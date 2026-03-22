import type { Photo } from "../api/client";
import RatingStars from "./RatingStars";

const LABEL_COLORS: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
  purple: "bg-purple-500",
};

interface PhotoCardProps {
  photo: Photo;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
}

export default function PhotoCard({ photo, selected, onClick, onDoubleClick }: PhotoCardProps) {
  return (
    <div
      className={`relative cursor-pointer overflow-hidden rounded bg-neutral-900 transition-shadow ${
        selected ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-neutral-950" : "hover:ring-1 hover:ring-neutral-600"
      }`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Thumbnail */}
      <div className="aspect-[3/2] w-full bg-neutral-800">
        {photo.thumb_sm_url ? (
          <img
            src={photo.thumb_sm_url}
            alt={photo.file_name}
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-600">
            No preview
          </div>
        )}
      </div>

      {/* Overlay badges — top-left */}
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
        {photo.flagged && (
          <span className="rounded bg-white/80 px-1 py-0.5 text-[10px] font-bold text-neutral-900">
            P
          </span>
        )}
        {photo.rejected && (
          <span className="rounded bg-red-600/90 px-1 py-0.5 text-[10px] font-bold text-white">
            X
          </span>
        )}
        {photo.label && LABEL_COLORS[photo.label] && (
          <span className={`h-2.5 w-2.5 rounded-full ${LABEL_COLORS[photo.label]}`} />
        )}
      </div>

      {/* Rating — bottom-left */}
      {photo.rating > 0 && (
        <div className="absolute bottom-1 left-1.5">
          <RatingStars rating={photo.rating} size="sm" />
        </div>
      )}
    </div>
  );
}
