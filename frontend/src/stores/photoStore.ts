import { create } from "zustand";
import type { PhotoFilters } from "../api/client";

export type ViewMode = "grid" | "timeline" | "map";

interface PhotoStore {
  // View
  view: ViewMode;
  setView: (v: ViewMode) => void;

  // Selection
  selectedIds: Set<number>;
  lastClickedId: number | null;
  select: (id: number) => void;
  toggleSelect: (id: number) => void;
  rangeSelect: (id: number, allIds: number[]) => void;
  selectAll: (ids: number[]) => void;
  clearSelection: () => void;

  // Loupe
  loupePhotoId: number | null;
  openLoupe: (id: number) => void;
  closeLoupe: () => void;

  // Filters
  filters: PhotoFilters;
  setFilters: (f: Partial<PhotoFilters>) => void;
  resetFilters: () => void;
}

const DEFAULT_FILTERS: PhotoFilters = {
  sort: "date_taken",
  order: "desc",
  rejected: false,
};

export const usePhotoStore = create<PhotoStore>((set) => ({
  view: "grid",
  setView: (view) => set({ view }),

  selectedIds: new Set(),
  lastClickedId: null,
  select: (id) => set({ selectedIds: new Set([id]), lastClickedId: id }),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next, lastClickedId: id };
    }),
  rangeSelect: (id, allIds) =>
    set((s) => {
      if (s.lastClickedId === null) return { selectedIds: new Set([id]), lastClickedId: id };
      const startIdx = allIds.indexOf(s.lastClickedId);
      const endIdx = allIds.indexOf(id);
      if (startIdx === -1 || endIdx === -1) return { selectedIds: new Set([id]), lastClickedId: id };
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      const next = new Set(s.selectedIds);
      for (let i = lo; i <= hi; i++) next.add(allIds[i]);
      return { selectedIds: next, lastClickedId: id };
    }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set(), lastClickedId: null }),

  loupePhotoId: null,
  openLoupe: (id) => set({ loupePhotoId: id }),
  closeLoupe: () => set({ loupePhotoId: null }),

  filters: { ...DEFAULT_FILTERS },
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),
}));
