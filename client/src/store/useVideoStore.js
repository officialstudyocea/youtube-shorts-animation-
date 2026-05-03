/**
 * useVideoStore.js
 * Zustand store – handles upload, processing, multi-clip polling, delete.
 */
import { create } from 'zustand';
import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '';
const API = `${API_BASE}/api`;

const useVideoStore = create((set, get) => ({
  videos:         [],
  activeVideo:    null,
  uploading:      false,
  uploadProgress: 0,
  loading:        false,
  error:          null,
  pollingIds:     new Set(),

  // ── Fetch all videos ───────────────────────────────────────────────────────
  fetchVideos: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await axios.get(`${API}/videos`);
      set({ videos: data.videos || [], loading: false });

      // Resume polling for any in-progress videos
      (data.videos || []).forEach((v) => {
        if (v.status === 'processing') get().startPolling(v.id);
      });
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      set({ error: `Cannot reach server: ${msg}`, loading: false });
    }
  },

  // ── Upload video ───────────────────────────────────────────────────────────
  uploadVideo: async (file, options = {}) => {
    set({ uploading: true, uploadProgress: 0, error: null });
    try {
      const formData = new FormData();
      formData.append('video', file);
      Object.entries(options).forEach(([k, v]) => formData.append(k, v));

      const { data } = await axios.post(`${API}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          set({ uploadProgress: Math.round((e.loaded / e.total) * 100) });
        },
      });

      set((s) => ({
        videos:         [data.video, ...s.videos],
        uploading:      false,
        uploadProgress: 0,
        activeVideo:    data.video,
      }));

      return data.video;
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      // Friendly network error
      const friendly = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        ? '🔌 Cannot connect to server. Make sure the backend is running on port 5000.'
        : msg;
      set({ uploading: false, error: friendly });
      return null;
    }
  },

  // ── Start processing ───────────────────────────────────────────────────────
  processVideo: async (id) => {
    set({ error: null });
    try {
      await axios.post(`${API}/process/${id}`);
      get().updateVideoInList(id, { status: 'processing', progress: 0 });
      get().startPolling(id);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      set({ error: msg });
    }
  },

  // ── Poll status/:id every 2s ───────────────────────────────────────────────
  startPolling: (id) => {
    if (get().pollingIds.has(id)) return;
    set((s) => ({ pollingIds: new Set([...s.pollingIds, id]) }));

    const iv = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API}/status/${id}`);

        // Always merge clips into the list entry
        get().updateVideoInList(id, {
          status:   data.status,
          progress: data.progress,
          error:    data.error,
          clips:    data.clips || [],
        });

        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(iv);
          set((s) => { const ids = new Set(s.pollingIds); ids.delete(id); return { pollingIds: ids }; });

          // Fetch full result
          if (data.status === 'completed') {
            try {
              const { data: res } = await axios.get(`${API}/result/${id}`);
              get().updateVideoInList(id, res.video);
              if (get().activeVideo?.id === id) set({ activeVideo: res.video });
            } catch {}
          }
        }
      } catch { /* server temporarily unavailable – keep polling */ }
    }, 2000);
  },

  // ── Delete ─────────────────────────────────────────────────────────────────
  deleteVideo: async (id) => {
    try {
      await axios.delete(`${API}/video/${id}`);
      set((s) => ({
        videos:      s.videos.filter((v) => v.id !== id),
        activeVideo: s.activeVideo?.id === id ? null : s.activeVideo,
      }));
    } catch (err) {
      set({ error: err.response?.data?.error || err.message });
    }
  },

  // ── Helpers ────────────────────────────────────────────────────────────────
  setActiveVideo:    (video) => set({ activeVideo: video }),
  clearError:        ()      => set({ error: null }),

  updateVideoInList: (id, patch) => {
    set((s) => ({
      videos: s.videos.map((v) =>
        v.id === id ? { ...v, ...patch } : v
      ),
      activeVideo: s.activeVideo?.id === id
        ? { ...s.activeVideo, ...patch }
        : s.activeVideo,
    }));
  },
}));

export default useVideoStore;
