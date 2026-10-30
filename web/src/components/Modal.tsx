import type { ReactNode, RefObject } from "react";
import { closeModal, useStore } from "../store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function Modal({
  children,
  wide,
  className,
  title,
  label,
  initialFocus,
  onClose = closeModal,
  onCloseAutoFocus,
}: {
  children: ReactNode;
  wide?: boolean;
  className?: string;
  title?: ReactNode;
  /** Accessible dialog name (defaults to a string title). */
  label?: string;
  /** Element to focus when the dialog opens, instead of its first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  onClose?(): void;
  onCloseAutoFocus?(event: Event): void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        onOpenAutoFocus={(e) => {
          if (!initialFocus?.current) return;
          e.preventDefault();
          initialFocus.current.focus();
        }}
        className={cn("max-h-[90dvh] gap-0 overflow-y-auto rounded-3xl p-6 sm:max-w-lg", wide && "sm:max-w-3xl", className)}
        onCloseAutoFocus={
          onCloseAutoFocus ??
          ((e) => {
            e.preventDefault();
            if (!document.querySelector("[role=dialog]")) useStore.getState().modalOpener?.focus();
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
