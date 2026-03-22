/**
 * API client — typed fetch wrappers for the PhotoCull backend.
 */

const API_BASE = "/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Photo {
  id: number;
  file_path: string;
  file_name: string;
  folder: string;
  file_size_bytes: number | null;
  file_mtime: number | null;
  file_hash: string | null;
  date_taken: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  camera_make: string | null;
  camera_model: string | null;
  lens_model: string | null;
  focal_length: number | null;
  aperture: number | null;
  shutter_speed: string | null;
  iso: number | null;
  image_width: number | null;
  image_height: number | null;
  orientation: number | null;
  thumb_sm_url: string | null;
  thumb_lg_url: string | null;
  rating: number;
  label: string;
  flagged: boolean;
  rejected: boolean;
  indexed_at: string;
}

export interface PhotoListResponse {
  photos: Photo[];
  next_cursor: number | null;
  count: number;
}

export interface PhotoUpdate {
  rating?: number;
  label?: string;
  flagged?: boolean;
  rejected?: boolean;
}

export interface FolderInfo {
  folder: string;
  count: number;
}

export interface Stats {
  total: number;
  flagged: number;
  rejected: number;
  unlabeled: number;
  by_rating: Record<string, number>;
  by_label: Record<string, number>;
  by_date: Record<string, number>;
}

export interface PhotoFilters {
  sort?: string;
  order?: string;
  date_from?: string;
  date_to?: string;
  has_gps?: boolean;
  rating_min?: number;
  label?: string;
  flagged?: boolean;
  rejected?: boolean;
  folder?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export async function getPhotos(
  filters: PhotoFilters = {},
  after_id?: number,
  limit = 100,
): Promise<PhotoListResponse> {
  const params = new URLSearchParams();
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.order) params.set("order", filters.order);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.has_gps !== undefined) params.set("has_gps", String(filters.has_gps));
  if (filters.rating_min !== undefined) params.set("rating_min", String(filters.rating_min));
  if (filters.label !== undefined) params.set("label", filters.label);
  if (filters.flagged !== undefined) params.set("flagged", String(filters.flagged));
  if (filters.rejected !== undefined) params.set("rejected", String(filters.rejected));
  if (filters.folder) params.set("folder", filters.folder);
  if (after_id !== undefined) params.set("after_id", String(after_id));
  params.set("limit", String(limit));
  return fetchJson<PhotoListResponse>(`/photos?${params}`);
}

export async function getPhoto(id: number): Promise<Photo> {
  return fetchJson<Photo>(`/photos/${id}`);
}

export async function updatePhoto(id: number, updates: PhotoUpdate): Promise<Photo> {
  return fetchJson<Photo>(`/photos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function batchUpdatePhotos(
  ids: number[],
  updates: PhotoUpdate,
): Promise<{ updated: number }> {
  return fetchJson<{ updated: number }>("/photos/batch", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, updates }),
  });
}

export async function getStats(): Promise<Stats> {
  return fetchJson<Stats>("/stats");
}

export async function getFolders(): Promise<FolderInfo[]> {
  return fetchJson<FolderInfo[]>("/folders");
}
