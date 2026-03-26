import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { usePhotoStore } from "../stores/photoStore";
import { usePhotoList, useUpdatePhoto } from "../hooks/usePhotos";
import type { Photo } from "../api/client";
import RatingStars from "./RatingStars";

const LABEL_COLORS: Record<string, string> = {
  red: "bg-red-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  yellow: "bg-yellow-400",
  purple: "bg-purple-500",
};

const LABELS = ["red", "green", "blue", "yellow", "purple"] as const;

export default function LoupeView() {
  const loupePhotoId = usePhotoStore((s) => s.loupePhotoId);
  const filters = usePhotoStore((s) => s.filters);
  const { closeLoupe, openLoupe } = usePhotoStore();
  const { data } = usePhotoList(filters);
  const updatePhoto = useUpdatePhoto();

  const allPhotos = useMemo(
    () => data?.pages.flatMap((p) => p.photos) ?? [],
    [data],
  );

  const currentIndex = useMemo(
    () => allPhotos.findIndex((p) => p.id === loupePhotoId),
    [allPhotos, loupePhotoId],
  );

  const photo: Photo | undefined = currentIndex >= 0 ? allPhotos[currentIndex] : undefined;

  const navigate = (dir: -1 | 1) => {
    const nextIdx = currentIndex + dir;
    if (nextIdx >= 0 && nextIdx < allPhotos.length) {
      openLoupe(allPhotos[nextIdx].id);
    }
  };

  const setRating = (r: number) => {
    if (!photo) return;
    updatePhoto.mutate({ id: photo.id, updates: { rating: r } });
  };

  const toggleFlag = () => {
    if (!photo) return;
    updatePhoto.mutate({ id: photo.id, updates: { flagged: !photo.flagged } });
  };

  const toggleReject = () => {
    if (!photo) return;
    updatePhoto.mutate({ id: photo.id, updates: { rejected: !photo.rejected } });
  };

  const setLabel = (label: string) => {
    if (!photo) return;
    updatePhoto.mutate({
      id: photo.id,
      updates: { label: photo.label === label ? "" : label },
    });
  };

  // Keyboard shortcuts
  useHotkeys("escape", closeLoupe, { enabled: !!photo });
  useHotkeys("left", () => navigate(-1), { enabled: !!photo });
  useHotkeys("right", () => navigate(1), { enabled: !!photo });
  useHotkeys("1", () => setRating(1), { enabled: !!photo });
  useHotkeys("2", () => setRating(2), { enabled: !!photo });
  useHotkeys("3", () => setRating(3), { enabled: !!photo });
  useHotkeys("4", () => setRating(4), { enabled: !!photo });
  useHotkeys("5", () => setRating(5), { enabled: !!photo });
  useHotkeys("0", () => setRating(0), { enabled: !!photo });
  useHotkeys("p", toggleFlag, { enabled: !!photo });
  useHotkeys("x", toggleReject, { enabled: !!photo });
  useHotkeys("r", () => setLabel("red"), { enabled: !!photo });
  useHotkeys("g", () => setLabel("green"), { enabled: !!photo });
  useHotkeys("b", () => setLabel("blue"), { enabled: !!photo });
  useHotkeys("y", () => setLabel("yellow"), { enabled: !!photo });
  useHotkeys("u", () => setLabel("purple"), { enabled: !!photo });

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeLoupe();
      }}
    >
      {/* Close button */}
      <button
        onClick={closeLoupe}
        className="absolute right-4 top-4 z-10 text-2xl text-neutral-400 hover:text-white"
      >
        &times;
      </button>

      {/* Main image area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {/* Prev arrow */}
        <button
          onClick={() => navigate(-1)}
          disabled={currentIndex <= 0}
          className="absolute left-4 text-3xl text-neutral-500 hover:text-white disabled:invisible"
        >
          &#8249;
        </button>

        {photo.thumb_lg_url ? (
          <img
            src={photo.thumb_lg_url}
            alt={photo.file_name}
            className="max-h-[calc(100vh-5rem)] max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-neutral-500">No preview available</div>
        )}

        {/* Next arrow */}
        <button
          onClick={() => navigate(1)}
          disabled={currentIndex >= allPhotos.length - 1}
          className="absolute right-4 text-3xl text-neutral-500 hover:text-white disabled:invisible"
        >
          &#8250;
        </button>
      </div>

      {/* Bottom info bar */}
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 bg-neutral-900/90 px-4 py-2 text-xs sm:gap-4 sm:px-6 sm:py-3 sm:text-sm">
        {/* File info */}
        <span className="font-medium text-neutral-200">{photo.file_name}</span>
        {photo.date_taken && (
          <span className="text-neutral-400">
            {new Date(photo.date_taken).toLocaleString()}
          </span>
        )}

        {/* Camera info */}
        <span className="text-neutral-500">
          {[
            photo.camera_model,
            photo.lens_model,
            photo.focal_length ? `${photo.focal_length}mm` : null,
            photo.aperture ? `f/${photo.aperture}` : null,
            photo.shutter_speed,
            photo.iso ? `ISO ${photo.iso}` : null,
          ]
            .filter(Boolean)
            .join(" \u00B7 ")}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* Rating */}
          <RatingStars rating={photo.rating} onChange={setRating} />

          {/* Label chips */}
          <div className="flex gap-1">
            {LABELS.map((l) => (
              <button
                key={l}
                onClick={() => setLabel(l)}
                className={`h-4 w-4 rounded-full border-2 ${LABEL_COLORS[l]} ${
                  photo.label === l ? "border-white" : "border-transparent opacity-50 hover:opacity-80"
                }`}
                title={l}
              />
            ))}
          </div>

          {/* Flag / Reject */}
          <button
            onClick={toggleFlag}
            className={`rounded px-2 py-0.5 text-xs font-bold ${
              photo.flagged ? "bg-white text-black" : "text-neutral-400 hover:text-white"
            }`}
          >
            P
          </button>
          <button
            onClick={toggleReject}
            className={`rounded px-2 py-0.5 text-xs font-bold ${
              photo.rejected ? "bg-red-600 text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
}
