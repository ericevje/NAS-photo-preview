import type { ReactNode } from "react";
import { usePhotoStore, type ViewMode } from "../stores/photoStore";
import { useStats } from "../hooks/usePhotos";
import FilterBar from "./FilterBar";
import BulkActions from "./BulkActions";

const VIEWS: { id: ViewMode; label: string; enabled: boolean }[] = [
  { id: "grid", label: "Grid", enabled: true },
  { id: "timeline", label: "Timeline", enabled: false },
  { id: "map", label: "Map", enabled: false },
];

export default function Layout({ children }: { children: ReactNode }) {
  const view = usePhotoStore((s) => s.view);
  const setView = usePhotoStore((s) => s.setView);
  const { data: stats } = useStats();

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      {/* Top nav */}
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-2.5">
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

        {/* Stats */}
        {stats && (
          <div className="flex gap-3 text-xs text-neutral-500">
            <span>{stats.total.toLocaleString()} photos</span>
            <span>{stats.flagged} flagged</span>
            <span>{stats.rejected} rejected</span>
          </div>
        )}
      </header>

      <FilterBar />
      <BulkActions />

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
