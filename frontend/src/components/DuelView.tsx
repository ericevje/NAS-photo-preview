import { useState, useCallback, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { usePhotoStore } from "../stores/photoStore";
import { usePhotoList, useUpdatePhoto } from "../hooks/usePhotos";
import type { Photo } from "../api/client";
import DuelSideBySide from "./DuelSideBySide";
import DuelSliderView from "./DuelSliderView";
import DuelWinner from "./DuelWinner";

type ViewMode = "sideBySide" | "slider";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DuelView() {
  const duelPhotoIds = usePhotoStore((s) => s.duelPhotoIds);
  const closeDuel = usePhotoStore((s) => s.closeDuel);
  const filters = usePhotoStore((s) => s.filters);
  const { data } = usePhotoList(filters);
  const updatePhoto = useUpdatePhoto();

  const photoMap = useMemo(() => {
    const map = new Map<number, Photo>();
    for (const page of data?.pages ?? []) {
      for (const p of page.photos) {
        map.set(p.id, p);
      }
    }
    return map;
  }, [data]);

  // Tournament state — initialized together from a single shuffle
  const [initial] = useState(() => {
    const shuffled = shuffle(duelPhotoIds);
    return {
      pool: shuffled,
      left: shuffled.length >= 2 ? shuffled[0] : null,
      right: shuffled.length >= 2 ? shuffled[1] : null,
    };
  });
  const [pool, setPool] = useState<number[]>(initial.pool);
  const [leftId, setLeftId] = useState<number | null>(initial.left);
  const [rightId, setRightId] = useState<number | null>(initial.right);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("sideBySide");
  const [sliderPct, setSliderPct] = useState(50);
  const consecutivePasses = useRef(0);
  const lastPairKey = useRef(
    initial.left !== null && initial.right !== null
      ? [initial.left, initial.right].sort().join(",")
      : "",
  );

  const drawPair = useCallback(
    (currentPool: number[]) => {
      if (currentPool.length < 2) {
        setWinnerId(currentPool[0] ?? null);
        setLeftId(null);
        setRightId(null);
        return;
      }
      const shuffled = shuffle(currentPool);
      const l = shuffled[0];
      const r = shuffled[1];
      const pairKey = [l, r].sort().join(",");
      if (pairKey === lastPairKey.current) {
        consecutivePasses.current += 1;
      } else {
        consecutivePasses.current = 0;
      }
      lastPairKey.current = pairKey;
      setLeftId(l);
      setRightId(r);
      setSliderPct(50);
    },
    [],
  );

  const pickLeft = useCallback(() => {
    if (leftId === null || rightId === null) return;
    const newPool = pool.filter((id) => id !== rightId);
    setPool(newPool);
    consecutivePasses.current = 0;
    lastPairKey.current = "";
    drawPair(newPool);
  }, [leftId, rightId, pool, drawPair]);

  const pickRight = useCallback(() => {
    if (leftId === null || rightId === null) return;
    const newPool = pool.filter((id) => id !== leftId);
    setPool(newPool);
    consecutivePasses.current = 0;
    lastPairKey.current = "";
    drawPair(newPool);
  }, [leftId, rightId, pool, drawPair]);

  const passDisabled =
    pool.length <= 2 && consecutivePasses.current >= 3;

  const pass = useCallback(() => {
    if (passDisabled) return;
    drawPair(pool);
  }, [pool, drawPair, passDisabled]);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === "sideBySide" ? "slider" : "sideBySide"));
  }, []);

  const resetSlider = useCallback(() => {
    setSliderPct(50);
  }, []);

  const flagWinner = useCallback(() => {
    if (winnerId === null) return;
    updatePhoto.mutate({ id: winnerId, updates: { flagged: true } });
  }, [winnerId, updatePhoto]);

  // Keyboard shortcuts
  const active = winnerId === null && leftId !== null;
  useHotkeys("escape", closeDuel);
  useHotkeys("left", pickLeft, { enabled: active });
  useHotkeys("1", pickLeft, { enabled: active });
  useHotkeys("right", pickRight, { enabled: active });
  useHotkeys("2", pickRight, { enabled: active });
  useHotkeys("space", pass, { enabled: active, preventDefault: true });
  useHotkeys("tab", toggleViewMode, {
    enabled: active,
    preventDefault: true,
  });
  useHotkeys("r", resetSlider, {
    enabled: active && viewMode === "slider",
  });
  useHotkeys("p", flagWinner, { enabled: winnerId !== null });

  const leftPhoto = leftId !== null ? photoMap.get(leftId) : undefined;
  const rightPhoto = rightId !== null ? photoMap.get(rightId) : undefined;
  const winnerPhoto = winnerId !== null ? photoMap.get(winnerId) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDuel();
      }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-4 border-b border-neutral-800 px-4 py-2 text-sm">
        <span className="font-medium text-neutral-200">Photo Duel</span>
        {winnerId === null && (
          <>
            <span className="text-neutral-500">
              {pool.length} photo{pool.length !== 1 ? "s" : ""} remaining
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode("sideBySide")}
                className={`rounded px-2 py-0.5 text-xs ${
                  viewMode === "sideBySide"
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setViewMode("slider")}
                className={`rounded px-2 py-0.5 text-xs ${
                  viewMode === "slider"
                    ? "bg-neutral-700 text-white"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                Slider
              </button>
            </div>
            {viewMode === "slider" && (
              <button
                onClick={resetSlider}
                className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:text-white"
              >
                Reset (R)
              </button>
            )}
            {passDisabled && (
              <span className="text-xs text-yellow-500">
                Pick one to continue
              </span>
            )}
          </>
        )}
        <button
          onClick={closeDuel}
          className="ml-auto text-xl text-neutral-400 hover:text-white"
        >
          &times;
        </button>
      </div>

      {/* Content */}
      {winnerPhoto ? (
        <DuelWinner photo={winnerPhoto} />
      ) : leftPhoto && rightPhoto ? (
        viewMode === "sideBySide" ? (
          <DuelSideBySide
            leftPhoto={leftPhoto}
            rightPhoto={rightPhoto}
            onPickLeft={pickLeft}
            onPickRight={pickRight}
            onPass={pass}
            passDisabled={passDisabled}
          />
        ) : (
          <DuelSliderView
            leftPhoto={leftPhoto}
            rightPhoto={rightPhoto}
            onPickLeft={pickLeft}
            onPickRight={pickRight}
            onPass={pass}
            passDisabled={passDisabled}
            sliderPct={sliderPct}
            onSliderChange={setSliderPct}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center text-neutral-500">
          Loading photos...
        </div>
      )}
    </div>
  );
}
