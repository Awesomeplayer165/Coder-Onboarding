import { X } from "lucide-react";
import { useEffect } from "react";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <section className="dialog-content" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="dialog-close" type="button" onClick={() => onOpenChange(false)} aria-label="Close dialog">
          <X size={16} />
        </button>
        <header className="dialog-header">
          <h2 id="dialog-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
        <div className="dialog-body">{children}</div>
        {footer ? <footer className="dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
