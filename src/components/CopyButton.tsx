import type { MouseEvent, ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { api } from '@/lib/bridge';
import { useToast } from './ToastProvider';

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'icon-button',
  children,
  title,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  children?: ReactNode;
  title?: string;
}) {
  const { pushToast } = useToast();

  const copy = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      await api.copyText(text);
      pushToast({ kind: 'success', title: copiedLabel, message: text.length > 80 ? `${text.slice(0, 80)}…` : text, duration: 2200 });
    } catch {
      pushToast({ kind: 'error', title: 'Could not copy', message: 'Select the text and copy it manually.' });
    }
  };

  return (
    <button type="button" className={className} onClick={copy} title={title || label} aria-label={title || label}>
      {children || <Copy size={15} />}
    </button>
  );
}
