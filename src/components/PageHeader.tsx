import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backTo,
  backLabel = 'Back',
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      {backTo ? (
        <Link to={backTo} className="back-link">
          <ArrowLeft size={15} />
          {backLabel}
        </Link>
      ) : null}
      <div className="page-head-row">
        <div className="page-head-copy">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="page-head-actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
