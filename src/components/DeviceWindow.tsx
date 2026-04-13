import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Skeleton } from "./ui/skeleton";
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
  const [device, setDevice] = useState<Device>({
    serial,
    model: serial,
    state: "device",
  });
  const [showOverlay, setShowOverlay] = useState(false);
  const [isConnectingPhase, setIsConnectingPhase] = useState(true);
  const [connectTimedOut, setConnectTimedOut] = useState(false);
  const { sessionBySerial } = useDeviceSessions(showToast);

  const startConnectAttempt = useCallback(() => {
    setIsConnectingPhase(true);
    setConnectTimedOut(false);
  }, []);

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

  const noopSetSettings = useCallback(
    (_fn: (state: boolean) => boolean) => {},
    [],
  );
  const noopSetTheme = useCallback(
    (_fn: (pref: "light" | "dark" | "auto") => "light" | "dark" | "auto") =>
      "light" as const,
    [],
  );

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
        const matched = devices.find(
          (candidate) => candidate.serial === serial,
        );
        setDevice(matched ?? { serial, model: serial, state: "device" });
      } catch {
        setDevice({ serial, model: serial, state: "device" });
      }
    };

    loadDevice();
    startConnectAttempt();
    connectToDevice({ serial, model: serial, state: "device" }, settings);
    return () => {
      disconnect();
    };
  }, [connectToDevice, disconnect, serial, settings, startConnectAttempt]);

  const session = sessionBySerial[serial];
  const status =
    session?.status ??
    (connectedDevice
      ? "running"
      : connectingSerial === serial
        ? "starting"
        : "stopped");
  const showLoadingScreen =
    isConnectingPhase && !connectedDevice && !connectTimedOut;
  const shouldShowOverlayForState =
    !showLoadingScreen &&
    (status === "error" ||
      status === "stopping" ||
      status === "stopped" ||
      !connectedDevice);
  const overlayVisible = showOverlay || shouldShowOverlayForState;

  useEffect(() => {
    if (connectedDevice) {
      setIsConnectingPhase(false);
      setConnectTimedOut(false);
    }
  }, [connectedDevice]);

  useEffect(() => {
    if (!isConnectingPhase) return;
    const timer = setTimeout(() => setConnectTimedOut(true), 30000);
    return () => clearTimeout(timer);
  }, [isConnectingPhase]);

  useEffect(() => {
    const isMac = navigator.userAgent.includes("Mac");
    const onKeyDown = (event: KeyboardEvent) => {
      const hasModifier = isMac ? event.metaKey : event.ctrlKey;
      if (hasModifier && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setShowOverlay((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sessionBadge = useMemo(() => {
    if (status === "running")
      return (
        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
          Running
        </Badge>
      );
    if (status === "starting")
      return (
        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600">
          Starting
        </Badge>
      );
    if (status === "stopping")
      return (
        <Badge className="border-rose-500/30 bg-rose-500/10 text-rose-600">
          Stopping
        </Badge>
      );
    if (status === "error")
      return (
        <Badge className="border-red-500/30 bg-red-500/10 text-red-600">
          Error
        </Badge>
      );
    return <Badge variant="outline">Stopped</Badge>;
  }, [status]);

  const handleReconnect = async () => {
    startConnectAttempt();
    await connectToDevice(device, settings, false);
  };

  const handleKillSession = async () => {
    setIsConnectingPhase(false);
    setConnectTimedOut(false);
    await disconnect();
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {overlayVisible && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 py-3">
          <div className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {device.model}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {serial}
              </div>
            </div>
            {sessionBadge}
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border/70 bg-card/90 p-2 shadow-lg backdrop-blur">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReconnect}
              disabled={status === "starting" || status === "running"}
            >
              Reconnect
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleKillSession}
              disabled={status !== "running" && status !== "starting"}
            >
              Kill Session
            </Button>
          </div>
        </div>
      )}

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
          onToggleMacroRecording={() => {}}
          onCanvasMouseEvent={handleCanvasMouseEvent}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        />
      ) : showLoadingScreen ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <div className="rounded-[2.5rem] border-[6px] border-border bg-card p-2 shadow-2xl">
                <Skeleton className="h-[480px] w-[270px] rounded-[2rem]" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border border-border/50 bg-background/90 p-4 shadow-lg backdrop-blur">
                  <Spinner className="size-6 text-primary" />
                </div>
              </div>
              <div className="absolute -bottom-3 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-muted" />
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">Connecting to {device.model}</div>
              <div className="text-xs text-muted-foreground">Initializing stream session...</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            <div className="rounded-full border border-border bg-card px-4 py-2 text-sm">
              {connectTimedOut
                ? "Connection timed out"
                : "Device session stopped"}
            </div>
            <Button onClick={handleReconnect} disabled={status === "starting"}>
              Open again
            </Button>
            <Button variant="ghost" onClick={() => getCurrentWindow().close()}>
              Close window
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
