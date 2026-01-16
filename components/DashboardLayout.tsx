'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  FolderOpen,
  BookOpen,
  Users,
  FileText,
  Settings,
  User,
  Search,
  BarChart3,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

const sideNavItems = [
  { href: '/bulk', label: 'Batches', icon: FolderOpen },
  { href: '/context', label: 'Courses', icon: BookOpen },
  { href: '/students', label: 'Students', icon: Users },
  { href: '/rubrics', label: 'Rubrics', icon: FileText },
];

const topNavItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/bulk', label: 'Batches' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-surface-200 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-surface-100">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-lg font-semibold text-surface-900">Babblet</span>
              <p className="text-xs text-surface-500">Grading Portal</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {sideNavItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-surface-600 hover:bg-surface-50 hover:text-surface-900'
                    }`}
                  >
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-primary-600' : 'text-surface-400'}`} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-surface-100">
          <Link
            href="/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
          >
            <Settings className="w-5 h-5 text-surface-400" />
            Settings
          </Link>
          
          {/* User Profile */}
          <div className="mt-4 flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <User className="w-4 h-4 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-900 truncate">Dr. A. Smith</p>
              <p className="text-xs text-surface-500 truncate">asmith@edu.edu</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 bg-white border-b border-surface-200 flex items-center justify-between px-6">
          <nav className="flex items-center gap-6">
            {topNavItems.map((item) => {
              const isActive = item.href === '/bulk' 
                ? pathname === '/bulk' || pathname?.startsWith('/bulk/')
                : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-primary-600'
                      : 'text-surface-500 hover:text-surface-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text"
                placeholder="Search"
                className="w-48 pl-9 pr-3 py-1.5 bg-surface-50 border border-surface-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            
            {/* User Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-medium">
              A
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
