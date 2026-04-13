use anyhow::{anyhow, Result};
use serde::Deserialize;
use socket2::{Domain, Socket, Type};
use std::net::SocketAddr;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

use crate::adb;

const SCRCPY_SERVER_REMOTE_PATH: &str = "/data/local/tmp/scrcpy-server.jar";

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct StreamSettings {
    pub max_size: u32,
    pub max_fps: u32,
    pub video_bit_rate: u32,
    pub video_codec: String,
    pub audio: bool,
    pub video_encoder: String,
    pub video_codec_options: String,
    pub display_id: u32,
    pub crop: String,
    pub orientation: String,
    pub video_buffer: u32,
    pub audio_buffer: u32,
    pub keyboard_mode: String,
    pub mouse_mode: String,
    pub show_touches: bool,
    pub stay_awake: bool,
    pub turn_screen_off: bool,
    pub no_clipboard_autosync: bool,
    pub shortcut_mod: String,
    pub power_off_on_close: bool,
    pub extra_server_args: String,
}

impl Default for StreamSettings {
    fn default() -> Self {
        Self {
            max_size: 1024,
            max_fps: 60,
            video_bit_rate: 8000000,
            video_codec: "h264".to_string(),
            audio: false,
            video_encoder: String::new(),
            video_codec_options: String::new(),
            display_id: 0,
            crop: String::new(),
            orientation: String::new(),
            video_buffer: 0,
            audio_buffer: 0,
            keyboard_mode: "sdk".to_string(),
            mouse_mode: "sdk".to_string(),
            show_touches: false,
            stay_awake: false,
            turn_screen_off: false,
            no_clipboard_autosync: false,
            shortcut_mod: "lalt,lsuper".to_string(),
            power_off_on_close: false,
            extra_server_args: String::new(),
        }
    }
}

fn parse_extra_args(input: &str) -> Result<Vec<String>> {
    let mut args = Vec::new();
    for token in input.split_whitespace() {
        let valid = token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_:=,./+%[]".contains(c));
        if !valid {
            return Err(anyhow!(
                "Invalid character in extra server arg: '{}'",
                token
            ));
        }
        args.push(token.to_string());
    }
    Ok(args)
}

pub struct ConnectedStreams {
    pub video_socket: TcpStream,
    pub audio_socket: Option<TcpStream>,
    pub control_socket: TcpStream,
    pub screen_width: u32,
    pub screen_height: u32,
}

pub async fn start_server(
    serial: &str,
    server_path: &str,
    port: u16,
    settings: &StreamSettings,
) -> Result<(ConnectedStreams, tokio::process::Child)> {
    adb::kill_scrcpy_server(serial).await;
    adb::remove_forward(serial, port).await?;

    adb::push_file(serial, server_path, SCRCPY_SERVER_REMOTE_PATH).await?;

    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse()?;
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    socket.set_nonblocking(true)?;
    socket.bind(&addr.into())?;
    socket.listen(4)?;
    let listener = TcpListener::from_std(socket.into())?;

    adb::reverse(serial, "localabstract:scrcpy", port).await?;

    let mut args = vec![
        "tunnel_forward=false".to_string(),
        "control=true".to_string(),
        format!("audio={}", settings.audio),
        "audio_codec=raw".to_string(),
        format!("video_codec={}", settings.video_codec),
        format!("max_size={}", settings.max_size),
        format!("max_fps={}", settings.max_fps),
        format!("video_bit_rate={}", settings.video_bit_rate),
        format!("display_id={}", settings.display_id),
        format!("show_touches={}", settings.show_touches),
        format!("stay_awake={}", settings.stay_awake),
        format!("power_off_on_close={}", settings.power_off_on_close),
        format!("clipboard_autosync={}", !settings.no_clipboard_autosync),
        "send_device_meta=true".to_string(),
        "send_dummy_byte=false".to_string(),
        "log_level=info".to_string(),
    ];

    if !settings.video_encoder.trim().is_empty() {
        args.push(format!("video_encoder={}", settings.video_encoder.trim()));
    }

    if !settings.video_codec_options.trim().is_empty() {
        args.push(format!(
            "video_codec_options={}",
            settings.video_codec_options.trim()
        ));
    }

    if !settings.crop.trim().is_empty() {
        args.push(format!("crop={}", settings.crop.trim()));
    }

    if !settings.orientation.trim().is_empty() {
        args.push(format!(
            "lock_video_orientation={}",
            settings.orientation.trim()
        ));
    }

    if !settings.extra_server_args.trim().is_empty() {
        args.extend(parse_extra_args(&settings.extra_server_args)?);
    }

    let server_cmd = format!(
        "CLASSPATH={path} app_process / com.genymobile.scrcpy.Server 2.7 {args}",
        path = SCRCPY_SERVER_REMOTE_PATH,
        args = args.join(" "),
    );

    let mut server_process = adb::shell(serial, &server_cmd).await?;

    let stdout = server_process.stdout.take();
    if let Some(stdout) = stdout {
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[scrcpy-server] {}", line);
            }
        });
    }

    let stderr = server_process.stderr.take();
    if let Some(stderr) = stderr {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[scrcpy-server stderr] {}", line);
            }
        });
    }

    let (mut video_socket, _) =
        tokio::time::timeout(tokio::time::Duration::from_secs(10), listener.accept())
            .await
            .map_err(|_| anyhow!("Timeout waiting for video connection"))?
            .map_err(|e| anyhow!("Accept failed: {}", e))?;

    let audio_socket = if settings.audio {
        let (mut audio_sock, _) =
            tokio::time::timeout(tokio::time::Duration::from_secs(5), listener.accept())
                .await
                .map_err(|_| anyhow!("Timeout waiting for audio connection"))?
                .map_err(|e| anyhow!("Accept failed: {}", e))?;

        let mut audio_codec_buf = [0u8; 4];
        audio_sock.read_exact(&mut audio_codec_buf).await?;

        Some(audio_sock)
    } else {
        None
    };

    let (control_socket, _) =
        tokio::time::timeout(tokio::time::Duration::from_secs(5), listener.accept())
            .await
            .map_err(|_| anyhow!("Timeout waiting for control connection"))?
            .map_err(|e| anyhow!("Accept failed: {}", e))?;

    let mut device_name_buf = [0u8; 64];
    video_socket.read_exact(&mut device_name_buf).await?;

    let mut codec_buf = [0u8; 4];
    video_socket.read_exact(&mut codec_buf).await?;

    let mut size_buf = [0u8; 8];
    video_socket.read_exact(&mut size_buf).await?;
    let screen_width = u32::from_be_bytes([size_buf[0], size_buf[1], size_buf[2], size_buf[3]]);
    let screen_height = u32::from_be_bytes([size_buf[4], size_buf[5], size_buf[6], size_buf[7]]);

    drop(listener);

    Ok((
        ConnectedStreams {
            video_socket,
            audio_socket,
            control_socket,
            screen_width,
            screen_height,
        },
        server_process,
    ))
}

pub async fn stop_server(serial: &str, _port: u16) {
    let _ = adb::remove_reverse(serial, "localabstract:scrcpy").await;
    adb::kill_scrcpy_server(serial).await;
}
