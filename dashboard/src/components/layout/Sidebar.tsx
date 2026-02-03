'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  Settings,
  Rocket,
  ClipboardCheck,
  X,
  UserCircle,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchAPI } from '@/lib/api';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  badge?: number;
  isModal?: boolean;
  onClick?: () => void;
}

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onDocsClick?: () => void;
}

export function Sidebar({ isOpen = false, onClose, onDocsClick }: SidebarProps) {
  const pathname = usePathname();
  const [reviewCount, setReviewCount] = useState(0);

  // Fetch review count
  useEffect(() => {
    async function fetchReviewCount() {
      try {
        const data = await fetchAPI('/api/tasks?status=review');
        setReviewCount(data?.tasks?.length || 0);
      } catch {
        // Silently fail
      }
    }
    fetchReviewCount();
    const interval = setInterval(fetchReviewCount, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems: NavItem[] = [
    { href: '/', label: 'Tasks', icon: LayoutDashboard },
    { href: '/review', label: 'Review', icon: ClipboardCheck, badge: reviewCount },
    { href: '/teams', label: 'Teams', icon: Users },
    { href: '/agents', label: 'Agents', icon: UserCircle },
    { href: '/activity', label: 'Activity', icon: Activity },
  ];

  // Close sidebar on mobile when clicking a link
  const handleLinkClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const handleDocsClick = () => {
    handleLinkClick();
    if (onDocsClick) {
      onDocsClick();
    }
  };

  return (
    <>
      {/* Backdrop overlay - only visible on mobile when sidebar is open */}
      <div 
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside 
        className={cn(
          'fixed left-0 top-0 h-full w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-50',
          'transition-transform duration-300 ease-in-out',
          // Mobile: slides in/out based on isOpen state
          isOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop (lg+): always visible
          'lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" onClick={handleLinkClick}>
            <div className="p-2 bg-blue-600 rounded-lg">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Mission Control</h1>
              <p className="text-xs text-zinc-500">Agent Task Board</p>
            </div>
          </Link>
          
          {/* Close button - only visible on mobile */}
          <button
            onClick={onClose}
            className="lg:hidden p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-600 cursor-not-allowed"
                  title="Coming soon"
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-auto text-xs bg-zinc-800 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                </div>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={cn(
                    'ml-auto text-xs px-2 py-0.5 rounded-full font-medium',
                    isActive
                      ? 'bg-blue-500 text-white'
                      : 'bg-amber-500/20 text-amber-400'
                  )}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Docs button (opens modal) */}
          <button
            onClick={handleDocsClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 w-full text-left text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
          >
            <FileText className="h-5 w-5" />
            <span className="font-medium">Docs</span>
          </button>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-3 py-2 text-zinc-500 text-sm">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
            <span className="ml-auto text-xs bg-zinc-800 px-2 py-0.5 rounded-full">
              Soon
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
