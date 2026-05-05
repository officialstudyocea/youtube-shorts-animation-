/**
 * ResultPanel.jsx
 * Full AI analysis result display for a completed Short.
 * Shows preview, viral score ring, title variations, hashtags, and upload tips.
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Copy, CheckCheck, Zap, Hash, Clock, Tag, Lightbulb,
  ChevronDown, ChevronUp, Play, Star
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { API_BASE } from '../store/useVideoStore';

function CopyButton({ text, label = 'Copy', id }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied!`);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button id={id} className="btn-ghost btn-neon text-sm px-3 py-1.5" onClick={handle}>
      {copied ? <CheckCheck size={13} className="text-green-400" /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

export default function ResultPanel({ video }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showVariations, setShowVariations] = useState(false);
  const videoRef = useRef(null);

  const ai = video?.aiAnalysis || {};
  const score = ai.viralScore || 0;
  const pct = (score / 10) * 100;

  if (!video || video.status !== 'completed') return null;

  const videoFileName = video.outputFile;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else {
      videoRef.current.pause();
    }
  };

  return (
    <motion.div
      id="result-panel"
      className="space-y-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap size={22} className="text-yellow-400" /> AI Analysis Results
        </h2>
        <a
          id="download-short-btn"
          href={`${API_BASE}/api/download/${video.id}`}
          download
          className="btn-primary btn-neon text-base"
        >
          <Download size={18} /> Download Short
        </a>
      </div>

      {/* Video preview + score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          className="relative glass rounded-2xl overflow-hidden group cursor-pointer mx-auto w-full md:w-[65%]"
          style={{ aspectRatio: '9/16' }}
          onClick={togglePlay}
        >
          {videoFileName ? (
            <>
              <video
                ref={videoRef}
                src={`${API_BASE}/outputs/${videoFileName}`}
                playsInline
                crossOrigin="anonymous"
                className="w-full h-full object-cover"
                style={{ background: '#000' }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-all">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 scale-110 group-hover:scale-125 transition-transform">
                    <Play size={32} className="text-white fill-white ml-1" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Play size={40} className="text-slate-600" />
            </div>
          )}
        </div>

        {/* Score & summary */}
        <div className="md:col-span-2 space-y-4">
          {/* Summary */}
          <div className="glass ai-shimmer p-5 rounded-2xl space-y-2">
            <p className="text-sm text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
              <Zap size={12} className="text-purple-400" /> Clip Summary
            </p>
            <p className="text-slate-200 text-base italic leading-relaxed relative z-10">
              "{ai.summary || 'Analyzing what was discussed...'}"
            </p>
          </div>

          {/* Viral score ring */}
          <div className="glass p-5 rounded-2xl flex items-center gap-5">
            <div
              className="score-ring shrink-0"
              style={{ '--pct': `${pct}%` }}
              title={`Viral Score: ${score}/10`}
            >
              <span className="gradient-text">{score.toFixed(1)}</span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500 uppercase tracking-wider font-medium">Viral Score</p>
              <p className="text-3xl font-black text-white mt-0.5">{score.toFixed(1)}<span className="text-slate-500 text-lg font-normal">/10</span></p>

              {/* Timeline */}
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>0:00</span>
                  <span>{Math.floor(video.duration || 0)}s</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden relative">
                  <div
                    className="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]"
                    style={{
                      left: `${((video.options?.trimStart || 0) / (video.duration || 1)) * 100}%`,
                      width: `${((ai.suggestedDuration || video.options?.trimDuration || 0) / (video.duration || 1)) * 100}%`
                    }}
                  />
                </div>
                <p className="text-[11px] text-purple-400 font-medium">
                  Clip Timeline: {video.options?.trimStart || 0}s → {(video.options?.trimStart || 0) + (ai.suggestedDuration || video.options?.trimDuration || 0).toFixed(1)}s
                </p>
              </div>
            </div>
          </div>

          {/* Category + posting time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="glass p-4 rounded-xl">
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1.5">
                <Tag size={12} /> Category
              </p>
              <p className="font-semibold text-white text-base">{ai.category || '—'}</p>
            </div>
            <div className="glass p-4 rounded-xl">
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1.5">
                <Clock size={12} /> Best Post Time
              </p>
              <p className="font-semibold text-white text-base">{ai.postingTime || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="glass ai-shimmer p-5 rounded-2xl space-y-2">
        <div className="flex items-center justify-between relative z-10">
          <p className="text-sm text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Star size={12} className="text-yellow-400" /> Viral Title
          </p>
          <CopyButton id="copy-title-btn" text={ai.title || ''} label="Title" />
        </div>
        <p className="text-white font-bold text-xl leading-snug relative z-10">{ai.title || '—'}</p>

        {/* Title variations toggle */}
        {ai.titleVariations?.length > 0 && (
          <div className="mt-3 border-t border-white/[0.06] pt-3">
            <button
              id="toggle-variations-btn"
              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
              onClick={() => setShowVariations(!showVariations)}
            >
              {showVariations ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showVariations ? 'Hide' : 'Show'} 3 alternative titles
            </button>
            <AnimatePresence>
              {showVariations && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-2"
                >
                  {ai.titleVariations.map((t, i) => (
                    <div key={i} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                      <p className="text-base text-slate-300 flex-1 mr-3">{t}</p>
                      <CopyButton id={`copy-variation-${i}-btn`} text={t} label="Copy" />
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="glass p-5 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 uppercase tracking-wider font-medium">SEO Description</p>
          <CopyButton id="copy-desc-btn" text={ai.description || ''} label="Description" />
        </div>
        <p className="text-slate-300 text-base leading-relaxed">{ai.description || '—'}</p>
      </div>

      {/* Hashtags */}
      <div className="glass p-5 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Hash size={12} /> Hashtags
          </p>
          <CopyButton id="copy-hashtags-btn" text={(ai.hashtags || []).join(' ')} label="All Tags" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(ai.hashtags || []).map((tag) => (
            <button
              key={tag}
              className="hashtag-chip"
              onClick={() => { navigator.clipboard.writeText(tag); toast.success(`${tag} copied!`); }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Upload tip */}
      {ai.uploadTips && (
        <div className="glass p-4 rounded-xl flex items-start gap-3 border border-yellow-500/20 bg-yellow-500/[0.05]">
          <Lightbulb size={20} className="text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-400 mb-0.5">Upload Tip</p>
            <p className="text-base text-slate-300">{ai.uploadTips}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
