import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { cn } from "../lib/utils";
import type { Settings } from "../types";
import { CODEC_OPTIONS, PRESETS, RESOLUTION_OPTIONS } from "../types";

const DEFAULT_MCP_PORT = 7070;

function getMcpUrl(port: number) {
  return `http://localhost:${port}/mcp`;
}

function getMcpConfig(port: number) {
  return JSON.stringify(
    {
      mcpServers: {
        another: { type: "http", url: getMcpUrl(port) },
      },
    },
    null,
    2
  );
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  activePreset: string;
  onApplyPreset: (name: string) => void;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-b border-border/60 pb-5 last:border-0 last:pb-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  value,
  children,
  className,
}: {
  label: string;
  value?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {value ? <div className="font-mono text-xs text-muted-foreground">{value}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  activePreset,
  onApplyPreset,
  onUpdateSetting,
}: SettingsDialogProps) {
  const [mcpInstructionsOpen, setMcpInstructionsOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const [mcpEnabled, setMcpEnabled] = useState(() => {
    const stored = localStorage.getItem("mcp_enabled");
    return stored === null ? true : stored === "true";
  });
  const [mcpPort] = useState(() => {
    const stored = localStorage.getItem("mcp_port");
    return stored ? parseInt(stored, 10) : DEFAULT_MCP_PORT;
  });
  const [mcpRunning, setMcpRunning] = useState(false);

  const checkMcpStatus = useCallback(async () => {
    try {
      const running = await invoke<boolean>("get_mcp_status");
      setMcpRunning(running);
    } catch {
      setMcpRunning(false);
    }
  }, []);

  useEffect(() => {
    checkMcpStatus();
  }, [checkMcpStatus]);

  async function handleMcpToggle(enabled: boolean) {
    setMcpEnabled(enabled);
    localStorage.setItem("mcp_enabled", String(enabled));
    try {
      if (enabled) {
        await invoke("start_mcp_server", { port: mcpPort });
      } else {
        await invoke("stop_mcp_server");
      }
      await checkMcpStatus();
    } catch {
      setMcpRunning(false);
    }
  }

  function handleCopyUrl() {
    copyToClipboard(getMcpUrl(mcpPort));
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  function handleCopySnippet(key: string, text: string) {
    copyToClipboard(text);
    setCopiedSnippet(key);
    setTimeout(() => setCopiedSnippet(null), 2000);
  }

  const mcpConfig = getMcpConfig(mcpPort);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes reconnect automatically when required.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
          <SettingsSection title="Presets">
            <div className="grid grid-cols-3 gap-2">
              {Object.keys(PRESETS).map((name) => (
                <Button
                  key={name}
                  variant={activePreset === name ? "default" : "outline"}
                  size="sm"
                  onClick={() => onApplyPreset(name)}
                  className="capitalize"
                >
                  {name}
                </Button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection title="Video">
            <div className={cn("space-y-4", settings.adaptive && "opacity-50 pointer-events-none")}>
              <SettingRow label="Resolution">
                <Select
                  value={String(settings.max_size)}
                  onValueChange={(value) => onUpdateSetting("max_size", Number(value))}
                >
                  <SelectTrigger className="min-w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Max FPS" value={`${settings.max_fps}`}>
                <div className="w-44" />
              </SettingRow>
              <Slider
                value={settings.max_fps}
                onValueChange={(value) => onUpdateSetting("max_fps", value as number)}
                min={15}
                max={120}
                step={5}
              />

              <SettingRow
                label="Bitrate"
                value={`${(settings.video_bit_rate / 1000000).toFixed(0)} Mbps`}
              >
                <div className="w-44" />
              </SettingRow>
              <Slider
                value={settings.video_bit_rate}
                onValueChange={(value) => onUpdateSetting("video_bit_rate", value as number)}
                min={1000000}
                max={32000000}
                step={1000000}
              />
            </div>

            <SettingRow label="Codec" className="pt-1">
              <Select
                value={settings.video_codec}
                onValueChange={(value) => {
                  if (value) onUpdateSetting("video_codec", value);
                }}
              >
                <SelectTrigger className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODEC_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow label="Adaptive Quality">
              <Switch
                checked={settings.adaptive}
                onCheckedChange={(checked) => onUpdateSetting("adaptive", checked)}
              />
            </SettingRow>
            <p className="text-xs text-muted-foreground">
              Automatically adjusts quality based on network conditions.
            </p>
          </SettingsSection>

          <SettingsSection title="Audio">
            <SettingRow label="Forward device audio">
              <Switch
                checked={settings.audio}
                onCheckedChange={(checked) => onUpdateSetting("audio", checked)}
              />
            </SettingRow>
            <p className="text-xs text-muted-foreground">Requires Android 11+.</p>
          </SettingsSection>

          <SettingsSection title="MCP Server">
            <SettingRow label="Enable MCP server">
              <Switch checked={mcpEnabled} onCheckedChange={handleMcpToggle} />
            </SettingRow>

            {mcpRunning ? <Badge variant="outline">Running on port {mcpPort}</Badge> : null}

            {mcpEnabled && (
              <div className="space-y-3 rounded-3xl border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Let AI agents control your Android device.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-xl bg-card px-3 py-2 font-mono text-xs ring-1 ring-border">
                    {getMcpUrl(mcpPort)}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                    <ClipboardDocumentIcon className="size-4" />
                    {copiedUrl ? "Copied" : "Copy URL"}
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  className="w-full justify-between px-2"
                  onClick={() => setMcpInstructionsOpen((value) => !value)}
                >
                  Setup instructions
                  <ChevronDownIcon
                    className={cn(
                      "size-4 transition-transform",
                      mcpInstructionsOpen && "rotate-180"
                    )}
                  />
                </Button>

                {mcpInstructionsOpen && (
                  <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Claude Code, Claude Desktop, Cursor, etc.
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopySnippet("config", mcpConfig)}
                      >
                        <ClipboardDocumentIcon className="size-4" />
                        {copiedSnippet === "config" ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs">
                      {mcpConfig}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </SettingsSection>
        </div>

        <div className="border-t border-border px-6 py-4">
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            <CheckIcon className="size-4" />
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
