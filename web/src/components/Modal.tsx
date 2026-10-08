import type { ReactNode } from "react";
import { useWindowEvent } from "../hooks";
import { closeModal } from "../store";
import { Icon } from "./Icon";

export function Modal({
  children,
  wide,
  title,
  label,
  onClose = closeModal,
}: {
  children: ReactNode;
  wide?: boolean;
  title?: ReactNode;
  /** Accessible dialog name (defaults to a string title). */
  label?: string;
  onClose?(): void;
}) {
  useWindowEvent("keydown", (e) => e.key === "Escape" && onClose());
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === "string" ? title : undefined)}>
        <button className="round modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
