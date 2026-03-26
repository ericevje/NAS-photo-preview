import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPhotos,
  updatePhoto,
  batchUpdatePhotos,
  getFolders,
  getStats,
  type PhotoFilters,
  type PhotoUpdate,
  type Photo,
} from "../api/client";

const PAGE_SIZE = 100;

export function usePhotoList(filters: PhotoFilters) {
  return useInfiniteQuery({
    queryKey: ["photos", filters],
    queryFn: ({ pageParam }) => getPhotos(filters, pageParam, PAGE_SIZE),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}

export function useUpdatePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: PhotoUpdate }) =>
      updatePhoto(id, updates),
    onSuccess: (updated) => {
      // Patch the photo in all cached pages
      qc.setQueriesData<ReturnType<typeof usePhotoList>["data"]>(
        { queryKey: ["photos"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              photos: page.photos.map((p: Photo) => (p.id === updated.id ? updated : p)),
            })),
          };
        },
      );
      // Invalidate all photo queries so filtered views refetch
      // (e.g. unflagging a photo removes it from the "flagged" filter cache)
      qc.invalidateQueries({ queryKey: ["photos"] });
      // Refresh stats so header counts update
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useBatchUpdatePhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, updates }: { ids: number[]; updates: PhotoUpdate }) =>
      batchUpdatePhotos(ids, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useFolders() {
  return useQuery({ queryKey: ["folders"], queryFn: getFolders });
}

export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: getStats });
}
