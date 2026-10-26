import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyLock, useEscape } from '@/lib/hooks';
import { cx } from '@/lib/format';

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  size = 'md',
  className,
  closeOnOverlay = true,
  hideClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  closeOnOverlay?: boolean;
  hideClose?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useBodyLock(open);
  useEscape(onClose, open);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => closeRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cx('modal-card', `modal-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        {!hideClose ? (
          <button ref={closeRef} className="icon-button modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        ) : null}
        {title || eyebrow ? (
          <div className="modal-head">
            {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
        ) : null}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
