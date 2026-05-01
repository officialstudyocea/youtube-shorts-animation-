/**
 * Dashboard.jsx
 * Landing dashboard showing stats, recent videos, and quick access.
 */
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, Film, TrendingUp, Zap, ArrowRight, Loader2 } from 'lucide-react';
import useVideoStore from '../store/useVideoStore';
import VideoCard from '../components/VideoCard';
import ResultPanel from '../components/ResultPanel';
import MultiClipPanel from '../components/MultiClipPanel';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <motion.div 
      className="glass p-5 rounded-2xl flex items-center gap-4 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-1" 
      {...fadeUp}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const { videos, fetchVideos, loading, setActiveVideo, activeVideo } = useVideoStore();

  useEffect(() => { fetchVideos(); }, []);

  const completed  = videos.filter((v) => v.status === 'completed').length;
  const processing = videos.filter((v) => v.status === 'processing').length;
  const avgScore   = completed
    ? (videos.filter((v) => v.status === 'completed')
        .reduce((s, v) => s + (v.aiAnalysis?.viralScore || 0), 0) / completed).toFixed(1)
    : '—';

  const recent = videos.slice(0, 6);

  return (
    <div className="min-h-screen p-6 space-y-8">
      {/* Hero */}
      <motion.div
        className="relative rounded-3xl overflow-hidden p-8 md:p-12"
        style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(59,130,246,0.1) 50%, rgba(236,72,153,0.1) 100%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex-1 space-y-6">
            <div className="flex items-center gap-2">
              <span className="badge badge-completed shadow-lg shadow-green-500/20">✨ AI Powered</span>
              <span className="badge badge-processing shadow-lg shadow-yellow-500/20">⚡ Groq LLaMA 70B</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-white leading-[1.1] tracking-tight">
              Turn Clips into<br />
              <span className="gradient-text">Viral Shorts</span> 🚀
            </h1>
            <p className="text-slate-400 text-lg mb-6 max-w-xl">
            Upload → Auto-crop to 1:1 → Burn subtitles → Get AI-powered titles, hashtags & viral score. All in seconds.
          </p>
            <Link to="/upload" id="get-started-btn" className="btn-primary btn-neon text-base px-8 py-4 shadow-xl shadow-purple-500/30">
              <Upload size={20} /> <span>Start Creating</span> <ArrowRight size={18} />
            </Link>
          </div>

          <div className="flex-1 w-full flex justify-center md:justify-end relative">
            {/* Phone Mockup */}
            <motion.div 
              className="relative w-64 aspect-[9/16] bg-slate-900 border-[8px] border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-purple-500/40 z-10"
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
            >
              <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 rounded-b-3xl w-1/2 mx-auto z-20" />
              <div className="w-full h-full bg-slate-800 relative flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/40 to-blue-600/40 opacity-50" />
                <Film size={48} className="text-white/50 animate-pulse" />
                {/* Simulated captions */}
                <div className="absolute bottom-16 inset-x-4">
                  <div className="bg-yellow-400 text-black text-center font-bold text-lg py-1 px-2 rounded-lg transform -rotate-2">WAIT UNTIL THE END!</div>
                </div>
              </div>
            </motion.div>
            
            {/* Floating Elements */}
            <motion.div 
              className="absolute top-10 right-0 glass px-4 py-2 rounded-xl z-20 shadow-lg shadow-purple-500/20"
              animate={{ y: [0, 8, 0], x: [0, -5, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            >
              <span className="text-white font-bold text-sm">🔥 9.8/10 Viral</span>
            </motion.div>
            
            <motion.div 
              className="absolute bottom-20 left-4 glass px-4 py-2 rounded-xl z-20 shadow-lg shadow-blue-500/20"
              animate={{ y: [0, -8, 0], x: [0, 5, 0] }}
              transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
            >
              <span className="text-white font-bold text-sm">✨ Auto-Captions</span>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Film}       label="Total Uploads"    value={videos.length}    color="bg-purple-500/20 text-purple-400" />
        <StatCard icon={TrendingUp} label="Shorts Created"   value={completed}        color="bg-green-500/20 text-green-400"  />
        <StatCard icon={Loader2}    label="In Progress"      value={processing}       color="bg-yellow-500/20 text-yellow-400"/>
        <StatCard icon={Zap}        label="Avg Viral Score"  value={`${avgScore}/10`} color="bg-blue-500/20 text-blue-400"    />
      </div>

      {/* Active result */}
      {activeVideo?.status === 'completed' && (
        <div className="glass p-6 rounded-2xl">
          {activeVideo.mode === 'multi' ? (
            <MultiClipPanel video={activeVideo} />
          ) : (
            <ResultPanel video={activeVideo} />
          )}
        </div>
      )}

      {/* Recent videos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Recent Clips</h2>
          <Link to="/history" className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass rounded-2xl overflow-hidden">
                <div className="skeleton aspect-[9/5]" />
                <div className="p-4 space-y-2">
                  <div className="skeleton h-4 rounded w-3/4" />
                  <div className="skeleton h-3 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="glass p-12 rounded-2xl text-center">
            <Film size={40} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No clips yet. Upload your first video!</p>
            <Link to="/upload" className="btn-primary btn-neon text-sm mt-4 inline-flex">
              <Upload size={15} /> Upload Now
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onClick={(vid) => setActiveVideo(vid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
