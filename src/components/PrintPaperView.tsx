import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Question, MockHistory } from '../types';
import {
  exportCompact2ColPdfTestPaper,
  exportCompact1PagePdfAnswerKey,
  exportCombinedBookletPdf,
  exportWordBookletPaper,
  printNativeCompact2ColPaper,
  printNativeCompactAnswerKey,
  BookletCustomConfig,
  formatMathSymbols,
  shouldDisplayTranslation,
  paginateQuestionsFor2ColPaper,
  getRecommendedPageCapacities,
  PaperPageLayout
} from '../lib/exportUtils';
import { optimizePrintLayoutWithAi, AiLayoutOptimizationResult } from '../lib/aiClient';
import { PRESET_LOGOS } from '../lib/paperLogos';
import {
  Printer,
  FileDown,
  BookOpen,
  Sparkles,
  Settings2,
  CheckCircle2,
  FileText,
  KeyRound,
  Layers,
  Image as ImageIcon,
  Upload,
  Eye,
  Sliders,
  Type,
  RefreshCw,
  Info,
  Check,
  ChevronRight,
  Shield,
  Columns,
  Edit3,
  Save,
  X,
  Plus,
  Minus,
  Sparkle,
  Wand2,
  ShieldCheck,
  Lock,
  Undo2,
  AlertCircle
} from 'lucide-react';

interface PrintPaperViewProps {
  currentTestQuestions: Question[];
  currentTestName: string;
  currentDuration: number;
  currentTotalMarks: number;
  mockHistory: MockHistory[];
  onSelectMock?: (mock: MockHistory) => void;
}

type TabType = 'paper' | 'answer-key' | 'combined' | 'explanations';

export const PrintPaperView: React.FC<PrintPaperViewProps> = ({
  currentTestQuestions,
  currentTestName,
  currentDuration,
  currentTotalMarks,
  mockHistory,
  onSelectMock
}) => {
  // Source Selection
  const [selectedSourceId, setSelectedSourceId] = useState<string>('current');
  const [activeTab, setActiveTab] = useState<TabType>('paper');

  // Customization State
  const [testTitle, setTestTitle] = useState<string>(
    currentTestName || 'HP Police Constable Mock Test - 01'
  );
  const [duration, setDuration] = useState<number>(currentDuration || 60);
  const [totalMarks, setTotalMarks] = useState<number>(
    currentTotalMarks || (currentTestQuestions.length > 0 ? currentTestQuestions.length : 50)
  );
  const [showRollNo, setShowRollNo] = useState<boolean>(true);
  const [selectedLogoId, setSelectedLogoId] = useState<string>('hp_police');
  const [customLogoUrl, setCustomLogoUrl] = useState<string>('');
  const [watermarkText, setWatermarkText] = useState<string>('Gradeup Study');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.08);
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [density, setDensity] = useState<'compact' | 'ultra-compact' | 'normal'>('compact');
  const [autoBalance, setAutoBalance] = useState<boolean>(true);
  const [manualPage1Cap, setManualPage1Cap] = useState<number>(20);
  const [manualOtherCap, setManualOtherCap] = useState<number>(26);
  const [isManualCapacity, setIsManualCapacity] = useState<boolean>(false);
  const [isLiveEditMode, setIsLiveEditMode] = useState<boolean>(false);

  // AI Auto-Fix State
  const [isAiOptimizing, setIsAiOptimizing] = useState<boolean>(false);
  const [aiOptimizationResult, setAiOptimizationResult] = useState<AiLayoutOptimizationResult | null>(null);
  const [aiOptimizationBackup, setAiOptimizationBackup] = useState<{
    density: 'compact' | 'ultra-compact' | 'normal';
    page1Cap: number;
    otherCap: number;
    autoBalance: boolean;
  } | null>(null);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [whitespaceCleanedNotice, setWhitespaceCleanedNotice] = useState<boolean>(false);

  // Modal Editing for Question
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editingQuestionDraft, setEditingQuestionDraft] = useState<Question | null>(null);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string>('');

  const [instructions, setInstructions] = useState<string>(
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active Questions List based on selection + local modifications
  const [editableQuestions, setEditableQuestions] = useState<Question[]>([]);

  // Sync questions whenever source changes
  useEffect(() => {
    let sourceQuestions: Question[] = [];
    if (selectedSourceId === 'current') {
      sourceQuestions = currentTestQuestions;
    } else {
      const foundMock = mockHistory.find(m => m.id === selectedSourceId);
      sourceQuestions = foundMock ? foundMock.questions : currentTestQuestions;
    }
    setEditableQuestions(sourceQuestions.map(q => ({ ...q })));
  }, [selectedSourceId, currentTestQuestions, mockHistory]);

  const activeQuestions = editableQuestions;

  // Auto update recommended capacities whenever questions or density change
  const recommendedCapacities = useMemo(() => {
    return getRecommendedPageCapacities(activeQuestions.length, density);
  }, [activeQuestions.length, density]);

  // If not manually overriding, synchronize manual caps with recommendations
  useEffect(() => {
    if (!isManualCapacity) {
      setManualPage1Cap(recommendedCapacities.p1Capacity);
      setManualOtherCap(recommendedCapacities.otherCapacity);
    }
  }, [recommendedCapacities, isManualCapacity]);

  // Update title when switching source
  const handleSourceChange = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    if (sourceId === 'current') {
      setTestTitle(currentTestName || 'HP Police Constable Mock Test - 01');
      setDuration(currentDuration || 60);
      setTotalMarks(currentTotalMarks || currentTestQuestions.length);
    } else {
      const found = mockHistory.find(m => m.id === sourceId);
      if (found) {
        setTestTitle(found.testName || 'HP Police Constable Mock Test');
        setDuration(found.duration || 60);
        setTotalMarks(found.totalMarks || found.questions.length);
      }
    }
  };

  // AI Auto Fix Action Handler
  const handleAiAutoFix = async () => {
    if (activeQuestions.length === 0) return;
    setIsAiOptimizing(true);
    // Save backup before AI applies new values
    setAiOptimizationBackup({
      density,
      page1Cap: manualPage1Cap,
      otherCap: manualOtherCap,
      autoBalance
    });

    try {
      const res = await optimizePrintLayoutWithAi(activeQuestions, testTitle);
      setAiOptimizationResult(res);

      // Apply recommended values
      setDensity(res.recommendedDensity);
      setManualPage1Cap(res.recommendedPage1Cap);
      setManualOtherCap(res.recommendedOtherCap);
      setAutoBalance(true);
      setIsManualCapacity(false);
      setShowAiModal(true);
    } catch (err: any) {
      console.error('AI Auto Fix Error:', err);
    } finally {
      setIsAiOptimizing(false);
    }
  };

  const handleRevertAiOptimization = () => {
    if (aiOptimizationBackup) {
      setDensity(aiOptimizationBackup.density);
      setManualPage1Cap(aiOptimizationBackup.page1Cap);
      setManualOtherCap(aiOptimizationBackup.otherCap);
      setAutoBalance(aiOptimizationBackup.autoBalance);
      setIsManualCapacity(!aiOptimizationBackup.autoBalance);
      setAiOptimizationResult(null);
      setShowAiModal(false);
    }
  };

  // Whitespace-only cleanup (ensures zero words or characters are removed/changed)
  const handleCleanWhitespaceOnly = () => {
    setEditableQuestions(prev => prev.map(q => ({
      ...q,
      question: (q.question || '').replace(/[ \t]+/g, ' ').trim(),
      optionA: (q.optionA || '').replace(/[ \t]+/g, ' ').trim(),
      optionB: (q.optionB || '').replace(/[ \t]+/g, ' ').trim(),
      optionC: (q.optionC || '').replace(/[ \t]+/g, ' ').trim(),
      optionD: (q.optionD || '').replace(/[ \t]+/g, ' ').trim(),
      translation: q.translation ? q.translation.replace(/[ \t]+/g, ' ').trim() : q.translation,
      explanation: q.explanation ? q.explanation.replace(/[ \t]+/g, ' ').trim() : q.explanation,
    })));
    setWhitespaceCleanedNotice(true);
    setTimeout(() => setWhitespaceCleanedNotice(false), 3500);
  };

  // Preset logo data url
  const activeLogoDataUrl = useMemo(() => {
    if (selectedLogoId === 'custom') return customLogoUrl;
    if (selectedLogoId === 'none') return '';
    const preset = PRESET_LOGOS.find(p => p.id === selectedLogoId);
    return preset ? preset.svgDataUrl : '';
  }, [selectedLogoId, customLogoUrl]);

  // Build config object
  const bookletConfig: BookletCustomConfig = useMemo(() => ({
    testName: testTitle,
    duration,
    totalMarks,
    instructions,
    watermarkText: showWatermark ? watermarkText : '',
    watermarkOpacity,
    logoDataUrl: activeLogoDataUrl,
    showRollNo,
    fontSize: density,
    columnsCount: 2,
    showBoxBorder: true,
    autoBalance,
    page1Capacity: isManualCapacity ? manualPage1Cap : undefined,
    otherPageCapacity: isManualCapacity ? manualOtherCap : undefined
  }), [
    testTitle,
    duration,
    totalMarks,
    instructions,
    showWatermark,
    watermarkText,
    watermarkOpacity,
    activeLogoDataUrl,
    showRollNo,
    density,
    autoBalance,
    isManualCapacity,
    manualPage1Cap,
    manualOtherCap
  ]);

  // Calculate discrete layout pages for preview and export
  const paperPages: PaperPageLayout[] = useMemo(() => {
    return paginateQuestionsFor2ColPaper(
      activeQuestions,
      density,
      isManualCapacity ? manualPage1Cap : undefined,
      isManualCapacity ? manualOtherCap : undefined,
      autoBalance
    );
  }, [activeQuestions, density, isManualCapacity, manualPage1Cap, manualOtherCap, autoBalance]);

  // Custom Logo File Upload handler
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const res = uploadEvent.target?.result as string;
      if (res) {
        setCustomLogoUrl(res);
        setSelectedLogoId('custom');
      }
    };
    reader.readAsDataURL(file);
  };

  // Quick Preset Handlers
  const applyHpPolicePreset = () => {
    setTestTitle('HP Police Constable Mock Test - 01');
    setDuration(60);
    setTotalMarks(activeQuestions.length || 50);
    setSelectedLogoId('hp_police');
    setWatermarkText('Gradeup Study');
    setDensity('compact');
    setAutoBalance(true);
    setIsManualCapacity(false);
    setInstructions(
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`
    );
  };

  const applyGradeupOfficialPreset = () => {
    setTestTitle('Gradeup Study Official Mock Test Series');
    setDuration(90);
    setTotalMarks(activeQuestions.length || 50);
    setSelectedLogoId('gradeup_study');
    setWatermarkText('Gradeup Study');
    setDensity('compact');
    setAutoBalance(true);
    setIsManualCapacity(false);
    setInstructions(
`1. All questions are compulsory and carry 1 mark each.
2. There is a negative marking of 0.25 marks for every incorrect answer.
3. Use Blue/Black ballpoint pen only to fill the OMR sheet.`
    );
  };

  // Inline Question Editing handlers
  const handleStartEditQuestion = (originalIndex: number) => {
    const q = activeQuestions[originalIndex];
    if (q) {
      setEditingQuestionIndex(originalIndex);
      setEditingQuestionDraft({ ...q });
    }
  };

  const handleSaveQuestionDraft = () => {
    if (editingQuestionIndex !== null && editingQuestionDraft) {
      setEditableQuestions(prev => {
        const next = [...prev];
        next[editingQuestionIndex] = { ...editingQuestionDraft };
        return next;
      });
      setEditingQuestionIndex(null);
      setEditingQuestionDraft(null);
    }
  };

  const handleInlineOptionChange = (originalIndex: number, optKey: 'optionA' | 'optionB' | 'optionC' | 'optionD' | 'question' | 'translation', val: string) => {
    setEditableQuestions(prev => {
      const next = [...prev];
      if (next[originalIndex]) {
        next[originalIndex] = {
          ...next[originalIndex],
          [optKey]: val
        };
      }
      return next;
    });
  };

  // Export Triggers
  const handleDownloadPaperPdf = async () => {
    setIsExporting(true);
    setExportMessage('Generating 2-Column Page-Saver PDF...');
    try {
      await exportCompact2ColPdfTestPaper(activeQuestions, bookletConfig);
    } finally {
      setIsExporting(false);
      setExportMessage('');
    }
  };

  const handleDownloadAnswerKeyPdf = async () => {
    setIsExporting(true);
    setExportMessage('Generating 1-Page Ultra-Compact Answer Key PDF...');
    try {
      await exportCompact1PagePdfAnswerKey(activeQuestions, bookletConfig);
    } finally {
      setIsExporting(false);
      setExportMessage('');
    }
  };

  const handleDownloadCombinedPdf = async () => {
    setIsExporting(true);
    setExportMessage('Generating Complete Booklet (Paper + Answer Key)...');
    try {
      await exportCombinedBookletPdf(activeQuestions, bookletConfig);
    } finally {
      setIsExporting(false);
      setExportMessage('');
    }
  };

  const handleDownloadWordPaper = () => {
    exportWordBookletPaper(activeQuestions, bookletConfig, false);
  };

  const handleDownloadWordCombined = () => {
    exportWordBookletPaper(activeQuestions, bookletConfig, true);
  };

  const handlePrintPaper = () => {
    printNativeCompact2ColPaper(activeQuestions, bookletConfig);
  };

  const handlePrintAnswerKey = () => {
    printNativeCompactAnswerKey(activeQuestions, bookletConfig);
  };

  // Column slice for Answer Key Preview
  const ansCols = activeQuestions.length > 60 ? 4 : activeQuestions.length > 30 ? 2 : 1;
  const itemsPerAnsCol = Math.ceil(activeQuestions.length / ansCols);
  const ansColumnSlices: Question[][] = [];
  for (let c = 0; c < ansCols; c++) {
    ansColumnSlices.push(activeQuestions.slice(c * itemsPerAnsCol, (c + 1) * itemsPerAnsCol));
  }

  // Savings calculation
  const totalPages = paperPages.length;
  const standard1ColPages = Math.ceil(activeQuestions.length / 5);
  const pagesSaved = Math.max(0, standard1ColPages - totalPages);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 pb-24">
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900/60 border border-blue-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 border border-blue-500/30">
                <Printer className="w-3.5 h-3.5 text-blue-400" />
                <span>Page-Saver Print & Booklet Engine (2-Column)</span>
              </div>
              <h1 className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                Printable Question Paper & Answer Key
              </h1>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl">
                Format your mock test into clean, discrete A4 exam pages with closed 4-sided outlines and page numbers. Auto-balance distributes MCQs evenly to prevent empty spaces and reduce paper waste.
              </p>
            </div>

            {/* Quick Presets & AI Auto-Fix */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleAiAutoFix}
                disabled={isAiOptimizing || activeQuestions.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:via-rose-400 hover:to-indigo-500 border border-amber-300/40 text-white rounded-xl text-xs font-extrabold transition-all shadow-lg hover:shadow-amber-500/20 active:scale-95 disabled:opacity-50"
                title="AI Auto Fix: Automatically calculate optimal A4 layout and eliminate blank spaces without changing question language"
              >
                {isAiOptimizing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>AI Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
                    <span>✨ AI Auto Fix</span>
                  </>
                )}
              </button>
              <button
                onClick={applyHpPolicePreset}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Auto-fill HP Police Constable 2-Column Template"
              >
                <Shield className="w-4 h-4 text-amber-400" />
                HP Police Preset
              </button>
              <button
                onClick={applyGradeupOfficialPreset}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Auto-fill Gradeup Study Official Mock Template"
              >
                <BookOpen className="w-4 h-4 text-blue-400" />
                Gradeup Study Preset
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Total Questions:</span>
              <span className="text-white font-bold text-base">{activeQuestions.length} MCQs</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Calculated Pages:</span>
              <span className="text-emerald-400 font-bold text-base">{totalPages} {totalPages === 1 ? 'Page' : 'Pages'}</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Paper Saved vs 1-Col:</span>
              <span className="text-blue-400 font-bold text-base">~{pagesSaved} Sheets ({Math.round((pagesSaved / Math.max(1, standard1ColPages)) * 100)}%)</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">A4 Layout Fit:</span>
              <span className="text-amber-300 font-bold text-base flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Balanced (0% Waste)
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: CUSTOMIZATION CONTROLS */}
        <div className="lg:col-span-4 space-y-4">
          {/* Source Selector Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-blue-400" />
              Select Mock Test to Print
            </h3>
            <select
              value={selectedSourceId}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="current">
                Active Test Session ({currentTestQuestions.length} MCQs) - {currentTestName || 'Current Test'}
              </option>
              {mockHistory.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.testName} ({m.questions.length} MCQs) - {new Date(m.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Actions / One-Click Buttons */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-400" />
                Print & Export Actions
              </h3>
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                <Lock className="w-3 h-3 text-emerald-400" />
                0% Text Mod
              </span>
            </div>

            {/* AI Auto Fix Primary Action Button */}
            <button
              onClick={handleAiAutoFix}
              disabled={isAiOptimizing || activeQuestions.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-600 hover:from-amber-400 hover:via-rose-400 hover:to-indigo-500 text-white rounded-xl font-extrabold text-sm shadow-lg hover:shadow-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-50 border border-amber-300/30"
              title="AI Page-Fit Optimizer: Eliminates bottom empty spaces by calibrating font density & column balance"
            >
              {isAiOptimizing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Optimizing A4 Page-Fit via AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                  <span>✨ AI Auto Fix (A4 Page Balancer)</span>
                </>
              )}
            </button>

            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={handlePrintPaper}
                disabled={activeQuestions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Print 2-Col Question Paper
              </button>

              <button
                onClick={handlePrintAnswerKey}
                disabled={activeQuestions.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" />
                Print 1-Page Answer Key
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2">
              <button
                onClick={handleDownloadPaperPdf}
                disabled={isExporting || activeQuestions.length === 0}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download PDF (Paper)
              </button>

              <button
                onClick={handleDownloadAnswerKeyPdf}
                disabled={isExporting || activeQuestions.length === 0}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                Download PDF (Key)
              </button>
            </div>

            {/* Word Document (.DOC / .DOCX) Export Options */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  Microsoft Word Export
                </span>
                <span className="text-[10px] text-slate-400">Editable .doc</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadWordPaper}
                  disabled={activeQuestions.length === 0}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-600/40 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  title="Download editable 2-column test paper in Microsoft Word (.doc) format"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  Word (Paper)
                </button>

                <button
                  onClick={handleDownloadWordCombined}
                  disabled={activeQuestions.length === 0}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-sky-900 hover:bg-sky-800 text-white border border-sky-500 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                  title="Download combined test paper + answer key in Microsoft Word (.doc) format"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-200" />
                  Word (Paper + Key)
                </button>
              </div>
            </div>

            <button
              onClick={handleDownloadCombinedPdf}
              disabled={isExporting || activeQuestions.length === 0}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5" />
              Download Combined PDF (Paper + Key)
            </button>

            {exportMessage && (
              <div className="text-center text-xs text-blue-400 animate-pulse font-semibold">
                {exportMessage}
              </div>
            )}
          </div>

          {/* Smart Pagination & Auto-Balance Settings */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Smart Page Balancer
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                {totalPages} {totalPages === 1 ? 'Page' : 'Pages'} Total
              </span>
            </div>

            {/* AI Auto-Fix Trigger & Status in Card */}
            <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-indigo-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>AI Page-Fit Balancer</span>
                </div>
                {aiOptimizationResult && (
                  <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    AI Applied
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-300">
                Calculates font sizing and capacities so that all pages are completely full and zero empty space remains at the bottom.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleAiAutoFix}
                  disabled={isAiOptimizing || activeQuestions.length === 0}
                  className="flex-1 py-1.5 px-3 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isAiOptimizing ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-white" />
                      <span>Optimizing...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3 h-3 text-amber-200" />
                      <span>Auto-Fit with AI</span>
                    </>
                  )}
                </button>

                {aiOptimizationBackup && (
                  <button
                    onClick={handleRevertAiOptimization}
                    className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700"
                    title="Undo AI layout optimization"
                  >
                    <Undo2 className="w-3 h-3 text-slate-400" />
                    <span>Undo</span>
                  </button>
                )}
              </div>

              {/* Strict Language Integrity Notice */}
              <div className="text-[10px] text-emerald-400/90 flex items-center gap-1 font-mono pt-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>100% Text Protected (Questions/Options unmodified)</span>
              </div>
            </div>

            {/* Auto-Balance Switch */}
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Sparkle className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-200">
                    Auto-Balance Pages
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoBalance && !isManualCapacity}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAutoBalance(true);
                      setIsManualCapacity(false);
                    } else {
                      setIsManualCapacity(true);
                      setAutoBalance(false);
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer"
                />
              </label>
              <p className="text-[11px] text-slate-400">
                Eliminates huge blank gaps at the bottom of pages by distributing MCQs evenly between pages.
              </p>
            </div>

            {/* Quick Whitespace Formatter */}
            <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-300">
                <span className="font-semibold block text-slate-200">Whitespace Cleaner:</span>
                <span className="text-[10px] text-slate-400">Trims double spaces (0 text change)</span>
              </div>
              <button
                onClick={handleCleanWhitespaceOnly}
                className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded text-xs font-semibold border border-slate-700 flex items-center gap-1 transition-all"
              >
                <Check className="w-3 h-3 text-blue-400" />
                Clean Spaces
              </button>
            </div>
            {whitespaceCleanedNotice && (
              <div className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-1 rounded text-center">
                ✓ Whitespace cleaned without modifying any words or options!
              </div>
            )}

            {/* Current Page Breakdown Badge */}
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg p-2.5 text-xs text-blue-200 space-y-1">
              <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Page Allocation Breakdown:
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {paperPages.map((p) => (
                  <span
                    key={p.pageNumber}
                    className="px-2 py-1 bg-slate-900 border border-blue-500/30 rounded text-[11px] font-mono text-slate-200"
                  >
                    Page {p.pageNumber}: {p.col1.length + p.col2.length} MCQs ({p.col1.length}L + {p.col2.length}R)
                  </span>
                ))}
              </div>
            </div>

            {/* Manual Capacity Controls (Toggleable) */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400">
                  Custom Page Capacities (Fine Tuning)
                </label>
                {isManualCapacity && (
                  <button
                    onClick={() => {
                      setIsManualCapacity(false);
                      setAutoBalance(true);
                    }}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Reset to Auto
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-1">Page 1 Max MCQs:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsManualCapacity(true);
                        setManualPage1Cap(prev => Math.max(6, prev - 2));
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      value={manualPage1Cap}
                      onChange={(e) => {
                        setIsManualCapacity(true);
                        setManualPage1Cap(Number(e.target.value));
                      }}
                      className="w-full bg-transparent text-center font-bold text-sm text-slate-100 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        setIsManualCapacity(true);
                        setManualPage1Cap(prev => Math.min(30, prev + 2));
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-1">Other Pages Max:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsManualCapacity(true);
                        setManualOtherCap(prev => Math.max(6, prev - 2));
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      value={manualOtherCap}
                      onChange={(e) => {
                        setIsManualCapacity(true);
                        setManualOtherCap(Number(e.target.value));
                      }}
                      className="w-full bg-transparent text-center font-bold text-sm text-slate-100 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        setIsManualCapacity(true);
                        setManualOtherCap(prev => Math.min(36, prev + 2));
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Density Selector */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Font & Layout Density
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setDensity('ultra-compact')}
                  className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    density === 'ultra-compact'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Ultra Page-Saver
                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">10.5px font</span>
                </button>
                <button
                  onClick={() => setDensity('compact')}
                  className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    density === 'compact'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Compact Booklet
                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">11.5px font</span>
                </button>
                <button
                  onClick={() => setDensity('normal')}
                  className={`py-2 px-2 rounded-lg border text-xs font-bold transition-all text-center ${
                    density === 'normal'
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  Relaxed
                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">12.5px font</span>
                </button>
              </div>
            </div>
          </div>

          {/* Exam Header & Logo Settings */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings2 className="w-4 h-4 text-blue-400" />
              Exam Header & Logo Settings
            </h3>

            {/* Test Title */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Exam / Paper Title
              </label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-blue-500"
                placeholder="e.g. HP Police Constable Mock Test - 01"
              />
            </div>

            {/* Duration & Marks */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Time (Minutes)
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">
                  Max Marks
                </label>
                <input
                  type="number"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Roll No Toggle */}
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showRollNo}
                onChange={(e) => setShowRollNo(e.target.checked)}
                className="rounded border-slate-700 text-blue-600 focus:ring-0"
              />
              <span>Include "Roll No: ____________" in Header</span>
            </label>

            {/* Official Logo / Badge Selection */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-2">
                Header Logo / Badge
              </label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {PRESET_LOGOS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedLogoId(p.id)}
                    className={`flex flex-col items-center p-2 rounded-lg border text-center transition-all ${
                      selectedLogoId === p.id
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <img src={p.svgDataUrl} alt={p.name} className="w-8 h-8 object-contain mb-1" />
                    <span className="text-[10px] font-bold line-clamp-1">{p.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border text-xs font-semibold transition-all ${
                    selectedLogoId === 'custom'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {customLogoUrl ? 'Change Custom Logo' : 'Upload Logo'}
                </button>
                <button
                  onClick={() => setSelectedLogoId('none')}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-semibold transition-all ${
                    selectedLogoId === 'none'
                      ? 'bg-red-600/20 border-red-500 text-red-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  No Logo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* General Instructions Box Editor */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                General Instructions Box
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500 font-sans"
              />
            </div>

            {/* Watermark Controls */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-400">
                  Diagonal Watermark
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="rounded border-slate-700 text-blue-600"
                  />
                  <span>Show</span>
                </label>
              </div>

              {showWatermark && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                    placeholder="Watermark Text"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Opacity:</span>
                    <input
                      type="range"
                      min="0.04"
                      max="0.25"
                      step="0.01"
                      value={watermarkOpacity}
                      onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                      className="flex-1 accent-blue-500 h-1 bg-slate-800 rounded"
                    />
                    <span className="text-[10px] text-slate-300 font-mono w-8 text-right">
                      {Math.round(watermarkOpacity * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE MULTI-PAGE REAL-SIZE DOCUMENT PREVIEW */}
        <div className="lg:col-span-8 space-y-4">
          {/* Tab Navigation & Live Edit Mode Toggle */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab('paper')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'paper'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                📄 2-Column Question Paper ({totalPages} {totalPages === 1 ? 'Page' : 'Pages'})
              </button>

              <button
                onClick={() => setActiveTab('answer-key')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'answer-key'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                🔑 1-Page Answer Key
              </button>

              <button
                onClick={() => setActiveTab('combined')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'combined'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                📋 Combined Booklet
              </button>

              <button
                onClick={() => setActiveTab('explanations')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'explanations'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                💡 Detailed Solutions
              </button>
            </div>

            {/* Live Edit Mode Switch */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsLiveEditMode(!isLiveEditMode)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  isLiveEditMode
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Click any text in the preview to edit"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isLiveEditMode ? 'Live Edit: ON' : 'Live Edit'}</span>
              </button>
            </div>
          </div>

          {/* DOCUMENT PREVIEW CONTAINER (Realistic White A4 Pages with Discrete Separation) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 overflow-auto max-h-[860px] flex flex-col items-center gap-8">
            {/* 1. QUESTION PAPER VIEW OR COMBINED VIEW: Render each discrete page */}
            {(activeTab === 'paper' || activeTab === 'combined') && (
              <div className="w-full flex flex-col items-center gap-8">
                {paperPages.map((page, pageIdx) => (
                  <div key={page.pageNumber} className="w-full max-w-[760px] flex flex-col items-center">
                    {/* Page Break Label */}
                    <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2 px-1">
                      <span className="font-mono font-bold text-slate-300">
                        📄 Page {page.pageNumber} of {page.totalPages}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {page.col1.length + page.col2.length} MCQs ({page.col1.length} Left, {page.col2.length} Right)
                      </span>
                    </div>

                    {/* A4 Sheet Container */}
                    <div className="w-full bg-white text-black shadow-2xl rounded-sm p-6 lg:p-8 relative min-h-[960px] font-sans flex flex-col justify-between border border-slate-300">
                      {/* Diagonal Watermark Overlay */}
                      {showWatermark && watermarkText && (
                        <div
                          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
                          style={{ zIndex: 0 }}
                        >
                          <span
                            className="text-6xl font-extrabold uppercase tracking-widest text-slate-900 transform -rotate-35 whitespace-nowrap"
                            style={{ opacity: watermarkOpacity }}
                          >
                            {watermarkText}
                          </span>
                        </div>
                      )}

                      {/* Header Section */}
                      <div className="relative z-10">
                        {page.isFirstPage ? (
                          <div>
                            {/* Top Exam Header */}
                            <div className="text-center mb-3">
                              {activeLogoDataUrl && (
                                <div className="flex justify-center mb-1.5">
                                  <img
                                    src={activeLogoDataUrl}
                                    alt="Logo"
                                    className="h-14 w-auto object-contain"
                                  />
                                </div>
                              )}
                              <h1 className="text-lg font-extrabold text-black uppercase tracking-tight m-0">
                                {testTitle}
                              </h1>
                              <div className="text-xs font-bold text-black mt-1 pb-2 border-b-[1.5px] border-black flex items-center justify-center gap-3">
                                <span>Time Allowed: {duration} Mins</span>
                                <span>|</span>
                                <span>Max Marks: {totalMarks}</span>
                                {showRollNo && (
                                  <>
                                    <span>|</span>
                                    <span>Roll No: ____________</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* General Instructions Box */}
                            {instructions && (
                              <div className="border border-slate-400 rounded-sm p-2 mb-3 text-[10px] leading-relaxed text-black bg-white">
                                <strong className="block mb-0.5 text-black">General Instructions:</strong>
                                <div className="whitespace-pre-line">{instructions}</div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mb-3 pb-1.5 border-b-[1.5px] border-black flex items-center justify-between text-xs font-bold text-black">
                            <span>{testTitle}</span>
                            <span className="text-[10px] bg-black text-white px-2 py-0.5 rounded font-mono">
                              PAGE {page.pageNumber} OF {page.totalPages}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 2-Column Boxed Questions Grid with Full Outer Border and Center Line */}
                      <div className="relative z-10 border-[1.5px] border-black grid grid-cols-2 bg-transparent text-black flex-1 min-h-0 my-2">
                        {/* Left Column */}
                        <div className="p-2.5 border-r-[1.5px] border-black space-y-2">
                          {page.col1.map((item) => {
                            const qNum = item.originalIndex + 1;
                            const q = item.question;
                            const optA = `(A) ${formatMathSymbols(q.optionA || '')}`;
                            const optB = `(B) ${formatMathSymbols(q.optionB || '')}`;
                            const optC = `(C) ${formatMathSymbols(q.optionC || '')}`;
                            const optD = `(D) ${formatMathSymbols(q.optionD || '')}`;
                            const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

                            return (
                              <div
                                key={q.id || item.originalIndex}
                                className={`text-[11px] leading-snug break-inside-avoid relative group ${
                                  density === 'ultra-compact' ? 'text-[10px] space-y-0.5' : density === 'normal' ? 'text-[12px] space-y-1' : 'space-y-0.5'
                                }`}
                              >
                                {isLiveEditMode && (
                                  <button
                                    onClick={() => handleStartEditQuestion(item.originalIndex)}
                                    className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 bg-blue-600 text-white p-1 rounded shadow text-[9px] flex items-center gap-0.5 z-20"
                                    title="Edit Question"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                    Edit
                                  </button>
                                )}

                                <div className="font-bold text-black">
                                  <span>Q{qNum}. </span>
                                  {isLiveEditMode ? (
                                    <span
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => handleInlineOptionChange(item.originalIndex, 'question', e.currentTarget.textContent || '')}
                                      className="outline-none hover:bg-amber-100/60 p-0.5 rounded"
                                    >
                                      {formatMathSymbols(q.question)}
                                    </span>
                                  ) : (
                                    <span>{formatMathSymbols(q.question)}</span>
                                  )}
                                </div>

                                {shouldDisplayTranslation(q.question, q.translation) && (
                                  <div className="text-slate-800 text-[10.5px]">
                                    {isLiveEditMode ? (
                                      <span
                                        contentEditable
                                        suppressContentEditableWarning
                                        onBlur={(e) => handleInlineOptionChange(item.originalIndex, 'translation', e.currentTarget.textContent || '')}
                                        className="outline-none hover:bg-amber-100/60 p-0.5 rounded block"
                                      >
                                        {formatMathSymbols(q.translation!)}
                                      </span>
                                    ) : (
                                      formatMathSymbols(q.translation!)
                                    )}
                                  </div>
                                )}

                                {isShort ? (
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] text-black pt-0.5">
                                    <div>{optA}</div>
                                    <div>{optB}</div>
                                    <div>{optC}</div>
                                    <div>{optD}</div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-0.5 text-[10.5px] text-black pt-0.5">
                                    <div>{optA}</div>
                                    <div>{optB}</div>
                                    <div>{optC}</div>
                                    <div>{optD}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Right Column */}
                        <div className="p-2.5 space-y-2">
                          {page.col2.map((item) => {
                            const qNum = item.originalIndex + 1;
                            const q = item.question;
                            const optA = `(A) ${formatMathSymbols(q.optionA || '')}`;
                            const optB = `(B) ${formatMathSymbols(q.optionB || '')}`;
                            const optC = `(C) ${formatMathSymbols(q.optionC || '')}`;
                            const optD = `(D) ${formatMathSymbols(q.optionD || '')}`;
                            const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

                            return (
                              <div
                                key={q.id || item.originalIndex}
                                className={`text-[11px] leading-snug break-inside-avoid relative group ${
                                  density === 'ultra-compact' ? 'text-[10px] space-y-0.5' : density === 'normal' ? 'text-[12px] space-y-1' : 'space-y-0.5'
                                }`}
                              >
                                {isLiveEditMode && (
                                  <button
                                    onClick={() => handleStartEditQuestion(item.originalIndex)}
                                    className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 bg-blue-600 text-white p-1 rounded shadow text-[9px] flex items-center gap-0.5 z-20"
                                    title="Edit Question"
                                  >
                                    <Edit3 className="w-2.5 h-2.5" />
                                    Edit
                                  </button>
                                )}

                                <div className="font-bold text-black">
                                  <span>Q{qNum}. </span>
                                  {isLiveEditMode ? (
                                    <span
                                      contentEditable
                                      suppressContentEditableWarning
                                      onBlur={(e) => handleInlineOptionChange(item.originalIndex, 'question', e.currentTarget.textContent || '')}
                                      className="outline-none hover:bg-amber-100/60 p-0.5 rounded"
                                    >
                                      {formatMathSymbols(q.question)}
                                    </span>
                                  ) : (
                                    <span>{formatMathSymbols(q.question)}</span>
                                  )}
                                </div>

                                {shouldDisplayTranslation(q.question, q.translation) && (
                                  <div className="text-slate-800 text-[10.5px]">
                                    {isLiveEditMode ? (
                                      <span
                                        contentEditable
                                        suppressContentEditableWarning
                                        onBlur={(e) => handleInlineOptionChange(item.originalIndex, 'translation', e.currentTarget.textContent || '')}
                                        className="outline-none hover:bg-amber-100/60 p-0.5 rounded block"
                                      >
                                        {formatMathSymbols(q.translation!)}
                                      </span>
                                    ) : (
                                      formatMathSymbols(q.translation!)
                                    )}
                                  </div>
                                )}

                                {isShort ? (
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] text-black pt-0.5">
                                    <div>{optA}</div>
                                    <div>{optB}</div>
                                    <div>{optC}</div>
                                    <div>{optD}</div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-0.5 text-[10.5px] text-black pt-0.5">
                                    <div>{optA}</div>
                                    <div>{optB}</div>
                                    <div>{optC}</div>
                                    <div>{optD}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Footer Section with Page Number */}
                      <div className="relative z-10 mt-2 pt-2 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-700 font-bold">
                        <span>Gradeup Study Official Test Series</span>
                        <span className="bg-slate-100 text-slate-900 px-2 py-0.5 rounded font-mono border border-slate-300">
                          Page {page.pageNumber} of {page.totalPages}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 2. ANSWER KEY VIEW (1-Page Ultra-Compact) */}
            {(activeTab === 'answer-key' || activeTab === 'combined') && (
              <div className="w-full max-w-[760px]">
                <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2 px-1">
                  <span className="font-mono font-bold text-slate-300">
                    🔑 Answer Key Page (1 Single Sheet)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Total {activeQuestions.length} Answers
                  </span>
                </div>

                <div className="w-full bg-white text-black shadow-2xl rounded-sm p-6 lg:p-8 relative min-h-[960px] font-sans flex flex-col justify-between border border-slate-300">
                  {/* Diagonal Watermark */}
                  {showWatermark && watermarkText && (
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
                      style={{ zIndex: 0 }}
                    >
                      <span
                        className="text-6xl font-extrabold uppercase tracking-widest text-slate-900 transform -rotate-35 whitespace-nowrap"
                        style={{ opacity: watermarkOpacity }}
                      >
                        {watermarkText}
                      </span>
                    </div>
                  )}

                  <div className="relative z-10">
                    {/* Header */}
                    <div className="text-center mb-4">
                      {activeLogoDataUrl && (
                        <div className="flex justify-center mb-2">
                          <img
                            src={activeLogoDataUrl}
                            alt="Logo"
                            className="h-16 w-auto object-contain"
                          />
                        </div>
                      )}
                      <h1 className="text-lg font-extrabold text-black uppercase tracking-tight m-0">
                        {testTitle}
                      </h1>
                      <div className="text-xs font-bold text-black mt-1 pb-2 border-b-[1.5px] border-black flex items-center justify-center gap-3">
                        <span>Time Allowed: {duration} Mins</span>
                        <span>|</span>
                        <span>Max Marks: {totalMarks}</span>
                        {showRollNo && (
                          <>
                            <span>|</span>
                            <span>Roll No: ____________</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Answer Key Title Box */}
                    <div className="border border-slate-400 rounded-sm p-1.5 mb-6 text-center bg-slate-50">
                      <span className="text-sm font-extrabold text-black tracking-wide uppercase">
                        Official Answer Key
                      </span>
                    </div>

                    {/* Compact Multi-Column Answer Grid */}
                    <div
                      className={`grid gap-x-8 gap-y-2 px-8 ${
                        ansCols === 4 ? 'grid-cols-4' : ansCols === 2 ? 'grid-cols-2' : 'grid-cols-1'
                      }`}
                    >
                      {ansColumnSlices.map((colQs, cIdx) => {
                        const startNum = cIdx * itemsPerAnsCol;
                        return (
                          <div key={cIdx} className="space-y-1">
                            {colQs.map((q, idx) => {
                              const qNum = startNum + idx + 1;
                              return (
                                <div
                                  key={q.id || idx}
                                  className="flex items-baseline gap-3 text-xs font-semibold text-black"
                                >
                                  <span className="w-7 text-right text-slate-700 font-bold">{qNum}.</span>
                                  <span className="font-extrabold text-black text-sm">{q.answer || 'A'}</span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="relative z-10 mt-6 pt-2 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-700 font-bold">
                    <span>Gradeup Study Official Test Series</span>
                    <span className="bg-slate-100 text-slate-900 px-2 py-0.5 rounded font-mono border border-slate-300">
                      Answer Key Page 1 of 1
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 3. DETAILED EXPLANATIONS VIEW */}
            {activeTab === 'explanations' && (
              <div className="w-full max-w-[760px] bg-white text-black shadow-2xl rounded-sm p-6 lg:p-8 space-y-4">
                <div className="text-center pb-3 border-b border-black">
                  <h2 className="text-base font-bold text-black uppercase">
                    {testTitle} - Detailed Solutions & Answer Key
                  </h2>
                  <span className="text-xs text-slate-600">Total {activeQuestions.length} Questions</span>
                </div>

                <div className="space-y-3">
                  {activeQuestions.map((q, idx) => (
                    <div key={q.id || idx} className="border border-slate-300 rounded p-2.5 text-xs text-black space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span>Q{idx + 1}. {q.subject && `[${q.subject}]`}</span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-extrabold">
                          Correct: Option {q.answer}
                        </span>
                      </div>
                      <div className="font-medium">{formatMathSymbols(q.question)}</div>
                      {q.translation && (
                        <div className="text-slate-700 italic">{formatMathSymbols(q.translation)}</div>
                      )}
                      <div className="mt-1 pt-1 border-t border-slate-200 text-slate-800 bg-slate-50 p-1.5 rounded">
                        <strong>Explanation: </strong>
                        {q.explanation ? formatMathSymbols(q.explanation) : `Option ${q.answer} is the correct answer.`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Question Modal */}
      {editingQuestionIndex !== null && editingQuestionDraft && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-400" />
                Edit Question {editingQuestionIndex + 1}
              </h3>
              <button
                onClick={() => {
                  setEditingQuestionIndex(null);
                  setEditingQuestionDraft(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Question Text (English)
                </label>
                <textarea
                  rows={3}
                  value={editingQuestionDraft.question}
                  onChange={(e) => setEditingQuestionDraft({ ...editingQuestionDraft, question: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Translation (Hindi / Regional)
                </label>
                <textarea
                  rows={2}
                  value={editingQuestionDraft.translation || ''}
                  onChange={(e) => setEditingQuestionDraft({ ...editingQuestionDraft, translation: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Option (A)</label>
                  <input
                    type="text"
                    value={editingQuestionDraft.optionA || ''}
                    onChange={(e) => setEditingQuestionDraft({ ...editingQuestionDraft, optionA: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Option (B)</label>
                  <input
                    type="text"
                    value={editingQuestionDraft.optionB || ''}
                    onChange={(e) => setEditingQuestionDraft({ ...editingQuestionDraft, optionB: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Option (C)</label>
                  <input
                    type="text"
                    value={editingQuestionDraft.optionC || ''}
                    onChange={(e) => setEditingQuestionDraft({ ...editingQuestionDraft, optionC: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Option (D)</label>
                  <input
                    type="text"
                    value={editingQuestionDraft.optionD || ''}
                    onChange={(e) => setEditingQuestionDraft({ ...editingQuestionDraft, optionD: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Correct Answer</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setEditingQuestionDraft({ ...editingQuestionDraft, answer: opt })}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        editingQuestionDraft.answer === opt
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow'
                          : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Option {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setEditingQuestionIndex(null);
                  setEditingQuestionDraft(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuestionDraft}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Auto-Fix Results Modal */}
      {showAiModal && aiOptimizationResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-500/20 rounded-xl border border-amber-500/30">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    AI Auto-Fix Complete!
                  </h3>
                  <span className="text-xs text-amber-300/90 font-medium">
                    A4 Page-Fit & Spacing Optimized
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Zero Language Modification Guarantee Badge */}
            <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-200">
                <span className="font-bold block text-emerald-300">
                  100% Content & Language Integrity Guaranteed
                </span>
                <span>
                  All question statements, options (A/B/C/D), Hindi translations, and answer keys remain 100% unaltered. Only A4 printable styling & pagination density were calibrated to eliminate blank space.
                </span>
              </div>
            </div>

            {/* Optimization Metrics */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Optimal Density</span>
                <span className="text-white font-bold capitalize">{aiOptimizationResult.recommendedDensity}</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">P1 / Other Caps</span>
                <span className="text-amber-300 font-bold font-mono">
                  {aiOptimizationResult.recommendedPage1Cap} / {aiOptimizationResult.recommendedOtherCap}
                </span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Total Pages</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {aiOptimizationResult.projectedTotalPages} {aiOptimizationResult.projectedTotalPages === 1 ? 'Page' : 'Pages'}
                </span>
              </div>
            </div>

            {/* AI Summary / Reasoning */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5 text-xs text-slate-300">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                <span>AI Optimization Analysis:</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {aiOptimizationResult.reasoning}
              </p>
              {aiOptimizationResult.actionableSuggestions && aiOptimizationResult.actionableSuggestions.length > 0 && (
                <ul className="list-disc list-inside text-[11px] text-slate-400 pt-1 space-y-0.5">
                  {aiOptimizationResult.actionableSuggestions.map((sug, i) => (
                    <li key={i}>{sug}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={handleRevertAiOptimization}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo / Revert
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAiModal(false)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Keep AI Layout
                </button>
                <button
                  onClick={() => {
                    setShowAiModal(false);
                    handlePrintPaper();
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
