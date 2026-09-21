import React, { useState } from 'react';
import { Question } from '../types';
import { exportBulkUploadWordDocx, exportBulkUploadWordDoc } from '../lib/exportUtils';
import {
  FileSpreadsheet,
  Download,
  X,
  FileText,
  CheckCircle2,
  Laptop,
  ArrowRight,
  Loader2,
  Layers,
  HelpCircle
} from 'lucide-react';

interface BulkUploadWordExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  testName: string;
}

export const BulkUploadWordExportModal: React.FC<BulkUploadWordExportModalProps> = ({
  isOpen,
  onClose,
  questions,
  testName
}) => {
  const [exportName, setExportName] = useState(testName || 'Mock_Test_MCQs');
  const [exportingType, setExportingType] = useState<'docx' | 'doc' | null>(null);

  // Sync test name when props change
  React.useEffect(() => {
    if (testName) {
      setExportName(testName);
    }
  }, [testName]);

  if (!isOpen) return null;

  // Compute subject distribution
  const subjectCounts: Record<string, number> = {};
  questions.forEach(q => {
    const sub = q.subject || 'General Knowledge';
    subjectCounts[sub] = (subjectCounts[sub] || 0) + 1;
  });

  const handleExportDocx = async () => {
    if (questions.length === 0) return;
    setExportingType('docx');
    try {
      await exportBulkUploadWordDocx(questions, exportName);
    } catch (err) {
      console.error('DOCX Export error:', err);
      alert('Failed to export DOCX. You can also try exporting as .doc format.');
    } finally {
      setExportingType(null);
    }
  };

  const handleExportDoc = () => {
    if (questions.length === 0) return;
    setExportingType('doc');
    try {
      exportBulkUploadWordDoc(questions, exportName);
    } catch (err) {
      console.error('DOC Export error:', err);
      alert('Failed to export DOC.');
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-950/80 via-indigo-950/70 to-slate-900 p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-400 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Export Bulk Upload Word File</h2>
                <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Device Transfer Ready
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Download MCQs in the official Gradeup Bulk Upload table format to import on another computer or device.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[calc(85vh-140px)] overflow-y-auto">
          {/* File & Test Info */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                File / Mock Test Name
              </label>
              <input
                type="text"
                value={exportName}
                onChange={e => setExportName(e.target.value)}
                placeholder="Enter mock test name"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center space-x-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong>{questions.length}</strong> Questions ready for export
                </span>
              </div>

              {/* Subject Badges */}
              <div className="flex items-center flex-wrap gap-1.5">
                {Object.entries(subjectCounts).map(([sub, count]) => (
                  <span
                    key={sub}
                    className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700"
                  >
                    {sub}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Format Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Option 1: DOCX Format */}
            <div className="bg-slate-950/80 border border-blue-500/40 hover:border-blue-400/80 rounded-xl p-4 flex flex-col justify-between space-y-3 transition-all">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <strong className="text-sm text-white">Microsoft Word (.docx)</strong>
                  </div>
                  <span className="text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded">
                    Modern
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  OpenXML table format with 9 standard columns (Subject, Chapter_Name, Question, Option_A..D, Answer, Explanation). Supports full Hindi/English bilingual text.
                </p>
              </div>

              <button
                onClick={handleExportDocx}
                disabled={exportingType !== null || questions.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-md transition-colors"
              >
                {exportingType === 'docx' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating DOCX...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Word (.docx)</span>
                  </>
                )}
              </button>
            </div>

            {/* Option 2: DOC Format */}
            <div className="bg-slate-950/80 border border-indigo-500/40 hover:border-indigo-400/80 rounded-xl p-4 flex flex-col justify-between space-y-3 transition-all">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                    <strong className="text-sm text-white">Word Template (.doc)</strong>
                  </div>
                  <span className="text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                    Fast & Simple
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Native Word HTML template format identical to Gradeup Bulk Upload Template. Opens directly in Microsoft Word and imports immediately.
                </p>
              </div>

              <button
                onClick={handleExportDoc}
                disabled={exportingType !== null || questions.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-md transition-colors"
              >
                {exportingType === 'doc' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing Download...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Word (.doc)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* How to use on another device instructions */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-200">
              <Laptop className="w-4 h-4 text-blue-400" />
              <span>How to Bulk Upload on another computer / device:</span>
            </div>
            <ol className="space-y-1.5 text-xs text-slate-400 pl-5 list-decimal marker:text-blue-400">
              <li>
                Click above to download the Word file (<code className="text-blue-300 font-mono">.docx</code> or <code className="text-blue-300 font-mono">.doc</code>).
              </li>
              <li>
                Transfer the file via Pendrive, WhatsApp, Email, or Google Drive to your other device.
              </li>
              <li>
                Open the Gradeup Study Platform on that device and navigate to the <strong>Bulk Upload</strong> tab.
              </li>
              <li>
                Click <strong>"Browse Computer Files"</strong> and select this Word file. All {questions.length} MCQs will load with subjects, chapters, options, answers & solutions!
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
          <span className="text-slate-400 flex items-center space-x-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Both formats are 100% compatible with Gradeup Bulk Upload parser</span>
          </span>

          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
