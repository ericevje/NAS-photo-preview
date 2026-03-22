import { usePhotoStore } from "../stores/photoStore";
import { useBatchUpdatePhotos } from "../hooks/usePhotos";

const LABELS = ["red", "green", "blue", "yellow", "purple"] as const;
const LABEL_COLORS: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
  purple: "bg-purple-500",
};

export default function BulkActions() {
  const selectedIds = usePhotoStore((s) => s.selectedIds);
  const clearSelection = usePhotoStore((s) => s.clearSelection);
  const batchUpdate = useBatchUpdatePhotos();

  if (selectedIds.size < 2) return null;

  const ids = [...selectedIds];

  const apply = (updates: Parameters<typeof batchUpdate.mutate>[0]["updates"]) => {
    batchUpdate.mutate({ ids, updates });
  };

  return (
    <div className="flex items-center gap-3 border-b border-neutral-700 bg-neutral-800/90 px-4 py-2 text-sm">
      <span className="font-medium text-neutral-200">
        {selectedIds.size} selected
      </span>

      <span className="h-4 w-px bg-neutral-600" />

      {/* Rating */}
      {[1, 2, 3, 4, 5].map((r) => (
        <button
          key={r}
          onClick={() => apply({ rating: r })}
          className="text-neutral-400 hover:text-yellow-400"
          title={`Set ${r} stars`}
        >
          {r}&#9733;
        </button>
      ))}

      <span className="h-4 w-px bg-neutral-600" />

      {/* Labels */}
      {LABELS.map((l) => (
        <button
          key={l}
          onClick={() => apply({ label: l })}
          className={`h-4 w-4 rounded-full ${LABEL_COLORS[l]} opacity-60 hover:opacity-100`}
          title={l}
        />
      ))}

      <span className="h-4 w-px bg-neutral-600" />

      <button
        onClick={() => apply({ flagged: true })}
        className="rounded px-2 py-0.5 text-neutral-300 hover:bg-neutral-700"
      >
        Flag all
      </button>
      <button
        onClick={() => apply({ rejected: true })}
        className="rounded px-2 py-0.5 text-red-400 hover:bg-neutral-700"
      >
        Reject all
      </button>

      <button
        onClick={clearSelection}
        className="ml-auto text-neutral-500 hover:text-neutral-300"
      >
        Clear
      </button>
    </div>
  );
}
