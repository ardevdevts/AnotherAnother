export interface Device {
  serial: string;
  model: string;
  state: string;
  wifi_available?: boolean;
}

export type DeviceSessionStatus = "starting" | "running" | "stopping" | "stopped" | "error";

export interface DeviceSessionInfo {
  serial: string;
  status: DeviceSessionStatus;
  window_label: string;
}

export interface Toast {
  id: number;
  message: string;
  type: "error" | "info";
}

export interface Settings {
  max_size: number;
  max_fps: number;
  video_bit_rate: number;
  video_codec: string;
  audio: boolean;
  adaptive: boolean;
  video_encoder: string;
  video_codec_options: string;
  display_id: number;
  crop: string;
  orientation: string;
  video_buffer: number;
  audio_buffer: number;
  keyboard_mode: string;
  mouse_mode: string;
  show_touches: boolean;
  stay_awake: boolean;
  turn_screen_off: boolean;
  no_clipboard_autosync: boolean;
  shortcut_mod: string;
  power_off_on_close: boolean;
  extra_server_args: string;
}

export type MacroEvent =
  | { type: "touch"; action: string; x: number; y: number }
  | { type: "text"; text: string }
  | { type: "key"; keycode: number; action: string }
  | { type: "scroll"; x: number; y: number; dx: number; dy: number }
  | { type: "button"; button: string }
  | { type: "wait"; ms: number };

export interface MacroTimedEvent {
  timestamp_ms: number;
  event: MacroEvent;
}

export interface SavedMacro {
  name: string;
  events: MacroTimedEvent[];
}

export type FrameEvent =
  | { event: "config"; data: { codec: string; description: string } }
  | { event: "packet"; data: { key: boolean; data: string; timestamp: number } }
  | { event: "disconnected"; data: { reason: string } };

export type Screen = "welcome" | "another";

export function getDeviceNickname(serial: string): string | null {
  return localStorage.getItem(`device_nickname_${serial}`);
}

export function setDeviceNickname(serial: string, name: string) {
  if (name.trim()) {
    localStorage.setItem(`device_nickname_${serial}`, name.trim());
  } else {
    localStorage.removeItem(`device_nickname_${serial}`);
  }
}

export function getDeviceDisplayName(device: Device): string {
  return getDeviceNickname(device.serial) || device.model;
}

export type ThemePreference = "light" | "dark" | "auto";

export const DEFAULT_SCRCPY_SETTINGS = {
  video_encoder: "",
  video_codec_options: "",
  display_id: 0,
  crop: "",
  orientation: "",
  video_buffer: 0,
  audio_buffer: 0,
  keyboard_mode: "sdk",
  mouse_mode: "sdk",
  show_touches: false,
  stay_awake: false,
  turn_screen_off: false,
  no_clipboard_autosync: false,
  shortcut_mod: "lalt,lsuper",
  power_off_on_close: false,
  extra_server_args: "",
};

export const PRESETS: Record<string, Settings> = {
  performance: {
    max_size: 720,
    max_fps: 30,
    video_bit_rate: 2000000,
    video_codec: "h264",
    audio: false,
    adaptive: false,
    ...DEFAULT_SCRCPY_SETTINGS,
  },
  balanced: {
    max_size: 1024,
    max_fps: 60,
    video_bit_rate: 8000000,
    video_codec: "h264",
    audio: false,
    adaptive: false,
    ...DEFAULT_SCRCPY_SETTINGS,
  },
  quality: {
    max_size: 1920,
    max_fps: 60,
    video_bit_rate: 24000000,
    video_codec: "h264",
    audio: false,
    adaptive: false,
    ...DEFAULT_SCRCPY_SETTINGS,
  },
};

export const RESOLUTION_OPTIONS = [
  { value: 480, label: "480p" },
  { value: 720, label: "720p" },
  { value: 1024, label: "1024p" },
  { value: 1280, label: "1280p" },
  { value: 1920, label: "1920p" },
  { value: 0, label: "Native" },
];

export const CODEC_OPTIONS = [
  { value: "h264", label: "H.264" },
  { value: "h265", label: "H.265 / HEVC" },
];

export const ORIENTATION_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "0", label: "0°" },
  { value: "1", label: "90°" },
  { value: "2", label: "180°" },
  { value: "3", label: "270°" },
];

export const INPUT_MODE_OPTIONS = [
  { value: "sdk", label: "SDK" },
  { value: "uhid", label: "UHID" },
  { value: "aoa", label: "AOA" },
  { value: "disabled", label: "Disabled" },
];

export interface AdaptiveTier {
  max_size: number;
  max_fps: number;
  video_bit_rate: number;
}

export const ADAPTIVE_TIERS: AdaptiveTier[] = [
  { max_size: 720, max_fps: 30, video_bit_rate: 2000000 },
  { max_size: 720, max_fps: 60, video_bit_rate: 4000000 },
  { max_size: 1024, max_fps: 60, video_bit_rate: 8000000 },
  { max_size: 1280, max_fps: 60, video_bit_rate: 12000000 },
  { max_size: 1920, max_fps: 60, video_bit_rate: 24000000 },
  { max_size: 1920, max_fps: 120, video_bit_rate: 32000000 },
];
