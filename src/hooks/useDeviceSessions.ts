import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { DeviceSessionInfo } from "../types";

export function useDeviceSessions(showToast: (msg: string, type?: "error" | "info") => void) {
  const [sessions, setSessions] = useState<DeviceSessionInfo[]>([]);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await invoke<DeviceSessionInfo[]>("list_device_sessions");
      setSessions(list);
    } catch (error) {
      showToast(`${error}`);
    }
  }, [showToast]);

  useEffect(() => {
    refreshSessions();
    const interval = setInterval(refreshSessions, 2000);
    const cleanup = listen<DeviceSessionInfo>("device-session-updated", () => {
      refreshSessions();
    });

    return () => {
      clearInterval(interval);
      cleanup.then((unlisten) => unlisten());
    };
  }, [refreshSessions]);

  const sessionBySerial = Object.fromEntries(sessions.map((session) => [session.serial, session]));

  return {
    sessions,
    sessionBySerial,
    refreshSessions,
  };
}
