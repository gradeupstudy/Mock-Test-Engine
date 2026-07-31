import React, { useState, useEffect } from 'react';
import {
  Database,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  UploadCloud,
  DownloadCloud,
  Code
} from 'lucide-react';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  syncQuestionsToSupabase,
  fetchQuestionsFromSupabase,
  syncAllMcqsWithSupabase,
  syncMockHistoryToSupabase,
  fetchMockHistoryFromSupabase,
  SUPABASE_SQL_SCHEMA
} from '../lib/supabaseClient';
import { Question, MockHistory } from '../types';
import { addQuestionsBatch, replaceAllQuestions, getAllMocks, addMocksBatch, replaceAllMocks } from '../lib/db';

interface SupabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  mockHistory?: MockHistory[];
  onDataRestored: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  isOpen,
  onClose,
  questions,
  mockHistory = [],
  onDataRestored
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'sync' | 'sql'>('config');

  useEffect(() => {
    if (isOpen) {
      const config = getStoredSupabaseConfig();
      setUrl(config.url);
      setAnonKey(config.anonKey);
      setStatusMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFullSync = async (notifySuccess = true) => {
    setIsSyncing(true);
    if (notifySuccess) {
      setStatusMsg({ text: 'Syncing all MCQs and Mock Test History with Supabase cloud database...', type: 'info' });
    }

    const res = await syncAllMcqsWithSupabase(questions);
    
    // Also sync mock test history if available
    const localMocks: MockHistory[] = mockHistory.length > 0 ? mockHistory : await getAllMocks();
    if (localMocks.length > 0) {
      await syncMockHistoryToSupabase(localMocks).catch(() => {});
    }

    // Fetch remote mock history from Supabase and merge
    const cloudMockRes = await fetchMockHistoryFromSupabase();
    if (cloudMockRes.success && cloudMockRes.mockHistory.length > 0) {
      const existingMocksMap = new Map(localMocks.map(m => [m.mockId, m]));
      cloudMockRes.mockHistory.forEach(m => {
        if (!existingMocksMap.has(m.mockId)) {
          existingMocksMap.set(m.mockId, m);
        }
      });
      await replaceAllMocks(Array.from(existingMocksMap.values()));
    }

    setIsSyncing(false);

    if (res.success) {
      await replaceAllQuestions(res.allQuestions);
      onDataRestored();

      if (notifySuccess) {
        setStatusMsg({
          text: `Success! Synchronized ${res.pulledCount} total MCQs and mock test records from Supabase (${res.pushedCount} new local MCQs uploaded).`,
          type: 'success'
        });
      }
      return true;
    } else {
      if (notifySuccess) {
        setStatusMsg({
          text: `Sync Failed: ${res.error}. (Make sure you ran the SQL Schema in your Supabase SQL Editor).`,
          type: 'error'
        });
      }
      return false;
    }
  };

  const handleSaveAndTest = async () => {
    setIsTesting(true);
    setStatusMsg({ text: 'Connecting to Supabase and syncing MCQs...', type: 'info' });

    saveSupabaseConfig(url, anonKey);
    const result = await testSupabaseConnection(url, anonKey);

    setIsTesting(false);
    if (result.success) {
      // Perform full sync immediately when connected
      const syncOk = await handleFullSync(false);
      if (syncOk) {
        setStatusMsg({
          text: `Connected to Supabase! All uploaded MCQs have been synced successfully with local storage.`,
          type: 'success'
        });
      } else {
        setStatusMsg({
          text: `Connected to Supabase! (Note: Run the SQL Schema under 'SQL Schema' tab to auto-create the questions table for syncing).`,
          type: 'info'
        });
      }
    } else {
      setStatusMsg({ text: result.message, type: 'error' });
    }
  };

  const handleSyncToSupabase = async () => {
    if (questions.length === 0) {
      setStatusMsg({ text: 'No questions in question bank to sync.', type: 'error' });
      return;
    }

    setIsSyncing(true);
    setStatusMsg({ text: `Syncing ${questions.length} questions to Supabase...`, type: 'info' });

    const res = await syncQuestionsToSupabase(questions);
    setIsSyncing(false);

    if (res.success) {
      setStatusMsg({
        text: `Successfully synced ${res.count} questions to Supabase!`,
        type: 'success'
      });
    } else {
      setStatusMsg({
        text: `Sync Failed: ${res.error}. (Make sure you ran the SQL Schema in Supabase Query Editor first)`,
        type: 'error'
      });
    }
  };

  const handleFetchFromSupabase = async () => {
    setIsFetching(true);
    setStatusMsg({ text: 'Fetching questions from Supabase...', type: 'info' });

    const res = await fetchQuestionsFromSupabase();
    setIsFetching(false);

    if (!res.success) {
      setStatusMsg({
        text: `Fetch Failed: ${res.error}. (Make sure table 'questions' exists in your Supabase project)`,
        type: 'error'
      });
      return;
    }

    if (res.questions.length === 0) {
      setStatusMsg({ text: 'Connected to Supabase, but the "questions" table is currently empty.', type: 'info' });
      return;
    }

    if (confirm(`Found ${res.questions.length} questions in Supabase. Do you want to APPEND them to existing local questions? (Click Cancel to REPLACE local questions).`)) {
      await addQuestionsBatch(res.questions);
      setStatusMsg({ text: `Appended ${res.questions.length} questions from Supabase to IndexedDB.`, type: 'success' });
    } else {
      await replaceAllQuestions(res.questions);
      setStatusMsg({ text: `Replaced local database with ${res.questions.length} questions from Supabase.`, type: 'success' });
    }

    onDataRestored();
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#121742] border border-[#232f7a] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0e1236] border-b border-[#232f7a] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Connect Supabase Database</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  PostgreSQL
                </span>
              </h2>
              <p className="text-xs text-slate-400">Cloud sync & PostgreSQL question bank database connection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#232f7a] bg-[#101540] px-6">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'config'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Connection & Key</span>
          </button>
          <button
            onClick={() => setActiveTab('sync')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'sync'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Cloud Sync</span>
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'sql'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>SQL Schema</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {statusMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start space-x-2.5 border ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                  : statusMsg.type === 'error'
                  ? 'bg-rose-950/80 border-rose-800 text-rose-200'
                  : 'bg-blue-950/80 border-blue-800 text-blue-200'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : statusMsg.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              ) : (
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{statusMsg.text}</span>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full bg-[#0a0d29] border border-[#232f7a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Find this in your Supabase Dashboard under Project Settings &gt; API.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Supabase Anon API Key
                </label>
                <input
                  type="password"
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-[#0a0d29] border border-[#232f7a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Public anon key for client or server connections.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveAndTest}
                  disabled={isTesting}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors flex items-center space-x-2 shadow-md"
                >
                  {isTesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>{isTesting ? 'Testing Connection...' : 'Save & Test Connection'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-300">
                Synchronize your local IndexedDB question bank ({questions.length} questions) with your remote Supabase cloud database.
              </p>

              {/* Featured Full 2-Way Sync Box */}
              <div className="bg-gradient-to-r from-emerald-950/60 to-blue-950/60 border border-emerald-500/40 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <h3 className="text-sm font-bold text-white">Full 2-Way MCQ Sync</h3>
                  </div>
                  <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Uploads all new local MCQs to Supabase AND downloads all MCQs stored on Supabase into your question bank automatically without duplicates.
                </p>
                <button
                  onClick={() => handleFullSync(true)}
                  disabled={isSyncing}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-2 shadow-md"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing All MCQs...' : 'Sync All MCQs Now (Push & Pull)'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#0b0e2b] border border-[#232f7a] p-4 rounded-xl space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <UploadCloud className="w-5 h-5" />
                    <h3 className="text-xs font-bold text-white">Upload to Supabase</h3>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Push all local questions into Supabase table <code className="text-emerald-300 font-mono">questions</code>.
                  </p>
                  <button
                    onClick={handleSyncToSupabase}
                    disabled={isSyncing}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5"
                  >
                    {isSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    <span>Push Local to Cloud</span>
                  </button>
                </div>

                <div className="bg-[#0b0e2b] border border-[#232f7a] p-4 rounded-xl space-y-3">
                  <div className="flex items-center space-x-2 text-blue-400">
                    <DownloadCloud className="w-5 h-5" />
                    <h3 className="text-xs font-bold text-white">Fetch from Supabase</h3>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Pull questions from Supabase into your local question bank.
                  </p>
                  <button
                    onClick={handleFetchFromSupabase}
                    disabled={isFetching}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5"
                  >
                    {isFetching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                    <span>Pull Cloud to Local</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">
                  Run this SQL in your Supabase SQL Editor to create tables for Gradeup Study:
                </p>
                <button
                  onClick={handleCopySql}
                  className="flex items-center space-x-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg transition-colors"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
                </button>
              </div>

              <pre className="bg-[#07091f] border border-[#232f7a] p-3.5 rounded-xl text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-60">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#0e1236] border-t border-[#232f7a] flex items-center justify-between text-xs text-slate-400">
          <span>Gradeup Study Supabase Integration</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
