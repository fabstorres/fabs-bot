import { useSyncExternalStore } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { pcBridge } from "../pcBridge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const controls = pcBridge?.windowControls;
let maximized = false;
const getMaximized = () => maximized;
const subscribe = (onChange: () => void) => controls?.onMaximizedChange((value) => {
  maximized = value;
  onChange();
}) ?? (() => {});

export function WindowControls({ className }: { className?: string }) {
  const isMaximized = useSyncExternalStore(subscribe, getMaximized);
  if (!controls) return null;

  return (
    <div role="group" aria-label="Window controls" className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button variant="ghost" size="icon-sm" onClick={() => void controls.minimize()} aria-label="Minimize" title="Minimize">
        <Minus />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => void controls.toggleMaximize()} aria-label={isMaximized ? "Restore" : "Maximize"} title={isMaximized ? "Restore" : "Maximize"}>
        {isMaximized ? <Copy /> : <Square />}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => void controls.close()} aria-label="Close" title="Close">
        <X />
      </Button>
    </div>
  );
}
