import { useMemo } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Kbd } from "./ui/kbd";

interface CommandDef {
  id: string;
  label: string;
  keys: string[];
  section: string;
  action: () => void;
}

interface CommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandDef[];
}

export function CommandBar({ open, onOpenChange, commands }: CommandBarProps) {
  const groupedCommands = useMemo(() => {
    const groups = new Map<string, CommandDef[]>();
    for (const command of commands) {
      const group = groups.get(command.section) ?? [];
      group.push(command);
      groups.set(command.section, group);
    }
    return Array.from(groups.entries());
  }, [commands]);

  const run = (command: CommandDef) => {
    onOpenChange(false);
    command.action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
      className="w-140 max-w-[calc(100%-2rem)]"
    >
      <Command className="rounded-4xl border border-border bg-popover">
        <CommandInput autoFocus placeholder="Type a command..." />
        <CommandList>
          <CommandEmpty>No matching commands</CommandEmpty>
          {groupedCommands.map(([section, sectionCommands]) => (
            <CommandGroup key={section} heading={section}>
              {sectionCommands.map((command) => (
                <CommandItem
                  key={command.id}
                  value={`${command.label} ${section}`}
                  onSelect={() => run(command)}
                >
                  <span className="truncate">{command.label}</span>
                  {command.keys.length > 0 && (
                    <span className="ml-auto flex items-center gap-1">
                      {command.keys.map((key, index) => (
                        <Kbd key={`${command.id}-${index}`} className="text-[11px]">
                          {key}
                        </Kbd>
                      ))}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
