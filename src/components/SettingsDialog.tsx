import { CheckIcon } from "@heroicons/react/24/outline";
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
import { Input } from "./ui/input";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";
import type { Settings } from "../types";
import {
  CODEC_OPTIONS,
  INPUT_MODE_OPTIONS,
  ORIENTATION_OPTIONS,
  PRESETS,
  RESOLUTION_OPTIONS,
} from "../types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  activePreset: string;
  onApplyPreset: (name: string) => void;
  onUpdateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
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

          <SettingsSection title="Scrcpy">
            <p className="text-xs text-muted-foreground">
              Advanced server arguments (bundled server: scrcpy v2.7). Changes reconnect automatically.
            </p>

            <SettingRow label="Display ID">
              <Input
                type="number"
                min={0}
                value={String(settings.display_id)}
                className="w-32"
                onChange={(event) =>
                  onUpdateSetting("display_id", Number(event.target.value || "0"))
                }
              />
            </SettingRow>

            <SettingRow label="Orientation">
              <Select
                value={settings.orientation}
                onValueChange={(value) => onUpdateSetting("orientation", value ?? "")}
              >
                <SelectTrigger className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIENTATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value || "auto"} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <div className="space-y-2">
              <div className="text-sm font-medium">Crop</div>
              <Input
                value={settings.crop}
                placeholder="width:height:x:y (example: 1080:1920:0:0)"
                onChange={(event) => onUpdateSetting("crop", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Video Encoder</div>
              <Input
                value={settings.video_encoder}
                placeholder="MediaCodec name (optional)"
                onChange={(event) => onUpdateSetting("video_encoder", event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Video Codec Options</div>
              <Input
                value={settings.video_codec_options}
                placeholder="key[:type]=value,key[:type]=value"
                onChange={(event) => onUpdateSetting("video_codec_options", event.target.value)}
              />
            </div>

            <SettingRow
              label="Video Buffer"
              value={`${settings.video_buffer} ms`}
            >
              <div className="w-44" />
            </SettingRow>
            <Slider
              value={settings.video_buffer}
              onValueChange={(value) => onUpdateSetting("video_buffer", value as number)}
              min={0}
              max={500}
              step={10}
            />

            <SettingRow
              label="Audio Buffer"
              value={`${settings.audio_buffer} ms`}
            >
              <div className="w-44" />
            </SettingRow>
            <Slider
              value={settings.audio_buffer}
              onValueChange={(value) => onUpdateSetting("audio_buffer", value as number)}
              min={0}
              max={500}
              step={10}
            />

            <SettingRow label="Keyboard Mode">
              <Select
                value={settings.keyboard_mode}
                onValueChange={(value) => onUpdateSetting("keyboard_mode", value ?? "sdk")}
              >
                <SelectTrigger className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INPUT_MODE_OPTIONS.map((option) => (
                    <SelectItem key={`kbd-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow label="Mouse Mode">
              <Select
                value={settings.mouse_mode}
                onValueChange={(value) => onUpdateSetting("mouse_mode", value ?? "sdk")}
              >
                <SelectTrigger className="min-w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INPUT_MODE_OPTIONS.map((option) => (
                    <SelectItem key={`mouse-${option.value}`} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>

            <div className="space-y-2">
              <div className="text-sm font-medium">Shortcut Modifier</div>
              <Input
                value={settings.shortcut_mod}
                placeholder="lalt,lsuper"
                onChange={(event) => onUpdateSetting("shortcut_mod", event.target.value)}
              />
            </div>

            <SettingRow label="Show Touches">
              <Switch
                checked={settings.show_touches}
                onCheckedChange={(checked) => onUpdateSetting("show_touches", checked)}
              />
            </SettingRow>

            <SettingRow label="Stay Awake">
              <Switch
                checked={settings.stay_awake}
                onCheckedChange={(checked) => onUpdateSetting("stay_awake", checked)}
              />
            </SettingRow>

            <SettingRow label="Turn Screen Off on Start">
              <Switch
                checked={settings.turn_screen_off}
                onCheckedChange={(checked) => onUpdateSetting("turn_screen_off", checked)}
              />
            </SettingRow>

            <SettingRow label="Disable Clipboard Autosync">
              <Switch
                checked={settings.no_clipboard_autosync}
                onCheckedChange={(checked) =>
                  onUpdateSetting("no_clipboard_autosync", checked)
                }
              />
            </SettingRow>

            <SettingRow label="Power Off Screen on Close">
              <Switch
                checked={settings.power_off_on_close}
                onCheckedChange={(checked) => onUpdateSetting("power_off_on_close", checked)}
              />
            </SettingRow>

            <div className="space-y-2">
              <div className="text-sm font-medium">Extra Server Args</div>
              <Textarea
                value={settings.extra_server_args}
                placeholder="Example: max_fps=120 no_downsize_on_error=true"
                className="min-h-20"
                onChange={(event) => onUpdateSetting("extra_server_args", event.target.value)}
              />
              <div className="text-xs text-muted-foreground">
                Space-separated arguments appended to server command.
              </div>
            </div>
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
