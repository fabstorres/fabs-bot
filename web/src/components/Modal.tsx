import type { ReactNode } from "react";
import { closeModal } from "../store";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function Modal({
  children,
  wide,
  title,
  label,
  onClose = closeModal,
  onCloseAutoFocus,
}: {
  children: ReactNode;
  wide?: boolean;
  title?: ReactNode;
  /** Accessible dialog name (defaults to a string title). */
  label?: string;
  onClose?(): void;
  onCloseAutoFocus?(event: Event): void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        className={cn("max-h-[90dvh] gap-0 overflow-y-auto rounded-3xl p-6 sm:max-w-lg", wide && "sm:max-w-3xl")}
      >
        <DialogTitle className={cn("mb-4 pr-8 text-xl font-semibold", !title && "sr-only")}>{title ?? label}</DialogTitle>
        <DialogDescription className="sr-only">{label ?? (typeof title === "string" ? title : "Dialog")}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
