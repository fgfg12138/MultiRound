// ===== AI 圆桌模拟器 — App with HashRouter =====

import { useEffect } from 'react';
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Home from '@/pages/Home';
import Create from '@/pages/Create';
import Discussion from '@/pages/Discussion';
import Result from '@/pages/Result';
import Settings from '@/pages/Settings';

function MenuActionListener() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = window.electronAPI?.onMenuAction?.((action: string) => {
      switch (action) {
        case 'new-roundtable':
          navigate('/create');
          break;
        case 'open-settings':
          navigate('/settings');
          break;
      }
    });
    return () => {
      if (cleanup) cleanup();
    };
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <HashRouter>
      <MenuActionListener />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<Create />} />
        <Route path="/discussion/:id" element={<Discussion />} />
        <Route path="/result/:id" element={<Result />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
}
