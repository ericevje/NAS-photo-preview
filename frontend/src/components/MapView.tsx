import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { usePhotoList } from "../hooks/usePhotos";
import { usePhotoStore } from "../stores/photoStore";
import type { Photo } from "../api/client";
import PhotoCard from "./PhotoCard";

// Fix default marker icon paths for bundled leaflet
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Override markercluster default styles for dark theme
const CLUSTER_STYLE = `
  .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
    background-color: rgba(59, 130, 246, 0.4) !important;
  }
  .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
    background-color: rgba(59, 130, 246, 0.7) !important;
    color: white !important;
  }
`;

function MarkerClusterLayer({ photos, onPhotoClick }: { photos: Photo[]; onPhotoClick: (photo: Photo) => void }) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  useEffect(() => {
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
    });

    for (const photo of photos) {
      if (photo.gps_lat == null || photo.gps_lon == null) continue;
      const marker = L.marker([photo.gps_lat, photo.gps_lon]);

      const thumbHtml = photo.thumb_sm_url
        ? `<img src="${photo.thumb_sm_url}" style="width:160px;height:auto;border-radius:4px;margin-bottom:6px;" />`
        : "";

      const ratingHtml = photo.rating > 0
        ? `<div style="color:#facc15;font-size:12px;">${"★".repeat(photo.rating)}${"☆".repeat(5 - photo.rating)}</div>`
        : "";

      marker.bindPopup(
        `<div style="text-align:center;min-width:160px;">
          ${thumbHtml}
          <div style="font-size:12px;color:#ccc;margin-bottom:2px;">${photo.file_name}</div>
          <div style="font-size:11px;color:#888;">${photo.date_taken ? new Date(photo.date_taken).toLocaleDateString() : ""}</div>
          ${ratingHtml}
        </div>`,
        { className: "dark-popup", maxWidth: 200 },
      );

      marker.on("click", () => onPhotoClick(photo));
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    clusterRef.current = cluster;

    return () => {
      map.removeLayer(cluster);
    };
  }, [map, photos, onPhotoClick]);

  return null;
}

function ViewportTracker({ onBoundsChange }: { onBoundsChange: (bounds: L.LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
  });

  useEffect(() => {
    onBoundsChange(map.getBounds());
  }, [map, onBoundsChange]);

  return null;
}

function FitBounds({ photos }: { photos: Photo[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || photos.length === 0) return;
    const points = photos
      .filter((p) => p.gps_lat != null && p.gps_lon != null)
      .map((p) => [p.gps_lat!, p.gps_lon!] as [number, number]);
    if (points.length === 0) return;
    fitted.current = true;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, photos]);

  return null;
}

export default function MapView() {
  const filters = usePhotoStore((s) => s.filters);
  const selectedIds = usePhotoStore((s) => s.selectedIds);
  const { select, toggleSelect, rangeSelect, openLoupe } = usePhotoStore();

  // Force has_gps filter for map view
  const mapFilters = useMemo(() => ({ ...filters, has_gps: true }), [filters]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    usePhotoList(mapFilters);

  const allPhotos = useMemo(
    () => data?.pages.flatMap((p) => p.photos) ?? [],
    [data],
  );

  const allIds = useMemo(() => allPhotos.map((p) => p.id), [allPhotos]);

  // Load all pages
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, allPhotos.length]);

  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);

  const handleBoundsChange = useCallback((bounds: L.LatLngBounds) => {
    setViewportBounds(bounds);
  }, []);

  const viewportPhotos = useMemo(() => {
    if (!viewportBounds) return allPhotos;
    return allPhotos.filter((p) => {
      if (p.gps_lat == null || p.gps_lon == null) return false;
      return viewportBounds.contains(L.latLng(p.gps_lat, p.gps_lon));
    });
  }, [allPhotos, viewportBounds]);

  const handlePhotoClick = useCallback((_photo: Photo) => {
    // Marker click is handled by popup; no-op here
  }, []);

  const handleGridClick = useCallback(
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
          <span className="text-sm text-neutral-500">Loading GPS photos...</span>
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
        <span className="text-sm">No GPS-tagged photos match the current filters.</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <style>{CLUSTER_STYLE}</style>
      <style>{`
        .dark-popup .leaflet-popup-content-wrapper {
          background: #1c1c1c;
          color: #e5e5e5;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        }
        .dark-popup .leaflet-popup-tip {
          background: #1c1c1c;
        }
        .dark-popup .leaflet-popup-close-button {
          color: #888 !important;
        }
      `}</style>

      {/* Map */}
      <div className="relative flex-1">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          className="h-full w-full"
          style={{ background: "#1a1a2e" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MarkerClusterLayer photos={allPhotos} onPhotoClick={handlePhotoClick} />
          <ViewportTracker onBoundsChange={handleBoundsChange} />
          <FitBounds photos={allPhotos} />
        </MapContainer>

        {isFetchingNextPage && (
          <div className="absolute left-1/2 top-2 z-[1000] -translate-x-1/2 rounded bg-neutral-800/90 px-3 py-1 text-xs text-neutral-400">
            Loading more photos...
          </div>
        )}
      </div>

      {/* Bottom drawer */}
      <div
        className={`border-t border-neutral-800 bg-neutral-900 transition-all ${
          drawerOpen ? "h-48" : "h-8"
        }`}
      >
        <button
          onClick={() => setDrawerOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-1 text-xs text-neutral-500 hover:text-neutral-300"
        >
          <span>
            {viewportPhotos.length} photo{viewportPhotos.length !== 1 ? "s" : ""} in view
          </span>
          <span>{drawerOpen ? "▼" : "▲"}</span>
        </button>
        {drawerOpen && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2">
            {viewportPhotos.map((photo) => (
              <div key={photo.id} className="w-36 flex-shrink-0">
                <PhotoCard
                  photo={photo}
                  selected={selectedIds.has(photo.id)}
                  onClick={(e) => handleGridClick(e, photo.id)}
                  onDoubleClick={() => openLoupe(photo.id)}
                />
              </div>
            ))}
            {viewportPhotos.length === 0 && (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-600">
                No photos in current map view
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
