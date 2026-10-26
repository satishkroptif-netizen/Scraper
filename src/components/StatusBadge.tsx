import { AlertCircle, CheckCircle2, CircleDashed, Clock3, Loader2, XCircle } from 'lucide-react';
import type { TaskStatus } from '@/lib/types';
import { statusMeta } from '@/lib/format';

export function StatusBadge({ status, size = 'md' }: { status: TaskStatus; size?: 'sm' | 'md' }) {
  const meta = statusMeta(status);
  const icon =
    status === 'running' ? (
      <Loader2 size={size === 'sm' ? 11 : 13} className="spin" />
    ) : status === 'completed' ? (
      <CheckCircle2 size={size === 'sm' ? 11 : 13} />
    ) : status === 'failed' ? (
      <XCircle size={size === 'sm' ? 11 : 13} />
    ) : status === 'queued' ? (
      <Clock3 size={size === 'sm' ? 11 : 13} />
    ) : status === 'cancelled' ? (
      <AlertCircle size={size === 'sm' ? 11 : 13} />
    ) : (
      <CircleDashed size={size === 'sm' ? 11 : 13} />
    );
  return (
    <span className={`status-badge status-${meta.tone} ${size === 'sm' ? 'status-sm' : ''}`}>
      {icon}
      {meta.label}
    </span>
  );
}
