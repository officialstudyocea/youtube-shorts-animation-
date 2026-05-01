/**
 * App.jsx – Root application with routing
 */
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import UploadPage from './pages/UploadPage';
import HistoryPage from './pages/HistoryPage';

import { useEffect, useRef } from 'react';

export default function App() {
  const cursorRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <BrowserRouter>
      {/* Background Layers */}
      <div className="moving-bg" />
      <div className="particles-layer" />
      <div id="cursor-glow" ref={cursorRef} />

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#8b5cf6', secondary: '#fff' } },
        }}
      />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <main className="main-content">
        <Routes>
          <Route path="/"        element={<Dashboard />} />
          <Route path="/upload"  element={<UploadPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
