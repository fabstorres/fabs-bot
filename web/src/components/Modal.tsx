import { useEffect, type ReactNode } from "react";
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
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
