import { useRef, useCallback, useEffect } from "react";
import type { Photo } from "../api/client";

interface Props {
  leftPhoto: Photo;
  rightPhoto: Photo;
  onPickLeft: () => void;
  onPickRight: () => void;
  onPass: () => void;
  passDisabled: boolean;
  sliderPct: number;
  onSliderChange: (pct: number) => void;
}

export default function DuelSliderView({
  leftPhoto,
  rightPhoto,
  onPickLeft,
  onPickRight,
  onPass,
  passDisabled,
  sliderPct,
  onSliderChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      onSliderChange(Math.max(5, Math.min(95, pct)));
    },
    [onSliderChange],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [handlePointerMove, handlePointerUp],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const hasLeft = !!leftPhoto.thumb_lg_url;
  const hasRight = !!rightPhoto.thumb_lg_url;

  return (
    <div className="flex flex-1 flex-col">
      {/* Slider area */}
      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
      >
        {hasRight && hasLeft ? (
          <>
            {/* Right image (base layer) */}
            <img
              src={rightPhoto.thumb_lg_url!}
              alt={rightPhoto.file_name}
              className="max-h-[calc(100vh-12rem)] max-w-full object-contain"
              draggable={false}
            />

            {/* Left image (clipped overlay) */}
            <img
              src={leftPhoto.thumb_lg_url!}
              alt={leftPhoto.file_name}
              className="absolute max-h-[calc(100vh-12rem)] max-w-full object-contain"
              style={{
                clipPath: `inset(0 ${100 - sliderPct}% 0 0)`,
              }}
              draggable={false}
            />

            {/* Slider line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/70"
              style={{ left: `${sliderPct}%` }}
            />

            {/* Slider handle */}
            <div
              onPointerDown={handlePointerDown}
              className="absolute top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-neutral-800/80"
              style={{ left: `${sliderPct}%` }}
            >
              <span className="text-xs text-white select-none">&#8596;</span>
            </div>

            {/* Labels */}
            <div className="absolute bottom-2 left-4 rounded bg-black/60 px-2 py-0.5 text-xs text-neutral-300">
              {leftPhoto.file_name}
            </div>
            <div className="absolute bottom-2 right-4 rounded bg-black/60 px-2 py-0.5 text-xs text-neutral-300">
              {rightPhoto.file_name}
            </div>
          </>
        ) : (
          <div className="text-neutral-500">No preview available</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 pb-4 pt-2">
        <button
          onClick={onPickLeft}
          className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 transition hover:border-blue-500 hover:bg-neutral-800"
        >
          &#8592; Pick Left
        </button>
        <button
          onClick={onPass}
          disabled={passDisabled}
          className="rounded-lg border border-neutral-600 px-6 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Pass (Space)
        </button>
        <button
          onClick={onPickRight}
          className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-300 transition hover:border-blue-500 hover:bg-neutral-800"
        >
          Pick Right &#8594;
        </button>
      </div>
    </div>
  );
}
