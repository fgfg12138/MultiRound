import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
  backTo?: string;
  actions?: ReactNode;
  scrollable?: boolean;
}

export default function Layout({ children, title, showBack, backTo, actions, scrollable = true }: LayoutProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          title={title}
          showBack={showBack}
          backTo={backTo}
          actions={actions}
          onBack={handleBack}
        />
        <main className={scrollable ? 'flex-1 overflow-y-auto overflow-x-hidden' : 'flex-1 overflow-hidden flex flex-col'}>
          {children}
        </main>
      </div>
    </div>
  );
}
