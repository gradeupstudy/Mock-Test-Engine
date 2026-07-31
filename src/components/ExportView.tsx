import React, { useState } from 'react';
import { Question, MockHistory, Template } from '../types';
import {
  exportPdfTestPaper,
  exportDocxTestPaper,
  exportPdfAnswerKey,
  exportDocxAnswerKey,
  exportAppOnlineMockTestDocx,
  printNativeTestPaper,
  printNativeAnswerKey
} from '../lib/exportUtils';
import {
  Download,
  FileText,
  Key,
  Calendar,
  Palette,
  ArrowRight,
  Globe,
  Printer,
  Layers,
  Trash2,
  Loader2
} from 'lucide-react';

interface ExportViewProps {
  currentQuestions: Question[];
  mockHistory: MockHistory[];
  allQuestions: Question[];
  template: Template;
  testName: string;
  totalMarks: number;
  duration: number;
  onDeleteMock?: (mock: MockHistory) => void;
  onLoadMockFromHistory: (mock: MockHistory, questions: Question[]) => void;
  onNavigateToTemplates: () => void;
}

export const ExportView: React.FC<ExportViewProps> = ({
  currentQuestions,
  mockHistory,
  allQuestions,
  template,
  testName,
  totalMarks,
  duration,
  onDeleteMock,
  onLoadMockFromHistory,
  onNavigateToTemplates
}) => {
  const [activeTestName, setActiveTestName] = useState<string>(testName);
  const [activeMarks, setActiveMarks] = useState<number>(totalMarks);
  const [activeDuration, setActiveDuration] = useState<number>(duration);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingAnswerKey, setIsExportingAnswerKey] = useState<boolean>(false);
  const [isExportingAppOnline, setIsExportingAppOnline] = useState<boolean>(false);

  const handleExportPdf = async () => {
    if (currentQuestions.length === 0) {
      alert('No questions loaded to export.');
      return;
    }
    setIsExportingPdf(true);
    try {
      await exportPdfTestPaper(currentQuestions, template, activeTestName, activeMarks, activeDuration);
    } catch (err: any) {
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintNative = () => {
    if (currentQuestions.length === 0) {
      alert('No questions loaded to print.');
      return;
    }
    printNativeTestPaper(currentQuestions, template, activeTestName, activeMarks, activeDuration);
  };

  const handleExportDocx = () => {
    if (currentQuestions.length === 0) {
      alert('No questions loaded to export.');
      return;
    }
    exportDocxTestPaper(currentQuestions, template, activeTestName, activeMarks, activeDuration);
  };

  const handleExportAnswerKey = async () => {
    if (currentQuestions.length === 0) {
      alert('No questions loaded to export.');
      return;
    }
    setIsExportingAnswerKey(true);
    try {
      await exportPdfAnswerKey(currentQuestions, activeTestName);
    } catch (err: any) {
      alert('Failed to generate Answer Key PDF: ' + err.message);
    } finally {
      setIsExportingAnswerKey(false);
    }
  };

  const handlePrintNativeAnswerKey = () => {
    if (currentQuestions.length === 0) {
      alert('No questions loaded to print.');
      return;
    }
    printNativeAnswerKey(currentQuestions, activeTestName);
  };

  const handleExportAnswerKeyDocx = () => {
    if (currentQuestions.length === 0) {
      alert('No questions loaded to export answer key.');
      return;
    }
    exportDocxAnswerKey(currentQuestions, template, activeTestName);
  };

  const handleExportAppOnlineMockTest = async (questionsToExport: Question[], customName?: string) => {
    if (questionsToExport.length === 0) {
      alert('No questions found to export.');
      return;
    }
    setIsExportingAppOnline(true);
    try {
      await exportAppOnlineMockTestDocx(
        questionsToExport,
        customName || activeTestName || 'App_Online_Mock_Test',
        1,
        0
      );
    } catch (err: any) {
      alert('Failed to generate App Online Mock Test Word file: ' + err.message);
    } finally {
      setIsExportingAppOnline(false);
    }
  };

  // Gather all unique questions present in any created mock test history
  const getAllCreatedMocksQuestions = (): Question[] => {
    const allMockQuestionIds = new Set<number>();
    mockHistory.forEach(m => (m.questionIds || []).forEach(id => allMockQuestionIds.add(id)));
    const matched = allQuestions.filter(q => q.id !== undefined && allMockQuestionIds.has(q.id));
    return matched.length > 0 ? matched : currentQuestions;
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Download className="w-5 h-5 text-blue-400" />
            <span>Export Test Paper & Answer Keys</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate printable PDF test papers, Word (DOCX) files, answer keys, and App Online Mock Test Word format with full Hindi & Bilingual support.
          </p>
        </div>

        {/* Template Badge */}
        <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-2 rounded-xl text-xs">
          <Palette className="w-4 h-4 text-purple-400" />
          <span className="text-slate-400">Active Template:</span>
          <strong className="text-white">{template.name}</strong>
          <button
            onClick={onNavigateToTemplates}
            className="text-blue-400 hover:underline text-[11px] ml-1 font-semibold"
          >
            Change
          </button>
        </div>
      </div>

      {/* Featured Card: App Online Mock Test */}
      <div className="bg-gradient-to-r from-[#0c1e38] via-[#10274c] to-[#0d1a33] border border-cyan-500/40 p-6 rounded-2xl shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <Globe className="w-32 h-32 text-cyan-400" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white">App Online Mock Test</h3>
                  <span className="text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Word (.docx) Format
                  </span>
                </div>
                <p className="text-xs text-cyan-100/80 mt-0.5">
                  Structured 2-column tabular Word document with Question, Type, Options, Answer Index (1-4), Solution, Positive & Negative Marks. Preserves Hindi & English bilingual text.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-2 flex-wrap gap-y-2">
            <button
              onClick={() => handleExportAppOnlineMockTest(currentQuestions, activeTestName)}
              disabled={isExportingAppOnline || currentQuestions.length === 0}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center space-x-2"
            >
              {isExportingAppOnline ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Export Current Mock Test ({currentQuestions.length} Qs)</span>
            </button>

            {mockHistory.length > 0 && (
              <button
                onClick={() => handleExportAppOnlineMockTest(getAllCreatedMocksQuestions(), 'All_Created_Mock_Tests')}
                disabled={isExportingAppOnline}
                className="bg-slate-800 hover:bg-slate-700 text-cyan-200 border border-cyan-500/30 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors flex items-center space-x-2"
              >
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>Export All Created Mock Tests Combined ({getAllCreatedMocksQuestions().length} Qs)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Standard Export Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* PDF Export Card */}
        <div className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 p-6 rounded-2xl space-y-4 transition-all shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Export PDF Test Paper</h3>
              <p className="text-xs text-slate-400 mt-1">
                Print-ready PDF formatted with your institute logo, instructions, watermark, and complete Devanagari Hindi font support.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf || currentQuestions.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download PDF Test ({currentQuestions.length} Qs)</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrintNative}
              disabled={currentQuestions.length === 0}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold py-2 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5"
              title="Open native browser print window to save or print directly"
            >
              <Printer className="w-3.5 h-3.5 text-blue-400" />
              <span>Print / Save as PDF (Native)</span>
            </button>
          </div>
        </div>

        {/* DOCX Word File Export Card */}
        <div className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 p-6 rounded-2xl space-y-4 transition-all shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Export Word (DOCX) Paper</h3>
              <p className="text-xs text-slate-400 mt-1">
                Editable Word document format for offline editing in Microsoft Word or LibreOffice.
              </p>
            </div>
          </div>

          <button
            onClick={handleExportDocx}
            disabled={currentQuestions.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download DOCX File</span>
          </button>
        </div>

        {/* Answer Key Export Card */}
        <div className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 p-6 rounded-2xl space-y-4 transition-all shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Export Answer Key PDF</h3>
              <p className="text-xs text-slate-400 mt-1">
                Tabular PDF report mapping question numbers, correct answers, subject categories, and full step-by-step Hindi explanations.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleExportAnswerKey}
              disabled={isExportingAnswerKey || currentQuestions.length === 0}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
            >
              {isExportingAnswerKey ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating Answer Key...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Answer Key PDF</span>
                </>
              )}
            </button>

            <button
              onClick={handleExportAnswerKeyDocx}
              disabled={currentQuestions.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center space-x-2"
              title="Download editable Microsoft Word (.doc/.docx) Answer Key document"
            >
              <FileText className="w-4 h-4 text-indigo-200" />
              <span>Download Answer Key Word (DOCX)</span>
            </button>

            <button
              onClick={handlePrintNativeAnswerKey}
              disabled={currentQuestions.length === 0}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold py-2 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5"
              title="Open native browser print window to save or print answer key directly"
            >
              <Printer className="w-3.5 h-3.5 text-purple-400" />
              <span>Print / Save as PDF (Native)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mock Tests History Section */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Mock Test History Log ({mockHistory.length})</span>
          </h3>
          <span className="text-xs text-slate-400">Click "Load" or "App Online Word" to export any created mock test</span>
        </div>

        {mockHistory.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No mock tests in history. Generate a mock test to save it here.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
            {mockHistory.map(mock => {
              const matchedQuestions = allQuestions.filter(q =>
                (mock.questionIds || []).includes(q.id!)
              );

              return (
                <div
                  key={mock.mockId}
                  className="p-4 bg-slate-950/40 hover:bg-slate-800/60 flex items-center justify-between transition-colors flex-wrap gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <strong className="text-xs font-bold text-white">{mock.testName}</strong>
                      <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono">
                        #{mock.mockId.toString().slice(-6)}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                      <span>{new Date(mock.createdDate).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{mock.questionIds?.length || 0} Questions</span>
                      <span>•</span>
                      <span>Uniqueness: <strong className="text-emerald-400">{mock.uniqueness || 100}%</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleExportAppOnlineMockTest(matchedQuestions, mock.testName)}
                      className="flex items-center space-x-1.5 bg-cyan-900/60 hover:bg-cyan-600 text-cyan-200 hover:text-white border border-cyan-700/60 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      title="Export this mock test in App Online Word (.docx) format"
                    >
                      <Globe className="w-3.5 h-3.5 text-cyan-300" />
                      <span>App Online DOCX</span>
                    </button>

                    <button
                      onClick={() => {
                        onLoadMockFromHistory(mock, matchedQuestions);
                        setActiveTestName(mock.testName);
                        setActiveMarks(mock.marks || matchedQuestions.length * 2);
                        setActiveDuration(mock.duration || 60);
                      }}
                      className="flex items-center space-x-1.5 bg-blue-900/60 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-700/60 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                    >
                      <span>Load Paper</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {onDeleteMock && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete "${mock.testName}" from mock test history?`)) {
                            onDeleteMock(mock);
                          }
                        }}
                        className="flex items-center space-x-1 bg-red-950/60 hover:bg-red-600 text-red-300 hover:text-white border border-red-800/60 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        title="Delete mock test from history log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive Processing Overlay for PDF/DOCX Export */}
      {(isExportingPdf || isExportingAnswerKey || isExportingAppOnline) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1230] border border-emerald-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-3 max-w-sm w-full text-center animate-in fade-in zoom-in-95">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <Download className="w-5 h-5 text-emerald-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isExportingAnswerKey ? 'Generating Answer Key PDF...' : isExportingAppOnline ? 'Preparing App Online Document...' : 'Generating Print-Ready PDF Paper...'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Formatting layout, styling headers, rendering questions & solutions.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
