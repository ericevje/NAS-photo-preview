import type { ReactNode } from "react";
import { usePhotoStore, type ViewMode } from "../stores/photoStore";
import { useStats } from "../hooks/usePhotos";
import FilterBar from "./FilterBar";
import BulkActions from "./BulkActions";

const VIEWS: { id: ViewMode; label: string; enabled: boolean }[] = [
  { id: "grid", label: "Grid", enabled: true },
  { id: "timeline", label: "Timeline", enabled: true },
  { id: "map", label: "Map", enabled: true },
];

export default function Layout({ children }: { children: ReactNode }) {
  const view = usePhotoStore((s) => s.view);
  const setView = usePhotoStore((s) => s.setView);
  const { data: stats } = useStats();

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Top nav */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 px-4 py-2 sm:px-5 sm:py-2.5">
        <h1 className="text-lg font-semibold tracking-tight">PhotoCull</h1>

        {/* View tabs */}
        <nav className="flex gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => v.enabled && setView(v.id)}
              disabled={!v.enabled}
              className={`rounded px-3 py-1 text-sm ${
                view === v.id
                  ? "bg-neutral-800 text-white"
                  : v.enabled
                    ? "text-neutral-400 hover:text-neutral-200"
                    : "cursor-not-allowed text-neutral-600"
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {/* Stats + Export */}
        <div className="flex items-center gap-4">
          {stats && (
            <div className="hidden gap-3 text-xs text-neutral-500 sm:flex">
              <span>{stats.total.toLocaleString()} photos</span>
              <span>{stats.flagged} flagged</span>
              <span>{stats.rejected} rejected</span>
            </div>
          )}
          <button
            onClick={() => usePhotoStore.getState().openImport()}
            className="rounded bg-neutral-800 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
          >
            Import
          </button>
          <button
            onClick={() => usePhotoStore.getState().openExport()}
            className="rounded bg-neutral-800 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-700 hover:text-white"
          >
            Export
          </button>
        </div>
      </header>

      <FilterBar />
      <BulkActions />

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
