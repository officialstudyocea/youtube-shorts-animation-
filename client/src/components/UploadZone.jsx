/**
 * UploadZone.jsx
 * Drag-and-drop uploader supporting both single-clip and multi-clip modes.
 */
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, Film, AlertCircle, Loader2, X,
  Plus, Trash2, Scissors, ChevronDown, ChevronUp
} from 'lucide-react';
import useVideoStore from '../store/useVideoStore';

const MAX_SIZE_MB  = 1024;
const ACCEPT_TYPES = { 'video/*': ['.mp4', '.mov', '.mkv', '.avi', '.webm'] };

// ── Clip row editor ───────────────────────────────────────────────────────────
function ClipRow({ clip, index, onChange, onRemove, videoDuration }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl"
    >
      <input
        className="input-field py-1.5 text-base"
        placeholder={`Clip ${index + 1} label...`}
        value={clip.label}
        onChange={(e) => onChange(index, 'label', e.target.value)}
      />
      <div>
        <label className="text-[11px] text-slate-500 block mb-0.5">Start (s)</label>
        <input
          type="number" min="0"
          max={videoDuration ? Math.max(0, videoDuration - 1) : 9999}
          step="0.5"
          className="input-field py-1.5 text-base"
          value={clip.startTime}
          onChange={(e) => onChange(index, 'startTime', parseFloat(e.target.value) || 0)}
        />
      </div>
      <div>
        <label className="text-[11px] text-slate-500 block mb-0.5">Length (s)</label>
        <input
          type="number" min="10" max="60" step="0.5"
          className="input-field py-1.5 text-base"
          value={clip.duration}
          onChange={(e) => onChange(index, 'duration', Math.min(60, parseFloat(e.target.value) || 15))}
        />
      </div>
      <button
        className="btn-danger btn-neon px-2 py-2 mt-4"
        onClick={() => onRemove(index)}
        title="Remove clip"
      >
        <Trash2 size={13} />
      </button>
    </motion.div>
  );
}

export default function UploadZone({ onSuccess }) {
  const { uploadVideo, uploading, uploadProgress, error, clearError } = useVideoStore();

  const [selectedFile, setSelectedFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [mode, setMode] = useState('single'); // 'single' | 'multi'
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState({
    duration: '30', language: 'en', captionStyle: 'modern', subtitles: 'true', aspectRatio: '1:1'
  });
  const [clips, setClips] = useState([
    { label: 'Clip 1', startTime: 0, duration: 30 },
  ]);

  // ── Dropzone ──────────────────────────────────────────────────────────────
  const onDrop = useCallback((accepted, rejected) => {
    if (rejected.length) {
      useVideoStore.setState({ error: 'Invalid file. Use MP4, MOV, MKV (max 1 GB).' });
      return;
    }
    if (accepted[0]) {
      setSelectedFile(accepted[0]);
      clearError();
      // Probe duration via HTML5 video element
      // Some codecs (e.g. H.265/HEVC) can't be previewed in Chrome — we handle
      // that gracefully and still allow the upload, just skip duration display.
      const url = URL.createObjectURL(accepted[0]);
      const v   = document.createElement('video');
      v.preload  = 'metadata';
      v.onloadedmetadata = () => {
        setVideoDuration(Math.floor(v.duration));
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        // Browser can't decode this codec for preview — that's fine.
        // FFmpeg on the server can handle it. Just skip duration display.
        URL.revokeObjectURL(url);
        setVideoDuration(null);
      };
      v.src = url; // assign src AFTER handlers are attached
    }
  }, [clearError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPT_TYPES,
    maxSize: MAX_SIZE_MB * 1024 * 1024,
    maxFiles: 1, disabled: uploading,
  });

  // ── Clip management ───────────────────────────────────────────────────────
  const addClip = () => {
    const last = clips[clips.length - 1];
    const nextStart = last ? last.startTime + last.duration : 0;
    setClips([...clips, { label: `Clip ${clips.length + 1}`, startTime: nextStart, duration: 30 }]);
  };

  const removeClip = (i) => setClips(clips.filter((_, idx) => idx !== i));

  const updateClip = (i, field, val) =>
    setClips(clips.map((c, idx) => idx === i ? { ...c, [field]: val } : c));

  // Auto-generate clips (Basic version)
  const autoSplit = (type = '3-clips') => {
    if (!videoDuration) return;
    
    let generated = [];
    if (type === 'all') {
      // Split into 60s chunks (max duration)
      const segLen = 60;
      const count = Math.ceil(videoDuration / segLen);
      generated = Array.from({ length: count }, (_, i) => {
        const start = i * segLen;
        const duration = Math.min(segLen, videoDuration - start);
        return { label: `Part ${i + 1}`, startTime: start, duration };
      }).filter(c => c.duration >= 10); // Keep clips at least 10s as requested
    } else {
      // Split into 3 equal-ish clips, target 30-60s each
      const count = 3;
      const totalAvailable = Math.min(videoDuration, 180); // Look at first 3 mins
      const segLen = Math.max(10, Math.min(60, Math.floor(totalAvailable / count)));
      
      generated = Array.from({ length: count }, (_, i) => ({
        label: `Hook ${i + 1}`,
        startTime: i * (videoDuration / (count + 1)), // Space them out
        duration: segLen,
      }));
    }
    
    setClips(generated);
    setMode('multi');
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile) return;

    const payload = { ...options };
    if (mode === 'multi') {
      payload.clips = JSON.stringify(clips);
    }

    const video = await uploadVideo(selectedFile, payload);
    if (video) {
      setSelectedFile(null);
      setVideoDuration(null);
      onSuccess?.(video);
    }
  };

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex gap-2 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06] w-fit">
        {[['single', 'Single Clip', Scissors], ['multi', 'Multi-Clip', Film]].map(([m, label, Icon]) => (
          <button
            key={m}
            id={`mode-${m}-btn`}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-base font-medium transition-all ${
              mode === m
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
            onClick={() => setMode(m)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <motion.div
        {...getRootProps()}
        id="dropzone"
        className={`drop-zone p-10 text-center ${isDragActive ? 'active' : ''} ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
        whileHover={!uploading ? { scale: 1.005 } : {}}
      >
        <input {...getInputProps()} id="video-file-input" />
        <AnimatePresence mode="wait">
          {selectedFile ? (
            <motion.div key="sel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                <Film size={26} className="text-purple-400 animate-float" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{selectedFile.name}</p>
                <p className="text-slate-400 text-base mt-0.5">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  {videoDuration ? ` · ${videoDuration}s` : ''}
                  {' '}· Ready
                </p>
              </div>
              {!uploading && (
                <button id="clear-file-btn" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setVideoDuration(null); }} className="btn-ghost btn-neon text-sm">
                  <X size={13} /> Clear
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${isDragActive ? 'bg-purple-500/30 scale-110' : 'bg-white/[0.04]'}`}>
                <Upload size={28} className={isDragActive ? 'text-purple-400' : 'text-slate-500'} />
              </div>
              <div>
                <p className="text-xl font-semibold text-white">{isDragActive ? '🎬 Drop it here!' : 'Drag & drop your 16:9 video'}</p>
                <p className="text-slate-500 text-base mt-1">or <span className="text-purple-400 font-medium">browse files</span></p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {['MP4', 'MOV', 'MKV', 'AVI'].map((ext) => (
                  <span key={ext} className="hashtag-chip text-sm">{ext}</span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Multi-clip segment editor */}
      <AnimatePresence>
        {mode === 'multi' && (
          <motion.div
            key="multi"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-white flex items-center gap-2">
                <Scissors size={16} className="text-purple-400" />
                Clip Segments
                <span className="badge badge-uploaded">{clips.length} clips</span>
              </p>
              <div className="flex gap-2">
                {selectedFile && videoDuration && (
                  <>
                    <button id="auto-split-btn" className="btn-ghost btn-neon text-sm px-3 py-1.5" onClick={() => autoSplit('3-clips')}>
                      ✨ Smart Split (3)
                    </button>
                    <button id="generate-all-btn" className="btn-primary btn-neon text-sm px-3 py-1.5" onClick={() => autoSplit('all')}>
                      🎬 Split Entire Video
                    </button>
                  </>
                )}
                <button id="add-clip-btn" className="btn-primary btn-neon text-sm px-3 py-1.5" onClick={addClip}>
                  <Plus size={14} /> Add Clip
                </button>
              </div>
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[1fr_90px_90px_auto] gap-2 px-3">
              <span className="text-[11px] text-slate-500 uppercase tracking-wider">Label</span>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider">Start</span>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider">Length</span>
              <span />
            </div>

            <AnimatePresence>
              {clips.map((clip, i) => (
                <ClipRow
                  key={i}
                  clip={clip}
                  index={i}
                  onChange={updateClip}
                  onRemove={removeClip}
                  videoDuration={videoDuration}
                />
              ))}
            </AnimatePresence>

            {videoDuration && (
              <p className="text-sm text-slate-600">
                Source video: {videoDuration}s · Each clip max 60s
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced options (collapsible) */}
      <div>
        <button
          id="toggle-advanced-btn"
          className="flex items-center gap-2 text-base text-slate-400 hover:text-white transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Advanced options
        </button>
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3"
            >
              {mode === 'single' && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">Duration (max 60s)</label>
                  <select id="duration-select" className="input-field" value={options.duration} onChange={(e) => setOptions({ ...options, duration: e.target.value })}>
                    {['15', '30', '45', '60'].map((v) => <option key={v} value={v}>{v}s</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Language</label>
                <select id="language-select" className="input-field" value={options.language} onChange={(e) => setOptions({ ...options, language: e.target.value })}>
                  {[['en','English'],['hi','Hindi'],['es','Spanish'],['fr','French'],['de','German'],['ja','Japanese']].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Caption Style</label>
                <select id="caption-style-select" className="input-field" value={options.captionStyle} onChange={(e) => setOptions({ ...options, captionStyle: e.target.value })}>
                  {['modern', 'classic', 'minimal'].map((v) => (
                    <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Subtitles</label>
                <select id="subtitles-select" className="input-field" value={options.subtitles} onChange={(e) => setOptions({ ...options, subtitles: e.target.value })}>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">Aspect Ratio</label>
                <select id="aspect-ratio-select" className="input-field" value={options.aspectRatio} onChange={(e) => setOptions({ ...options, aspectRatio: e.target.value })}>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="9:16">9:16 (Vertical)</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {uploading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass p-4 rounded-xl">
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin text-purple-400" />Uploading...</span>
              <span className="text-purple-400 font-bold">{uploadProgress}%</span>
            </div>
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${uploadProgress}%` }} /></div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <p className="text-red-300 text-base flex-1">{error}</p>
            <button id="clear-error-btn" onClick={clearError}><X size={16} className="text-red-400" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload button */}
      <motion.button
        id="upload-btn"
        className="btn-primary btn-neon w-full justify-center py-4 text-lg"
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
        whileTap={{ scale: 0.97 }}
        style={{ opacity: (!selectedFile || uploading) ? 0.5 : 1 }}
      >
        {uploading ? (
          <><Loader2 size={18} className="animate-spin" /><span>Uploading...</span></>
        ) : mode === 'multi' ? (
          <><Scissors size={18} /><span>Upload & Cut {clips.length} Clips</span></>
        ) : (
          <><Upload size={18} /><span>Upload & Process</span></>
        )}
      </motion.button>
    </div>
  );
}
