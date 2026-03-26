import { usePhotoStore } from "../stores/photoStore";
import { useFolders } from "../hooks/usePhotos";

const LABELS = ["red", "green", "blue", "yellow", "purple"] as const;
const LABEL_COLORS: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
  purple: "bg-purple-500",
};

export default function FilterBar() {
  const filters = usePhotoStore((s) => s.filters);
  const { setFilters, resetFilters } = usePhotoStore();
  const { data: folders } = useFolders();

  const hasActiveFilters =
    filters.date_from ||
    filters.date_to ||
    filters.label !== undefined ||
    filters.rating_min !== undefined ||
    filters.flagged !== undefined ||
    filters.folder ||
    filters.rejected !== false;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs sm:gap-3 sm:px-4 sm:text-sm">
      {/* Sort */}
      <select
        value={`${filters.sort ?? "date_taken"}_${filters.order ?? "desc"}`}
        onChange={(e) => {
          const [sort, order] = e.target.value.split("_");
          setFilters({ sort, order });
        }}
        className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 outline-none"
      >
        <option value="date_taken_desc">Date (newest)</option>
        <option value="date_taken_asc">Date (oldest)</option>
        <option value="file_name_asc">Name (A-Z)</option>
        <option value="file_name_desc">Name (Z-A)</option>
      </select>

      <span className="h-4 w-px bg-neutral-700" />

      {/* Date range */}
      <input
        type="date"
        value={filters.date_from ?? ""}
        onChange={(e) => setFilters({ date_from: e.target.value || undefined })}
        className="rounded bg-neutral-800 px-2 py-1 text-neutral-300 outline-none"
        placeholder="From"
      />
      <span className="text-neutral-600">to</span>
      <input
        type="date"
        value={filters.date_to ?? ""}
        onChange={(e) => setFilters({ date_to: e.target.value || undefined })}
        className="rounded bg-neutral-800 px-2 py-1 text-neutral-300 outline-none"
        placeholder="To"
      />

      <span className="h-4 w-px bg-neutral-700" />

      {/* Rating min */}
      <select
        value={filters.rating_min ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setFilters({ rating_min: v ? Number(v) : undefined });
        }}
        className="rounded bg-neutral-800 px-2 py-1 text-neutral-200 outline-none"
      >
        <option value="">Any rating</option>
        <option value="1">1+ stars</option>
        <option value="2">2+ stars</option>
        <option value="3">3+ stars</option>
        <option value="4">4+ stars</option>
        <option value="5">5 stars</option>
      </select>

      {/* Label chips */}
      <div className="flex gap-1">
        {LABELS.map((l) => (
          <button
            key={l}
            onClick={() => setFilters({ label: filters.label === l ? undefined : l })}
            className={`h-5 w-5 rounded-full ${LABEL_COLORS[l]} ${
              filters.label === l ? "ring-2 ring-white" : "opacity-40 hover:opacity-70"
            }`}
            title={l}
          />
        ))}
      </div>

      {/* Flagged */}
      <button
        onClick={() => setFilters({ flagged: filters.flagged === true ? undefined : true })}
        className={`rounded px-2 py-0.5 font-bold ${
          filters.flagged ? "bg-white text-black" : "text-neutral-500 hover:text-neutral-300"
        }`}
      >
        Flagged
      </button>

      {/* Folder */}
      {folders && folders.length > 0 && (
        <select
          value={filters.folder ?? ""}
          onChange={(e) => setFilters({ folder: e.target.value || undefined })}
          className="max-w-[200px] truncate rounded bg-neutral-800 px-2 py-1 text-neutral-200 outline-none"
        >
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f.folder} value={f.folder}>
              {f.folder} ({f.count})
            </option>
          ))}
        </select>
      )}

      {/* Show rejected */}
      <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-neutral-400">
        <input
          type="checkbox"
          checked={filters.rejected === undefined}
          onChange={(e) => setFilters({ rejected: e.target.checked ? undefined : false })}
          className="rounded"
        />
        Show rejected
      </label>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          onClick={resetFilters}
          className="text-neutral-500 hover:text-neutral-300"
        >
          Reset
        </button>
      )}
    </div>
  );
}
