import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  DownloadCloud,
  UploadCloud,
  Key,
  Database,
  ExternalLink,
  ShieldCheck,
  FileJson,
  Zap,
  Archive,
  Server,
  Layers
} from 'lucide-react';
import {
  getStoredR2Config,
  saveR2Config,
  testR2Connection,
  listR2BucketFiles,
  uploadBackupToR2Bucket,
  downloadBackupFromR2Bucket,
  deleteBackupFromR2Bucket,
  CloudflareR2File,
  CloudflareR2Config
} from '../lib/r2Client';
import { generateBackupFilename } from '../lib/supabaseClient';
import { Question, MockHistory } from '../types';
import { addQuestionsBatch, replaceAllQuestions, addMocksBatch, replaceAllMocks } from '../lib/db';

interface CloudflareR2ModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  mockHistory: MockHistory[];
  onDataRestored: () => void;
}

export const CloudflareR2Modal: React.FC<CloudflareR2ModalProps> = ({
  isOpen,
  onClose,
  questions,
  mockHistory,
  onDataRestored
}) => {
  const [accountId, setAccountId] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [bucketName, setBucketName] = useState('backups');
  const [customDomain, setCustomDomain] = useState('');
  const [useGzip, setUseGzip] = useState(true);

  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [bucketFiles, setBucketFiles] = useState<CloudflareR2File[]>([]);

  const [isRestoringName, setIsRestoringName] = useState<string | null>(null);
  const [isDeletingName, setIsDeletingName] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'append'>('replace');
  const [customFilename, setCustomFilename] = useState('');

  useEffect(() => {
    if (isOpen) {
      const config = getStoredR2Config();
      setAccountId(config.accountId);
      setAccessKeyId(config.accessKeyId);
      setSecretAccessKey(config.secretAccessKey);
      setBucketName(config.bucketName || 'backups');
      setCustomDomain(config.customDomain || '');
      setStatusMsg(null);
      setCustomFilename(generateBackupFilename('Gradeup_Study_Backup', 'json.gz'));

      if (config.accountId && config.accessKeyId && config.secretAccessKey) {
        loadBucketFiles(config.bucketName || 'backups');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const loadBucketFiles = async (bName?: string) => {
    setIsLoadingFiles(true);
    const res = await listR2BucketFiles(bName || bucketName);
    setIsLoadingFiles(false);
    if (res.success) {
      setBucketFiles(res.files);
    } else {
      if (res.error && !res.error.includes('credentials')) {
        setStatusMsg({ text: res.error, type: 'error' });
      }
    }
  };

  const handleSaveConfig = async () => {
    const newConfig: CloudflareR2Config = {
      accountId: accountId.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucketName: bucketName.trim() || 'backups',
      customDomain: customDomain.trim()
    };

    saveR2Config(newConfig);
    setStatusMsg({ text: 'Cloudflare R2 Storage credentials saved to local settings.', type: 'success' });
    await loadBucketFiles(newConfig.bucketName);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setStatusMsg({ text: 'Testing connection to Cloudflare R2 Bucket...', type: 'info' });

    const res = await testR2Connection({
      accountId: accountId.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey: secretAccessKey.trim(),
      bucketName: bucketName.trim() || 'backups',
      customDomain: customDomain.trim()
    });

    setIsTesting(false);
    if (res.success) {
      setStatusMsg({ text: res.message, type: 'success' });
      saveR2Config({ accountId, accessKeyId, secretAccessKey, bucketName, customDomain });
      await loadBucketFiles(bucketName.trim() || 'backups');
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
    if (!accountId || !accessKeyId || !secretAccessKey) {
      setStatusMsg({ text: 'Please configure Cloudflare R2 Account ID and API Access Key first.', type: 'error' });
      return;
    }

    setIsSaving(true);
    setStatusMsg({ text: `Compressing (Gzip) & Uploading backup to Cloudflare R2 Bucket "${bucketName}"...`, type: 'info' });

    const backupPayload = {
      version: '2.5',
      exportDate: new Date().toISOString(),
      questions,
      mockHistory
    };

    const fileName = customFilename.trim() || generateBackupFilename('Gradeup_Study_Backup', useGzip ? 'json.gz' : 'json');
    const res = await uploadBackupToR2Bucket(backupPayload, fileName, bucketName, useGzip);
    setIsSaving(false);

    if (res.success) {
      const origMB = res.originalSize ? formatFileSize(res.originalSize) : '';
      const compMB = res.compressedSize ? formatFileSize(res.compressedSize) : '';
      const savingsInfo = useGzip && res.savingsPercent
        ? ` (Size reduced from ${origMB} ➔ ${compMB}, ${res.savingsPercent}% smaller!)`
        : '';

      setStatusMsg({
        text: `⚡ Backup successfully saved to Cloudflare R2 Bucket "${bucketName}" as "${res.fileName}"!${savingsInfo} (${questions.length} MCQs & ${mockHistory.length} Mock Tests)`,
        type: 'success'
      });
      // Generate next timestamped filename for next backup
      setCustomFilename(generateBackupFilename('Gradeup_Study_Backup', useGzip ? 'json.gz' : 'json'));
      await loadBucketFiles(bucketName);
    } else {
      setStatusMsg({ text: `Upload Failed: ${res.error || 'Unknown error'}`, type: 'error' });
    }
  };

  const handleRestoreFile = async (file: CloudflareR2File) => {
    setIsRestoringName(file.name);
    setStatusMsg({ text: `Downloading & decompressing "${file.name}" from Cloudflare R2 Bucket...`, type: 'info' });

    const res = await downloadBackupFromR2Bucket(file.name, bucketName);
    setIsRestoringName(null);

    if (!res.success || !res.data) {
      setStatusMsg({ text: res.error || 'Failed to restore file from Cloudflare R2.', type: 'error' });
      return;
    }

    const restoredQs = res.data.questions || [];
    const restoredMocks = res.data.mockHistory || [];

    if (restoreMode === 'append') {
      if (restoredQs.length > 0) await addQuestionsBatch(restoredQs);
      if (restoredMocks.length > 0) await addMocksBatch(restoredMocks);
      setStatusMsg({
        text: `Successfully decompressed and appended ${restoredQs.length} MCQs and ${restoredMocks.length} mock tests from Cloudflare R2 to IndexedDB!`,
        type: 'success'
      });
    } else {
      if (restoredQs.length > 0) await replaceAllQuestions(restoredQs);
      if (restoredMocks.length > 0) await replaceAllMocks(restoredMocks);
      setStatusMsg({
        text: `Successfully decompressed and replaced local database with ${restoredQs.length} MCQs and ${restoredMocks.length} mock tests from Cloudflare R2!`,
        type: 'success'
      });
    }

    onDataRestored();
  };

  const handleDeleteFile = async (file: CloudflareR2File) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${file.name}" from Cloudflare R2 Bucket "${bucketName}"?`)) {
      return;
    }

    setIsDeletingName(file.name);
    setStatusMsg({ text: `Deleting "${file.name}" from Cloudflare R2 Bucket...`, type: 'info' });

    const res = await deleteBackupFromR2Bucket(file.name, bucketName);
    setIsDeletingName(null);

    if (res.success) {
      setStatusMsg({ text: `File "${file.name}" deleted from Cloudflare R2 Bucket.`, type: 'success' });
      await loadBucketFiles(bucketName);
    } else {
      setStatusMsg({ text: res.error || 'Failed to delete file.', type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0e1235] border border-[#232f7a] rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-950/60 via-[#121845] to-[#161c52] border-b border-[#232f7a] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-orange-600/20 p-2.5 rounded-2xl border border-orange-500/30 text-orange-400">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Cloudflare R2 Object Storage</span>
                <span className="text-[10px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-full flex items-center space-x-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>0 Egress Fees</span>
                </span>
              </h2>
              <p className="text-xs text-slate-400">Store and restore compressed JSON backups (.json.gz) in Cloudflare R2 S3 Bucket</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMsg && (
          <div
            className={`px-6 py-3 text-xs flex items-center space-x-2 font-medium border-b ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/50'
                : statusMsg.type === 'error'
                ? 'bg-red-950/80 text-red-300 border-red-800/50'
                : 'bg-blue-950/80 text-blue-300 border-blue-800/50'
            }`}
          >
            {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
            {statusMsg.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
            {statusMsg.type === 'info' && <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />}
            <span className="flex-1 leading-relaxed">{statusMsg.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Cloudflare R2 Credentials */}
          <div className="bg-[#0b0e2b] border border-[#232f7a] p-4 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f2868] pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Cloudflare R2 API Credentials</h3>
              </div>
              <a
                href="https://dash.cloudflare.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-orange-400 hover:text-orange-300 flex items-center space-x-1"
              >
                <span>Cloudflare Dashboard</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Cloudflare Account ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="e.g. 1234567890abcdef1234567890abcdef"
                  className="w-full bg-[#070a24] border border-[#232f7a] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Bucket Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  placeholder="backups"
                  className="w-full bg-[#070a24] border border-[#232f7a] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Access Key ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="e.g. 8f24a180c..."
                  className="w-full bg-[#070a24] border border-[#232f7a] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Secret Access Key <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder="e.g. 91ab772..."
                  className="w-full bg-[#070a24] border border-[#232f7a] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Custom Domain / Public URL <span className="text-slate-400 font-normal">(Optional, e.g. https://pub-xxx.r2.dev)</span>
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="https://pub-xxx.r2.dev or https://https://<accountid>.r2.cloudflarestorage.com"
                  className="w-full bg-[#070a24] border border-[#232f7a] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono text-[11px]"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={isTesting}
                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center space-x-2 shadow-md"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{isTesting ? 'Testing R2...' : 'Test Connection'}</span>
              </button>

              <button
                onClick={handleSaveConfig}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
              >
                Save Credentials
              </button>
            </div>
          </div>

          {/* Section 2: Create & Upload Backup */}
          <div className="bg-[#0b0e2b] border border-[#232f7a] p-4 rounded-2xl space-y-4">
            <div className="flex items-center space-x-2 border-b border-[#1f2868] pb-3">
              <UploadCloud className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Upload Backup to Cloudflare R2
              </h3>
            </div>

            <div className="space-y-3">
              <div className="bg-[#070a24] p-3 rounded-xl border border-[#1f2868] flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-slate-300">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Current DB Content:</span>
                </div>
                <span className="font-bold text-white">
                  {questions.length} Questions &amp; {mockHistory.length} Mock Tests
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
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Backup File Name
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder="Gradeup_Study_Backup.json.gz"
                    className="flex-1 bg-[#070a24] border border-[#232f7a] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                  />
                  <button
                    onClick={handleUploadBackup}
                    disabled={isSaving || questions.length === 0}
                    className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center space-x-2 flex-shrink-0 shadow-md"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    <span>{isSaving ? 'Compressing & Uploading...' : 'Backup to R2 Now'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: R2 Bucket Files List & Restore */}
          <div className="bg-[#0b0e2b] border border-[#232f7a] p-4 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f2868] pb-3">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-orange-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Files in Cloudflare R2 Bucket "{bucketName}"
                </h3>
              </div>
              <button
                onClick={() => loadBucketFiles(bucketName)}
                disabled={isLoadingFiles}
                className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>

            {/* Restore Mode Option */}
            <div className="flex items-center space-x-4 bg-[#070a24] p-3 rounded-xl border border-[#1f2868] text-xs">
              <span className="font-semibold text-slate-300">Restore Action:</span>
              <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="restoreMode"
                  value="replace"
                  checked={restoreMode === 'replace'}
                  onChange={() => setRestoreMode('replace')}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span>Replace Local Database</span>
              </label>
              <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="restoreMode"
                  value="append"
                  checked={restoreMode === 'append'}
                  onChange={() => setRestoreMode('append')}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span>Append to Existing Bank</span>
              </label>
            </div>

            {/* Bucket Files List */}
            {isLoadingFiles ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-2 bg-[#0b0e2b] rounded-xl border border-[#232f7a]">
                <RefreshCw className="w-6 h-6 text-orange-400 animate-spin mx-auto" />
                <p>Fetching backup files from Cloudflare R2 Bucket...</p>
              </div>
            ) : bucketFiles.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-[#0b0e2b] rounded-xl border border-[#232f7a] space-y-2">
                <Cloud className="w-8 h-8 text-slate-600 mx-auto" />
                <p>No backup files found in Cloudflare R2 Bucket "{bucketName}" yet.</p>
                <p className="text-[11px] text-slate-500">Click "Backup to R2 Now" above to save your first backup file.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {bucketFiles.map((file) => {
                  const isRestoring = isRestoringName === file.name;
                  const isDeleting = isDeletingName === file.name;
                  const formattedDate = file.lastModified ? new Date(file.lastModified).toLocaleString() : 'Uploaded';
                  const isCompressedFile = file.name.endsWith('.gz') || file.name.endsWith('.zip');

                  return (
                    <div
                      key={file.name}
                      className="bg-[#070a24] border border-[#1f2868] hover:border-[#3546a1] p-3 rounded-xl flex items-center justify-between transition-colors"
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
                            <span>Uploaded: {formattedDate}</span>
                          </span>
                          {file.size ? (
                            <span>Size: {formatFileSize(file.size)}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleRestoreFile(file)}
                          disabled={isRestoring || isDeleting}
                          className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1.5 shadow-sm"
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
                          className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors"
                          title="Delete file from Cloudflare R2 Bucket"
                        >
                          {isDeleting ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
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
        </div>

        {/* Modal Footer */}
        <div className="bg-[#0a0d28] border-t border-[#232f7a] px-6 py-3.5 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-orange-400" />
            <span>Cloudflare R2 Direct Sync (Zero Egress Costs)</span>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded-xl font-bold transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};
