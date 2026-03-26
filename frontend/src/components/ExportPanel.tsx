import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { usePhotoStore } from "../stores/photoStore";
import {
  browseForFolder,
  downloadExportList,
  getExportCount,
  getExportDefaultDest,
  getExportStatus,
  startExportCopy,
  type ExportFilters,
  type PhotoFilters,
} from "../api/client";

function filtersToExportFilters(f: PhotoFilters): ExportFilters {
  return {
    date_from: f.date_from,
    date_to: f.date_to,
    has_gps: f.has_gps,
    rating_min: f.rating_min,
    label: f.label,
    flagged: f.flagged,
    rejected: f.rejected,
    folder: f.folder,
  };
}

function FilterSummary({ filters }: { filters: PhotoFilters }) {
  const parts: string[] = [];
  if (filters.date_from) parts.push(`from ${filters.date_from}`);
  if (filters.date_to) parts.push(`to ${filters.date_to}`);
  if (filters.rating_min) parts.push(`${filters.rating_min}+ stars`);
  if (filters.label) parts.push(`label: ${filters.label}`);
  if (filters.flagged) parts.push("flagged");
  if (filters.rejected === undefined) parts.push("including rejected");
  if (filters.folder) parts.push(`folder: ${filters.folder}`);
  if (parts.length === 0) parts.push("all photos (excluding rejected)");
  return (
    <span className="text-sm text-neutral-400">
      Filters: {parts.join(", ")}
    </span>
  );
}

export default function ExportPanel({ onClose }: { onClose: () => void }) {
  const filters = usePhotoStore((s) => s.filters);
  const selectedIds = usePhotoStore((s) => s.selectedIds);
  const hasSelection = selectedIds.size > 0;

  const [tab, setTab] = useState<"list" | "copy">("list");
  const [dest, setDest] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [copyTotal, setCopyTotal] = useState(0);
  const [copyCopied, setCopyCopied] = useState(0);
  const [copyFailed, setCopyFailed] = useState(0);
  const [copyDone, setCopyDone] = useState(false);
  const [includeXmp, setIncludeXmp] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const exportFilters = filtersToExportFilters(filters);
  const photoIds = hasSelection ? [...selectedIds] : undefined;

  // Fetch count on open and when filters/selection change
  useEffect(() => {
    let cancelled = false;
    getExportCount(photoIds ? undefined : exportFilters, photoIds)
      .then((r) => {
        if (!cancelled) setCount(r.count);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.size, filters]);

  // Set default destination on mount
  useEffect(() => {
    getExportDefaultDest().then((r) => setDest(r.path)).catch(() => {});
  }, []);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useHotkeys("escape", onClose, { enableOnFormTags: true });

  const handleBrowse = useCallback(async () => {
    try {
      const res = await browseForFolder();
      if (res.path) setDest(res.path);
    } catch {
      // User cancelled or error — ignore
    }
  }, []);

  const handleDownloadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await downloadExportList(
        photoIds ? undefined : exportFilters,
        photoIds,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, selectedIds]);

  const handleStartCopy = useCallback(async () => {
    if (!dest.trim()) {
      setError("Please enter a destination path");
      return;
    }
    setLoading(true);
    setError(null);
    setCopyDone(false);
    setCopyCopied(0);
    setCopyFailed(0);
    try {
      const res = await startExportCopy(
        dest.trim(),
        photoIds ? undefined : exportFilters,
        photoIds,
        includeXmp,
      );
      setJobId(res.job_id);
      setCopyTotal(res.total);

      // Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const status = await getExportStatus(res.job_id);
          setCopyCopied(status.copied);
          setCopyFailed(status.failed);
          if (status.status === "done") {
            setCopyDone(true);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        } catch {
          // Ignore transient poll errors
        }
      }, 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest, filters, selectedIds]);

  const progress = copyTotal > 0 ? ((copyCopied + copyFailed) / copyTotal) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2 className="text-base font-semibold text-neutral-100">Export Photos</h2>
          <button
            onClick={onClose}
            className="text-xl text-neutral-500 hover:text-white"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Summary */}
          <div className="space-y-1">
            <div className="text-sm font-medium text-neutral-200">
              {hasSelection
                ? `${selectedIds.size} selected photo${selectedIds.size !== 1 ? "s" : ""}`
                : count !== null
                  ? `${count.toLocaleString()} photo${count !== 1 ? "s" : ""} matching filters`
                  : "Counting photos..."}
            </div>
            {!hasSelection && <FilterSummary filters={filters} />}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded bg-neutral-800 p-1">
            <button
              onClick={() => setTab("list")}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                tab === "list"
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              File List
            </button>
            <button
              onClick={() => setTab("copy")}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                tab === "copy"
                  ? "bg-neutral-700 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Copy to Folder
            </button>
          </div>

          {/* File List tab */}
          {tab === "list" && (
            <div className="space-y-2">
              <p className="text-xs text-neutral-500">
                Download a .txt file with one NAS file path per line. Use for Lightroom import or scripting.
              </p>
              <button
                onClick={handleDownloadList}
                disabled={loading || count === 0}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
              >
                {loading ? "Preparing..." : "Download File List"}
              </button>
            </div>
          )}

          {/* Copy tab */}
          {tab === "copy" && (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">
                Copy original files from the NAS to a local folder. Files are copied in the background.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  placeholder="/path/to/destination"
                  className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none ring-1 ring-neutral-700 placeholder:text-neutral-600 focus:ring-blue-500"
                />
                <button
                  onClick={handleBrowse}
                  type="button"
                  className="shrink-0 rounded bg-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-600"
                >
                  Browse…
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={includeXmp}
                  onChange={(e) => setIncludeXmp(e.target.checked)}
                  className="rounded border-neutral-600"
                />
                Generate XMP sidecars (ratings &amp; labels for Lightroom)
              </label>
              {!jobId && (
                <button
                  onClick={handleStartCopy}
                  disabled={loading || count === 0}
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
                >
                  {loading ? "Starting..." : "Start Copy"}
                </button>
              )}

              {/* Progress */}
              {jobId && (
                <div className="space-y-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-400">
                    <span>
                      {copyCopied} / {copyTotal} copied
                    </span>
                    {copyFailed > 0 && (
                      <span className="text-red-400">{copyFailed} failed</span>
                    )}
                    {copyDone && (
                      <span className="text-green-400">Complete</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded bg-red-900/30 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-800 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
