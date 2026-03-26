import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import {
  browseForImportFolder,
  getImportStatus,
  startImport,
  type ImportJobStatus,
} from "../api/client";

export default function ImportPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [sourceDir, setSourceDir] = useState("");
  const [incremental, setIncremental] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useHotkeys("escape", onClose, { enableOnFormTags: true });

  // Check for an already-running import on mount
  useEffect(() => {
    getImportStatus().then((status) => {
      if (status.status === "running" || status.status === "done") {
        setJob(status);
        if (status.source_dir) setSourceDir(status.source_dir);
        if (status.status === "running") {
          startPolling();
        }
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await getImportStatus();
        setJob(status);
        if (status.status === "done" || status.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (status.status === "done") {
            queryClient.invalidateQueries({ queryKey: ["photos"] });
            queryClient.invalidateQueries({ queryKey: ["stats"] });
            queryClient.invalidateQueries({ queryKey: ["folders"] });
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 500);
  }

  const handleBrowse = useCallback(async () => {
    try {
      const res = await browseForImportFolder();
      if (res.path) setSourceDir(res.path);
    } catch {
      // User cancelled or error
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!sourceDir.trim()) {
      setError("Please select a folder to import");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await startImport(sourceDir.trim(), incremental);
      setJob({
        status: "running",
        phase: "scanning",
        source_dir: sourceDir.trim(),
        processed: 0,
        skipped: 0,
        total: 0,
      });
      startPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceDir, incremental]);

  const isRunning = job?.status === "running";
  const isDone = job?.status === "done";
  const isError = job?.status === "error";
  const total = job?.total ?? 0;
  const processed = job?.processed ?? 0;
  const skipped = job?.skipped ?? 0;
  const progress = total > 0 ? (processed / total) * 100 : 0;

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
          <h2 className="text-base font-semibold text-neutral-100">Import Photos</h2>
          <button
            onClick={onClose}
            className="text-xl text-neutral-500 hover:text-white"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-neutral-500">
            Select a NAS folder to scan for photos. Thumbnails and metadata will be extracted and added to the library.
          </p>

          {/* Folder picker */}
          <div className="flex gap-2">
            <input
              type="text"
              value={sourceDir}
              onChange={(e) => setSourceDir(e.target.value)}
              placeholder="/Volumes/photos/2024"
              disabled={isRunning}
              className="flex-1 rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-200 outline-none ring-1 ring-neutral-700 placeholder:text-neutral-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={handleBrowse}
              type="button"
              disabled={isRunning}
              className="shrink-0 rounded bg-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-600 disabled:opacity-50"
            >
              Browse...
            </button>
          </div>

          {/* Incremental checkbox */}
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={incremental}
              onChange={(e) => setIncremental(e.target.checked)}
              disabled={isRunning}
              className="rounded border-neutral-600"
            />
            Incremental (skip files already imported)
          </label>

          {/* Start button */}
          {!isRunning && !isDone && (
            <button
              onClick={handleStart}
              disabled={loading || !sourceDir.trim()}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600"
            >
              {loading ? "Starting..." : "Start Import"}
            </button>
          )}

          {/* Progress */}
          {(isRunning || isDone || isError) && (
            <div className="space-y-2">
              {job?.phase === "scanning" && (
                <div className="text-sm text-neutral-400">Scanning folders...</div>
              )}
              {total > 0 && (
                <>
                  <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-400">
                    <span>
                      {processed} / {total} processed
                    </span>
                    {skipped > 0 && (
                      <span>{skipped} skipped</span>
                    )}
                    {isDone && (
                      <span className="text-green-400">Complete</span>
                    )}
                  </div>
                </>
              )}
              {isDone && total === 0 && (
                <div className="text-sm text-neutral-400">No new photos found.</div>
              )}
              {isError && (
                <div className="rounded bg-red-900/30 px-3 py-2 text-sm text-red-400">
                  {job?.error ?? "Import failed"}
                </div>
              )}
            </div>
          )}

          {/* Import another */}
          {(isDone || isError) && (
            <button
              onClick={() => {
                setJob(null);
                setError(null);
                setSourceDir("");
              }}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700"
            >
              Import Another Folder
            </button>
          )}

          {/* Error from start request */}
          {error && !isError && (
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
