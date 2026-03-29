import { useState, useRef, useCallback, useEffect } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  DevicePhoneMobileIcon,
  Cog6ToothIcon,
  CameraIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  SignalIcon,
  HomeIcon,
  Square2StackIcon,
  CheckIcon,
  ComputerDesktopIcon,
} from "@heroicons/react/24/outline";
import { Dialog } from "@base-ui-components/react/dialog";
import { Select } from "@base-ui-components/react/select";
import { Slider } from "@base-ui-components/react/slider";
import appIcon from "./assets/icon.png";
import "./App.css";

interface Device {
  serial: string;
  model: string;
  state: string;
}

interface Toast {
  id: number;
  message: string;
  type: "error" | "info";
}

interface Settings {
  max_size: number;
  max_fps: number;
  video_bit_rate: number;
  video_codec: string;
}

type FrameEvent =
  | { event: "frame"; data: { width: number; height: number; jpeg_base64: string } }
  | { event: "disconnected"; data: { reason: string } }
  | { event: "size_changed"; data: { width: number; height: number } };

type Screen = "welcome" | "another";

const PRESETS: Record<string, Settings> = {
  performance: { max_size: 720, max_fps: 30, video_bit_rate: 2000000, video_codec: "h264" },
  balanced: { max_size: 1024, max_fps: 60, video_bit_rate: 8000000, video_codec: "h264" },
  quality: { max_size: 1920, max_fps: 60, video_bit_rate: 24000000, video_codec: "h264" },
};

let toastId = 0;

type ThemePreference = "light" | "dark" | "auto";

function getInitialThemePreference(): ThemePreference {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "auto";
}

function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "auto") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return pref;
}

function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [deviceSize, setDeviceSize] = useState({ width: 1080, height: 1920 });
  const [settings, setSettings] = useState<Settings>(PRESETS.balanced);
  const [activePreset, setActivePreset] = useState<string>("balanced");
  const [themePref, setThemePref] = useState<ThemePreference>(getInitialThemePreference);
  const [theme, setTheme] = useState<"light" | "dark">(() => resolveTheme(getInitialThemePreference()));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pendingFrame = useRef<{ width: number; height: number; jpeg_base64: string } | null>(null);
  const rafId = useRef<number>(0);
  const isMouseDown = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("theme", themePref);
    setTheme(resolveTheme(themePref));
    if (themePref === "auto") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => setTheme(resolveTheme("auto"));
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [themePref]);

  const showToast = useCallback((message: string, type: "error" | "info" = "error") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const devs = await invoke<Device[]>("list_devices");
      setDevices(devs.filter((d) => d.state === "device"));
    } catch (e) {
      showToast(`${e}`);
    }
  }, [showToast]);

  useEffect(() => {
    refreshDevices();
    const interval = setInterval(refreshDevices, 3000);
    return () => clearInterval(interval);
  }, [refreshDevices]);

  const pressButton = useCallback(async (button: string) => {
    try { await invoke("press_button", { button }); } catch {}
  }, []);

  const takeScreenshot = useCallback(async () => {
    try {
      const base64 = await invoke<string>("take_screenshot");
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${base64}`;
      link.download = `screenshot-${Date.now()}.png`;
      link.click();
      showToast("Screenshot saved", "info");
    } catch (e) {
      showToast(`Screenshot failed: ${e}`);
    }
  }, [showToast]);

  useEffect(() => {
    const unlisten = listen<string>("menu-event", (event) => {
      const id = event.payload;
      if (id === "disconnect") {
        disconnect();
      } else if (id === "toggle_theme") {
        setThemePref((p) => p === "dark" ? "light" : p === "light" ? "dark" : "light");
      } else if (id === "settings") {
        setShowSettings((s) => !s);
      } else if (id === "screenshot") {
        takeScreenshot();
      } else if (["home", "back", "recents", "volume_up", "volume_down", "power"].includes(id)) {
        pressButton(id);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [takeScreenshot, pressButton]);

  const isReconnecting = useRef(false);

  const connectToDevice = useCallback(async (device: Device, s: Settings, silent = false) => {
    setConnecting(true);
    try {
      const channel = new Channel<FrameEvent>();
      channel.onmessage = (msg) => {
        if (msg.event === "frame") {
          pendingFrame.current = msg.data;
          if (!rafId.current) {
            rafId.current = requestAnimationFrame(() => {
              rafId.current = 0;
              const frame = pendingFrame.current;
              if (!frame) return;
              pendingFrame.current = null;
              const canvas = canvasRef.current;
              if (!canvas) return;
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              const bytes = Uint8Array.from(atob(frame.jpeg_base64), (c) => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: "image/jpeg" });
              createImageBitmap(blob).then((bmp) => {
                if (canvas.width !== frame.width || canvas.height !== frame.height) {
                  canvas.width = frame.width;
                  canvas.height = frame.height;
                }
                ctx.drawImage(bmp, 0, 0);
                bmp.close();
              });
            });
          }
        } else if (msg.event === "disconnected") {
          if (!isReconnecting.current) {
            setConnectedDevice(null);
            setScreen("welcome");
            showToast("Device disconnected", "info");
          }
        } else if (msg.event === "size_changed") {
          setDeviceSize({ width: msg.data.width, height: msg.data.height });
        }
      };

      const [width, height] = await invoke<[number, number]>("connect_device", {
        serial: device.serial,
        onFrame: channel,
        settings: s,
      });
      setDeviceSize({ width, height });
      setConnectedDevice(device);
      setScreen("another");

      const chromeH = 52;
      const maxViewH = 860;
      const aspect = width / height;
      const viewW = Math.round(maxViewH * aspect);
      const totalH = maxViewH + chromeH;
      const win = getCurrentWindow();
      await win.setSize(new LogicalSize(Math.max(viewW, 280), totalH));
    } catch (e) {
      if (!silent) showToast(`Failed to connect: ${e}`);
    } finally {
      setConnecting(false);
      isReconnecting.current = false;
    }
  }, [showToast]);

  const disconnect = useCallback(async () => {
    try { await invoke("disconnect_device"); } catch {}
    setConnectedDevice(null);
    setScreen("welcome");
    try {
      await getCurrentWindow().setSize(new LogicalSize(380, 750));
    } catch {}
  }, []);

  const scheduleReconnect = useCallback((s: Settings) => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(() => {
      if (connectedDevice) {
        isReconnecting.current = true;
        connectToDevice(connectedDevice, s, true);
      }
    }, 800);
  }, [connectedDevice, connectToDevice]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setActivePreset("");
    if (connectedDevice) scheduleReconnect(next);
  };

  const applyPreset = (name: string) => {
    const next = PRESETS[name];
    setSettings(next);
    setActivePreset(name);
    if (connectedDevice) scheduleReconnect(next);
  };

  const handleCanvasMouseEvent = async (e: React.MouseEvent<HTMLCanvasElement>, action: string) => {
    if (!connectedDevice) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    try { await invoke("send_touch", { action, x, y }); } catch {}
  };

  const handleWheel = async (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!connectedDevice) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const dy = e.deltaY > 0 ? -1 : 1;
    try { await invoke("send_scroll", { x, y, dx: 0, dy }); } catch {}
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (!connectedDevice) return;
    e.preventDefault();
    if (e.key.length === 1) {
      try { await invoke("send_text", { text: e.key }); } catch {}
    } else {
      const keyMap: Record<string, number> = {
        Enter: 66, Backspace: 67, Delete: 112,
        ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
        Escape: 111, Tab: 61,
      };
      const keycode = keyMap[e.key];
      if (keycode) {
        try {
          await invoke("send_key", { keycode, action: "down" });
          await invoke("send_key", { keycode, action: "up" });
        } catch {}
      }
    }
  };

  const truncateSerial = (s: string) =>
    s.length > 16 ? s.slice(0, 6) + "..." + s.slice(-4) : s;

  const resolutionOptions = [
    { value: 480, label: "480p" },
    { value: 720, label: "720p" },
    { value: 1024, label: "1024p" },
    { value: 1280, label: "1280p" },
    { value: 1920, label: "1920p" },
    { value: 0, label: "Native" },
  ];

  const codecOptions = [
    { value: "h264", label: "H.264" },
    { value: "h265", label: "H.265" },
  ];

  // -------- WELCOME SCREEN --------
  if (screen === "welcome") {
    return (
      <div className="welcome">
        <div className="window-drag" data-tauri-drag-region>
          <div className="toolbar-actions">
            <button className="toolbar-btn" onClick={() => setThemePref(themePref === "light" ? "dark" : themePref === "dark" ? "auto" : "light")} title={themePref === "light" ? "Light" : themePref === "dark" ? "Dark" : "System"}>
              {themePref === "light" ? <SunIcon /> : themePref === "dark" ? <MoonIcon /> : <ComputerDesktopIcon />}
            </button>
            <button className="toolbar-btn" onClick={() => setShowSettings(true)} title="Settings">
              <Cog6ToothIcon />
            </button>
          </div>
        </div>
        <div className="welcome-header">
          <img src={appIcon} alt="Another" className="welcome-logo" />
          <h1 className="welcome-title">Another</h1>
        </div>
        <p className="welcome-subtitle">Android screen mirroring and control</p>

        <div className="device-list">
          <div className="device-list-header">
            <span className="device-list-title">
              {devices.length > 0 ? `${devices.length} device${devices.length > 1 ? "s" : ""} found` : "Searching..."}
            </span>
            <button className="device-list-refresh" onClick={refreshDevices}>
              <ArrowPathIcon /> Refresh
            </button>
          </div>

          {devices.length === 0 ? (
            <div className="device-empty">
              <SignalIcon />
              <p>No devices detected.<br />Connect your Android via USB and enable USB debugging.</p>
            </div>
          ) : (
            devices.map((d) => (
              <div
                key={d.serial}
                className="device-card"
                onClick={() => !connecting && connectToDevice(d, settings)}
              >
                <div className="device-card-icon">
                  <DevicePhoneMobileIcon />
                </div>
                <div className="device-card-info">
                  <div className="device-card-name">{d.model}</div>
                  <div className="device-card-serial">{truncateSerial(d.serial)}</div>
                </div>
                <div className="device-card-arrow">
                  {connecting ? <div className="spinner" /> : <ChevronRightIcon />}
                </div>
              </div>
            ))
          )}
        </div>

        {renderSettings()}
        {renderToasts()}
      </div>
    );
  }

  // -------- ANOTHER SCREEN --------
  function renderSettings() {
    return (
      <Dialog.Root open={showSettings} onOpenChange={setShowSettings}>
        <Dialog.Portal>
          <Dialog.Backdrop className="dialog-backdrop" />
          <Dialog.Popup className="settings-panel">
            <div className="settings-header">
              <Dialog.Title className="settings-title">Settings</Dialog.Title>
            </div>

            <div className="settings-group">
              <div className="settings-group-title">Presets</div>
              <div className="preset-btns">
                {Object.keys(PRESETS).map((name) => (
                  <button key={name} className={`preset-btn ${activePreset === name ? "active" : ""}`} onClick={() => applyPreset(name)}>
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-group">
              <div className="settings-group-title">Video</div>

              <div className="setting-row">
                <span className="setting-label">Resolution</span>
                <Select.Root value={settings.max_size} onValueChange={(val) => updateSetting("max_size", val as number)}>
                  <Select.Trigger className="select-trigger">
                    <Select.Value>{resolutionOptions.find((o) => o.value === settings.max_size)?.label}</Select.Value>
                    <ChevronUpDownIcon className="select-icon" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner className="select-positioner" sideOffset={4}>
                      <Select.Popup className="select-popup">
                        {resolutionOptions.map((o) => (
                          <Select.Item key={o.value} value={o.value} className="select-item">
                            <Select.ItemIndicator className="select-item-indicator"><CheckIcon /></Select.ItemIndicator>
                            <Select.ItemText>{o.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              </div>

              <div className="setting-row">
                <span className="setting-label">Max FPS</span>
                <span className="setting-value">{settings.max_fps}</span>
              </div>
              <Slider.Root
                className="slider-root"
                value={settings.max_fps}
                onValueChange={(val) => updateSetting("max_fps", val as number)}
                min={15} max={120} step={5}
              >
                <Slider.Control className="slider-control">
                  <Slider.Track className="slider-track">
                    <Slider.Indicator className="slider-indicator" />
                    <Slider.Thumb className="slider-thumb" />
                  </Slider.Track>
                </Slider.Control>
              </Slider.Root>

              <div className="setting-row" style={{ marginTop: 12 }}>
                <span className="setting-label">Bitrate</span>
                <span className="setting-value">{(settings.video_bit_rate / 1000000).toFixed(0)} Mbps</span>
              </div>
              <Slider.Root
                className="slider-root"
                value={settings.video_bit_rate}
                onValueChange={(val) => updateSetting("video_bit_rate", val as number)}
                min={1000000} max={32000000} step={1000000}
              >
                <Slider.Control className="slider-control">
                  <Slider.Track className="slider-track">
                    <Slider.Indicator className="slider-indicator" />
                    <Slider.Thumb className="slider-thumb" />
                  </Slider.Track>
                </Slider.Control>
              </Slider.Root>

              <div className="setting-row" style={{ marginTop: 12 }}>
                <span className="setting-label">Codec</span>
                <Select.Root value={settings.video_codec} onValueChange={(val) => updateSetting("video_codec", val as string)}>
                  <Select.Trigger className="select-trigger">
                    <Select.Value>{codecOptions.find((o) => o.value === settings.video_codec)?.label}</Select.Value>
                    <ChevronUpDownIcon className="select-icon" />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Positioner className="select-positioner" sideOffset={4}>
                      <Select.Popup className="select-popup">
                        {codecOptions.map((o) => (
                          <Select.Item key={o.value} value={o.value} className="select-item">
                            <Select.ItemIndicator className="select-item-indicator"><CheckIcon /></Select.ItemIndicator>
                            <Select.ItemText>{o.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Popup>
                    </Select.Positioner>
                  </Select.Portal>
                </Select.Root>
              </div>
            </div>

            <div className="settings-note">
              <strong>Live settings</strong> -- changes reconnect automatically.
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  function renderToasts() {
    return (
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="another">
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-info" data-tauri-drag-region>
          <span className="titlebar-device">{connectedDevice?.model}</span>
          <span className="titlebar-os">Android</span>
        </div>

        <div className="titlebar-group">
          <button className="titlebar-btn" onClick={() => pressButton("back")} title="Back">
            <ChevronLeftIcon />
          </button>
          <button className="titlebar-btn" onClick={() => pressButton("home")} title="Home">
            <HomeIcon />
          </button>
          <button className="titlebar-btn" onClick={() => pressButton("recents")} title="Recents">
            <Square2StackIcon />
          </button>
        </div>

        <div className="titlebar-group">
          <button className="titlebar-btn" onClick={takeScreenshot} title="Screenshot">
            <CameraIcon />
          </button>
          <button className="titlebar-btn" onClick={() => setShowSettings(!showSettings)} title="Settings">
            <Cog6ToothIcon />
          </button>
          <button className="titlebar-btn" onClick={disconnect} title="Disconnect">
            <XMarkIcon />
          </button>
        </div>
      </div>

      <div className="viewport" tabIndex={0} onKeyDown={handleKeyDown}>
        {connecting ? (
          <div className="viewport-loading">
            <div className="spinner" />
            <p>Connecting...</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={deviceSize.width}
            height={deviceSize.height}
            onMouseDown={(e) => { isMouseDown.current = true; handleCanvasMouseEvent(e, "down"); }}
            onMouseMove={(e) => { if (isMouseDown.current) handleCanvasMouseEvent(e, "move"); }}
            onMouseUp={(e) => { isMouseDown.current = false; handleCanvasMouseEvent(e, "up"); }}
            onMouseLeave={(e) => { if (isMouseDown.current) { isMouseDown.current = false; handleCanvasMouseEvent(e, "up"); } }}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>

      {renderSettings()}
      {renderToasts()}
    </div>
  );
}

export default App;
