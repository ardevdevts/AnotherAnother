import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowPathIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  MoonIcon,
  SignalIcon,
  SunIcon,
  WifiIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Spinner } from "./ui/spinner";
import type { Device, ThemePreference } from "../types";
import {
  getDeviceDisplayName,
  getDeviceNickname,
  setDeviceNickname,
} from "../types";
import appIcon from "../assets/icon.png";

interface WelcomeScreenProps {
  devices: Device[];
  connectingSerial: string | null;
  themePref: ThemePreference;
  onCycleTheme: () => void;
  onOpenSettings: () => void;
  onRefreshDevices: () => void;
  onConnectDevice: (device: Device) => void;
  showToast: (msg: string, type?: "error" | "info") => void;
}

function truncateSerial(serial: string) {
  return serial.length > 16 ? `${serial.slice(0, 6)}...${serial.slice(-4)}` : serial;
}

function isWifiDevice(serial: string) {
  return serial.includes(":");
}

export function WelcomeScreen({
  devices,
  connectingSerial,
  themePref,
  onCycleTheme,
  onOpenSettings,
  onRefreshDevices,
  onConnectDevice,
  showToast,
}: WelcomeScreenProps) {
  const [showWifiDialog, setShowWifiDialog] = useState(false);
  const [wifiAddress, setWifiAddress] = useState("");
  const [wifiConnecting, setWifiConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [togglingSerial, setTogglingSerial] = useState<string | null>(null);
  const [editingSerial, setEditingSerial] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; device: Device } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const runDeviceRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await Promise.resolve(onRefreshDevices());
    } finally {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [contextMenu]);

  const handleContextMenu = (event: React.MouseEvent, device: Device) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, device });
  };

  const toggleWifiForDevice = async (device: Device) => {
    setTogglingSerial(device.serial);
    try {
      if (isWifiDevice(device.serial)) {
        await invoke("wifi_disconnect", { address: device.serial });
        showToast(`${getDeviceDisplayName(device)} WiFi disconnected`, "info");
      } else if (device.wifi_available) {
        const ip = await invoke<string | null>("get_device_ip", { serial: device.serial });
        if (ip) {
          await invoke("wifi_disconnect", { address: `${ip}:5555` });
          showToast(`${getDeviceDisplayName(device)} WiFi disconnected`, "info");
        }
      } else {
        const addr = await invoke<string>("wifi_enable", { serial: device.serial });
        showToast(`${getDeviceDisplayName(device)} now available at ${addr}`, "info");
      }
      await runDeviceRefresh();
    } catch (error) {
      showToast(`${error}`);
    } finally {
      setTogglingSerial(null);
    }
  };

  const handleToggleWifi = async (event: React.MouseEvent, device: Device) => {
    event.stopPropagation();
    await toggleWifiForDevice(device);
  };

  const handleWifiConnect = async () => {
    if (!wifiAddress.trim()) return;
    setWifiConnecting(true);
    try {
      const addr = wifiAddress.includes(":") ? wifiAddress : `${wifiAddress}:5555`;
      await invoke("wifi_connect", { address: addr });
      showToast("Device connected via WiFi", "info");
      setWifiAddress("");
      setShowWifiDialog(false);
      await runDeviceRefresh();
    } catch (error) {
      showToast(`Connection failed: ${error}`);
    } finally {
      setWifiConnecting(false);
    }
  };

  return (
    <div className="relative flex h-screen w-screen select-none flex-col items-center justify-center overflow-hidden bg-linear-to-b from-background to-muted/30 px-5 pt-10">
      <div
        className="absolute top-0 right-0 left-0 flex h-10 items-center justify-end border-b border-border bg-card/80 pr-2 backdrop-blur-sm [-webkit-app-region:drag]"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <Button variant="ghost" size="icon-sm" onClick={onCycleTheme} title={themePref}>
            {themePref === "light" ? <SunIcon className="size-4" /> : themePref === "dark" ? <MoonIcon className="size-4" /> : <ComputerDesktopIcon className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setShowWifiDialog(true)} title="Connect via WiFi">
            <WifiIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onOpenSettings} title="Settings">
            <Cog6ToothIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6 mt-6 flex flex-col items-center gap-3">
        <img src={appIcon} alt="Another" className="size-16 rounded-2xl ring-1 ring-border" />
        <h1 className="text-3xl font-semibold tracking-tight">Another</h1>
        <p className="text-sm text-muted-foreground">Android screen mirroring and control</p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {devices.length > 0
              ? `${devices.length} device${devices.length > 1 ? "s" : ""} found`
              : isRefreshing
                ? "Searching..."
                : "No devices"}
          </span>
          <Button variant="ghost" size="sm" onClick={runDeviceRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Spinner className="size-4" /> : <ArrowPathIcon className="size-4" />}
            Refresh
          </Button>
        </div>

        {devices.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/80 px-6 py-8 text-center">
            {isRefreshing ? (
              <Spinner className="mx-auto mb-3 size-8 text-muted-foreground" />
            ) : (
              <SignalIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {isRefreshing ? "Searching for devices..." : "No devices detected."}
              <br />
              Connect your Android via USB and enable USB debugging.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <div
                key={device.serial}
                className="group flex cursor-pointer items-center gap-3 rounded-3xl border border-border bg-card/90 px-3 py-2 transition-colors hover:bg-accent/50"
                onClick={() => !connectingSerial && onConnectDevice(device)}
                onContextMenu={(event) => handleContextMenu(event, device)}
              >
                <div className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <DevicePhoneMobileIcon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingSerial === device.serial ? (
                    <Input
                      value={editValue}
                      className="h-8"
                      onChange={(event) => setEditValue(event.target.value)}
                      onBlur={() => {
                        setDeviceNickname(device.serial, editValue);
                        setEditingSerial(null);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          setDeviceNickname(device.serial, editValue);
                          setEditingSerial(null);
                        }
                        if (event.key === "Escape") setEditingSerial(null);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <div
                      className="truncate text-sm font-semibold"
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setEditingSerial(device.serial);
                        setEditValue(getDeviceDisplayName(device));
                      }}
                      title="Double-click to rename"
                    >
                      {getDeviceDisplayName(device)}
                    </div>
                  )}
                  <div className="truncate text-xs text-muted-foreground">
                    {truncateSerial(device.serial)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant={isWifiDevice(device.serial) || device.wifi_available ? "secondary" : "ghost"}
                    size="icon-sm"
                    title={isWifiDevice(device.serial) ? "Disable WiFi" : "Enable WiFi"}
                    onClick={(event) => handleToggleWifi(event, device)}
                    disabled={togglingSerial === device.serial}
                  >
                    {togglingSerial === device.serial ? <Spinner className="size-4" /> : <WifiIcon className="size-4" />}
                  </Button>
                  {connectingSerial === device.serial ? <Spinner className="size-4 text-muted-foreground" /> : <ChevronRightIcon className="size-4 text-muted-foreground group-hover:text-foreground" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-120 min-w-40 rounded-2xl border border-border bg-popover p-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <Button className="w-full justify-start rounded-xl" variant="ghost" size="sm" onClick={() => {
            onConnectDevice(contextMenu.device);
            setContextMenu(null);
          }}>
            Connect
          </Button>
          <Button className="w-full justify-start rounded-xl" variant="ghost" size="sm" onClick={() => {
            setEditingSerial(contextMenu.device.serial);
            setEditValue(getDeviceDisplayName(contextMenu.device));
            setContextMenu(null);
          }}>
            Rename
          </Button>
          {getDeviceNickname(contextMenu.device.serial) && (
            <Button className="w-full justify-start rounded-xl" variant="ghost" size="sm" onClick={() => {
              setDeviceNickname(contextMenu.device.serial, "");
              setContextMenu(null);
            }}>
              Reset Name
            </Button>
          )}
          <Button className="w-full justify-start rounded-xl" variant="ghost" size="sm" onClick={() => {
            toggleWifiForDevice(contextMenu.device);
            setContextMenu(null);
          }}>
            {isWifiDevice(contextMenu.device.serial) ? "Disable WiFi" : "Enable WiFi"}
          </Button>
          <div className="my-1 border-t border-border" />
          <Button className="w-full justify-start rounded-xl" variant="ghost" size="sm" onClick={() => {
            navigator.clipboard.writeText(contextMenu.device.serial);
            showToast("Serial copied", "info");
            setContextMenu(null);
          }}>
            Copy Serial
          </Button>
        </div>
      )}

      <Dialog open={showWifiDialog} onOpenChange={setShowWifiDialog}>
        <DialogContent showCloseButton={false} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect by IP</DialogTitle>
            <DialogDescription>
              On your Android device, open Settings &gt; About phone &gt; Status and find the IP address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="text"
              placeholder="192.168.1.100"
              value={wifiAddress}
              onChange={(event) => setWifiAddress(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleWifiConnect()}
              autoFocus
            />
            <Badge variant="outline">Both devices must be on the same network</Badge>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWifiDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleWifiConnect} disabled={wifiConnecting || !wifiAddress.trim()}>
              {wifiConnecting ? <Spinner /> : null}
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
