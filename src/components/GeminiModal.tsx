import React, { useState, useEffect } from 'react';
import { Sparkles, Key, CheckCircle2, AlertCircle, X, RefreshCw, ExternalLink, Server, Plus, Trash2, Layers, ShieldCheck, Globe, HelpCircle, FileText, Settings, ArrowRight } from 'lucide-react';
import { AiConfig, AiProvider, AiProviderConfig } from '../types';
import { testAiConnection, testSpecificProvider, saveStoredAiConfig, fetchOllamaModels, extractKeysList, getActiveKeyPointer, setActiveKeyPointer, onApiShift, ApiShiftEvent } from '../lib/aiClient';

interface GeminiModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiConfig: AiConfig;
  onSaveAiConfig: (config: AiConfig) => void;
}

export const GeminiModal: React.FC<GeminiModalProps> = ({
  isOpen,
  onClose,
  aiConfig,
  onSaveAiConfig
}) => {
  const [activeTab, setActiveTab] = useState<'main' | 'tavily' | 'deepl' | 'fallback'>('main');
  const [provider, setProvider] = useState<AiProvider>(aiConfig.provider || 'gemini');
  const [apiKey, setApiKey] = useState<string>(aiConfig.apiKey || '');
  const [model, setModel] = useState<string>(aiConfig.model || '');
  const [baseUrl, setBaseUrl] = useState<string>(aiConfig.baseUrl || 'http://localhost:11434');
  const [enableFallback, setEnableFallback] = useState<boolean>(aiConfig.enableFallback !== undefined ? aiConfig.enableFallback : true);
  const [fallbackProviders, setFallbackProviders] = useState<AiProviderConfig[]>(aiConfig.fallbackProviders || []);
  const [tavilyApiKey, setTavilyApiKey] = useState<string>(aiConfig.tavilyApiKey || '');
  const [deeplApiKey, setDeeplApiKey] = useState<string>(aiConfig.deeplApiKey || '');
  const [activeKeyIdx, setActiveKeyIdx] = useState<number>(getActiveKeyPointer(aiConfig.provider || 'gemini'));

  useEffect(() => {
    setActiveKeyIdx(getActiveKeyPointer(provider));
    const unsubscribe = onApiShift((evt: ApiShiftEvent) => {
      if (evt.provider === provider) {
        setActiveKeyIdx(evt.activeKeyIndex);
      }
    });
    return () => unsubscribe();
  }, [provider]);

  // Testing states
  const [isTestingMain, setIsTestingMain] = useState<boolean>(false);
  const [mainTestResult, setMainTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isTestingTavily, setIsTestingTavily] = useState<boolean>(false);
  const [tavilyTestResult, setTavilyTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isTestingDeepl, setIsTestingDeepl] = useState<boolean>(false);
  const [deeplTestResult, setDeeplTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Ollama specific state
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | 'unknown'>('unknown');
  const [connectionError, setConnectionError] = useState<string>('');

  const loadOllamaInfo = async (targetUrl: string) => {
    setIsLoadingModels(true);
    setConnectionStatus('checking');

    try {
      const res = await fetchOllamaModels(targetUrl);
      if (res.connected && res.success) {
        setConnectionStatus('connected');
        setConnectionError('');
        setOllamaModels(res.models);
        if (res.models.length > 0 && !model) {
          setModel(res.models[0]);
        }
      } else {
        setConnectionStatus('disconnected');
        setConnectionError(res.error || 'Ollama is not running.');
        setOllamaModels([]);
      }
    } catch (err: any) {
      setConnectionStatus('disconnected');
      setConnectionError(err.message || 'Ollama is not running.');
      setOllamaModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    setProvider(aiConfig.provider || 'gemini');
    setApiKey(aiConfig.apiKey || '');
    setModel(aiConfig.model || '');
    const currentBaseUrl = aiConfig.baseUrl || 'http://localhost:11434';
    setBaseUrl(currentBaseUrl);
    setEnableFallback(aiConfig.enableFallback !== undefined ? aiConfig.enableFallback : true);
    setFallbackProviders(aiConfig.fallbackProviders || []);
    setTavilyApiKey(aiConfig.tavilyApiKey || '');
    setDeeplApiKey(aiConfig.deeplApiKey || '');

    if (isOpen && (aiConfig.provider === 'ollama' || provider === 'ollama')) {
      loadOllamaInfo(currentBaseUrl);
    }
  }, [aiConfig, isOpen]);

  useEffect(() => {
    if (isOpen && provider === 'ollama') {
      loadOllamaInfo(baseUrl);
    }
  }, [provider]);

  if (!isOpen) return null;

  const primaryKeysList = extractKeysList(apiKey);

  const currentConfig: AiConfig = {
    provider,
    apiKey: provider === 'ollama' ? '' : apiKey,
    apiKeysList: primaryKeysList,
    tavilyApiKey: tavilyApiKey.trim(),
    deeplApiKey: deeplApiKey.trim(),
    model: model.trim() || (provider === 'ollama' ? 'qwen3:8b' : ''),
    baseUrl: baseUrl.trim() || 'http://localhost:11434',
    enableFallback,
    fallbackProviders
  };

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    const trimmed = val.trim();
    if (trimmed.startsWith('tvly-') && provider !== 'tavily') {
      setProvider('tavily');
      setMainTestResult(null);
    } else if (trimmed.startsWith('gsk_') && provider !== 'groq') {
      setProvider('groq');
      setMainTestResult(null);
    } else if (trimmed.startsWith('sk-or-') && provider !== 'openrouter') {
      setProvider('openrouter');
      setMainTestResult(null);
    } else if (trimmed.startsWith('sk-') && !trimmed.startsWith('sk-or-') && provider !== 'openai') {
      setProvider('openai');
      setMainTestResult(null);
    } else if ((trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) && provider !== 'gemini') {
      setProvider('gemini');
      setMainTestResult(null);
    }
  };

  const handleAddFallback = () => {
    const nextProvider: AiProvider = provider === 'gemini' ? 'groq' : 'gemini';
    setFallbackProviders([
      ...fallbackProviders,
      {
        provider: nextProvider,
        apiKey: '',
        apiKeysList: [],
        model: '',
        baseUrl: (nextProvider as AiProvider) === 'ollama' ? 'http://localhost:11434' : ''
      }
    ]);
  };

  const handleUpdateFallback = (index: number, updated: Partial<AiProviderConfig>) => {
    const list = [...fallbackProviders];
    const item = { ...list[index], ...updated };
    if (updated.apiKey !== undefined) {
      item.apiKeysList = extractKeysList(updated.apiKey);
    }
    list[index] = item;
    setFallbackProviders(list);
  };

  const handleRemoveFallback = (index: number) => {
    setFallbackProviders(fallbackProviders.filter((_, i) => i !== index));
  };

  const handleTestMainConnection = async () => {
    setIsTestingMain(true);
    setMainTestResult(null);

    const result = await testAiConnection(currentConfig);
    setMainTestResult(result);
    setIsTestingMain(false);

    if (provider === 'ollama') {
      if (result.success) {
        setConnectionStatus('connected');
        setConnectionError('');
      } else {
        setConnectionStatus('disconnected');
        setConnectionError(result.message);
      }
    }
  };

  const handleTestTavilyConnection = async () => {
    setIsTestingTavily(true);
    setTavilyTestResult(null);
    const result = await testSpecificProvider('tavily', tavilyApiKey);
    setTavilyTestResult(result);
    setIsTestingTavily(false);
  };

  const handleTestDeeplConnection = async () => {
    setIsTestingDeepl(true);
    setDeeplTestResult(null);
    const result = await testSpecificProvider('deepl', deeplApiKey);
    setDeeplTestResult(result);
    setIsTestingDeepl(false);
  };

  const handleSave = () => {
    saveStoredAiConfig(currentConfig);
    onSaveAiConfig(currentConfig);
    onClose();
  };

  const getProviderInfo = (provName: AiProvider) => {
    switch (provName) {
      case 'gemini':
        return {
          title: 'Google Gemini AI',
          placeholder: 'AIzaSy... (Paste multiple keys separated by lines)',
          defaultModel: 'gemini-3.6-flash',
          keyUrl: 'https://aistudio.google.com/app/apikey',
          note: 'Get free Google Gemini API keys from Google AI Studio.'
        };
      case 'groq':
        return {
          title: 'Groq Cloud AI (High Speed)',
          placeholder: 'gsk_... (Paste multiple keys separated by lines)',
          defaultModel: 'llama-3.3-70b-versatile',
          keyUrl: 'https://console.groq.com/keys',
          note: 'Ultra-fast open models with generous free API quota.'
        };
      case 'openai':
        return {
          title: 'OpenAI API (GPT-4o)',
          placeholder: 'sk-proj-... (Paste multiple keys separated by lines)',
          defaultModel: 'gpt-4o-mini',
          keyUrl: 'https://platform.openai.com/api-keys',
          note: 'Standard OpenAI platform API keys.'
        };
      case 'openrouter':
        return {
          title: 'OpenRouter / Universal Router',
          placeholder: 'sk-or-v1-... (Paste multiple keys separated by lines)',
          defaultModel: 'google/gemini-2.0-flash-001',
          keyUrl: 'https://openrouter.ai/keys',
          note: 'Access multiple AI models with unified keys.'
        };
      case 'tavily':
        return {
          title: 'Tavily Search AI',
          placeholder: 'tvly-... (Paste Tavily API key)',
          defaultModel: 'tavily-search-api',
          keyUrl: 'https://tavily.com',
          note: 'Primary search engine AI API dedicated for detailed MCQ solution explanation generation.'
        };
      case 'deepl':
        return {
          title: 'DeepL Translation API',
          placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx',
          defaultModel: 'deepl-v2',
          keyUrl: 'https://www.deepl.com/pro-api',
          note: 'Primary world-class translation engine dedicated for precise MCQ dual language translation.'
        };
      case 'ollama':
        return {
          title: 'Ollama Local AI',
          placeholder: 'No API key required',
          defaultModel: 'qwen3:8b',
          keyUrl: 'https://ollama.com',
          note: 'Runs models locally via REST API.'
        };
    }
  };

  const info = getProviderInfo(provider);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-3xl p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-base font-bold text-white">AI Engine & Integration Settings</h3>
              <p className="text-[11px] text-slate-400">Configure dedicated engines for Main AI, Explanations, Translation & Failover</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Engine Quick Summary Cards (Clickable to switch tab) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Tavily Status */}
          <button
            type="button"
            onClick={() => setActiveTab('tavily')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'tavily'
                ? 'bg-amber-950/60 border-amber-500 ring-1 ring-amber-500/50'
                : 'bg-slate-950/80 border-amber-500/30 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 text-xs flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Tavily Explanations</span>
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                tavilyApiKey.trim()
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {tavilyApiKey.trim() ? 'Connected' : 'Ready'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
              <span>Main Solution Engine</span>
              <ArrowRight className="w-3 h-3 text-amber-400 opacity-70" />
            </p>
          </button>

          {/* DeepL Status */}
          <button
            type="button"
            onClick={() => setActiveTab('deepl')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'deepl'
                ? 'bg-blue-950/60 border-blue-500 ring-1 ring-blue-500/50'
                : 'bg-slate-950/80 border-blue-500/30 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-300 text-xs flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>DeepL Translation</span>
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                deeplApiKey.trim()
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}>
                {deeplApiKey.trim() ? 'Connected' : 'Ready'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
              <span>Dual Language Engine</span>
              <ArrowRight className="w-3 h-3 text-blue-400 opacity-70" />
            </p>
          </button>

          {/* Main AI & Audit Status */}
          <button
            type="button"
            onClick={() => setActiveTab('main')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'main'
                ? 'bg-purple-950/60 border-purple-500 ring-1 ring-purple-500/50'
                : 'bg-slate-950/80 border-purple-500/30 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-300 text-xs flex items-center space-x-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>Main AI & 360° Audit</span>
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-purple-500/20 border-purple-500/40 text-purple-300">
                {provider.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between">
              <span>Gemini / Groq Audit</span>
              <ArrowRight className="w-3 h-3 text-purple-400 opacity-70" />
            </p>
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('main')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'main'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>1. Main AI & 360° Audit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tavily')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'tavily'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>2. Explanation Engine (Tavily)</span>
            {tavilyApiKey.trim() && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('deepl')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'deepl'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>3. Translation Engine (DeepL)</span>
            {deeplApiKey.trim() && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fallback')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'fallback'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>4. Auto-Fallback Stack</span>
          </button>
        </div>

        {/* TAB 1: MAIN AI & 360 AUDIT */}
        {activeTab === 'main' && (
          <div className="space-y-4 text-xs animate-fadeIn">
            <div className="bg-purple-950/30 border border-purple-500/30 p-3 rounded-xl flex items-start space-x-2.5">
              <ShieldCheck className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-purple-200 text-xs">Primary Generation & 360° AI Quality Audit Engine</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                  Used for main MCQ processing, bulk question creation, and running <strong>360° Quality Audits</strong> (Gemini & Groq).
                </p>
              </div>
            </div>

            {/* Provider Selection Buttons */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold block flex items-center justify-between">
                <span>Select Primary Service Provider:</span>
                {primaryKeysList.length > 1 && (
                  <span className="text-emerald-400 font-normal text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                    {primaryKeysList.length} API Keys Active (Auto-Rotate)
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <button
                  type="button"
                  onClick={() => { setProvider('gemini'); setMainTestResult(null); }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    provider === 'gemini'
                      ? 'bg-purple-950/80 border-purple-500 text-purple-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">Google Gemini</div>
                  <div className="text-[10px] opacity-75">AI Studio</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setProvider('groq'); setMainTestResult(null); }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    provider === 'groq'
                      ? 'bg-purple-950/80 border-purple-500 text-purple-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">Groq AI</div>
                  <div className="text-[10px] opacity-75">Llama 3.3 70B</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setProvider('openrouter'); setMainTestResult(null); }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    provider === 'openrouter'
                      ? 'bg-purple-950/80 border-purple-500 text-purple-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">OpenRouter</div>
                  <div className="text-[10px] opacity-75">Universal API</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setProvider('openai'); setMainTestResult(null); }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    provider === 'openai'
                      ? 'bg-purple-950/80 border-purple-500 text-purple-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">OpenAI</div>
                  <div className="text-[10px] opacity-75">GPT-4o Mini</div>
                </button>

                <button
                  type="button"
                  onClick={() => { setProvider('ollama'); setMainTestResult(null); loadOllamaInfo(baseUrl); }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    provider === 'ollama'
                      ? 'bg-purple-950/80 border-purple-500 text-purple-200 font-bold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold text-xs">Ollama Local</div>
                  <div className="text-[10px] opacity-75">REST Endpoint</div>
                </button>
              </div>
            </div>

            {/* Inputs based on Provider */}
            {provider === 'ollama' ? (
              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-3">
                <div className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}>
                  <span className="font-semibold text-xs">
                    {connectionStatus === 'connected' ? 'Connected to Ollama Server' : 'Ollama Offline / Server Unreachable'}
                  </span>
                  <button
                    type="button"
                    onClick={() => loadOllamaInfo(baseUrl)}
                    disabled={isLoadingModels}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center space-x-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                <div>
                  <label className="text-slate-300 font-medium block mb-1">Ollama Base URL:</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 font-mono text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-medium flex items-center space-x-1.5">
                    <Key className="w-3.5 h-3.5 text-purple-400" />
                    <span>{info.title} Key(s)</span>
                  </label>
                  <a
                    href={info.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-purple-400 hover:text-purple-300 underline flex items-center space-x-1"
                  >
                    <span>Get Free Keys</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <textarea
                  rows={3}
                  value={apiKey}
                  onChange={e => handleApiKeyChange(e.target.value)}
                  placeholder={info.placeholder}
                  className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 font-mono text-xs leading-relaxed"
                />

                <p className="text-[10px] text-slate-400">
                  💡 <strong>Multi-Key Rotation:</strong> Enter multiple API keys separated by lines or commas. If Key #1 hits quota, Key #2 is called automatically!
                </p>

                {/* Live Parsed Keys Breakdown & Currently Active Key Indicator */}
                {(() => {
                  const parsedKeys = extractKeysList(apiKey);
                  if (parsedKeys.length === 0) return null;

                  return (
                    <div className="pt-2.5 border-t border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-semibold flex items-center space-x-1">
                          <Key className="w-3 h-3 text-purple-400 inline" />
                          <span>Active Key Rotation Pool ({parsedKeys.length}):</span>
                        </span>
                        <span className="text-emerald-400 text-[10px] font-mono font-bold bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded">
                          ⚡ Auto-Failover Ready
                        </span>
                      </div>

                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {parsedKeys.map((k, idx) => {
                          const masked = k.length > 12 ? `${k.slice(0, 8)}...${k.slice(-4)}` : k;
                          const currentActiveIdx = activeKeyIdx % parsedKeys.length;
                          const isActive = idx === currentActiveIdx;

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setActiveKeyPointer(provider, idx, parsedKeys.length);
                              }}
                              title="Click to select this key as the active key"
                              className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                                isActive
                                  ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-100 shadow-sm ring-1 ring-emerald-500/30'
                                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-purple-500/40 hover:bg-slate-850'
                              }`}
                            >
                              <div className="flex items-center space-x-2 truncate">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  Key #{idx + 1}
                                </span>
                                <span className="truncate font-semibold">{masked}</span>
                              </div>

                              {isActive ? (
                                <span className="text-[10px] bg-emerald-500 text-slate-950 px-2 py-0.5 rounded font-extrabold flex items-center space-x-1 flex-shrink-0 shadow-sm">
                                  <CheckCircle2 className="w-3 h-3 inline" />
                                  <span>CURRENTLY ACTIVE IN POOL</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium flex-shrink-0 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hover:text-purple-300">
                                  BACKUP (CLICK TO SET ACTIVE)
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Custom Model */}
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <label className="text-slate-400 font-medium block">Custom Model Name (Optional):</label>
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder={`Default: ${info.defaultModel}`}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 font-mono text-xs"
              />
            </div>

            {/* Test Connection Button */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestMainConnection}
                disabled={isTestingMain}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                {isTestingMain ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isTestingMain ? 'Testing Connection...' : `Test ${provider.toUpperCase()} Connection`}</span>
              </button>
            </div>

            {mainTestResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                mainTestResult.success ? 'bg-emerald-950/90 border-emerald-700 text-emerald-200' : 'bg-rose-950/90 border-rose-700 text-rose-200'
              }`}>
                {mainTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />}
                <div className="flex-1">{mainTestResult.message}</div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TAVILY EXPLANATION ENGINE */}
        {activeTab === 'tavily' && (
          <div className="space-y-4 text-xs animate-fadeIn">
            <div className="bg-amber-950/40 border border-amber-500/40 p-4 rounded-xl flex items-start space-x-3">
              <Sparkles className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-amber-200 text-sm">Tavily Search AI — Dedicated Explanation Engine</h4>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    tavilyApiKey.trim()
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {tavilyApiKey.trim() ? '⚡ Engine Active' : '⚡ System Ready'}
                  </span>
                </div>
                <p className="text-[11px] text-amber-100/90 leading-relaxed">
                  Tavily API is set as the <strong>Main Tool</strong> for generating step-by-step MCQ solutions and detailed explanations.
                </p>
              </div>
            </div>

            {/* Tavily API Key Input Section */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-amber-300 font-semibold text-xs flex items-center space-x-2">
                  <Key className="w-4 h-4 text-amber-400" />
                  <span>Tavily API Key:</span>
                </label>
                <a
                  href="https://tavily.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline font-medium flex items-center space-x-1"
                >
                  <span>Get Free Tavily API Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <input
                type="text"
                value={tavilyApiKey}
                onChange={e => setTavilyApiKey(e.target.value)}
                placeholder="tvly-... (Paste Tavily Search API Key here)"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 font-mono text-xs focus:border-amber-500 focus:outline-none shadow-inner"
              />

              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1 text-[11px] text-slate-300">
                <div className="font-semibold text-amber-300 flex items-center space-x-1.5 mb-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>How Tavily is used in this app:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li><strong>Explanation Generation:</strong> Directly creates detailed step-by-step solutions for any MCQ.</li>
                  <li><strong>Test Preview Warnings Fix:</strong> One-click fix button in 360° Inspection modal resolves explanation errors using Tavily.</li>
                  <li><strong>Fact Checking:</strong> Uses real-time web search grounding to verify complex concepts.</li>
                </ul>
              </div>

              {/* Individual Connect & Test Button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTestTavilyConnection}
                  disabled={isTestingTavily}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isTestingTavily ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isTestingTavily ? 'Verifying Tavily Key...' : '⚡ Connect & Test Tavily API'}</span>
                </button>
              </div>

              {tavilyTestResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                  tavilyTestResult.success ? 'bg-emerald-950/90 border-emerald-700 text-emerald-200' : 'bg-rose-950/90 border-rose-700 text-rose-200'
                }`}>
                  {tavilyTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">{tavilyTestResult.message}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: DEEPL TRANSLATION ENGINE */}
        {activeTab === 'deepl' && (
          <div className="space-y-4 text-xs animate-fadeIn">
            <div className="bg-blue-950/40 border border-blue-500/40 p-4 rounded-xl flex items-start space-x-3">
              <Globe className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-blue-200 text-sm">DeepL Translator — Dedicated Dual Language Engine</h4>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    deeplApiKey.trim()
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {deeplApiKey.trim() ? '⚡ Engine Active' : '⚡ System Ready'}
                  </span>
                </div>
                <p className="text-[11px] text-blue-100/90 leading-relaxed">
                  DeepL API is set as the <strong>Main Tool</strong> for converting MCQs into Dual Language (English + Hindi) with high linguistic accuracy.
                </p>
              </div>
            </div>

            {/* DeepL API Key Input Section */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-blue-300 font-semibold text-xs flex items-center space-x-2">
                  <Key className="w-4 h-4 text-blue-400" />
                  <span>DeepL API Key:</span>
                </label>
                <a
                  href="https://www.deepl.com/pro-api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline font-medium flex items-center space-x-1"
                >
                  <span>Get Free DeepL API Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <input
                type="text"
                value={deeplApiKey}
                onChange={e => setDeeplApiKey(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx (Paste DeepL API Key)"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-3 font-mono text-xs focus:border-blue-500 focus:outline-none shadow-inner"
              />

              <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg space-y-1 text-[11px] text-slate-300">
                <div className="font-semibold text-blue-300 flex items-center space-x-1.5 mb-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>How DeepL is used in this app:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li><strong>Dual Language Conversion:</strong> Converts single-language test papers to Dual Language (English + Hindi).</li>
                  <li><strong>Test Preview Warnings Fix:</strong> One-click fix in 360° Inspection modal resolves missing Hindi or translation mismatch warnings using DeepL.</li>
                  <li><strong>Format Preservation:</strong> Protects Math symbols, LaTeX, and Option labels (A, B, C, D) during translation.</li>
                </ul>
              </div>

              {/* Individual Connect & Test Button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTestDeeplConnection}
                  disabled={isTestingDeepl}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 transition-colors disabled:opacity-50 shadow-md"
                >
                  {isTestingDeepl ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                  <span>{isTestingDeepl ? 'Verifying DeepL Key...' : '⚡ Connect & Test DeepL API'}</span>
                </button>
              </div>

              {deeplTestResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                  deeplTestResult.success ? 'bg-emerald-950/90 border-emerald-700 text-emerald-200' : 'bg-rose-950/90 border-rose-700 text-rose-200'
                }`}>
                  {deeplTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">{deeplTestResult.message}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: FALLBACK PROVIDERS STACK */}
        {activeTab === 'fallback' && (
          <div className="space-y-4 text-xs animate-fadeIn">
            <div className="bg-slate-950/80 border border-purple-500/30 p-3.5 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-slate-200">Secondary Fallback Backup Stack</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFallback}
                    onChange={e => setEnableFallback(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  <span className="ml-2 text-[10px] text-slate-300 font-medium">Enable Failover</span>
                </label>
              </div>

              <p className="text-[10px] text-slate-400 leading-normal">
                If all primary API keys run out of quota, the system will seamlessly failover to these secondary providers in order.
              </p>

              {fallbackProviders.length > 0 && (
                <div className="space-y-2.5">
                  {fallbackProviders.map((fp, idx) => {
                    const fpKeys = extractKeysList(fp.apiKey);
                    return (
                      <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-300 text-[11px] flex items-center space-x-1.5">
                            <Layers className="w-3.5 h-3.5 text-purple-400" />
                            <span>Fallback #{idx + 1}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFallback(idx)}
                            className="text-rose-400 hover:text-rose-300 p-1 rounded transition-colors"
                            title="Remove Fallback Provider"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Provider:</label>
                            <select
                              value={fp.provider}
                              onChange={e => handleUpdateFallback(idx, { provider: e.target.value as AiProvider })}
                              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 font-mono text-xs"
                            >
                              <option value="gemini">Google Gemini</option>
                              <option value="groq">Groq AI (Free Llama 3)</option>
                              <option value="openrouter">OpenRouter</option>
                              <option value="openai">OpenAI (GPT-4o)</option>
                              <option value="ollama">Ollama Local</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Custom Model (Optional):</label>
                            <input
                              type="text"
                              value={fp.model || ''}
                              onChange={e => handleUpdateFallback(idx, { model: e.target.value })}
                              placeholder="Default model"
                              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 font-mono text-xs"
                            />
                          </div>
                        </div>

                        {fp.provider !== 'ollama' && (
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">
                              API Key(s): {fpKeys.length > 0 && <span className="text-emerald-400">({fpKeys.length} key{fpKeys.length > 1 ? 's' : ''})</span>}
                            </label>
                            <textarea
                              rows={2}
                              value={fp.apiKey || ''}
                              onChange={e => handleUpdateFallback(idx, { apiKey: e.target.value })}
                              placeholder="Paste API key(s) separated by line or comma"
                              className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 font-mono text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={handleAddFallback}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-purple-300 border border-dashed border-purple-500/40 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-purple-400" />
                <span>Add Secondary Backup Provider</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>All settings are saved locally & persistent in browser.</span>
          </div>

          <button
            onClick={handleSave}
            className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg transition-colors flex items-center space-x-1.5"
          >
            <span>Save All Engine Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
