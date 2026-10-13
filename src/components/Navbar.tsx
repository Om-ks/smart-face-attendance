'use client';

import React from 'react';
import { Camera, UserPlus, Users, ClipboardCheck, Sparkles, ShieldCheck } from 'lucide-react';
import { ActiveTab } from '@/types';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  modelsLoaded: boolean;
  studentCount: number;
  attendanceCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  modelsLoaded,
  studentCount,
  attendanceCount,
}) => {
  const navItems = [
    {
      id: 'scanner' as ActiveTab,
      label: 'Live Scanner',
      icon: Camera,
      badge: null,
    },
    {
      id: 'enroll' as ActiveTab,
      label: 'Enroll Face',
      icon: UserPlus,
      badge: null,
    },
    {
      id: 'students' as ActiveTab,
      label: 'Students',
      icon: Users,
      badge: studentCount > 0 ? studentCount : null,
    },
    {
      id: 'records' as ActiveTab,
      label: 'Attendance',
      icon: ClipboardCheck,
      badge: attendanceCount > 0 ? attendanceCount : null,
    },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-indigo-200">
                SmartFace AI
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Edge ML
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  modelsLoaded ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                }`}
              />
              <span>{modelsLoaded ? 'SSD & ResNet Models Ready' : 'Loading Neural Nets...'}</span>
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1.5 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/60 shadow-inner">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.badge !== null && (
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-3 py-2 flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-colors relative ${
                isActive ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium">{item.label}</span>
              {item.badge !== null && (
                <span className="absolute top-0 right-2 w-4 h-4 rounded-full bg-indigo-600 text-[9px] text-white flex items-center justify-center font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </header>
  );
};
