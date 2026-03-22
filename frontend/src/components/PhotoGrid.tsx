import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePhotoList } from "../hooks/usePhotos";
import { usePhotoStore } from "../stores/photoStore";
import type { Photo } from "../api/client";
import PhotoCard from "./PhotoCard";

const COLUMN_MIN_WIDTH = 220;

function useColumnCount(ref: React.RefObject<HTMLDivElement | null>, minWidth: number) {
  const getCount = useCallback(() => {
    if (!ref.current) return 4;
    return Math.max(1, Math.floor(ref.current.clientWidth / minWidth));
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

export default function PhotoGrid() {
  const filters = usePhotoStore((s) => s.filters);
  const selectedIds = usePhotoStore((s) => s.selectedIds);
  const { select, toggleSelect, rangeSelect, openLoupe } = usePhotoStore();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    usePhotoList(filters);

  const allPhotos = useMemo(
    () => data?.pages.flatMap((p) => p.photos) ?? [],
    [data],
  );

  const allIds = useMemo(() => allPhotos.map((p) => p.id), [allPhotos]);

  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount(containerRef, COLUMN_MIN_WIDTH);

  const rows = useMemo(() => {
    const result: Photo[][] = [];
    for (let i = 0; i < allPhotos.length; i += columnCount) {
      result.push(allPhotos.slice(i, i + columnCount));
    }
    return result;
  }, [allPhotos, columnCount]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  // Infinite scroll: load more when near the end
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
      <div className="flex h-64 items-center justify-center text-neutral-500">
        Loading photos...
      </div>
    );
  }

  if (allPhotos.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-500">
        No photos match the current filters.
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
              {row.map((photo) => (
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
