import { useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  FolderIcon,
  PencilIcon,
  PlayCircleIcon,
  PlayIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
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
import { cn } from "../lib/utils";
import type { MacroInfo } from "../hooks/useMacro";
import macroIcon from "../assets/macro.png";

function MacroItemIcon() {
  return (
    <svg viewBox="0 0 24 25" fill="none" className="size-4">
      <path d="M11.41 2.068c-.57 0-1.08 0-1.55.17-.1.04-.19.08-.29.12-.46.22-.81.58-1.21.98L3.58 8.148c-.47.47-.88.88-1.11 1.43-.22.54-.22 1.13-.22 1.8v3.47c0 1.78 0 3.22.15 4.35.16 1.17.49 2.16 1.27 2.95.78.78 1.76 1.12 2.93 1.28 1.12.15 2.55.15 4.33.15s3.31 0 4.43-.15c-.49-1.1-1.51-2.09-2.61-2.52-1.66-.65-1.66-3.01 0-3.66 1.16-.46 2.22-1.52 2.67-2.67.66-1.66 3.01-1.66 3.66 0 .16.41.39.81.67 1.17V14.858c0-1.53 0-2.77-.11-3.75-.12-1.02-.37-1.89-.96-2.63-.22-.27-.46-.52-.73-.74-.73-.6-1.6-.85-2.61-.97-1.18-.11-2.4-.11-3.92-.11z" fill="currentColor" opacity="0.4" />
      <path fillRule="evenodd" clipRule="evenodd" d="M9.569 2.358c.09-.05.19-.09.29-.12.21-.07.42-.12.65-.14v1.99c0 1.36 0 2.01-.12 2.88-.12.9-.38 1.66-.98 2.26s-1.36.86-2.26.98c-.87.12-1.52.12-2.88.12H2.289c.03-.26.09-.51.18-.75.22-.54.64-.96 1.11-1.43l4.78-4.81c.4-.4.76-.77 1.21-.98zM17.919 23.118c-.24.61-1.09.61-1.33 0l-.04-.1a5.73 5.73 0 00-3.23-3.23l-.11-.04c-.6-.24-.6-1.1 0-1.33l.11-.04a5.73 5.73 0 003.23-3.23l.04-.1c.24-.61 1.09-.61 1.33 0l.04.1a5.73 5.73 0 003.23 3.23l.11.04c.6.24.6 1.1 0 1.33l-.11.04a5.73 5.73 0 00-3.23 3.23l-.04.1z" fill="currentColor" />
    </svg>
  );
}

interface MacrosScreenProps {
  macros: MacroInfo[];
  macrosDir: string;
  playingMacro: string | null;
  onBack: () => void;
  onPlay: (name: string) => void;
  onDelete: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onReorder: (order: string[]) => void;
  onExport: (name: string) => void;
  onExportAll: () => void;
  onImport: () => void;
  onSetDir: (dir: string) => void;
  showToast: (msg: string, type?: "error" | "info") => void;
}

export function MacrosScreen({
  macros,
  macrosDir,
  playingMacro,
  onBack,
  onPlay,
  onDelete,
  onRename,
  onExport,
  onExportAll,
  onImport,
  onSetDir,
  showToast,
}: MacrosScreenProps) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingPlay, setPendingPlay] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = (name: string) => {
    setEditingName(name);
    setEditValue(name);
    setTimeout(() => editInputRef.current?.select(), 0);
  };

  const handleConfirmEdit = () => {
    if (!editingName) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== editingName) {
      onRename(editingName, trimmed);
    }
    setEditingName(null);
  };

  const handlePickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected) {
        onSetDir(selected as string);
        showToast("Macros folder changed", "info");
      }
    } catch {
      // noop
    }
  };

  const shortDir = macrosDir.length > 40 ? `...${macrosDir.slice(macrosDir.length - 37)}` : macrosDir;

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 px-5 pt-10">
      <div
        className="absolute top-0 right-0 left-0 flex h-10 items-center justify-between border-b border-border bg-card/80 px-2 backdrop-blur-sm [-webkit-app-region:drag]"
        data-tauri-drag-region
      >
        <Button variant="ghost" size="icon-sm" className="[-webkit-app-region:no-drag]" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
          <Button variant="ghost" size="icon-sm" onClick={onImport}>
            <ArrowUpTrayIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handlePickFolder}>
            <FolderIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6 mt-6 flex flex-col items-center gap-3">
        <img src={macroIcon} alt="Macros" className="size-16 rounded-2xl ring-1 ring-border" />
        <h1 className="text-3xl font-semibold tracking-tight">Macros</h1>
        <p className="text-sm text-muted-foreground">Record and replay device interactions</p>
      </div>

      <div className="w-full max-w-md space-y-2">
        {macros.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {macros.length} macro{macros.length > 1 ? "s" : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={onExportAll}>
              <ArrowDownTrayIcon className="size-4" />
              Export
            </Button>
          </div>
        )}

        {macros.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/80 px-6 py-8 text-center">
            <PlayCircleIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-semibold">No macros yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Record one with Cmd/Ctrl+Shift+M while on the device screen.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={onImport}>
              Import from file
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {macros.map((macro) => (
              <div
                key={macro.name}
                className={cn(
                  "flex items-center gap-3 rounded-3xl border border-border bg-card/90 px-3 py-2",
                  playingMacro === macro.name && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <MacroItemIcon />
                </div>

                <div className="min-w-0 flex-1">
                  {editingName === macro.name ? (
                    <div className="flex items-center gap-1">
                      <Input
                        ref={editInputRef}
                        value={editValue}
                        className="h-8"
                        onChange={(event) => setEditValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") handleConfirmEdit();
                          if (event.key === "Escape") setEditingName(null);
                        }}
                        autoFocus
                      />
                      <Button size="icon-sm" variant="ghost" onClick={handleConfirmEdit}>
                        <CheckIcon className="size-4 text-green-500" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditingName(null)}>
                        <XMarkIcon className="size-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="truncate text-sm font-semibold">{macro.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {macro.event_count} event{macro.event_count !== 1 ? "s" : ""}
                      </div>
                    </>
                  )}
                </div>

                {editingName !== macro.name && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-primary"
                      onClick={() => setPendingPlay(macro.name)}
                      disabled={!!playingMacro}
                    >
                      {playingMacro === macro.name ? <Spinner className="size-4" /> : <PlayIcon className="size-4" />}
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleStartEdit(macro.name)}>
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => onExport(macro.name)}>
                      <ArrowDownTrayIcon className="size-4" />
                    </Button>
                    {confirmDelete === macro.name ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => {
                          onDelete(macro.name);
                          setConfirmDelete(null);
                        }}
                        onBlur={() => setConfirmDelete(null)}
                      >
                        <CheckIcon className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={() => setConfirmDelete(macro.name)}
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          className="mt-2 flex w-full items-center gap-2 truncate rounded-2xl border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/50"
          onClick={handlePickFolder}
        >
          <FolderIcon className="size-4 shrink-0" />
          <span className="truncate">{shortDir}</span>
        </button>
      </div>

      <Dialog open={!!pendingPlay} onOpenChange={(isOpen) => !isOpen && setPendingPlay(null)}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Play Macro</DialogTitle>
            <DialogDescription>
              Ready to play <strong>{pendingPlay}</strong>? You will be taken back to the device screen first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPlay(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const name = pendingPlay;
                setPendingPlay(null);
                if (name) onPlay(name);
              }}
            >
              Play
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
