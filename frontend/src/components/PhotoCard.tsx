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
  onToggleFlag?: () => void;
  onToggleReject?: () => void;
}

export default function PhotoCard({ photo, selected, onClick, onDoubleClick, onToggleFlag, onToggleReject }: PhotoCardProps) {
  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded bg-neutral-900 transition-shadow ${
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

      {/* Overlay badges — top-left: labels and status */}
      <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
        {photo.label && LABEL_COLORS[photo.label] && (
          <span className={`h-2.5 w-2.5 rounded-full ${LABEL_COLORS[photo.label]}`} />
        )}
      </div>

      {/* Flag / Reject buttons — top-right, visible on hover or when active */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100"
           style={photo.flagged || photo.rejected ? { opacity: 1 } : undefined}>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFlag?.(); }}
          className={`rounded px-1 py-0.5 text-[10px] font-bold ${
            photo.flagged ? "bg-white/90 text-neutral-900" : "bg-black/50 text-neutral-300 hover:bg-white/80 hover:text-neutral-900"
          }`}
          title="Flag (P)"
        >
          P
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleReject?.(); }}
          className={`rounded px-1 py-0.5 text-[10px] font-bold ${
            photo.rejected ? "bg-red-600/90 text-white" : "bg-black/50 text-neutral-300 hover:bg-red-600/80 hover:text-white"
          }`}
          title="Reject (X)"
        >
          X
        </button>
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
