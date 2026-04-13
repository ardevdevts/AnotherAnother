import { useState, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useHotkeys } from "@tanstack/react-hotkeys";
import type { Settings, Device } from "./types";
import { PRESETS } from "./types";
import { useTheme } from "./hooks/useTheme";
import { useToasts } from "./hooks/useToasts";
import { useDevices } from "./hooks/useDevices";
import { useDeviceSessions } from "./hooks/useDeviceSessions";
import { useConnection } from "./hooks/useConnection";
import { useAdaptiveBitrate } from "./hooks/useAdaptiveBitrate";
import { useMacro } from "./hooks/useMacro";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { MirrorScreen } from "./components/MirrorScreen";
import { DeviceWindow } from "./components/DeviceWindow";
import { SettingsDialog } from "./components/SettingsDialog";
import { CommandBar } from "./components/CommandBar";
import { MacrosScreen } from "./components/MacrosScreen";
import { ToastContainer } from "./components/ToastContainer";

const isMac = navigator.userAgent.includes("Mac");
const MOD = isMac ? "⌘" : "Ctrl";
const MOD_KEY = isMac ? "Meta" : "Ctrl";

interface CommandDef {
  id: string;
  label: string;
  keys: string[];
  hotkey: string;
  section: string;
  action: () => void;
}

function DeviceApp({ serial }: { serial: string }) {
  useTheme();
  const { toasts, showToast } = useToasts();

  return (
    <>
      <DeviceWindow serial={serial} showToast={showToast} />
      <ToastContainer toasts={toasts} />
    </>
  );
}

function ManagerApp() {
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [showMacros, setShowMacros] = useState(false);
  const [settings, setSettings] = useState<Settings>(PRESETS.balanced);
  const [activePreset, setActivePreset] = useState("balanced");

  const { themePref, setThemePref, cycleTheme } = useTheme();
  const { toasts, showToast } = useToasts();
  const { devices, refreshDevices } = useDevices(showToast);
  const { sessionBySerial } = useDeviceSessions(showToast);
  const macro = useMacro({ showToast, onRecordingStopped: () => setShowMacros(true) });

  const takeScreenshot = useCallback(async () => {
    if (!connectedDeviceRef.current) {
      showToast("Open a device window first", "info");
      return;
    }
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

  const adaptiveRef = useRef<{ frameReceived: () => void; disableAdaptive: () => void }>({
    frameReceived: () => { },
    disableAdaptive: () => { },
  });

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const connectedDeviceRef = useRef<Device | null>(null);
  const scheduleReconnectRef = useRef<((s: Settings) => void) | null>(null);

  const handleCodecFallback = useCallback((codec: string) => {
    const next = { ...settingsRef.current, video_codec: codec };
    setSettings(next);
    if (connectedDeviceRef.current) scheduleReconnectRef.current?.(next);
  }, []);

  const {
    screen,
    connectedDevice,
    connectingSerial,
    deviceSize,
    canvasRef,
    decoderRef,
    isMouseDown,
    muted,
    recording,
    setMuted,
    toggleRecording,
    disconnect,
    scheduleReconnect,
    pressButton,
    handleCanvasMouseEvent,
    handleWheel,
    handleKeyDown,
  } = useConnection({
    deviceSerial: "",
    settings,
    showToast,
    takeScreenshot,
    setShowSettings: (fn) => setShowSettings(fn),
    setThemePref: (fn) => setThemePref(fn),
    onFrameReceived: () => adaptiveRef.current.frameReceived(),
    onCodecFallback: handleCodecFallback,
    onRecordEvent: macro.recordEvent,
  });

  scheduleReconnectRef.current = scheduleReconnect;
  connectedDeviceRef.current = connectedDevice;

  const adaptive = useAdaptiveBitrate({
    enabled: settings.adaptive,
    decoder: decoderRef,
    currentSettings: settings,
    onTierChange: (newSettings) => {
      setSettings(newSettings);
      setActivePreset("");
      if (connectedDevice) scheduleReconnect(newSettings);
    },
  });

  adaptiveRef.current = adaptive;

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settings, [key]: value };
    const adaptiveManagedKeys: Array<keyof Settings> = [
      "max_size",
      "max_fps",
      "video_bit_rate",
    ];
    if (adaptiveManagedKeys.includes(key)) {
      next.adaptive = false;
      adaptive.disableAdaptive();
    }
    setSettings(next);
    if (adaptiveManagedKeys.includes(key)) setActivePreset("");
    if (key !== "audio" && key !== "adaptive") {
      if (connectedDevice) scheduleReconnect(next);
    }
  };

  const applyPreset = (name: string) => {
    const next = { ...settings, ...PRESETS[name], audio: settings.audio };
    setSettings(next);
    setActivePreset(name);
    adaptive.disableAdaptive();
    if (connectedDevice) scheduleReconnect(next);
  };

  const commands: CommandDef[] = useMemo(() => [
    { id: "vol-up", label: "Volume Up", keys: [MOD, "+"], hotkey: `${MOD_KEY}+=`, section: "Audio", action: () => pressButton("volume_up") },
    { id: "vol-down", label: "Volume Down", keys: [MOD, "-"], hotkey: `${MOD_KEY}+-`, section: "Audio", action: () => pressButton("volume_down") },
    { id: "mute", label: muted ? "Unmute Audio" : "Mute Audio", keys: [MOD, "M"], hotkey: `${MOD_KEY}+M`, section: "Audio", action: () => setMuted(!muted) },
    { id: "screenshot", label: "Take Screenshot", keys: [MOD, "S"], hotkey: `${MOD_KEY}+S`, section: "Actions", action: takeScreenshot },
    { id: "record", label: recording ? "Stop Recording" : "Record Screen", keys: [MOD, "⇧", "R"], hotkey: `${MOD_KEY}+Shift+R`, section: "Actions", action: toggleRecording },
    { id: "settings", label: "Open Settings", keys: [MOD, ","], hotkey: `${MOD_KEY}+,`, section: "Actions", action: () => setShowSettings(true) },
    { id: "theme", label: "Toggle Theme", keys: [MOD, "T"], hotkey: `${MOD_KEY}+T`, section: "Actions", action: cycleTheme },
    { id: "disconnect", label: "Disconnect", keys: [MOD, "D"], hotkey: `${MOD_KEY}+D`, section: "Actions", action: disconnect },
    { id: "home", label: "Home", keys: [MOD, "H"], hotkey: `${MOD_KEY}+H`, section: "Device", action: () => pressButton("home") },
    { id: "back", label: "Back", keys: [MOD, "B"], hotkey: `${MOD_KEY}+B`, section: "Device", action: () => pressButton("back") },
    { id: "recents", label: "Recent Apps", keys: [MOD, "R"], hotkey: `${MOD_KEY}+R`, section: "Device", action: () => pressButton("recents") },
    { id: "power", label: "Power Button", keys: [MOD, "P"], hotkey: `${MOD_KEY}+P`, section: "Device", action: () => pressButton("power") },
    { id: "macro-toggle", label: macro.macroRecording ? "Stop Macro Recording" : "Record Macro", keys: [MOD, "⇧", "M"], hotkey: `${MOD_KEY}+Shift+M`, section: "Macros", action: macro.toggleRecording },
    { id: "macro-play", label: "Play Last Macro", keys: [MOD, "⇧", "P"], hotkey: `${MOD_KEY}+Shift+P`, section: "Macros", action: () => { if (macro.macros.length > 0) macro.playMacro(macro.macros[macro.macros.length - 1].name); } },
    { id: "macro-manage", label: "Manage Macros", keys: [MOD, "⇧", "L"], hotkey: `${MOD_KEY}+Shift+L`, section: "Macros", action: () => setShowMacros(true) },
    { id: "macro-export", label: "Export All Macros", keys: [MOD, "⇧", "E"], hotkey: `${MOD_KEY}+Shift+E`, section: "Macros", action: macro.exportAllMacros },
    { id: "macro-import", label: "Import Macros", keys: [MOD, "⇧", "I"], hotkey: `${MOD_KEY}+Shift+I`, section: "Macros", action: macro.importMacros },
  ], [muted, recording, setMuted, toggleRecording, pressButton, takeScreenshot, cycleTheme, disconnect, macro.macroRecording, macro.toggleRecording, macro.macros, macro.playMacro, macro.exportAllMacros, macro.importMacros]);

  useHotkeys(
    commands.map((command) => ({
      hotkey: command.hotkey as never,
      callback: (event: KeyboardEvent) => {
        event.preventDefault();
        command.action();
      },
      options: { enabled: !showCommandBar },
    }))
  );

  useHotkeys([
    {
      hotkey: `${MOD_KEY}+Alt+C` as never,
      callback: (event: KeyboardEvent) => {
        event.preventDefault();
        setShowCommandBar((state) => !state);
      },
    },
  ]);

  return (
    <>
      {showMacros ? (
        <MacrosScreen
          macros={macro.macros}
          macrosDir={macro.macrosDir}
          playingMacro={macro.playingMacro}
          onBack={() => setShowMacros(false)}
          onPlay={(name) => {
            setShowMacros(false);
            setTimeout(() => macro.playMacro(name), 500);
          }}
          onDelete={macro.deleteMacro}
          onRename={macro.renameMacro}
          onReorder={macro.reorderMacros}
          onExport={macro.exportMacro}
          onExportAll={macro.exportAllMacros}
          onImport={macro.importMacros}
          onSetDir={macro.setMacrosDir}
          showToast={showToast}
        />
      ) : screen === "welcome" ? (
        <WelcomeScreen
          devices={devices}
          connectingSerial={connectingSerial}
          deviceSessions={sessionBySerial}
          themePref={themePref}
          onCycleTheme={cycleTheme}
          onOpenSettings={() => setShowSettings(true)}
          onRefreshDevices={refreshDevices}
          onOpenDevice={async (d) => {
            try {
              await invoke("open_device_window", { serial: d.serial });
            } catch (error) {
              showToast(`Failed to open device window: ${error}`);
            }
          }}
          onKillSession={async (d) => {
            try {
              await invoke("disconnect_device", { serial: d.serial });
            } catch (error) {
              showToast(`Failed to stop device session: ${error}`);
            }
          }}
          showToast={showToast}
        />
      ) : connectedDevice ? (
        <MirrorScreen
          connectedDevice={connectedDevice}
          deviceSize={deviceSize}
          canvasRef={canvasRef}
          isMouseDown={isMouseDown}
          recording={recording}
          macroRecording={macro.macroRecording}
          adaptiveInfo={settings.adaptive ? { enabled: true, tierName: adaptive.metrics.tierName, fps: adaptive.metrics.fps } : undefined}
          onToggleRecording={toggleRecording}
          onToggleMacroRecording={macro.toggleRecording}
          onCanvasMouseEvent={handleCanvasMouseEvent}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        />
      ) : null}

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={settings}
        activePreset={activePreset}
        onApplyPreset={applyPreset}
        onUpdateSetting={updateSetting}
      />
      <CommandBar
        open={showCommandBar}
        onOpenChange={setShowCommandBar}
        commands={commands}
      />
      <ToastContainer toasts={toasts} />
    </>
  );
}

function App() {
  const deviceSerial = new URLSearchParams(window.location.search).get("device");
  if (deviceSerial) {
    return <DeviceApp serial={deviceSerial} />;
  }
  return <ManagerApp />;
}

export default App;
