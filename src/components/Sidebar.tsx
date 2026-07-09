import { Home, MessageSquare, Plus, Settings, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

interface NavItemData {
  label: string;
  icon: React.ReactNode;
  path: string;
}

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const mainMenuItems: NavItemData[] = [
    { label: '首页', icon: <Home className="w-5 h-5" />, path: '/' },
    { label: '讨论列表', icon: <MessageSquare className="w-5 h-5" />, path: '/' },
    { label: '创建圆桌', icon: <Plus className="w-5 h-5" />, path: '/create' },
    { label: '设置', icon: <Settings className="w-5 h-5" />, path: '/settings' },
  ];

  const isActive = (path: string): boolean => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/discussion/');
    }
    return location.pathname === path;
  };

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <aside
      className="w-60 min-w-[240px] flex flex-col py-s5 px-s1 gap-s1 overflow-y-auto select-none"
      style={{
        background: 'linear-gradient(180deg, #4c1d95 0%, #3b0764 100%)',
        color: '#fff',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-s3 px-s3 mb-s6 text-lg font-bold">
        <div
          className="w-9 h-9 flex items-center justify-center text-lg rounded-r"
          style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}
        >
          ◆
        </div>
        <span>AI 圆桌</span>
      </div>

      {/* Section: 主菜单 */}
      <div className="px-s3 mb-s1">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,.35)' }}
        >
          主菜单
        </span>
      </div>

      {mainMenuItems.map((item) => (
        <div
          key={item.label}
          onClick={() => handleNavClick(item.path)}
          className={`
            flex items-center gap-s3 px-s3 py-[10px] rounded-r cursor-pointer text-sm font-medium
            transition-all duration-200 no-underline select-none
            ${isActive(item.path) ? 'active-nav' : ''}
          `}
          style={{
            color: isActive(item.path) ? '#fff' : 'rgba(255,255,255,.7)',
            background: isActive(item.path) ? 'rgba(255,255,255,.15)' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (!isActive(item.path)) {
              e.currentTarget.style.background = 'rgba(255,255,255,.1)';
              e.currentTarget.style.color = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive(item.path)) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(255,255,255,.7)';
            }
          }}
        >
          <span className="w-5 text-center shrink-0">{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}

      {/* Section: 深度模式 (commented out for future use) */}
      {/* 
      <div className="h-px my-s3" style={{ background: 'rgba(255,255,255,.08)' }} />

      <div className="px-s3 mb-s1">
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,.35)' }}
        >
          深度模式
        </span>
      </div>

      {deepModeItems.map((item) => (
        <div
          key={item.label}
          onClick={() => handleNavClick(item.path)}
          className={`
            flex items-center gap-s3 px-s3 py-[10px] rounded-r cursor-pointer text-sm font-medium
            transition-all duration-200 no-underline select-none
            ${isActive(item.path) ? 'active-nav' : ''}
          `}
          style={{
            color: isActive(item.path) ? '#fff' : 'rgba(255,255,255,.7)',
            background: isActive(item.path) ? 'rgba(255,255,255,.15)' : 'transparent',
          }}
        >
          <span className="w-5 text-center shrink-0">{item.icon}</span>
          <span>{item.label}</span>
        </div>
      ))}
      */}

      {/* Bottom: User Info */}
      <div className="mt-auto">
        <div
          className="flex items-center gap-s3 px-s3 py-s3 rounded-r mt-s3"
          style={{ background: 'rgba(255,255,255,.06)' }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }}
          >
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: '#fff' }}>
              主持人
            </div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,.5)' }}>
              主持人
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
