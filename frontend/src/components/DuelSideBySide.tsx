import type { Photo } from "../api/client";

interface Props {
  leftPhoto: Photo;
  rightPhoto: Photo;
  onPickLeft: () => void;
  onPickRight: () => void;
  onPass: () => void;
  passDisabled: boolean;
}

function PhotoMeta({ photo }: { photo: Photo }) {
  return (
    <div className="mt-2 text-center text-xs text-neutral-400">
      <div className="font-medium text-neutral-300">{photo.file_name}</div>
      <div className="mt-0.5">
        {[
          photo.focal_length ? `${photo.focal_length}mm` : null,
          photo.aperture ? `f/${photo.aperture}` : null,
          photo.shutter_speed,
          photo.iso ? `ISO ${photo.iso}` : null,
        ]
          .filter(Boolean)
          .join(" \u00B7 ")}
      </div>
    </div>
  );
}

export default function DuelSideBySide({
  leftPhoto,
  rightPhoto,
  onPickLeft,
  onPickRight,
  onPass,
  passDisabled,
}: Props) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 gap-2 p-4">
        {/* Left photo */}
        <button
          onClick={onPickLeft}
          className="group flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-transparent transition hover:border-blue-500 focus:border-blue-500 focus:outline-none"
        >
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            {leftPhoto.thumb_lg_url ? (
              <img
                src={leftPhoto.thumb_lg_url}
                alt={leftPhoto.file_name}
                className="max-h-[calc(100vh-14rem)] max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="text-neutral-500">No preview</div>
            )}
          </div>
          <PhotoMeta photo={leftPhoto} />
          <div className="mt-1 text-xs text-neutral-600 group-hover:text-blue-400">
            &#8592; Pick (Left)
          </div>
        </button>

        {/* Divider */}
        <div className="flex w-px items-stretch bg-neutral-700" />

        {/* Right photo */}
        <button
          onClick={onPickRight}
          className="group flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-transparent transition hover:border-blue-500 focus:border-blue-500 focus:outline-none"
        >
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            {rightPhoto.thumb_lg_url ? (
              <img
                src={rightPhoto.thumb_lg_url}
                alt={rightPhoto.file_name}
                className="max-h-[calc(100vh-14rem)] max-w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="text-neutral-500">No preview</div>
            )}
          </div>
          <PhotoMeta photo={rightPhoto} />
          <div className="mt-1 text-xs text-neutral-600 group-hover:text-blue-400">
            Pick (Right) &#8594;
          </div>
        </button>
      </div>

      {/* Pass button */}
      <div className="flex justify-center pb-4">
        <button
          onClick={onPass}
          disabled={passDisabled}
          className="rounded-lg border border-neutral-600 px-6 py-2 text-sm text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Pass (Space)
        </button>
      </div>
    </div>
  );
}
