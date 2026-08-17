import React, { useState, useMemo, useRef } from 'react';
import { Question, MockHistory } from '../types';
import {
  exportCompact2ColPdfTestPaper,
  exportCompact1PagePdfAnswerKey,
  exportCombinedBookletPdf,
  printNativeCompact2ColPaper,
  printNativeCompactAnswerKey,
  exportDocxTestPaper,
  exportDocxAnswerKey,
  BookletCustomConfig,
  formatMathSymbols,
  shouldDisplayTranslation
} from '../lib/exportUtils';
import { PRESET_LOGOS, PresetLogo } from '../lib/paperLogos';
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
  Minimize2,
  Maximize2,
  RefreshCw,
  Info,
  Check,
  ChevronRight,
  Shield,
  Columns
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
  const [columnMode, setColumnMode] = useState<1 | 2>(2);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string>('');

  const [instructions, setInstructions] = useState<string>(
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active Questions List based on selection
  const activeQuestions = useMemo(() => {
    if (selectedSourceId === 'current') {
      return currentTestQuestions;
    }
    const foundMock = mockHistory.find(m => m.id === selectedSourceId);
    return foundMock ? foundMock.questions : currentTestQuestions;
  }, [selectedSourceId, currentTestQuestions, mockHistory]);

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
    columnsCount: columnMode,
    showBoxBorder: true
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
    columnMode
  ]);

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
    setTotalMarks(50);
    setSelectedLogoId('hp_police');
    setWatermarkText('Gradeup Study');
    setDensity('compact');
    setColumnMode(2);
    setInstructions(
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`
    );
  };

  const applyGradeupOfficialPreset = () => {
    setTestTitle('Gradeup Study Official Mock Test Series');
    setDuration(90);
    setTotalMarks(activeQuestions.length);
    setSelectedLogoId('gradeup_study');
    setWatermarkText('Gradeup Study');
    setDensity('compact');
    setColumnMode(2);
    setInstructions(
`1. All questions are compulsory and carry 1 mark each.
2. There is a negative marking of 0.25 marks for every incorrect answer.
3. Use Blue/Black ballpoint pen only to fill the OMR sheet.`
    );
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

  const handlePrintPaper = () => {
    printNativeCompact2ColPaper(activeQuestions, bookletConfig);
  };

  const handlePrintAnswerKey = () => {
    printNativeCompactAnswerKey(activeQuestions, bookletConfig);
  };

  // Question splitting for 2-column preview
  const midPoint = Math.ceil(activeQuestions.length / 2);
  const leftQuestions = activeQuestions.slice(0, midPoint);
  const rightQuestions = activeQuestions.slice(midPoint);

  // Column slice for Answer Key Preview
  const ansCols = activeQuestions.length > 60 ? 4 : activeQuestions.length > 30 ? 2 : 1;
  const itemsPerAnsCol = Math.ceil(activeQuestions.length / ansCols);
  const ansColumnSlices: Question[][] = [];
  for (let c = 0; c < ansCols; c++) {
    ansColumnSlices.push(activeQuestions.slice(c * itemsPerAnsCol, (c + 1) * itemsPerAnsCol));
  }

  // Estimated page calculation
  const estimatedPages = useMemo(() => {
    const qCount = activeQuestions.length;
    if (qCount === 0) return 0;
    const perPage = density === 'ultra-compact' ? 16 : density === 'compact' ? 13 : 9;
    return Math.ceil(qCount / perPage);
  }, [activeQuestions.length, density]);

  const standard1ColPages = useMemo(() => {
    const qCount = activeQuestions.length;
    if (qCount === 0) return 0;
    return Math.ceil(qCount / 5); // typical 1-col layout fits ~5 questions per page
  }, [activeQuestions.length]);

  const pagesSaved = Math.max(0, standard1ColPages - estimatedPages);

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
                Format your mock test into a clean, 2-column boxed exam paper and a 1-page ultra-compact answer sheet. Print directly or download high-resolution PDFs designed to minimize paper usage.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2">
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
              <span className="text-slate-400 block">Est. Booklet Pages:</span>
              <span className="text-emerald-400 font-bold text-base">~{estimatedPages} Pages</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Paper Saved vs 1-Col:</span>
              <span className="text-blue-400 font-bold text-base">~{pagesSaved} Sheets ({Math.round((pagesSaved / Math.max(1, standard1ColPages)) * 100)}%)</span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Answer Key Size:</span>
              <span className="text-purple-400 font-bold text-base">1 Single Page</span>
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
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Printer className="w-4 h-4 text-emerald-400" />
              Print & Export Actions
            </h3>

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

          {/* Exam Header & Logo Settings */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Settings2 className="w-4 h-4 text-blue-400" />
              Exam Header & Badge Settings
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
          </div>

          {/* Density & Layout Controls */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
              <Columns className="w-4 h-4 text-purple-400" />
              Page-Saver Layout & Density
            </h3>

            {/* Density Selector */}
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Layout Density (Questions per Page)
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
                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Max Qs / page</span>
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
                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Sample PDF style</span>
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
                  <span className="block text-[9px] font-normal text-slate-400 mt-0.5">Larger fonts</span>
                </button>
              </div>
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

        {/* RIGHT COLUMN: LIVE REAL-SIZE DOCUMENT PREVIEW */}
        <div className="lg:col-span-8 space-y-4">
          {/* Tab Navigation */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 flex items-center justify-between">
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
                📄 2-Column Question Paper
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

            <div className="text-xs text-slate-400 font-mono hidden sm:block">
              A4 Format • Print Ready
            </div>
          </div>

          {/* DOCUMENT PREVIEW CONTAINER (Realistic White A4 Sheet with Drop Shadow) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:p-6 overflow-auto max-h-[820px] flex justify-center">
            {/* White Sheet Container */}
            <div className="w-full max-w-[760px] bg-white text-black shadow-2xl rounded-sm p-6 lg:p-8 relative min-h-[960px] font-sans">
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

              {/* CONTENT LAYER */}
              <div className="relative z-10">
                {/* 1. QUESTION PAPER VIEW OR COMBINED VIEW */}
                {(activeTab === 'paper' || activeTab === 'combined') && (
                  <div>
                    {/* Header with Logo */}
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

                    {/* 2-Column Boxed Questions Grid (Identical to Sample PDF) */}
                    <div className="border-[1.5px] border-black grid grid-cols-2 bg-transparent text-black">
                      {/* Left Column */}
                      <div className="p-2.5 border-r-[1.5px] border-black space-y-2.5">
                        {leftQuestions.map((q, idx) => {
                          const qNum = idx + 1;
                          const optA = `(A) ${formatMathSymbols(q.optionA || '')}`;
                          const optB = `(B) ${formatMathSymbols(q.optionB || '')}`;
                          const optC = `(C) ${formatMathSymbols(q.optionC || '')}`;
                          const optD = `(D) ${formatMathSymbols(q.optionD || '')}`;
                          const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

                          return (
                            <div
                              key={q.id || idx}
                              className={`text-[11px] leading-snug break-inside-avoid ${
                                density === 'ultra-compact' ? 'text-[10px] space-y-0.5' : density === 'normal' ? 'text-[12px] space-y-1' : 'space-y-0.5'
                              }`}
                            >
                              <div className="font-bold text-black">
                                <span>Q{qNum}. </span>
                                <span>{formatMathSymbols(q.question)}</span>
                              </div>
                              {shouldDisplayTranslation(q.question, q.translation) && (
                                <div className="text-slate-800 text-[10.5px]">
                                  {formatMathSymbols(q.translation!)}
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
                      <div className="p-2.5 space-y-2.5">
                        {rightQuestions.map((q, idx) => {
                          const qNum = midPoint + idx + 1;
                          const optA = `(A) ${formatMathSymbols(q.optionA || '')}`;
                          const optB = `(B) ${formatMathSymbols(q.optionB || '')}`;
                          const optC = `(C) ${formatMathSymbols(q.optionC || '')}`;
                          const optD = `(D) ${formatMathSymbols(q.optionD || '')}`;
                          const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

                          return (
                            <div
                              key={q.id || idx}
                              className={`text-[11px] leading-snug break-inside-avoid ${
                                density === 'ultra-compact' ? 'text-[10px] space-y-0.5' : density === 'normal' ? 'text-[12px] space-y-1' : 'space-y-0.5'
                              }`}
                            >
                              <div className="font-bold text-black">
                                <span>Q{qNum}. </span>
                                <span>{formatMathSymbols(q.question)}</span>
                              </div>
                              {shouldDisplayTranslation(q.question, q.translation) && (
                                <div className="text-slate-800 text-[10.5px]">
                                  {formatMathSymbols(q.translation!)}
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
                  </div>
                )}

                {/* 2. ANSWER KEY VIEW (1-Page Ultra-Compact, exactly matching Sample PDF Page 1) */}
                {(activeTab === 'answer-key' || activeTab === 'combined') && (
                  <div className={activeTab === 'combined' ? 'mt-12 pt-8 border-t-2 border-dashed border-slate-400' : ''}>
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
                        Answer Key
                      </span>
                    </div>

                    {/* Compact Answer Grid (Multi-Column) */}
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
                )}

                {/* 3. DETAILED EXPLANATIONS VIEW */}
                {activeTab === 'explanations' && (
                  <div className="space-y-4">
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
        </div>
      </div>
    </div>
  );
};
