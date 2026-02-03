'use client';

import { useState } from 'react';
import { Menu, Rocket } from 'lucide-react';
import { Sidebar } from './Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-zinc-950">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />
      
      {/* Mobile header with hamburger menu */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-zinc-950 border-b border-zinc-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={openSidebar}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <Rocket className="h-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold">Mission Control</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0">
        {children}
      </main>
    </div>
  );
}
