import { Star } from 'lucide-react';
import { formatRating } from '@/lib/format';

export function RatingStars({
  rating,
  size = 13,
  showValue = false,
  reviewCount,
}: {
  rating: number | null | undefined;
  size?: number;
  showValue?: boolean;
  reviewCount?: number | null;
}) {
  const value = Number(rating || 0);
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="rating-stars" title={rating ? `${formatRating(rating)} out of 5` : 'No rating'}>
      <span className="rating-layers" style={{ height: size }} aria-hidden="true">
        <span className="rating-base">
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} size={size} strokeWidth={1.8} />
          ))}
        </span>
        <span className="rating-fill" style={{ width: `${percent}%` }}>
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} size={size} strokeWidth={1.8} fill="currentColor" />
          ))}
        </span>
      </span>
      {showValue ? <span className="rating-value">{rating ? formatRating(rating) : 'No rating'}</span> : null}
      {reviewCount !== undefined && reviewCount !== null ? (
        <span className="rating-count">({reviewCount.toLocaleString()})</span>
      ) : null}
    </span>
  );
}
