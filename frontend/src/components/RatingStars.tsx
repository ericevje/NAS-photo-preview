interface RatingStarsProps {
  rating: number;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
}

export default function RatingStars({ rating, onChange, size = "md" }: RatingStarsProps) {
  const starSize = size === "sm" ? "text-xs" : "text-base";
  return (
    <span className={`inline-flex gap-0.5 ${starSize}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`${
            n <= rating ? "text-yellow-400" : "text-neutral-600"
          } ${onChange ? "cursor-pointer hover:text-yellow-300" : "cursor-default"}`}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(n === rating ? 0 : n);
          }}
          tabIndex={-1}
        >
          &#9733;
        </button>
      ))}
    </span>
  );
}
