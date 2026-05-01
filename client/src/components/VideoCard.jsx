/**
 * VideoCard.jsx
 * Card in the history grid showing video status, thumbnail, and AI results.
 */
import { motion } from 'framer-motion';
import {
  Play, Loader2, CheckCircle2, XCircle, Clock,
  Trash2, Download, RefreshCw, Copy, Scissors, Film
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import useVideoStore from '../store/useVideoStore';

function StatusBadge({ status }) {
  const cfg = {
    uploaded: { cls: 'badge-uploaded', icon: Clock, label: 'Uploaded' },
    processing: { cls: 'badge-processing', icon: Loader2, label: 'Processing' },
    completed: { cls: 'badge-completed', icon: CheckCircle2, label: 'Completed' },
    failed: { cls: 'badge-failed', icon: XCircle, label: 'Failed' },
  };
  const { cls, icon: Icon, label } = cfg[status] || cfg.uploaded;
  return (
    <span className={`badge ${cls}`}>
      <Icon size={10} className={status === 'processing' ? 'animate-spin' : ''} />
      {label}
    </span>
  );
}

export default function VideoCard({ video, onClick }) {
  const { deleteVideo, processVideo } = useVideoStore();

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('Delete this video?')) return;
    await deleteVideo(video.id);
    toast.success('Video deleted');
  };

  const handleReprocess = async (e) => {
    e.stopPropagation();
    await processVideo(video.id);
    toast.success('Reprocessing started...');
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    window.open(`/api/download/${video.id}`, '_blank');
  };

  const handleCopyTitle = (e) => {
    e.stopPropagation();
    const title = video.aiAnalysis?.title || video.originalName;
    navigator.clipboard.writeText(title);
    toast.success('Title copied!');
  };

  const sizeLabel = video.originalSize
    ? `${(video.originalSize / 1024 / 1024).toFixed(1)} MB`
    : '';

  return (
    <motion.div
      id={`video-card-${video.id}`}
      className="glass rounded-2xl overflow-hidden cursor-pointer group video-card"
      onClick={() => onClick?.(video)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300 }}
      layout
    >
      {/* Thumbnail / Placeholder */}
      <div className="relative aspect-square bg-slate-900/60 overflow-hidden">
        {video.hasThumb || (video.mode === 'multi' && video.clips?.[0]?.hasThumb) ? (
          <img
            src={`/outputs/${video.thumbnailFile || video.clips?.[0]?.thumbnailFile}`}
            alt="thumbnail"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {video.status === 'processing' ? (
              <Loader2 size={32} className="text-purple-400 animate-spin" />
            ) : (
              <Play size={32} className="text-slate-600" />
            )}
          </div>
        )}

        {/* Processing overlay / Gradient overlay */}
        <div className="absolute inset-0 video-card-overlay flex items-center justify-center">
          {video.status === 'completed' && (
            <div className="w-12 h-12 rounded-full bg-purple-500/80 flex items-center justify-center backdrop-blur-sm transform scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 shadow-lg shadow-purple-500/50">
              <Play size={24} className="text-white ml-1" />
            </div>
          )}
        </div>

        {/* Processing overlay */}
        {video.status === 'processing' && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${video.progress || 0}%` }} />
            </div>
            <p className="text-xs text-purple-300 mt-1 text-right">{video.progress || 0}%</p>
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute top-2 right-2">
          <StatusBadge status={video.status} />
        </div>

        {/* Waveform Animation */}
        {video.status === 'completed' && (
          <div className="absolute bottom-2 left-2 waveform group-hover:scale-110 transition-transform">
            <div className="waveform-bar h-2" />
            <div className="waveform-bar h-4" />
            <div className="waveform-bar h-3" />
            <div className="waveform-bar h-5" />
            <div className="waveform-bar h-2" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <p className="font-semibold text-white text-sm truncate leading-tight">
            {video.aiAnalysis?.title || video.originalName}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{video.originalName}</p>
        </div>

        {/* Hashtags */}
        {video.aiAnalysis?.hashtags?.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {video.aiAnalysis.hashtags.slice(0, 3).map((tag) => (
              <span key={tag} className="hashtag-chip">{tag}</span>
            ))}
          </div>
        )}

        {/* Mode badge */}
        {video.mode === 'multi' && (
          <div className="flex items-center gap-1.5">
            <Scissors size={11} className="text-purple-400" />
            <span className="text-xs text-purple-400 font-medium">{video.clips?.length} clips</span>
            <span className="text-slate-600 text-xs">·</span>
            <span className="text-xs text-slate-500">
              {video.clips?.filter(c => c.status === 'completed').length}/{video.clips?.length} done
            </span>
          </div>
        )}
        {/* Viral score + meta (single mode) */}
        {video.status === 'completed' && video.mode !== 'multi' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-yellow-400 text-xs font-bold">
                ⚡ {video.aiAnalysis?.viralScore?.toFixed(1)}/10
              </span>
              {sizeLabel && <span className="text-slate-600 text-xs">· {sizeLabel}</span>}
            </div>
            <span className="text-slate-600 text-xs">{video.aiAnalysis?.category}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          {video.status === 'completed' && video.mode !== 'multi' && (
            <>
              <button
                id={`download-btn-${video.id}`}
                className="btn-ghost btn-neon flex-1 text-xs py-2 justify-center"
                onClick={handleDownload}
                title="Download Short"
              >
                <Download size={13} /> Download
              </button>
              <button
                id={`copy-title-btn-${video.id}`}
                className="btn-ghost btn-neon flex-1 text-xs py-2 justify-center"
                onClick={handleCopyTitle}
                title="Copy Title"
              >
                <Copy size={13} /> Title
              </button>
            </>
          )}
          {(video.status === 'uploaded' || video.status === 'failed') && (
            <button
              id={`process-btn-${video.id}`}
              className="btn-primary btn-neon flex-1 text-xs py-2 justify-center"
              onClick={handleReprocess}
            >
              <RefreshCw size={13} /> Process
            </button>
          )}
          <button
            id={`delete-btn-${video.id}`}
            className="btn-danger btn-neon px-3 py-2"
            onClick={handleDelete}
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
