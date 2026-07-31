import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  Trash2,
  HardDrive,
  FileJson,
  UserCheck,
  ShieldCheck,
  Calendar,
  CloudCheck,
  Key,
  Globe,
  ExternalLink,
  Info
} from 'lucide-react';
import {
  getStoredDriveToken,
  saveDriveToken,
  clearDriveToken,
  requestDriveAccessToken,
  requestDriveTokenViaFirebase,
  getCustomDriveClientId,
  saveCustomDriveClientId,
  getDriveUserInfo,
  saveBackupToDrive,
  listDriveBackups,
  downloadBackupFromDrive,
  deleteBackupFromDrive,
  DriveBackupFile,
  DriveUserInfo
} from '../lib/googleDriveClient';
import { Question, MockHistory } from '../types';
import { addQuestionsBatch, replaceAllQuestions, addMocksBatch, replaceAllMocks } from '../lib/db';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  mockHistory?: MockHistory[];
  onDataRestored: () => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  questions,
  mockHistory = [],
  onDataRestored
}) => {
  const [token, setToken] = useState<string>('');
  const [userInfo, setUserInfo] = useState<DriveUserInfo | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  const [customFilename, setCustomFilename] = useState<string>('');
  const [customClientId, setCustomClientId] = useState<string>('');
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const currentDomain = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredDriveToken();
      setToken(stored);
      setStatusMsg(null);
      setCustomFilename(`Gradeup_Study_Backup_${new Date().toISOString().slice(0, 10)}.json`);
      setCustomClientId(getCustomDriveClientId());

      if (stored) {
        loadDriveDetails(stored);
      } else {
        setUserInfo(null);
        setDriveFiles([]);
      }
    }
  }, [isOpen]);

  const loadDriveDetails = async (authToken: string) => {
    setIsLoadingList(true);
    // Fetch user profile and file list in parallel
    const [userRes, listRes] = await Promise.all([
      getDriveUserInfo(authToken),
      listDriveBackups(authToken)
    ]);
    setIsLoadingList(false);

    if (userRes.success && userRes.user) {
      setUserInfo(userRes.user);
    }

    if (listRes.success) {
      setDriveFiles(listRes.files);
    } else if (listRes.error) {
      setStatusMsg({ text: `Google Drive Error: ${listRes.error}`, type: 'error' });
    }
  };

  const handleConnectFirebase = async () => {
    setIsConnecting(true);
    setStatusMsg({ text: 'Opening Google Firebase Sign-In popup...', type: 'info' });

    try {
      const newToken = await requestDriveTokenViaFirebase();
      setToken(newToken);
      setStatusMsg({ text: 'Successfully linked Google Drive via Firebase Authentication!', type: 'success' });
      await loadDriveDetails(newToken);
    } catch (err: any) {
      setStatusMsg({
        text: `Firebase Sign-In Failed: ${err.message || 'OAuth consent declined'}`,
        type: 'error'
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleConnectGoogleDrive = async () => {
    setIsConnecting(true);
    setStatusMsg({ text: 'Opening Google OAuth authorization popup...', type: 'info' });

    try {
      if (customClientId.trim()) {
        saveCustomDriveClientId(customClientId.trim());
      }
      const newToken = await requestDriveAccessToken(customClientId.trim() || undefined);
      setToken(newToken);
      setStatusMsg({ text: 'Successfully authorized! Linked Google Drive account.', type: 'success' });
      await loadDriveDetails(newToken);
    } catch (err: any) {
      setStatusMsg({
        text: `Connection Failed: ${err.message || 'OAuth consent declined'}`,
        type: 'error'
      });
      if (err.message && err.message.includes('origin_mismatch')) {
        setShowSettings(true);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveClientId = () => {
    saveCustomDriveClientId(customClientId);
    setStatusMsg({
      text: customClientId.trim()
        ? 'Custom Google OAuth Client ID saved successfully.'
        : 'Cleared custom Client ID. Default app configuration will be used.',
      type: 'success'
    });
  };

  if (!isOpen) return null;

  const handleDisconnect = () => {
    clearDriveToken();
    setToken('');
    setUserInfo(null);
    setDriveFiles([]);
    setStatusMsg({ text: 'Disconnected Google Drive account.', type: 'info' });
  };

  const handleSaveBackupToDrive = async () => {
    if (!token) {
      setStatusMsg({ text: 'Please connect Google Drive first.', type: 'error' });
      return;
    }

    setIsSaving(true);
    setStatusMsg({ text: 'Packaging question bank and uploading JSON backup to Google Drive...', type: 'info' });

    const backupPayload = {
      version: '2.5',
      exportDate: new Date().toISOString(),
      questionsCount: questions.length,
      mockHistoryCount: mockHistory.length,
      questions,
      mockHistory
    };

    const targetName = customFilename.trim() || `Gradeup_Study_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    const res = await saveBackupToDrive(backupPayload, targetName, token);

    setIsSaving(false);

    if (res.success) {
      setStatusMsg({
        text: `⚡ Backup successfully saved to Google Drive as "${res.filename}"! (${questions.length} MCQs & ${mockHistory.length} Mock Tests)`,
        type: 'success'
      });
      // Refresh drive files list
      const listRes = await listDriveBackups(token);
      if (listRes.success) setDriveFiles(listRes.files);
    } else {
      setStatusMsg({
        text: `Backup Upload Failed: ${res.error}`,
        type: 'error'
      });
    }
  };

  const handleRestoreFileFromDrive = async (file: DriveBackupFile) => {
    if (!token) return;

    setIsRestoringId(file.id);
    setStatusMsg({ text: `Downloading backup file "${file.name}" from Google Drive...`, type: 'info' });

    const res = await downloadBackupFromDrive(file.id, token);
    setIsRestoringId(null);

    if (!res.success || !res.data) {
      setStatusMsg({ text: `Failed to download file: ${res.error || 'Empty payload'}`, type: 'error' });
      return;
    }

    const parsed = res.data;
    const restoredQs = Array.isArray(parsed.questions) ? parsed.questions : [];
    const restoredMocks = Array.isArray(parsed.mockHistory) ? parsed.mockHistory : [];

    if (restoredQs.length === 0 && restoredMocks.length === 0) {
      setStatusMsg({ text: 'Backup file does not contain any valid questions or mock test history.', type: 'error' });
      return;
    }

    if (confirm(`Found ${restoredQs.length} MCQs and ${restoredMocks.length} Mock Tests in Google Drive backup file.\n\nClick OK to APPEND to existing local data.\nClick Cancel to REPLACE all existing local data.`)) {
      if (restoredQs.length > 0) await addQuestionsBatch(restoredQs);
      if (restoredMocks.length > 0) await addMocksBatch(restoredMocks);
      setStatusMsg({
        text: `Successfully appended ${restoredQs.length} MCQs and ${restoredMocks.length} mock tests from Google Drive to IndexedDB!`,
        type: 'success'
      });
    } else {
      if (restoredQs.length > 0) await replaceAllQuestions(restoredQs);
      if (restoredMocks.length > 0) await replaceAllMocks(restoredMocks);
      setStatusMsg({
        text: `Successfully replaced local database with ${restoredQs.length} MCQs and ${restoredMocks.length} mock tests from Google Drive!`,
        type: 'success'
      });
    }

    onDataRestored();
  };

  const handleDeleteFileFromDrive = async (file: DriveBackupFile) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete backup file "${file.name}" from Google Drive?`)) return;

    setIsDeletingId(file.id);
    const res = await deleteBackupFromDrive(file.id, token);
    setIsDeletingId(null);

    if (res.success) {
      setStatusMsg({ text: `Deleted backup file "${file.name}" from Google Drive.`, type: 'success' });
      setDriveFiles(prev => prev.filter(f => f.id !== file.id));
    } else {
      setStatusMsg({ text: `Delete failed: ${res.error}`, type: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#101538] border border-[#232f7a] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0a0d29] border-b border-[#232f7a] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Google Drive JSON Backup Sync</span>
                <span className="text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                  OAuth v2
                </span>
              </h2>
              <p className="text-xs text-slate-400">Keep your JSON Backup files safely stored in your personal Google Drive</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Status Bar */}
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

          {/* Connection Card */}
          <div className="bg-[#0b0e2b] border border-[#232f7a] p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <span>{userInfo?.displayName || 'Google Account Connection'}</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {userInfo?.emailAddress
                      ? `Connected as ${userInfo.emailAddress}`
                      : 'Connect your Google Drive account to backup JSON files directly'}
                  </p>
                </div>
              </div>

              {token ? (
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Connected</span>
                  </span>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-700 hover:border-rose-700 px-3 py-1 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleConnectFirebase}
                    disabled={isConnecting}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-1.5"
                    title="Recommended for Vercel / Custom domains: Uses Firebase Google Sign-In"
                  >
                    {isConnecting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <HardDrive className="w-3.5 h-3.5" />
                    )}
                    <span>Link via Firebase Popup</span>
                  </button>

                  <button
                    onClick={handleConnectGoogleDrive}
                    disabled={isConnecting}
                    className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-semibold px-3 py-2 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5"
                    title="Direct Google OAuth Client connection"
                  >
                    <span>Direct Google OAuth</span>
                  </button>
                </div>
              )}
            </div>

            {/* Config & Domain Settings Toggle */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>Domain: <code className="text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded font-mono">{currentDomain || 'Unknown'}</code></span>
              </span>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{showSettings ? 'Hide OAuth Settings' : 'OAuth Client ID / Fix origin_mismatch'}</span>
              </button>
            </div>

            {/* Advanced OAuth Settings & Troubleshooting panel */}
            {showSettings && (
              <div className="p-4 bg-slate-950 border border-blue-500/30 rounded-xl space-y-3.5 text-xs animate-fadeIn">
                <div className="flex items-center space-x-2 text-blue-300 font-bold">
                  <Key className="w-4 h-4 text-blue-400" />
                  <span>Google Cloud OAuth Domain Authorization Setup</span>
                </div>

                <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200 space-y-2 text-[11px] leading-relaxed">
                  <div className="font-bold flex items-center space-x-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>How to fix "Error 400: origin_mismatch" on Vercel / Custom Domain:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-slate-300">
                    <li>
                      <strong>Option 1 (Easiest):</strong> Click <strong className="text-blue-300">"Link via Firebase Popup"</strong> above.
                    </li>
                    <li>
                      <strong>Option 2:</strong> Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center">Google Cloud Console <ExternalLink className="w-3 h-3 ml-0.5" /></a> and edit your OAuth 2.0 Client ID.
                    </li>
                    <li>
                      Add <code className="text-amber-300 bg-black/50 px-1 py-0.5 rounded font-mono">{currentDomain || 'https://mock-test-generator-o5ol.vercel.app'}</code> under <strong>"Authorized JavaScript origins"</strong>.
                    </li>
                    <li>
                      Copy your Client ID and paste it in the box below, then click "Save Client ID".
                    </li>
                  </ol>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Custom Google OAuth Client ID (Optional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customClientId}
                      onChange={(e) => setCustomClientId(e.target.value)}
                      placeholder="e.g. 1075230553480-xxx.apps.googleusercontent.com"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                    <button
                      onClick={handleSaveClientId}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-colors flex-shrink-0"
                    >
                      Save Client ID
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Backup Save Action Card */}
          {token && (
            <div className="bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border border-blue-500/40 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-blue-300">
                  <UploadCloud className="w-5 h-5 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">Save Current Bank to Google Drive</h3>
                </div>
                <span className="text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                  {questions.length} MCQs + {mockHistory.length} Mock Tests
                </span>
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
                    placeholder="Gradeup_Study_Backup.json"
                    className="flex-1 bg-[#070a24] border border-[#232f7a] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={handleSaveBackupToDrive}
                    disabled={isSaving}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2 flex-shrink-0"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <UploadCloud className="w-4 h-4" />
                    )}
                    <span>{isSaving ? 'Saving File...' : 'Backup JSON Now'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Saved Google Drive Backup Files List */}
          {token && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                  <FileJson className="w-4 h-4 text-emerald-400" />
                  <span>Saved Backup Files on Google Drive ({driveFiles.length})</span>
                </h3>
                <button
                  onClick={() => loadDriveDetails(token)}
                  disabled={isLoadingList}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
                  <span>Refresh List</span>
                </button>
              </div>

              {isLoadingList ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-2 bg-[#0b0e2b] rounded-xl border border-[#232f7a]">
                  <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
                  <p>Fetching backup files from Google Drive...</p>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-[#0b0e2b] rounded-xl border border-[#232f7a] space-y-2">
                  <FileJson className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>No Gradeup JSON backup files found in your Google Drive yet.</p>
                  <p className="text-[11px] text-slate-500">Click "Backup JSON Now" above to save your first backup file.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {driveFiles.map(file => {
                    const isRestoring = isRestoringId === file.id;
                    const isDeleting = isDeletingId === file.id;
                    const formattedDate = new Date(file.modifiedTime || file.createdTime).toLocaleString();

                    return (
                      <div
                        key={file.id}
                        className="p-3.5 bg-[#0b0e2b] border border-[#232f7a] hover:border-blue-700/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <FileJson className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span className="text-xs font-bold text-white font-mono">{file.name}</span>
                          </div>
                          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              <span>Modified: {formattedDate}</span>
                            </span>
                            {file.size && (
                              <span>{(parseInt(file.size, 10) / 1024).toFixed(1)} KB</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            onClick={() => handleRestoreFileFromDrive(file)}
                            disabled={isRestoring || isDeleting}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1.5 shadow-sm"
                            title="Restore this backup into local IndexedDB"
                          >
                            {isRestoring ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <DownloadCloud className="w-3.5 h-3.5" />
                            )}
                            <span>{isRestoring ? 'Restoring...' : 'Restore'}</span>
                          </button>

                          <button
                            onClick={() => handleDeleteFileFromDrive(file)}
                            disabled={isRestoring || isDeleting}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Delete this file from Google Drive"
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
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#0a0d29] border-t border-[#232f7a] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-1.5 text-slate-300">
            <CloudCheck className="w-4 h-4 text-blue-400" />
            <span>Google Drive JSON Backup Sync</span>
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
