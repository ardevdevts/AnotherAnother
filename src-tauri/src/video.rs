use anyhow::Result;
use base64::Engine;
use openh264::decoder::Decoder;
use openh264::formats::YUVSource;
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use tokio::sync::Notify;
use turbojpeg::{Compressor, Image, PixelFormat};

#[derive(Clone, serde::Serialize)]
#[serde(tag = "event", content = "data")]
pub enum FrameEvent {
    #[serde(rename = "frame")]
    Frame {
        width: u32,
        height: u32,
        jpeg_base64: String,
    },
    #[serde(rename = "disconnected")]
    Disconnected { reason: String },
    #[serde(rename = "size_changed")]
    SizeChanged { width: u32, height: u32 },
}

pub async fn stream_video(
    mut video_socket: TcpStream,
    channel: Channel<FrameEvent>,
    shutdown: Arc<Notify>,
) {
    let result = tokio::select! {
        r = decode_loop(&mut video_socket, &channel) => r,
        _ = shutdown.notified() => Ok(()),
    };

    if let Err(e) = result {
        let _ = channel.send(FrameEvent::Disconnected {
            reason: e.to_string(),
        });
    }
}

async fn decode_loop(video_socket: &mut TcpStream, channel: &Channel<FrameEvent>) -> Result<()> {
    let (packet_tx, packet_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(2);

    let channel_clone = channel.clone();
    std::thread::spawn(move || {
        render_thread(packet_rx, channel_clone);
    });

    loop {
        let mut header = [0u8; 12];
        video_socket.read_exact(&mut header).await?;

        let packet_size = u32::from_be_bytes(header[8..12].try_into()?) as usize;
        if packet_size == 0 {
            continue;
        }

        let mut packet_data = vec![0u8; packet_size];
        video_socket.read_exact(&mut packet_data).await?;

        let _ = packet_tx.try_send(packet_data);
    }
}

fn render_thread(rx: std::sync::mpsc::Receiver<Vec<u8>>, channel: Channel<FrameEvent>) {
    let mut decoder = match Decoder::new() {
        Ok(d) => d,
        Err(_) => return,
    };
    let mut compressor = match Compressor::new() {
        Ok(c) => c,
        Err(_) => return,
    };
    let _ = compressor.set_quality(85);
    let _ = compressor.set_subsamp(turbojpeg::Subsamp::Sub2x1);

    let mut current_width: u32 = 0;
    let mut current_height: u32 = 0;
    let mut rgb_buf: Vec<u8> = Vec::new();

    while let Ok(packet_data) = rx.recv() {
        let yuv = match decoder.decode(&packet_data) {
            Ok(Some(yuv)) => yuv,
            _ => continue,
        };

        let (w, h) = yuv.dimensions();
        let width = w as u32;
        let height = h as u32;

        if width != current_width || height != current_height {
            current_width = width;
            current_height = height;
            rgb_buf.resize((width * height * 3) as usize, 0);
            let _ = channel.send(FrameEvent::SizeChanged { width, height });
        }

        yuv.write_rgb8(&mut rgb_buf);

        let image = Image {
            pixels: rgb_buf.as_slice(),
            width: width as usize,
            pitch: width as usize * 3,
            height: height as usize,
            format: PixelFormat::RGB,
        };

        let jpeg_data = match compressor.compress_to_vec(image) {
            Ok(data) => data,
            Err(_) => continue,
        };

        let jpeg_base64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_data);

        let _ = channel.send(FrameEvent::Frame {
            width,
            height,
            jpeg_base64,
        });
    }
}
