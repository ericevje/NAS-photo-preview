import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePhotoList } from "../hooks/usePhotos";
import { usePhotoStore } from "../stores/photoStore";
import type { Photo } from "../api/client";
import PhotoCard from "./PhotoCard";

const COLUMN_MIN_WIDTH = 220;

interface DateGroup {
  date: string;
  photos: Photo[];
}

type Row =
  | { type: "header"; date: string; count: number }
  | { type: "photos"; photos: Photo[] };

function useColumnCount(ref: React.RefObject<HTMLDivElement | null>, minWidth: number) {
  const getCount = useCallback(() => {
    if (!ref.current) return 4;
    return Math.max(1, Math.floor((ref.current.clientWidth - 16) / minWidth));
  }, [ref, minWidth]);

  const [count, setCount] = useState(4);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setCount(getCount());
    const ro = new ResizeObserver(() => setCount(getCount()));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, getCount]);

  return count;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function TimelineView() {
  const filters = usePhotoStore((s) => s.filters);
  const selectedIds = usePhotoStore((s) => s.selectedIds);
  const { select, toggleSelect, rangeSelect, openLoupe } = usePhotoStore();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    usePhotoList(filters);

  const allPhotos = useMemo(
    () => data?.pages.flatMap((p) => p.photos) ?? [],
    [data],
  );

  const allIds = useMemo(() => allPhotos.map((p) => p.id), [allPhotos]);

  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(containerRef, COLUMN_MIN_WIDTH);

  // Group photos by date (day)
  const groups = useMemo<DateGroup[]>(() => {
    const map = new Map<string, Photo[]>();
    for (const photo of allPhotos) {
      const day = photo.date_taken ? photo.date_taken.slice(0, 10) : "Unknown";
      let arr = map.get(day);
      if (!arr) {
        arr = [];
        map.set(day, arr);
      }
      arr.push(photo);
    }
    return Array.from(map.entries()).map(([date, photos]) => ({ date, photos }));
  }, [allPhotos]);

  // Build virtual rows: header + photo grid rows per group
  const rows = useMemo<Row[]>(() => {
    const result: Row[] = [];
    for (const group of groups) {
      result.push({ type: "header", date: group.date, count: group.photos.length });
      for (let i = 0; i < group.photos.length; i += columnCount) {
        result.push({ type: "photos", photos: group.photos.slice(i, i + columnCount) });
      }
    }
    return result;
  }, [groups, columnCount]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (rows[index].type === "header" ? 36 : 180),
    overscan: 5,
  });

  // Infinite scroll
  const items = virtualizer.getVirtualItems();
  useEffect(() => {
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= rows.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [items, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleClick = useCallback(
    (e: React.MouseEvent, id: number) => {
      if (e.shiftKey) {
        rangeSelect(id, allIds);
      } else if (e.metaKey || e.ctrlKey) {
        toggleSelect(id);
      } else {
        select(id);
      }
    },
    [allIds, select, toggleSelect, rangeSelect],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-blue-500" />
          <span className="text-sm text-neutral-500">Loading photos...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="rounded bg-red-900/20 px-4 py-3 text-center text-sm text-red-400">
          Failed to load photos{error instanceof Error ? `: ${error.message}` : ""}
        </div>
      </div>
    );
  }

  if (allPhotos.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-neutral-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <span className="text-sm">No photos match the current filters.</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto px-2 py-2">
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];

          if (row.type === "header") {
            return (
              <div
                key={`h-${virtualRow.index}`}
                className="absolute left-0 right-0 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 px-2 py-1.5 backdrop-blur-sm"
                style={{
                  top: virtualRow.start,
                  height: virtualRow.size,
                  zIndex: 10,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
              >
                <span className="text-sm font-medium text-neutral-300">
                  {row.date === "Unknown" ? "Unknown date" : formatDate(row.date)}
                </span>
                <span className="text-xs text-neutral-600">{row.count} photos</span>
              </div>
            );
          }

          return (
            <div
              key={virtualRow.index}
              className="absolute left-0 right-0 grid gap-2"
              style={{
                top: virtualRow.start,
                height: virtualRow.size,
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
              }}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
            >
              {row.photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.has(photo.id)}
                  onClick={(e) => handleClick(e, photo.id)}
                  onDoubleClick={() => openLoupe(photo.id)}
                />
              ))}
            </div>
          );
        })}
      </div>
      {isFetchingNextPage && (
        <div className="py-4 text-center text-sm text-neutral-500">Loading more...</div>
      )}
    </div>
  );
}
