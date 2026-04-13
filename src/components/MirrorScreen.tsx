import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  StopIcon,
} from "@heroicons/react/24/outline";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import type { Device } from "../types";

interface MirrorScreenProps {
  connectedDevice: Device;
  connecting?: boolean;
  deviceSize: { width: number; height: number };
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isMouseDown: React.MutableRefObject<boolean>;
  recording: boolean;
  macroRecording: boolean;
  adaptiveInfo?: { enabled: boolean; tierName: string; fps: number };
  onToggleRecording: () => void;
  onToggleMacroRecording: () => void;
  onCanvasMouseEvent: (event: React.MouseEvent<HTMLCanvasElement>, action: string) => void;
  onWheel: (event: React.WheelEvent<HTMLCanvasElement>) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function MacroRecordingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 25" fill="none" className="size-3 animate-pulse text-amber-400">
      <path d="M11.41 2.068c-.57 0-1.08 0-1.55.17-.1.04-.19.08-.29.12-.46.22-.81.58-1.21.98L3.58 8.148c-.47.47-.88.88-1.11 1.43-.22.54-.22 1.13-.22 1.8v3.47c0 1.78 0 3.22.15 4.35.16 1.17.49 2.16 1.27 2.95.78.78 1.76 1.12 2.93 1.28 1.12.15 2.55.15 4.33.15s3.31 0 4.43-.15c-.49-1.1-1.51-2.09-2.61-2.52-1.66-.65-1.66-3.01 0-3.66 1.16-.46 2.22-1.52 2.67-2.67.66-1.66 3.01-1.66 3.66 0 .16.41.39.81.67 1.17V14.858c0-1.53 0-2.77-.11-3.75-.12-1.02-.37-1.89-.96-2.63-.22-.27-.46-.52-.73-.74-.73-.6-1.6-.85-2.61-.97-1.18-.11-2.4-.11-3.92-.11z" fill="currentColor" opacity="0.5" />
      <path fillRule="evenodd" clipRule="evenodd" d="M9.569 2.358c.09-.05.19-.09.29-.12.21-.07.42-.12.65-.14v1.99c0 1.36 0 2.01-.12 2.88-.12.9-.38 1.66-.98 2.26s-1.36.86-2.26.98c-.87.12-1.52.12-2.88.12H2.289c.03-.26.09-.51.18-.75.22-.54.64-.96 1.11-1.43l4.78-4.81c.4-.4.76-.77 1.21-.98zM17.919 23.118c-.24.61-1.09.61-1.33 0l-.04-.1a5.73 5.73 0 00-3.23-3.23l-.11-.04c-.6-.24-.6-1.1 0-1.33l.11-.04a5.73 5.73 0 003.23-3.23l.04-.1c.24-.61 1.09-.61 1.33 0l.04.1a5.73 5.73 0 003.23 3.23l.11.04c.6.24.6 1.1 0 1.33l-.11.04a5.73 5.73 0 00-3.23 3.23l-.04.1z" fill="currentColor" />
    </svg>
  );
}

function OverlayBar({
  tone,
  time,
  onStop,
  children,
}: {
  tone: "red" | "amber";
  time: string;
  onStop: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/75 px-3 py-1.5 text-white backdrop-blur">
      {children}
      <span className="min-w-10 text-center font-mono text-sm">{time}</span>
      <Button
        size="sm"
        className={tone === "red" ? "bg-red-500 text-white hover:bg-red-600" : "bg-amber-500 text-white hover:bg-amber-600"}
        onClick={onStop}
      >
        <StopIcon className="size-4" />
        Stop
      </Button>
    </div>
  );
}

export function MirrorScreen({
  connectedDevice: _connectedDevice,
  connecting,
  deviceSize,
  canvasRef,
  isMouseDown,
  recording,
  macroRecording,
  adaptiveInfo,
  onToggleRecording,
  onToggleMacroRecording,
  onCanvasMouseEvent,
  onWheel,
  onKeyDown,
}: MirrorScreenProps) {
  const [elapsed, setElapsed] = useState(0);
  const [macroElapsed, setMacroElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const macroIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (recording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [recording]);

  useEffect(() => {
    if (macroRecording) {
      setMacroElapsed(0);
      macroIntervalRef.current = setInterval(() => setMacroElapsed((seconds) => seconds + 1), 1000);
    } else {
      if (macroIntervalRef.current) clearInterval(macroIntervalRef.current);
      macroIntervalRef.current = null;
    }
    return () => {
      if (macroIntervalRef.current) clearInterval(macroIntervalRef.current);
    };
  }, [macroRecording]);

  return (
    <div className="flex h-screen w-screen flex-col">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black/90 outline-none" tabIndex={0} onKeyDown={onKeyDown}>
        {connecting ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Spinner className="size-6" />
            <p className="text-sm font-medium">Connecting...</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={deviceSize.width}
            height={deviceSize.height}
            className="max-h-full max-w-full object-contain"
            onMouseDown={(event) => {
              isMouseDown.current = true;
              onCanvasMouseEvent(event, "down");
            }}
            onMouseMove={(event) => {
              if (isMouseDown.current) onCanvasMouseEvent(event, "move");
            }}
            onMouseUp={(event) => {
              isMouseDown.current = false;
              onCanvasMouseEvent(event, "up");
            }}
            onMouseLeave={(event) => {
              if (isMouseDown.current) {
                isMouseDown.current = false;
                onCanvasMouseEvent(event, "up");
              }
            }}
            onWheel={onWheel}
            onContextMenu={(event) => event.preventDefault()}
          />
        )}

        {recording && (
          <OverlayBar tone="red" time={formatTime(elapsed)} onStop={onToggleRecording}>
            <span className="size-2 rounded-full bg-red-500 animate-pulse" />
          </OverlayBar>
        )}

        {macroRecording && (
          <div className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
            <OverlayBar tone="amber" time={formatTime(macroElapsed)} onStop={onToggleMacroRecording}>
              <MacroRecordingIcon />
            </OverlayBar>
          </div>
        )}

        {adaptiveInfo?.enabled && (
          <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 font-mono text-xs text-white backdrop-blur">
            {adaptiveInfo.tierName} · {adaptiveInfo.fps} FPS
          </div>
        )}
      </div>
    </div>
  );
}
