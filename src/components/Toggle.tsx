import type { ReactNode } from 'react';

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      {icon ? <span className="toggle-icon">{icon}</span> : null}
      <div className="toggle-copy">
        <span className="toggle-label">{label}</span>
        {description ? <span className="toggle-description">{description}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}
