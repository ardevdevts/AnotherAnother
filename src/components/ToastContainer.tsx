import type { Toast } from "../types";
import { cn } from "../lib/utils";

interface ToastContainerProps {
  toasts: Toast[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  return (
    <div className="pointer-events-none fixed bottom-14 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-in fade-in slide-in-from-bottom-2 rounded-xl px-4 py-2 text-center text-sm font-medium shadow-lg backdrop-blur",
            t.type === "error"
              ? "bg-destructive text-destructive-foreground"
              : "border border-border bg-card text-card-foreground"
          )}
        >
          {t.message}
        </div>

      ))}
    </div>
  );
}
