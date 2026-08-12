import React from 'react';
import {
  BookOpen,
  PieChart,
  UploadCloud,
  Layers,
  Brain,
  SquarePen,
  Paintbrush,
  Download,
  BarChart2,
  Database,
  Key,
  ShieldCheck,
  Menu,
  X,
  Globe
} from 'lucide-react';
import { AiConfig } from '../types';
import { AiEngineIndicator } from './AiEngineIndicator';
import { getStoredAiConfig } from '../lib/aiClient';

export type ActiveModule =
  | 'dashboard'
  | 'upload'
  | 'bank'
  | 'creator'
  | 'preview'
  | 'templates'
  | 'export'
  | 'analytics'
  | 'backup'
  | 'online_mocks';

interface NavbarProps {
  onOpenGeminiModal: () => void;
  geminiActive: boolean;
  totalQuestions: number;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  aiConfig?: AiConfig;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenGeminiModal,
  geminiActive,
  totalQuestions,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  aiConfig
}) => {
  const currentConfig = aiConfig || getStoredAiConfig();

  return (
    <header className="bg-[#101540] border-b border-[#1f2863] text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-300 hover:text-white rounded-lg hover:bg-[#1f2863] transition-colors"
            title="Toggle Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 p-2 rounded-xl shadow-md flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Gradeup Study</h1>
              <span className="text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                PRO v2.5
              </span>
            </div>
            <p className="text-[11px] text-slate-400">MCQ Bank & Intelligent Mock Test Creator</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Question Count Pill */}
          <div className="hidden lg:flex items-center space-x-1 bg-[#192159] border border-[#26317d] text-slate-300 px-3 py-1.5 rounded-xl text-xs">
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span>Bank: <strong className="text-white">{totalQuestions}</strong> MCQs</span>
          </div>

          {/* Active AI Engine Indicator Badge */}
          <AiEngineIndicator config={currentConfig} onOpenModal={onOpenGeminiModal} variant="badge" />
        </div>
      </div>
    </header>
  );
};

interface SidebarProps {
  activeModule: ActiveModule;
  onSelectModule: (module: ActiveModule) => void;
  onOpenGeminiModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  onOpenGeminiModal
}) => {
  const navItems: { id: ActiveModule; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: PieChart },
    { id: 'upload', label: 'Bulk Upload', icon: UploadCloud },
    { id: 'bank', label: 'Question Bank', icon: Layers },
    { id: 'creator', label: 'Mock Test Creator', icon: Brain },
    { id: 'preview', label: 'Test Preview', icon: SquarePen },
    { id: 'templates', label: 'Templates', icon: Paintbrush },
    { id: 'online_mocks', label: 'Online Share & Results', icon: Globe },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'backup', label: 'Backup', icon: Database },
  ];

  return (
    <aside className="w-full md:w-60 bg-[#121742] border-r border-[#1e2763] flex-shrink-0 p-3 flex flex-col justify-between min-h-[calc(100vh-4rem)]">
      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              className={`relative w-full flex items-center space-x-3.5 px-3.5 py-3 rounded-xl text-xs transition-all ${
                isActive
                  ? 'bg-[#29357d] text-white font-bold shadow-md'
                  : 'text-slate-300 hover:bg-[#1a2157] hover:text-white font-medium'
              }`}
            >
              {/* Left Orange Accent Indicator Bar as shown in prompt image */}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-orange-500 rounded-r-md shadow-sm" />
              )}
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-300'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-[#1e2763] space-y-2 mt-4">
        <button
          onClick={onOpenGeminiModal}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#1a2157] hover:bg-[#232d73] text-slate-200 text-xs font-medium border border-[#2b3882] transition-colors"
        >
          <div className="flex items-center space-x-2">
            <Key className="w-3.5 h-3.5 text-purple-400" />
            <span>Gemini AI Key</span>
          </div>
          <span className="text-[10px] text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800">
            Configure
          </span>
        </button>

        <div className="px-3 py-2 bg-[#0d1233] rounded-xl border border-[#1d265e] text-[11px] text-slate-400 space-y-1">
          <div className="flex justify-between font-semibold text-slate-300">
            <span>X-IQSE v3.0 Engine</span>
            <span className="text-emerald-400">3-Engine Active</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            DU-XQE Mutation + Vector Deduplication + IRT Psychometrics active.
          </p>
        </div>
      </div>
    </aside>
  );
};
