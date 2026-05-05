/**
 * UploadPage.jsx
 * 4-step workflow: Upload → Processing → Done
 * Handles both single-clip and multi-clip modes.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Zap, AlertTriangle } from 'lucide-react';
import UploadZone from '../components/UploadZone';
import ResultPanel from '../components/ResultPanel';
import MultiClipPanel from '../components/MultiClipPanel';
import useVideoStore from '../store/useVideoStore';

const STEPS = ['Upload', 'Processing', 'Ready'];

function StepDots({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
              i < current  ? 'bg-purple-500 text-white' :
              i === current ? 'bg-purple-500/30 border-2 border-purple-500 text-purple-400' :
                             'bg-white/[0.05] border border-white/10 text-slate-600'
            }`}>
              {i < current ? <CheckCircle2 size={16} /> : i + 1}
            </div>
            <span className={`text-[11px] font-medium whitespace-nowrap ${i === current ? 'text-purple-400' : 'text-slate-600'}`}>
              {step}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 transition-colors duration-500 ${i < current ? 'bg-purple-500' : 'bg-white/[0.07]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function UploadPage() {
  const { processVideo, activeVideo, setActiveVideo, videos } = useVideoStore();
  const [uploadedId, setUploadedId] = useState(null);
  const [step, setStep] = useState(0);

  // After upload, trigger processing
  const handleUploadSuccess = async (video) => {
    setUploadedId(video.id);
    setActiveVideo(video);
    setStep(1);
    await processVideo(video.id);
  };

  // Watch active video for status changes
  const liveVideo = videos.find((v) => v.id === uploadedId);

  useEffect(() => {
    if (!liveVideo) return;
    if (liveVideo.status === 'processing') setStep(1);
    if (liveVideo.status === 'completed')  { setStep(2); setActiveVideo(liveVideo); }
    if (liveVideo.status === 'failed')     setStep(0);
  }, [liveVideo?.status, liveVideo?.progress]);

  const isMulti = liveVideo?.mode === 'multi';

  // Calculate accurate smooth progress
  let displayProgress = liveVideo?.progress || 0;
  if (isMulti && liveVideo?.clips?.length > 0) {
    const total = liveVideo.clips.length;
    const currentSum = liveVideo.clips.reduce((sum, c) => {
      if (c.status === 'completed') return sum + 100;
      if (c.status === 'processing') return sum + (c.progress || 0);
      return sum;
    }, 0);
    displayProgress = Math.round(currentSum / total);
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-4xl font-black text-white mb-2">
            Create <span className="gradient-text">Viral Shorts</span> 🎬
          </h1>

        </motion.div>

        <StepDots current={step} />

        <AnimatePresence mode="wait">
          {/* Step 0 – Upload */}
          {step === 0 && (
            <motion.div
              key="upload"
              className="glass p-6 rounded-2xl"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <UploadZone onSuccess={handleUploadSuccess} />
            </motion.div>
          )}

          {/* Step 1 – Processing */}
          {step === 1 && liveVideo && (
            <motion.div
              key="processing"
              className="glass p-8 rounded-2xl text-center space-y-6"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Animated rings */}
              <div className="flex justify-center w-full">
                <div className="relative w-24 h-24">
                  <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
                  <div className="absolute inset-2 rounded-full border-2 border-purple-500/50 animate-ping" style={{ animationDelay: '0.3s' }} />
                  <div className="w-24 h-24 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Loader2 size={32} className="text-purple-400 animate-spin" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-2xl font-bold text-white mb-1">
                  {isMulti ? `Processing ${liveVideo.clips?.length} Clips` : 'Processing Your Short'}
                </p>
                <p className="text-slate-500 text-base">
                  Smart-cropping to 1:1 · Burning subtitles · Groq AI analysis
                </p>
              </div>

              {/* Overall progress */}
              <div className="max-w-sm mx-auto space-y-2">
                <div className="flex justify-between text-sm text-slate-400">
                  <span>FFmpeg rendering...</span>
                  <span className="text-purple-400 font-bold">{displayProgress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${displayProgress}%` }} />
                </div>
              </div>

              {/* Per-clip mini status for multi mode */}
              {isMulti && liveVideo.clips?.length > 0 && (
                <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
                  {liveVideo.clips.map((c, i) => (
                    <div key={i} className="glass p-2 rounded-lg text-center">
                      <p className="text-[11px] text-slate-500 truncate">{c.label || `Clip ${i+1}`}</p>
                      <p className={`text-sm font-bold mt-0.5 ${
                        c.status === 'completed' ? 'text-green-400' :
                        c.status === 'processing' ? 'text-purple-400' :
                        c.status === 'failed' ? 'text-red-400' : 'text-slate-600'
                      }`}>
                        {c.status === 'completed' ? '✅' :
                         c.status === 'processing' ? `${c.progress || 0}%` :
                         c.status === 'failed' ? '❌' : '⏳'}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-slate-600 text-sm">
                {isMulti ? 'Clips are processed sequentially' : 'Usually 10-30 seconds'}
              </p>
            </motion.div>
          )}

          {/* Step 2 – Results */}
          {step === 2 && liveVideo && (
            <motion.div
              key="result"
              className="glass p-6 rounded-2xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-2 mb-6">
                <CheckCircle2 size={20} className="text-green-400" />
                <span className="font-bold text-white">
                  {isMulti ? `All ${liveVideo.clips?.length} clips ready!` : 'Your Short is ready!'}
                </span>
                <Zap size={16} className="text-yellow-400" />
              </div>

              {isMulti ? (
                <MultiClipPanel video={liveVideo} />
              ) : (
                <ResultPanel video={liveVideo} />
              )}

              <button
                id="process-another-btn"
                className="btn-ghost btn-neon w-full mt-6 justify-center"
                onClick={() => { setStep(0); setUploadedId(null); setActiveVideo(null); }}
              >
                ↩ Process Another Video
              </button>
            </motion.div>
          )}

          {/* Failed state */}
          {step === 0 && liveVideo?.status === 'failed' && (
            <motion.div
              key="failed"
              className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <AlertTriangle size={18} className="text-red-400" />
              <div>
                <p className="text-red-300 font-medium text-sm">Processing failed</p>
                <p className="text-red-400/70 text-xs mt-0.5">{liveVideo.error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
