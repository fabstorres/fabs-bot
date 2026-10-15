import { useState, type ReactNode, type RefObject } from "react";
import { closeModal } from "../store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The control focus returns to on close: the focused element, or the trigger of the menu it sits in. */
function opener() {
  const active = document.activeElement;
  const menu = active?.closest("[role=menu]");
  const trigger = menu && document.getElementById(menu.getAttribute("aria-labelledby") ?? "");
  return (trigger ?? active) as HTMLElement | null;
}

export function Modal({
  children,
  wide,
  title,
  label,
  initialFocus,
  onClose = closeModal,
  onCloseAutoFocus,
}: {
  children: ReactNode;
  wide?: boolean;
  title?: ReactNode;
  /** Accessible dialog name (defaults to a string title). */
  label?: string;
  /** Element to focus when the dialog opens, instead of its first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  onClose?(): void;
  onCloseAutoFocus?(event: Event): void;
}) {
  const [returnTo] = useState(opener);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        onOpenAutoFocus={(e) => {
          if (!initialFocus?.current) return;
          e.preventDefault();
          initialFocus.current.focus();
        }}
        className={cn("max-h-[90dvh] gap-0 overflow-y-auto rounded-3xl p-6 sm:max-w-lg", wide && "sm:max-w-3xl")}
        onCloseAutoFocus={
          onCloseAutoFocus ??
          ((e) => {
            e.preventDefault();
            returnTo?.focus();
          })
        }
      >
        <DialogTitle className={cn("mb-4 pr-8 text-xl font-semibold", !title && "sr-only")}>{title ?? label}</DialogTitle>
        <DialogDescription className="sr-only">{label ?? (typeof title === "string" ? title : "Dialog")}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
