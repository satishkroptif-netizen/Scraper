export function ProgressBar({
  value,
  tone = 'brand',
  animated = false,
  thin = false,
}: {
  value: number;
  tone?: 'brand' | 'lime' | 'danger';
  animated?: boolean;
  thin?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={`progress-track ${thin ? 'progress-thin' : ''} progress-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <span
        className={`progress-fill ${animated ? 'progress-animated' : ''}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
