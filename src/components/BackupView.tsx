import React, { useState } from 'react';
import { Question, MockHistory } from '../types';
import { replaceAllQuestions, addQuestionsBatch, addMocksBatch, replaceAllMocks } from '../lib/db';
import {
  HardDrive,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  FileCheck,
  CloudCheck
} from 'lucide-react';
import { GoogleDriveModal } from './GoogleDriveModal';
import { PinModal } from './PinModal';
import { getStoredDriveToken } from '../lib/googleDriveClient';

interface BackupViewProps {
  questions: Question[];
  mockHistory: MockHistory[];
  onDataRestored: () => void;
  onClearAll?: () => Promise<void>;
}

export const BackupView: React.FC<BackupViewProps> = ({
  questions,
  mockHistory,
  onDataRestored,
  onClearAll
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState<boolean>(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);

  const isDriveConnected = Boolean(getStoredDriveToken());

  const handleExportJson = () => {
    const backupData = {
      version: '2.5',
      exportDate: new Date().toISOString(),
      questionsCount: questions.length,
      mockHistoryCount: mockHistory.length,
      questions,
      mockHistory
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Gradeup_Study_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setStatusMessage(`Exported backup containing ${questions.length} questions and ${mockHistory.length} mock tests.`);
  };

  const handleExportMockHistoryJson = () => {
    const backupData = {
      version: '2.5',
      exportType: 'mock_history',
      exportDate: new Date().toISOString(),
      mockHistoryCount: mockHistory.length,
      mockHistory
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Gradeup_Mock_Tests_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setStatusMessage(`Exported ${mockHistory.length} created mock test history records to JSON file.`);
  };

  const handleRestoreMockHistoryJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setStatusMessage('Reading mock test backup JSON file...');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const mocksToLoad = Array.isArray(parsed.mockHistory) ? parsed.mockHistory : (Array.isArray(parsed) ? parsed : null);

      if (!mocksToLoad) {
        throw new Error('Invalid mock history backup structure: missing mockHistory array');
      }

      if (confirm(`Found ${mocksToLoad.length} created mock test records. Do you want to APPEND them to existing history? (Click Cancel to REPLACE all existing mock test records).`)) {
        await addMocksBatch(mocksToLoad);
        setStatusMessage(`Successfully appended ${mocksToLoad.length} created mock tests to history.`);
      } else {
        await replaceAllMocks(mocksToLoad);
        setStatusMessage(`Successfully restored ${mocksToLoad.length} created mock tests into history.`);
      }

      onDataRestored();
    } catch (err: any) {
      setStatusMessage(`Mock History Restore Failed: ${err.message || 'Invalid JSON file'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setStatusMessage('Reading backup JSON file...');

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed.questions)) {
        throw new Error('Invalid backup file structure: missing questions array');
      }

      if (confirm(`Found ${parsed.questions.length} questions in backup. Do you want to APPEND them to existing questions? (Click Cancel to REPLACE all existing questions).`)) {
        await addQuestionsBatch(parsed.questions);
        if (Array.isArray(parsed.mockHistory) && parsed.mockHistory.length > 0) {
          await addMocksBatch(parsed.mockHistory);
        }
        setStatusMessage(`Successfully appended ${parsed.questions.length} questions and mock history to your database.`);
      } else {
        await replaceAllQuestions(parsed.questions);
        if (Array.isArray(parsed.mockHistory)) {
          await replaceAllMocks(parsed.mockHistory);
        }
        setStatusMessage(`Successfully replaced database with ${parsed.questions.length} questions and ${parsed.mockHistory?.length || 0} mock tests.`);
      }

      onDataRestored();
    } catch (err: any) {
      setStatusMessage(`Restore Failed: ${err.message || 'Invalid JSON file'}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <HardDrive className="w-5 h-5 text-blue-400" />
          <span>Backup & Restore Question Bank</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Export your entire IndexedDB question bank and mock history as a portable JSON file or restore from a previous backup.
        </p>
      </div>

      {statusMessage && (
        <div className="p-4 bg-blue-950/80 border border-blue-800 text-blue-200 rounded-xl text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Google Drive Cloud Backup Card */}
        <div className="bg-[#111740] border border-[#232f7a] p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <HardDrive className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                isDriveConnected
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {isDriveConnected ? 'Drive Linked' : 'Not Linked'}
              </span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Google Drive Cloud Sync</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Link your personal Google Drive account to store and restore backup JSON files seamlessly in 1-click.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDriveModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <Cloud className="w-4 h-4" />
            <span>{isDriveConnected ? 'Manage Google Drive Sync' : 'Link Google Drive'}</span>
          </button>
        </div>

        {/* Export Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Export Complete Backup (JSON)</h3>
              <p className="text-xs text-slate-400 mt-1">
                Downloads a single JSON file containing all {questions.length} questions, options, difficulty ratings, and mock test history.
              </p>
            </div>
          </div>

          <button
            onClick={handleExportJson}
            disabled={questions.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Export Question Bank JSON</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Restore / Import Backup (JSON)</h3>
              <p className="text-xs text-slate-400 mt-1">
                Upload a previously saved Gradeup Study backup JSON file to restore questions into IndexedDB.
              </p>
            </div>
          </div>

          <label className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center space-x-2 text-center">
            {isRestoring ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            <span>{isRestoring ? 'Restoring File...' : 'Select Backup JSON File'}</span>
            <input type="file" accept=".json" onChange={handleRestoreJson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Mock Tests Backup & Restore Dedicated Section */}
      <div className="bg-[#0f143a] border border-[#232f7a] p-6 rounded-2xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Created Mock Test History Backup & Restore</h3>
            <p className="text-xs text-slate-400">
              Backup or restore created mock test history ({mockHistory.length} saved mock tests) in JSON format.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <button
            onClick={handleExportMockHistoryJson}
            disabled={mockHistory.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Backup Mock Tests JSON ({mockHistory.length})</span>
          </button>

          <label className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center space-x-2 text-center border border-slate-700">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Load / Restore Mock Tests JSON</span>
            <input type="file" accept=".json" onChange={handleRestoreMockHistoryJson} className="hidden" />
          </label>
        </div>
      </div>

      {/* Danger Zone / Clear Database */}
      {onClearAll && questions.length > 0 && (
        <div className="bg-rose-950/30 border border-rose-900/50 p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-rose-200">Clear Pre-Stored MCQs / Wipe Database</h4>
              <p className="text-xs text-rose-300/70 mt-0.5">
                Permanently deletes all {questions.length} stored MCQs from local storage so you can start completely fresh.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPinModalOpen(true)}
            className="w-full sm:w-auto bg-rose-700 hover:bg-rose-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex-shrink-0 shadow-sm"
            title={`Clear pre-stored questions (PIN Protected: ${localStorage.getItem('app_security_pin') || '260298'})`}
          >
            Clear All Stored MCQs
          </button>
        </div>
      )}

      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        questions={questions}
        mockHistory={mockHistory}
        onDataRestored={onDataRestored}
      />

      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        requiredPin="260298"
        title="Clear Pre-Stored MCQs Security Check"
        description={`Wiping all ${questions.length} stored MCQs requires security PIN authorization.`}
        onSuccess={async () => {
          if (onClearAll) {
            await onClearAll();
            setStatusMessage('All stored MCQs have been deleted. Question bank is now completely clean and empty.');
          }
        }}
      />
    </div>
  );
};
