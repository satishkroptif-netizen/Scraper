import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? 'empty-compact' : ''}`}>
      <div className="empty-art" aria-hidden="true">
        <span className="empty-ring empty-ring-one" />
        <span className="empty-ring empty-ring-two" />
        <span className="empty-icon">{icon || <MapPin size={30} />}</span>
      </div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action || secondary ? (
        <div className="empty-actions">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
