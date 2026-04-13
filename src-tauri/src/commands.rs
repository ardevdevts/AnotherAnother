use crate::audio::{self, AudioHandle};
use crate::state::{AppState, DeviceSessionInfo, DeviceSessionStatus, ScrcpySession};
use crate::video::{self, FrameEvent};
use another_core::scrcpy::StreamSettings;
use another_core::{adb, control, macro_engine, scrcpy};
use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Mutex;

fn sanitize_window_label(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric()
                || character == '-'
                || character == '_'
                || character == ':'
                || character == '/'
            {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn device_window_label(serial: &str) -> String {
    format!("device-{}", sanitize_window_label(serial))
}

async fn session_for(
    state: &State<'_, AppState>,
    serial: &str,
) -> Result<Arc<Mutex<ScrcpySession>>, String> {
    let sessions = state.sessions.lock().await;
    sessions
        .get(serial)
        .cloned()
        .ok_or_else(|| "Not connected".to_string())
}

async fn emit_session_update(app: &AppHandle, session: &ScrcpySession) {
    let _ = app.emit(
        "device-session-updated",
        DeviceSessionInfo {
            serial: session.device_serial.clone(),
            status: session.status.clone(),
            window_label: session.window_label.clone(),
        },
    );
}

#[tauri::command]
pub async fn open_device_window(app: AppHandle, serial: String) -> Result<(), String> {
    let label = device_window_label(&serial);
    if let Some(window) = app.get_webview_window(&label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?device={}", serial).into()),
    )
    .title(&format!("Another - {}", serial))
    .inner_size(960.0, 900.0)
    .min_inner_size(360.0, 420.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn list_device_sessions(state: State<'_, AppState>) -> Result<Vec<DeviceSessionInfo>, String> {
    let sessions = state.sessions.lock().await;
    let session_refs: Vec<_> = sessions.values().cloned().collect();
    drop(sessions);

    let mut list = Vec::with_capacity(session_refs.len());
    for session in session_refs {
        let session = session.lock().await;
        list.push(DeviceSessionInfo {
            serial: session.device_serial.clone(),
            status: session.status.clone(),
            window_label: session.window_label.clone(),
        });
    }
    Ok(list)
}

#[tauri::command]
pub async fn list_devices() -> Result<Vec<adb::Device>, String> {
    adb::list_devices().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn connect_device(
    app: AppHandle,
    serial: String,
    on_frame: Channel<FrameEvent>,
    settings: StreamSettings,
    state: State<'_, AppState>,
) -> Result<(u32, u32), String> {
    {
        let sessions = state.sessions.lock().await;
        if sessions.contains_key(&serial) {
            return Err("That device is already open in another window".to_string());
        }
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    let server_path = resource_dir.join("resources").join("scrcpy-server-v2.7");
    let server_path_str = server_path.to_string_lossy().to_string();

    let port: u16 = 27183;

    let (streams, server_process) =
        scrcpy::start_server(&serial, &server_path_str, port, &settings)
            .await
            .map_err(|e| format!("Failed to start scrcpy server: {}", e))?;

    let shutdown = Arc::new(tokio::sync::Notify::new());
    let control_socket = Arc::new(Mutex::new(streams.control_socket));
    let process = Arc::new(Mutex::new(Some(server_process)));

    let audio_handle = if let Some(audio_socket) = streams.audio_socket {
        let handle = AudioHandle::new().map_err(|e| format!("Failed to init audio: {}", e))?;
        let handle = Arc::new(handle);
        let audio_shutdown = shutdown.clone();
        let audio_ref = handle.clone();
        tokio::spawn(async move {
            audio::stream_audio(audio_socket, audio_ref, audio_shutdown).await;
        });
        Some(handle)
    } else {
        None
    };

    let session = ScrcpySession {
        device_serial: serial.clone(),
        control_socket: control_socket.clone(),
        screen_width: streams.screen_width,
        screen_height: streams.screen_height,
        shutdown: shutdown.clone(),
        audio: audio_handle,
        process: process.clone(),
        status: DeviceSessionStatus::Running,
        window_label: device_window_label(&serial),
    };

    let width = streams.screen_width;
    let height = streams.screen_height;

    let session = Arc::new(Mutex::new(session));
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(serial.clone(), session.clone());
    }

    {
        let session_guard = session.lock().await;
        emit_session_update(&app, &session_guard).await;
    }

    if settings.turn_screen_off {
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
        if let Err(err) = control::inject_keycode(&control_socket, "down", control::KEYCODE_POWER, 0, 0)
            .await
        {
            eprintln!("[scrcpy-server] Failed to turn screen off (down): {}", err);
        }
        if let Err(err) = control::inject_keycode(&control_socket, "up", control::KEYCODE_POWER, 0, 0)
            .await
        {
            eprintln!("[scrcpy-server] Failed to turn screen off (up): {}", err);
        }
    }

    let session_map = state.sessions.clone();
    let app_for_task = app.clone();
    let serial_clone = serial.clone();

    let video_codec = if settings.video_codec == "h265" {
        video::VideoCodec::H265
    } else {
        video::VideoCodec::H264
    };

    tokio::spawn(async move {
        video::stream_video(
            streams.video_socket,
            on_frame,
            shutdown.clone(),
            video_codec,
        )
        .await;
        scrcpy::stop_server(&serial_clone, port).await;
        if let Some(session) = {
            let sessions = session_map.lock().await;
            sessions.get(&serial_clone).cloned()
        } {
            let mut session_guard = session.lock().await;
            session_guard.status = DeviceSessionStatus::Stopped;
            emit_session_update(&app_for_task, &session_guard).await;
            if let Some(mut process) = session_guard.process.lock().await.take() {
                let _ = process.kill().await;
            }
        }
        let mut sessions = session_map.lock().await;
        sessions.remove(&serial_clone);
    });

    Ok((width, height))
}

#[tauri::command]
pub async fn disconnect_device(
    serial: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = {
        let mut sessions = state.sessions.lock().await;
        sessions.remove(&serial)
    };

    if let Some(session) = session {
        let mut session_guard = session.lock().await;
        session_guard.status = DeviceSessionStatus::Stopping;
        emit_session_update(&app, &session_guard).await;
        session_guard.shutdown.notify_one();
        scrcpy::stop_server(&session_guard.device_serial, 27183)
            .await
            .map_err(|e| e.to_string())?;
        if let Some(mut process) = session_guard.process.lock().await.take() {
            let _ = process.kill().await;
        }
        session_guard.status = DeviceSessionStatus::Stopped;
        emit_session_update(&app, &session_guard).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_muted(
    serial: String,
    muted: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    if let Some(audio) = &session.audio {
        if muted {
            audio.sink.set_volume(0.0);
        } else {
            audio.sink.set_volume(1.0);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn send_touch(
    serial: String,
    action: String,
    x: f64,
    y: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    let px = (x * session.screen_width as f64) as u32;
    let py = (y * session.screen_height as f64) as u32;
    control::inject_touch(
        &session.control_socket,
        &action,
        px,
        py,
        session.screen_width as u16,
        session.screen_height as u16,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_key(
    serial: String,
    keycode: u32,
    action: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    control::inject_keycode(&session.control_socket, &action, keycode, 0, 0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_text(
    serial: String,
    text: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    control::inject_text(&session.control_socket, &text)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_scroll(
    serial: String,
    x: f64,
    y: f64,
    dx: f64,
    dy: f64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    let px = (x * session.screen_width as f64) as u32;
    let py = (y * session.screen_height as f64) as u32;
    let sx = (dx * 120.0) as i16;
    let sy = (dy * 120.0) as i16;
    control::inject_scroll(
        &session.control_socket,
        px,
        py,
        session.screen_width as u16,
        session.screen_height as u16,
        sx,
        sy,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn take_screenshot(serial: String, state: State<'_, AppState>) -> Result<String, String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    let png_data = adb::exec_out_screencap(&session.device_serial)
        .await
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&png_data))
}

#[tauri::command]
pub async fn press_button(
    serial: String,
    button: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    let keycode = match button.as_str() {
        "home" => control::KEYCODE_HOME,
        "back" => control::KEYCODE_BACK,
        "recents" => control::KEYCODE_APP_SWITCH,
        "power" => control::KEYCODE_POWER,
        "volume_up" => control::KEYCODE_VOLUME_UP,
        "volume_down" => control::KEYCODE_VOLUME_DOWN,
        _ => return Err(format!("Unknown button: {}", button)),
    };
    control::inject_keycode(&session.control_socket, "down", keycode, 0, 0)
        .await
        .map_err(|e| e.to_string())?;
    control::inject_keycode(&session.control_socket, "up", keycode, 0, 0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_screen_size(
    serial: String,
    width: u32,
    height: u32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let session = sessions.get(&serial).cloned().ok_or("Not connected")?;
    drop(sessions);
    let mut session = session.lock().await;
    session.screen_width = width;
    session.screen_height = height;
    Ok(())
}

#[tauri::command]
pub async fn rotate_device(serial: String, state: State<'_, AppState>) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;
    control::rotate_device(&session.control_socket)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wake_screen(serial: String, state: State<'_, AppState>) -> Result<(), String> {
    let session = session_for(&state, &serial).await?;
    let session = session.lock().await;

    let is_on = adb::shell(
        &session.device_serial,
        "dumpsys power | grep 'Display Power'",
    )
    .await
    .map_err(|e| e.to_string())?
    .wait_with_output()
    .await
    .map(|o| String::from_utf8_lossy(&o.stdout).contains("state=ON"))
    .unwrap_or(true);

    if !is_on {
        control::inject_keycode(
            &session.control_socket,
            "down",
            control::KEYCODE_WAKEUP,
            0,
            0,
        )
        .await
        .map_err(|e| e.to_string())?;
        control::inject_keycode(&session.control_socket, "up", control::KEYCODE_WAKEUP, 0, 0)
            .await
            .map_err(|e| e.to_string())?;
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn play_macro(
    serial: String,
    events: Vec<macro_engine::TimedEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (socket, sw, sh) = {
        let session = session_for(&state, &serial).await?;
        let session = session.lock().await;
        (
            session.control_socket.clone(),
            session.screen_width,
            session.screen_height,
        )
    };
    macro_engine::play_events(&events, &socket, sw, sh)
        .await
        .map_err(|e| e.to_string())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn macro_path(dir: &str, name: &str) -> PathBuf {
    PathBuf::from(dir).join(format!("{}.json", sanitize_filename(name)))
}

#[derive(Serialize)]
pub struct MacroInfo {
    pub name: String,
    pub event_count: usize,
}

#[tauri::command]
pub async fn get_default_macros_dir(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("macros");
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn list_macro_files(dir: String) -> Result<Vec<MacroInfo>, String> {
    let path = PathBuf::from(&dir);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let order_path = path.join("_order.json");
    let order: Vec<String> = if order_path.exists() {
        let data = tokio::fs::read_to_string(&order_path)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        Vec::new()
    };

    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| e.to_string())?;

    let mut macros: Vec<MacroInfo> = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let fname = entry.file_name().to_string_lossy().to_string();
        if !fname.ends_with(".json") || fname == "_order.json" {
            continue;
        }
        let data = match tokio::fs::read_to_string(entry.path()).await {
            Ok(d) => d,
            Err(_) => continue,
        };
        let m: macro_engine::Macro = match serde_json::from_str(&data) {
            Ok(m) => m,
            Err(_) => continue,
        };
        macros.push(MacroInfo {
            name: m.name,
            event_count: m.events.len(),
        });
    }

    if !order.is_empty() {
        macros.sort_by_key(|m| {
            order
                .iter()
                .position(|n| n == &m.name)
                .unwrap_or(usize::MAX)
        });
    }

    Ok(macros)
}

#[tauri::command]
pub async fn load_macro_file(dir: String, name: String) -> Result<macro_engine::Macro, String> {
    let path = macro_path(&dir, &name);
    let data = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Failed to read macro: {}", e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse macro: {}", e))
}

#[tauri::command]
pub async fn save_macro_file(dir: String, macro_data: macro_engine::Macro) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| e.to_string())?;

    let file_path = macro_path(&dir, &macro_data.name);
    let json = serde_json::to_string_pretty(&macro_data).map_err(|e| e.to_string())?;
    tokio::fs::write(&file_path, json)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_macro_file(dir: String, name: String) -> Result<(), String> {
    let path = macro_path(&dir, &name);
    if path.exists() {
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_macro_file(
    dir: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let old_path = macro_path(&dir, &old_name);
    if !old_path.exists() {
        return Err(format!("Macro '{}' not found", old_name));
    }

    let data = tokio::fs::read_to_string(&old_path)
        .await
        .map_err(|e| e.to_string())?;
    let mut m: macro_engine::Macro = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    m.name = new_name.clone();

    let new_path = macro_path(&dir, &new_name);
    let json = serde_json::to_string_pretty(&m).map_err(|e| e.to_string())?;
    tokio::fs::write(&new_path, json)
        .await
        .map_err(|e| e.to_string())?;

    if old_path != new_path {
        tokio::fs::remove_file(&old_path)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn save_macros_order(dir: String, order: Vec<String>) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    tokio::fs::create_dir_all(&path)
        .await
        .map_err(|e| e.to_string())?;

    let order_path = path.join("_order.json");
    let json = serde_json::to_string_pretty(&order).map_err(|e| e.to_string())?;
    tokio::fs::write(&order_path, json)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wifi_connect(address: String) -> Result<(), String> {
    adb::connect_device(&address)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wifi_disconnect(address: String) -> Result<(), String> {
    adb::disconnect_device(&address)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_device_ip(serial: String) -> Result<Option<String>, String> {
    adb::get_device_ip(&serial).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn wifi_enable(serial: String) -> Result<String, String> {
    let ip = adb::get_device_ip(&serial)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| {
            "Device is not connected to WiFi. Connect it to the same network as this computer."
                .to_string()
        })?;

    adb::tcpip(&serial, 5555).await.map_err(|e| e.to_string())?;

    let addr = format!("{}:5555", ip);
    let mut connected = false;
    for _ in 0..5 {
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
        if adb::connect_device(&addr).await.is_ok() {
            connected = true;
            break;
        }
    }

    if !connected {
        return Err(format!(
            "Could not connect to {} -- make sure both devices are on the same WiFi network",
            addr
        ));
    }

    Ok(addr)
}
