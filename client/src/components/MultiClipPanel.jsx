/**
 * MultiClipPanel.jsx
 * Shows all clips from a multi-mode video:
 *  - Per-clip status & progress while processing
 *  - Per-clip AI recommendations when completed
 *  - Per-clip download button
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Loader2, XCircle, Clock, Download, Copy,
  ChevronDown, ChevronUp, Hash, Star, Zap, Tag, Lightbulb, Play
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_BASE } from '../store/useVideoStore';

// ── Sub-components ────────────────────────────────────────────────────────────

function ClipStatus({ status, progress }) {
  if (status === 'completed') return <span className="badge badge-completed"><CheckCircle2 size={12} /> Done</span>;
  if (status === 'failed') return <span className="badge badge-failed"><XCircle size={12} /> Failed</span>;
  if (status === 'processing') return <span className="badge badge-processing"><Loader2 size={12} className="animate-spin" /> {progress || 0}%</span>;
  return <span className="badge badge-uploaded"><Clock size={12} /> Pending</span>;
}

function CopyBtn({ text, label, id }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      id={id}
      className="btn-ghost btn-neon text-sm px-2 py-1"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(`${label} copied!`);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <CheckCircle2 size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function ViralRing({ score }) {
  const pct = Math.max(0, Math.min(10, score || 0)) * 10;
  return (
    <div
      className="score-ring shrink-0"
      style={{ '--pct': `${pct}%`, width: 64, height: 64, fontSize: 18 }}
    >
      <span className="gradient-text">{(score || 0).toFixed(1)}</span>
    </div>
  );
}

// ── Single clip card ──────────────────────────────────────────────────────────

function ClipCard({ clip, videoId, index, videoDuration }) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef(null);
  const ai = clip.aiAnalysis || {};
  const isCompleted = clip.status === 'completed';

  return (
    <motion.div
      layout
      className="glass rounded-2xl overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        {/* Thumbnail or placeholder */}
        <div className="w-14 h-14 rounded-xl bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
          {clip.hasThumb ? (
            <img
              src={clip.thumbnailFile ? `${API_BASE}/outputs/${clip.thumbnailFile}` : ''}
              alt={clip.label}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.src = ''; }}
            />
          ) : (
            <Play size={20} className="text-slate-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-white text-base truncate">{clip.label}</p>
            <ClipStatus status={clip.status} progress={clip.progress} />
          </div>
          <p className="text-sm text-slate-500">
            {clip.startTime || 0}s → {((clip.startTime || 0) + (clip.duration || 0)).toFixed(1)}s · {clip.duration || 0}s
          </p>
          {clip.status === 'processing' && (
            <div className="progress-bar mt-2">
              <div className="progress-fill" style={{ width: `${clip.progress || 0}%` }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCompleted && <ViralRing score={ai.viralScore} />}
          {isCompleted && (
            <button
              id={`toggle-clip-${index}-btn`}
              className="btn-ghost btn-neon px-2 py-2"
              onClick={() => setOpen(!open)}
              title="Show AI recommendations"
            >
              {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded AI results */}
      <AnimatePresence>
        {isCompleted && open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/[0.06]"
          >
            <div className="p-4 space-y-4">
              {/* Preview */}
              {clip.hasOutput && (
                <div className="relative group cursor-pointer" onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                  }
                }}>
                  <video
                    ref={videoRef}
                    src={clip.outputFile ? `${API_BASE}/outputs/${clip.outputFile}` : ''}
                    playsInline
                    crossOrigin="anonymous"
                    className="w-full max-h-48 rounded-xl bg-black object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all opacity-0 group-hover:opacity-100">
                    <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                      <Play size={20} className="text-white fill-white ml-0.5" />
                    </div>
                  </div>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500 flex items-center gap-1"><Star size={12} className="text-yellow-400" /> Viral Title</p>
                  <CopyBtn id={`copy-title-${index}-btn`} text={ai.title || ''} label="Title" />
                </div>
                <p className="text-base font-bold text-white leading-snug">{ai.title || '—'}</p>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">SEO Description</p>
                  <CopyBtn id={`copy-desc-${index}-btn`} text={ai.description || ''} label="Desc" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{ai.description || '—'}</p>
              </div>

              {/* Category + Timeline Meta */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.03] rounded-lg p-2.5">
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mb-0.5"><Tag size={10} /> Category</p>
                  <p className="text-sm font-medium text-white">{ai.category || '—'}</p>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-2.5">
                  <p className="text-[11px] text-slate-500 mb-0.5">Best Post Time</p>
                  <p className="text-sm font-medium text-white">{ai.postingTime || '—'}</p>
                </div>
              </div>

              {/* Clip Timeline Visual */}
              <div className="space-y-1.5 px-1">
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>Start: {clip.startTime}s</span>
                  <span>End: {((clip.startTime || 0) + (ai.suggestedDuration || clip.duration || 0)).toFixed(1)}s</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden relative">
                  <div
                    className="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    style={{
                      left: `${((clip.startTime || 0) / (videoDuration || 1)) * 100}%`,
                      width: `${((ai.suggestedDuration || clip.duration || 0) / (videoDuration || 1)) * 100}%`
                    }}
                  />
                </div>
              </div>

              {/* Hashtags */}
              {ai.hashtags?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm text-slate-500 flex items-center gap-1"><Hash size={12} /> Hashtags</p>
                    <CopyBtn id={`copy-tags-${index}-btn`} text={(ai.hashtags || []).join(' ')} label="Tags" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ai.hashtags.map((t) => (
                      <button key={t} className="hashtag-chip" onClick={() => { navigator.clipboard.writeText(t); toast.success(`${t} copied!`); }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title variations */}
              {ai.titleVariations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm text-slate-500">Alternative Titles</p>
                  {ai.titleVariations.map((t, vi) => (
                    <div key={vi} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-2.5 py-2">
                      <p className="text-sm text-slate-300 flex-1 mr-2">{t}</p>
                      <CopyBtn id={`copy-var-${index}-${vi}-btn`} text={t} label="Copy" />
                    </div>
                  ))}
                </div>
              )}

              {/* Upload tip */}
              {ai.uploadTips && (
                <div className="flex items-start gap-2 bg-yellow-500/[0.06] border border-yellow-500/20 rounded-xl p-3">
                  <Lightbulb size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-300">{ai.uploadTips}</p>
                </div>
              )}

              {/* Download */}
              <a
                id={`download-clip-${index}-btn`}
                href={`${API_BASE}/api/download/${videoId}?clip=${index}`}
                download
                className="btn-primary btn-neon w-full justify-center text-base"
              >
                <Download size={18} /> Download Clip {index + 1}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function MultiClipPanel({ video }) {
  if (!video || video.mode !== 'multi' || !video.clips?.length) return null;

  const completed = video.clips.filter((c) => c.status === 'completed').length;
  const total = video.clips.length;
  const allDone = completed === total;
  const avgScore = allDone
    ? (video.clips.reduce((s, c) => s + (c.aiAnalysis?.viralScore || 0), 0) / total).toFixed(1)
    : null;

  return (
    <motion.div
      id="multi-clip-panel"
      className="space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap size={20} className="text-yellow-400" />
            {total} Clips · {completed} Ready
          </h2>
          {avgScore && (
            <p className="text-base text-purple-400 mt-0.5">
              Avg viral score: <strong>{avgScore}/10</strong>
            </p>
          )}
        </div>

        {/* Overall progress bar */}
        {!allDone && (
          <div className="w-40 space-y-1">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(completed / total) * 100}%` }} />
            </div>
            <p className="text-sm text-slate-500 text-right">{completed}/{total} clips</p>
          </div>
        )}
      </div>

      {/* Clip cards */}
      <div className="space-y-3">
        {video.clips.map((clip, i) => (
          <ClipCard key={i} clip={clip} videoId={video.id} index={i} videoDuration={video.duration} />
        ))}
      </div>
    </motion.div>
  );
}
