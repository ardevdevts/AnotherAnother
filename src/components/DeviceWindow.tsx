import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { MirrorScreen } from "./MirrorScreen";
import { useConnection } from "../hooks/useConnection";
import { useDeviceSessions } from "../hooks/useDeviceSessions";
import { PRESETS, type Device, type Settings } from "../types";

interface DeviceWindowProps {
  serial: string;
  showToast: (msg: string, type?: "error" | "info") => void;
}

export function DeviceWindow({ serial, showToast }: DeviceWindowProps) {
  const [settings] = useState<Settings>(PRESETS.balanced);
  const [device, setDevice] = useState<Device>({ serial, model: serial, state: "device" });
  const { sessionBySerial } = useDeviceSessions(showToast);

  const takeScreenshot = useCallback(async () => {
    try {
      const base64 = await invoke<string>("take_screenshot", { serial });
      const link = document.createElement("a");
      link.href = `data:image/png;base64,${base64}`;
      link.download = `screenshot-${Date.now()}.png`;
      link.click();
      showToast("Screenshot saved", "info");
    } catch (error) {
      showToast(`Screenshot failed: ${error}`);
    }
  }, [serial, showToast]);

  const noopSetSettings = useCallback((_fn: (state: boolean) => boolean) => {}, []);
  const noopSetTheme = useCallback((_fn: (pref: "light" | "dark" | "auto") => "light" | "dark" | "auto") => "light" as const, []);

  const {
    connectedDevice,
    connectingSerial,
    deviceSize,
    canvasRef,
    isMouseDown,
    recording,
    toggleRecording,
    connectToDevice,
    disconnect,
    handleCanvasMouseEvent,
    handleWheel,
    handleKeyDown,
  } = useConnection({
    deviceSerial: serial,
    settings,
    showToast,
    takeScreenshot,
    setShowSettings: noopSetSettings,
    setThemePref: noopSetTheme,
    onFrameReceived: undefined,
    onCodecFallback: undefined,
    onRecordEvent: undefined,
  });

  useEffect(() => {
    const loadDevice = async () => {
      try {
        const devices = await invoke<Device[]>("list_devices");
        const matched = devices.find((candidate) => candidate.serial === serial);
        setDevice(matched ?? { serial, model: serial, state: "device" });
      } catch {
        setDevice({ serial, model: serial, state: "device" });
      }
    };

    loadDevice();
    connectToDevice({ serial, model: serial, state: "device" }, settings);
    return () => {
      disconnect();
    };
  }, [connectToDevice, disconnect, serial, settings]);

  const session = sessionBySerial[serial];
  const status = session?.status ?? (connectedDevice ? "running" : connectingSerial === serial ? "starting" : "stopped");

  const sessionBadge = useMemo(() => {
    if (status === "running") return <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">Running</Badge>;
    if (status === "starting") return <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600">Starting</Badge>;
    if (status === "stopping") return <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-600">Stopping</Badge>;
    if (status === "error") return <Badge className="border-red-500/30 bg-red-500/10 text-red-600">Error</Badge>;
    return <Badge variant="outline">Stopped</Badge>;
  }, [status]);

  const handleReconnect = async () => {
    await connectToDevice(device, settings, false);
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 py-3">
        <div className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{device.model}</div>
            <div className="truncate text-xs text-muted-foreground">{serial}</div>
          </div>
          {sessionBadge}
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border/70 bg-card/90 p-2 shadow-lg backdrop-blur">
          <Button variant="outline" size="sm" onClick={handleReconnect} disabled={status === "starting" || status === "running"}>
            Reconnect
          </Button>
          <Button variant="destructive" size="sm" onClick={disconnect} disabled={status !== "running" && status !== "starting"}>
            Kill Session
          </Button>
        </div>
      </div>

      {connectedDevice ? (
        <MirrorScreen
          connectedDevice={connectedDevice}
          connecting={connectingSerial === serial}
          deviceSize={deviceSize}
          canvasRef={canvasRef}
          isMouseDown={isMouseDown}
          recording={recording}
          macroRecording={false}
          onToggleRecording={toggleRecording}
          onToggleMacroRecording={() => { }}
          onCanvasMouseEvent={handleCanvasMouseEvent}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        />  
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <div className="rounded-full border border-border bg-card px-4 py-2 text-sm">Device session stopped</div>
            <Button onClick={handleReconnect} disabled={status === "starting"}>Open again</Button>
            <Button variant="ghost" onClick={() => getCurrentWindow().close()}>Close window</Button>
          </div>
        </div>
      )}
    </div>
  );
}
