import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck, XCircle } from 'lucide-react';

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  success: CheckCircle2,
  legal: ShieldCheck,
};

export function InfoCallout({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: keyof typeof ICONS;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = ICONS[tone];
  return (
    <div className={`callout callout-${tone}`}>
      <span className="callout-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="callout-content">
        {title ? <strong>{title}</strong> : null}
        {children ? <div className="callout-text">{children}</div> : null}
      </div>
      {action ? <div className="callout-action">{action}</div> : null}
    </div>
  );
}
