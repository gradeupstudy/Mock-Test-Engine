import React, { useState, useEffect } from 'react';
import {
  Database,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Trash2,
  FileJson,
  Calendar,
  FolderSync,
  Code,
  Copy,
  Check,
  Server,
  Zap,
  Archive
} from 'lucide-react';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  getStoredSupabaseBucketName,
  saveSupabaseBucketName,
  testSupabaseBucketAccess,
  uploadJsonBackupToSupabaseBucket,
  listJsonBackupsFromSupabaseBucket,
  downloadJsonBackupFromSupabaseBucket,
  deleteJsonBackupFromSupabaseBucket,
  syncQuestionsToSupabase,
  replaceQuestionsInSupabase,
  syncMockHistoryToSupabase,
  clearAllQuestionsFromSupabase,
  SupabaseStorageBackupFile,
  SUPABASE_SQL_SCHEMA
} from '../lib/supabaseClient';
import { Question, MockHistory } from '../types';
import { addQuestionsBatch, replaceAllQuestions, clearAllQuestions, addMocksBatch, replaceAllMocks } from '../lib/db';
import { clearDeletedMcqsLog } from '../lib/mcqLogUtils';

interface SupabaseStorageModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  mockHistory?: MockHistory[];
  onDataRestored: () => void;
}

export const SupabaseStorageModal: React.FC<SupabaseStorageModalProps> = ({
  isOpen,
  onClose,
  questions,
  mockHistory = [],
  onDataRestored
}) => {
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [bucketName, setBucketName] = useState('backups');
  const [useGzip, setUseGzip] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isRestoringName, setIsRestoringName] = useState<string | null>(null);
  const [isDeletingName, setIsDeletingName] = useState<string | null>(null);

  const [customFilename, setCustomFilename] = useState('');
  const [bucketFiles, setBucketFiles] = useState<SupabaseStorageBackupFile[]>([]);
  const [activeTab, setActiveTab] = useState<'storage' | 'config' | 'sql'>('storage');
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const config = getStoredSupabaseConfig();
      setUrl(config.url);
      setAnonKey(config.anonKey);
      setBucketName(config.bucketName || 'backups');
      setStatusMsg(null);
      setCustomFilename(`Gradeup_Study_Backup_${new Date().toISOString().slice(0, 10)}.json.gz`);

      if (config.url && config.anonKey) {
        loadBucketFiles(config.bucketName || 'backups');
      } else {
        setBucketFiles([]);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const loadBucketFiles = async (bName?: string) => {
    setIsLoadingFiles(true);
    const targetBucket = bName || bucketName;
    const res = await listJsonBackupsFromSupabaseBucket(targetBucket);
    setIsLoadingFiles(false);

    if (res.success) {
      setBucketFiles(res.files);
    } else {
      setStatusMsg({
        text: `Supabase Storage Notice: ${res.error || 'Could not fetch files. Make sure bucket exists.'}`,
        type: 'error'
      });
    }
  };

  const handleSaveAndTest = async () => {
    setIsTesting(true);
    setStatusMsg({ text: `Saving config & testing Supabase Storage Bucket "${bucketName}"...`, type: 'info' });

    saveSupabaseConfig(url, anonKey);
    saveSupabaseBucketName(bucketName);

    const res = await testSupabaseBucketAccess(bucketName);
    setIsTesting(false);

    if (res.success) {
      setStatusMsg({ text: res.message, type: 'success' });
      await loadBucketFiles(bucketName);
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const handleUploadBackup = async () => {
    if (!url || !anonKey) {
      setStatusMsg({ text: 'Please configure Supabase URL and Anon Key first.', type: 'error' });
      setActiveTab('config');
      return;
    }

    setIsSaving(true);
    setStatusMsg({ text: `Compressing (Gzip) & Uploading backup to Supabase Storage Bucket "${bucketName}"...`, type: 'info' });

    const backupPayload = {
      version: '2.5',
      exportDate: new Date().toISOString(),
      questionsCount: questions.length,
      mockHistoryCount: mockHistory.length,
      questions,
      mockHistory
    };

    const fileName = customFilename.trim() || `Gradeup_Study_Backup_${new Date().toISOString().slice(0, 10)}.json.gz`;
    const res = await uploadJsonBackupToSupabaseBucket(backupPayload, fileName, bucketName, useGzip);
    setIsSaving(false);

    if (res.success) {
      const origMB = res.originalSize ? formatFileSize(res.originalSize) : '';
      const compMB = res.compressedSize ? formatFileSize(res.compressedSize) : '';
      const savingsInfo = useGzip && res.savingsPercent
        ? ` (Size reduced from ${origMB} ➔ ${compMB}, ${res.savingsPercent}% smaller!)`
        : '';

      setStatusMsg({
        text: `⚡ Backup successfully saved to Supabase Bucket "${bucketName}" as "${res.fileName}"!${savingsInfo} (${questions.length} MCQs & ${mockHistory.length} Mock Tests)`,
        type: 'success'
      });
      await loadBucketFiles(bucketName);
    } else {
      setStatusMsg({ text: `Upload Failed: ${res.error}`, type: 'error' });
    }
  };

  const handleRestoreFile = async (file: SupabaseStorageBackupFile) => {
    setIsRestoringName(file.name);
    setStatusMsg({ text: `Downloading & decompressing "${file.name}" from Supabase Storage...`, type: 'info' });

    const res = await downloadJsonBackupFromSupabaseBucket(file.name, bucketName);
    setIsRestoringName(null);

    if (!res.success || !res.data) {
      setStatusMsg({ text: `Restore Failed: ${res.error || 'Invalid file content'}`, type: 'error' });
      return;
    }

    const parsed = res.data;
    const restoredQs = Array.isArray(parsed.questions) ? parsed.questions : [];
    const restoredMocks = Array.isArray(parsed.mockHistory) ? parsed.mockHistory : [];

    if (restoredQs.length === 0 && restoredMocks.length === 0) {
      setStatusMsg({ text: 'Backup file does not contain any valid questions or mock test history.', type: 'error' });
      return;
    }

    if (confirm(`Found ${restoredQs.length} MCQs and ${restoredMocks.length} Mock Tests in Supabase backup file.\n\nClick OK to APPEND to existing local data.\nClick Cancel to REPLACE all existing local data.`)) {
      if (restoredQs.length > 0) {
        await addQuestionsBatch(restoredQs);
        await syncQuestionsToSupabase(restoredQs).catch(() => {});
      }
      if (restoredMocks.length > 0) {
        await addMocksBatch(restoredMocks);
        await syncMockHistoryToSupabase(restoredMocks).catch(() => {});
      }
      setStatusMsg({
        text: `Successfully decompressed and appended ${restoredQs.length} MCQs and ${restoredMocks.length} mock tests from Supabase Storage to IndexedDB & Supabase Table!`,
        type: 'success'
      });
    } else {
      if (restoredQs.length > 0) {
        await replaceAllQuestions(restoredQs);
        clearDeletedMcqsLog();
        await replaceQuestionsInSupabase(restoredQs).catch(() => {});
      } else {
        await clearAllQuestions();
        await clearAllQuestionsFromSupabase().catch(() => {});
      }
      if (restoredMocks.length > 0) {
        await replaceAllMocks(restoredMocks);
        await syncMockHistoryToSupabase(restoredMocks).catch(() => {});
      }
      setStatusMsg({
        text: `Successfully decompressed and replaced database & Supabase Table with ${restoredQs.length} MCQs and ${restoredMocks.length} mock tests from Supabase Storage!`,
        type: 'success'
      });
    }

    onDataRestored();
  };

  const handleDeleteFile = async (file: SupabaseStorageBackupFile) => {
    if (!confirm(`Are you sure you want to delete backup file "${file.name}" from Supabase Storage?`)) return;

    setIsDeletingName(file.name);
    const res = await deleteJsonBackupFromSupabaseBucket(file.name, bucketName);
    setIsDeletingName(null);

    if (res.success) {
      setStatusMsg({ text: `Deleted backup file "${file.name}" from Supabase Storage.`, type: 'success' });
      setBucketFiles(prev => prev.filter(f => f.name !== file.name));
    } else {
      setStatusMsg({ text: `Delete Failed: ${res.error}`, type: 'error' });
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const isConfigured = Boolean(url && anonKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#101538] border border-[#232f7a] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0a0d29] border-b border-[#232f7a] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <FolderSync className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Supabase File Bucket Storage</span>
                <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Gzip Compressed</span>
                </span>
              </h2>
              <p className="text-xs text-slate-400">Store and restore compressed JSON backup files (.json.gz / .json) in Supabase Cloud Bucket</p>
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
        <div className="flex border-b border-[#232f7a] bg-[#0d1030] px-6">
          <button
            onClick={() => setActiveTab('storage')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'storage'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Bucket Backup & Restore</span>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'config'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Bucket Credentials</span>
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
            <span>SQL & Storage Policies</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status Message */}
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

          {activeTab === 'storage' && (
            <div className="space-y-5">
              {!isConfigured ? (
                <div className="p-5 bg-[#0b0e2b] border border-amber-500/40 rounded-2xl space-y-3">
                  <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Supabase Storage Not Configured</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Please enter your Supabase Project URL and Anon API Key under the <strong>"Bucket Credentials"</strong> tab to connect your Supabase File Bucket.
                  </p>
                  <button
                    onClick={() => setActiveTab('config')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors shadow-md"
                  >
                    Configure Bucket Credentials
                  </button>
                </div>
              ) : (
                <>
                  {/* Upload Backup Card */}
                  <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border border-emerald-500/40 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-emerald-300">
                        <UploadCloud className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white">Save Current Bank to Supabase Storage</h3>
                      </div>
                      <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                        Bucket: "{bucketName}"
                      </span>
                    </div>

                    {/* Compression Toggle Bar */}
                    <div className="bg-[#080b26] border border-[#232f7a] p-3 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2.5">
                        <Archive className="w-4 h-4 text-amber-400" />
                        <div>
                          <span className="font-bold text-white">Gzip Compression (Pako)</span>
                          <p className="text-[11px] text-slate-400">Reduces file size by ~85-90% (e.g. 300MB JSON becomes ~30MB)</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useGzip}
                          onChange={(e) => {
                            setUseGzip(e.target.checked);
                            setCustomFilename(prev => {
                              if (e.target.checked && !prev.endsWith('.gz')) return `${prev}.gz`;
                              if (!e.target.checked && prev.endsWith('.gz')) return prev.replace(/\.gz$/, '');
                              return prev;
                            });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">
                        Backup File Name
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={customFilename}
                          onChange={(e) => setCustomFilename(e.target.value)}
                          placeholder="Gradeup_Study_Backup.json.gz"
                          className="flex-1 bg-[#070a24] border border-[#232f7a] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <button
                          onClick={handleUploadBackup}
                          disabled={isSaving}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2 flex-shrink-0"
                        >
                          {isSaving ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <UploadCloud className="w-4 h-4" />
                          )}
                          <span>{isSaving ? 'Compressing & Uploading...' : 'Backup JSON Now'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* List of Saved Files in Supabase Bucket */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                        <FileJson className="w-4 h-4 text-emerald-400" />
                        <span>Saved Backup Files in Bucket "{bucketName}" ({bucketFiles.length})</span>
                      </h3>
                      <button
                        onClick={() => loadBucketFiles()}
                        disabled={isLoadingFiles}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                        <span>Refresh List</span>
                      </button>
                    </div>

                    {isLoadingFiles ? (
                      <div className="p-8 text-center text-xs text-slate-400 space-y-2 bg-[#0b0e2b] rounded-xl border border-[#232f7a]">
                        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
                        <p>Fetching backup files from Supabase Storage Bucket...</p>
                      </div>
                    ) : bucketFiles.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400 bg-[#0b0e2b] rounded-xl border border-[#232f7a] space-y-2">
                        <FileJson className="w-8 h-8 text-slate-600 mx-auto" />
                        <p>No backup files found in Supabase Storage Bucket "{bucketName}" yet.</p>
                        <p className="text-[11px] text-slate-500">Click "Backup JSON Now" above to save your first backup file.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {bucketFiles.map(file => {
                          const isRestoring = isRestoringName === file.name;
                          const isDeleting = isDeletingName === file.name;
                          const formattedDate = new Date(file.updated_at || file.created_at || '').toLocaleString();
                          const isCompressedFile = file.name.endsWith('.gz') || file.name.endsWith('.zip');

                          return (
                            <div
                              key={file.name}
                              className="p-3.5 bg-[#0b0e2b] border border-[#232f7a] hover:border-emerald-700/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-2">
                                  {isCompressedFile ? (
                                    <Archive className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                  ) : (
                                    <FileJson className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                  )}
                                  <span className="text-xs font-bold text-white font-mono">{file.name}</span>
                                  {isCompressedFile && (
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-sans">
                                      Gzip
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                                  <span className="flex items-center space-x-1">
                                    <Calendar className="w-3 h-3 text-slate-500" />
                                    <span>Uploaded: {formattedDate}</span>
                                  </span>
                                  {file.size ? (
                                    <span>Size: {formatFileSize(file.size)}</span>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 flex-shrink-0">
                                <button
                                  onClick={() => handleRestoreFile(file)}
                                  disabled={isRestoring || isDeleting}
                                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1.5 shadow-sm"
                                  title="Decompress and restore into local IndexedDB"
                                >
                                  {isRestoring ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <DownloadCloud className="w-3.5 h-3.5" />
                                  )}
                                  <span>{isRestoring ? 'Decompressing...' : 'Restore'}</span>
                                </button>

                                <button
                                  onClick={() => handleDeleteFile(file)}
                                  disabled={isRestoring || isDeleting}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                                  title="Delete this file from Supabase Storage"
                                >
                                  {isDeleting ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
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
                  className="w-full bg-[#0a0d29] border border-[#232f7a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
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
                  className="w-full bg-[#0a0d29] border border-[#232f7a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Storage Bucket Name
                </label>
                <input
                  type="text"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  placeholder="backups"
                  className="w-full bg-[#0a0d29] border border-[#232f7a] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Name of the bucket in Supabase Storage (default: <code>backups</code>).
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
                  <span>{isTesting ? 'Testing Storage Access...' : 'Save & Test Bucket Access'}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-300">
                  Run this SQL in your Supabase SQL Editor to create the <code>backups</code> storage bucket and grant permissions:
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
        <div className="px-6 py-3.5 bg-[#0a0d29] border-t border-[#232f7a] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Supabase File Bucket Storage Sync</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

