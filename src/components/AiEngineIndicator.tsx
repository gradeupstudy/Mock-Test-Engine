import React, { useState, useEffect } from 'react';
import { Sparkles, Key, Server, HardDrive, ShieldCheck, ChevronRight, Layers, Cpu, RefreshCw } from 'lucide-react';
import { AiConfig, AiProvider } from '../types';
import { extractKeysList, onApiShift, ApiShiftEvent } from '../lib/aiClient';

interface AiEngineIndicatorProps {
  config: AiConfig;
  onOpenModal?: () => void;
  variant?: 'badge' | 'card' | 'inline';
  className?: string;
}

export function getAiEngineDetails(config: AiConfig, activeKeyIndex?: number) {
  const provider = config.provider || 'gemini';
  const keys = config.apiKeysList && config.apiKeysList.length > 0
    ? config.apiKeysList
    : extractKeysList(config.apiKey);

  let providerName = 'Google Gemini';
  let providerShort = 'Gemini';
  let defaultModel = 'gemini-2.5-flash';

  if (provider === 'groq') {
    providerName = 'Groq Cloud AI';
    providerShort = 'Groq';
    defaultModel = 'llama-3.3-70b-versatile';
  } else if (provider === 'openai') {
    providerName = 'OpenAI';
    providerShort = 'OpenAI';
    defaultModel = 'gpt-4o-mini';
  } else if (provider === 'openrouter') {
    providerName = 'OpenRouter';
    providerShort = 'OpenRouter';
    defaultModel = 'google/gemini-2.5-flash';
  } else if (provider === 'ollama') {
    providerName = 'Ollama Local';
    providerShort = 'Ollama';
    defaultModel = 'qwen3:8b';
  }

  const modelName = config.model && config.model.trim() ? config.model.trim() : defaultModel;

  const currentIdx = activeKeyIndex !== undefined ? activeKeyIndex : 0;
  const activeKeyRaw = keys[currentIdx] || '';
  const activeKeyMasked = activeKeyRaw.length > 12
    ? `${activeKeyRaw.slice(0, 8)}...${activeKeyRaw.slice(-4)}`
    : activeKeyRaw;

  let keyBadge = 'Key #1';
  let keyDetail = 'Key #1 (Active)';

  if (provider === 'ollama') {
    keyBadge = 'Local API';
    keyDetail = 'Local REST API (No Key Needed)';
  } else if (keys.length > 1) {
    keyBadge = `Key ${currentIdx + 1}/${keys.length}`;
    keyDetail = `Key #${currentIdx + 1} (${activeKeyMasked}) Active (${keys.length} Keys Configured)`;
  } else if (keys.length === 1) {
    keyBadge = `Key #1 (${activeKeyMasked})`;
    keyDetail = `Key #1 (${activeKeyMasked}) Active`;
  } else if (provider === 'gemini') {
    keyBadge = 'Server Key';
    keyDetail = 'AI Studio System Key (Default)';
  } else {
    keyBadge = 'No Key';
    keyDetail = 'No API Key Entered';
  }

  const fallbacks = config.enableFallback !== false && config.fallbackProviders ? config.fallbackProviders : [];
  const fallbackCount = fallbacks.length;

  return {
    provider,
    providerName,
    providerShort,
    modelName,
    keyBadge,
    keyDetail,
    activeKeyMasked,
    activeKeyRaw,
    totalKeys: keys.length,
    fallbackCount,
    fallbacks
  };
}

export const AiEngineIndicator: React.FC<AiEngineIndicatorProps> = ({
  config,
  onOpenModal,
  variant = 'badge',
  className = ''
}) => {
  const [activeKeyIdx, setActiveKeyIdx] = useState<number>(0);
  const [shiftNotification, setShiftNotification] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onApiShift((evt: ApiShiftEvent) => {
      if (evt.provider === (config.provider || 'gemini')) {
        setActiveKeyIdx(evt.activeKeyIndex);
        if (evt.isCooldownShift) {
          setShiftNotification(`⚡ Shifted to Key #${evt.activeKeyIndex + 1}/${evt.totalKeys} (Quota Limit)`);
          setTimeout(() => setShiftNotification(null), 4000);
        }
      }
    });
    return () => unsubscribe();
  }, [config.provider]);

  const details = getAiEngineDetails(config, activeKeyIdx);

  if (variant === 'badge') {
    return (
      <div className="relative inline-flex items-center">
        {shiftNotification && (
          <div className="absolute -bottom-8 left-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded shadow-lg animate-bounce z-50 whitespace-nowrap text-center">
            {shiftNotification}
          </div>
        )}
        <button
          type="button"
          onClick={onOpenModal}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all bg-gradient-to-r from-purple-900/80 to-indigo-900/80 hover:from-purple-900 hover:to-indigo-900 border border-purple-500/40 text-purple-200 shadow-md hover:shadow-purple-500/20 group ${className}`}
          title="Click to view or update AI Engine & API Keys"
        >
          <div className="flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-purple-400 group-hover:rotate-12 transition-transform" />
            <span className="font-bold text-white">{details.providerShort}</span>
          </div>

          <span className="text-purple-400 font-mono text-[10px] hidden sm:inline">|</span>

          <span className="text-purple-300 font-mono text-[11px] truncate max-w-[120px] hidden sm:inline" title={details.modelName}>
            {details.modelName}
          </span>

          <span className="text-purple-400 font-mono text-[10px]">|</span>

          <span
            className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-md font-mono font-semibold flex items-center space-x-1"
            title={details.keyDetail}
          >
            <Key className="w-2.5 h-2.5 text-emerald-400 inline" />
            <span>{details.keyBadge}</span>
          </span>

          {details.fallbackCount > 0 && (
            <span className="bg-purple-950 text-purple-300 border border-purple-700/60 text-[9px] px-1.5 py-0.5 rounded font-mono hidden md:inline">
              +{details.fallbackCount} Backup{details.fallbackCount > 1 ? 's' : ''}
            </span>
          )}

          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
        </button>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`inline-flex items-center space-x-2 text-xs bg-slate-950/80 border border-purple-500/30 px-3 py-1.5 rounded-xl ${className}`}>
        <div className="flex items-center space-x-1 text-purple-300 font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>{details.providerShort}</span>
        </div>
        <span className="text-slate-600">•</span>
        <span className="text-slate-300 font-mono text-[11px]">{details.modelName}</span>
        <span className="text-slate-600">•</span>
        <span className="text-emerald-400 font-mono text-[11px] font-medium bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
          {details.keyDetail}
        </span>
        {onOpenModal && (
          <button
            type="button"
            onClick={onOpenModal}
            className="text-purple-400 hover:text-purple-300 underline text-[10px] font-medium ml-1"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  // Default: 'card' variant
  return (
    <div className={`bg-slate-900/90 border border-purple-500/30 rounded-2xl p-4 text-xs space-y-3 shadow-lg ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-xl">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-white text-sm">{details.providerName}</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold">
                Active API
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Current AI Generation & Parsing Engine</p>
          </div>
        </div>

        {onOpenModal && (
          <button
            type="button"
            onClick={onOpenModal}
            className="flex items-center space-x-1.5 bg-purple-950 hover:bg-purple-900 text-purple-200 border border-purple-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm"
          >
            <Key className="w-3.5 h-3.5 text-purple-400" />
            <span>Configure Keys / Engine</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
          <span className="text-[10px] text-slate-400 block font-medium mb-0.5">Active Model:</span>
          <span className="font-mono text-purple-300 font-bold text-xs truncate block" title={details.modelName}>
            {details.modelName}
          </span>
        </div>

        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
          <span className="text-[10px] text-slate-400 block font-medium mb-0.5">Active API Key:</span>
          <span className="font-mono text-emerald-400 font-bold text-xs flex items-center space-x-1 truncate">
            <Key className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span className="truncate">{details.keyDetail}</span>
          </span>
        </div>

        <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
          <span className="text-[10px] text-slate-400 block font-medium mb-0.5">Auto-Fallback Status:</span>
          <span className="font-mono text-slate-200 font-bold text-xs flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            <span>
              {details.fallbackCount > 0
                ? `${details.fallbackCount} Backup Provider${details.fallbackCount > 1 ? 's' : ''}`
                : 'Primary Only'}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
