/**
 * HistoryPage.jsx
 * Searchable, filterable video history grid with bulk management.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Trash2, RefreshCw, Film, Loader2 } from 'lucide-react';
import useVideoStore from '../store/useVideoStore';
import VideoCard from '../components/VideoCard';
import ResultPanel from '../components/ResultPanel';
import MultiClipPanel from '../components/MultiClipPanel';

const STATUS_FILTERS = ['all', 'completed', 'processing', 'uploaded', 'failed'];

export default function HistoryPage() {
  const { videos, fetchVideos, loading, setActiveVideo, activeVideo } = useVideoStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showResult, setShowResult] = useState(false);

  useEffect(() => { fetchVideos(); }, []);

  const filtered = videos.filter((v) => {
    const matchSearch =
      v.originalName.toLowerCase().includes(search.toLowerCase()) ||
      (v.aiAnalysis?.title || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filter === 'all' || v.status === filter;
    return matchSearch && matchStatus;
  });

  const handleCardClick = (video) => {
    setActiveVideo(video);
    setShowResult(video.status === 'completed');
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Video History</h1>
          <p className="text-slate-500 text-sm mt-1">{videos.length} clips · {videos.filter((v) => v.status === 'completed').length} processed</p>
        </div>
        <button
          id="refresh-btn"
          className="btn-ghost btn-neon text-sm"
          onClick={fetchVideos}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </motion.div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            id="search-input"
            className="input-field pl-9"
            placeholder="Search by name or AI title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              id={`filter-${s}-btn`}
              className={`text-xs px-3 py-2 rounded-lg font-medium transition-all capitalize ${
                filter === s
                  ? 'bg-purple-500/25 text-purple-400 border border-purple-500/40'
                  : 'bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-white'
              }`}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Result modal (slide in) */}
      <AnimatePresence>
        {showResult && activeVideo && (
          <motion.div
            key="result-modal"
            className="glass p-6 rounded-2xl"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">Result for <span className="text-white font-medium">{activeVideo.originalName}</span></p>
              <button id="close-result-btn" className="btn-ghost btn-neon text-xs px-3 py-1.5" onClick={() => setShowResult(false)}>Close ×</button>
            </div>
            {activeVideo.mode === 'multi' ? (
              <MultiClipPanel video={activeVideo} />
            ) : (
              <ResultPanel video={activeVideo} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass rounded-2xl overflow-hidden">
              <div className="skeleton aspect-[9/5]" />
              <div className="p-4 space-y-2">
                <div className="skeleton h-4 rounded w-3/4" />
                <div className="skeleton h-3 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center">
          <Film size={48} className="text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 text-lg font-medium">
            {search || filter !== 'all' ? 'No matching videos found' : 'No videos yet'}
          </p>
          <p className="text-slate-600 text-sm mt-1">
            {search ? `No results for "${search}"` : 'Upload your first clip to get started!'}
          </p>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          layout
        >
          <AnimatePresence>
            {filtered.map((v) => (
              <VideoCard key={v.id} video={v} onClick={handleCardClick} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
