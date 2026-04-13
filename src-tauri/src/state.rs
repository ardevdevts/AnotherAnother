use crate::audio::AudioHandle;
use std::sync::Arc;
use tokio::process::Child;
use tokio::net::TcpStream;
use tokio::sync::Mutex;

#[derive(Clone, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceSessionStatus {
    Starting,
    Running,
    Stopping,
    Stopped,
    Error,
}

#[derive(Clone, serde::Serialize)]
pub struct DeviceSessionInfo {
    pub serial: String,
    pub status: DeviceSessionStatus,
    pub window_label: String,
}

pub struct ScrcpySession {
    pub device_serial: String,
    pub control_socket: Arc<Mutex<TcpStream>>,
    pub screen_width: u32,
    pub screen_height: u32,
    pub shutdown: Arc<tokio::sync::Notify>,
    pub audio: Option<Arc<AudioHandle>>,
    pub process: Arc<Mutex<Option<Child>>>,
    pub status: DeviceSessionStatus,
    pub window_label: String,
}

pub struct AppState {
    pub sessions: Arc<Mutex<std::collections::HashMap<String, Arc<Mutex<ScrcpySession>>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
        }
    }
}
