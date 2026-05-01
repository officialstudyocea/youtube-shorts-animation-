/**
 * Sidebar.jsx
 * Fixed left navigation sidebar with animated neon accents.
 */
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Upload, History, Settings, Zap, Film, Menu, X
} from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload',   icon: Upload,           label: 'Upload'    },
  { to: '/history',  icon: History,          label: 'History'   },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        id="sidebar-toggle"
        className="fixed top-4 left-4 z-[200] md:hidden p-2 rounded-lg glass"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[150] md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center animate-pulse-glow">
              <Film size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Shorts Maker</h1>
              <p className="text-[11px] text-purple-400 mt-0.5">Automation Studio</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-4 px-0">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

      </aside>
    </>
  );
}
