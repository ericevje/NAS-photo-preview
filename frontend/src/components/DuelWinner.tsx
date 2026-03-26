import type { Photo } from "../api/client";
import { useUpdatePhoto } from "../hooks/usePhotos";
import { usePhotoStore } from "../stores/photoStore";

interface Props {
  photo: Photo;
}

export default function DuelWinner({ photo }: Props) {
  const closeDuel = usePhotoStore((s) => s.closeDuel);
  const updatePhoto = useUpdatePhoto();

  const handleFlag = () => {
    updatePhoto.mutate({ id: photo.id, updates: { flagged: true } });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-lg font-semibold tracking-wide text-neutral-300">
        WINNER
      </div>

      {photo.thumb_lg_url ? (
        <img
          src={photo.thumb_lg_url}
          alt={photo.file_name}
          className="max-h-[calc(100vh-16rem)] max-w-full rounded object-contain"
          draggable={false}
        />
      ) : (
        <div className="text-neutral-500">No preview available</div>
      )}

      <div className="text-center text-sm text-neutral-400">
        <div className="font-medium text-neutral-200">{photo.file_name}</div>
        {photo.date_taken && (
          <div className="mt-1">
            {new Date(photo.date_taken).toLocaleString()}
          </div>
        )}
        <div className="mt-0.5">
          {[
            photo.camera_model,
            photo.focal_length ? `${photo.focal_length}mm` : null,
            photo.aperture ? `f/${photo.aperture}` : null,
            photo.shutter_speed,
            photo.iso ? `ISO ${photo.iso}` : null,
          ]
            .filter(Boolean)
            .join(" \u00B7 ")}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleFlag}
          disabled={photo.flagged}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
        >
          {photo.flagged ? "Flagged" : "Flag as Pick (P)"}
        </button>
        <button
          onClick={closeDuel}
          className="rounded-lg border border-neutral-600 px-5 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800"
        >
          Done (Esc)
        </button>
      </div>
    </div>
  );
}
