import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      hideClose
      footer={
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => void onConfirm()} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="confirm-body">
        <span className={`confirm-icon ${tone === 'danger' ? 'is-danger' : ''}`}>
          <AlertTriangle size={22} />
        </span>
        <div>
          <h2 className="confirm-title">{title}</h2>
          <p className="confirm-message">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
