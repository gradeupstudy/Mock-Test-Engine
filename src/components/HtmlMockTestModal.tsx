import React, { useState, useEffect } from 'react';
import { Question, HtmlMockTestConfig } from '../types';
import {
  generateInteractiveHtmlMockTest,
  getStoredHtmlMockTestConfig,
  saveStoredHtmlMockTestConfig,
  DEFAULT_HTML_TEST_CONFIG
} from '../lib/htmlMockTestGenerator';
import {
  Globe,
  Download,
  ExternalLink,
  Copy,
  Check,
  X,
  Youtube,
  Clock,
  Award,
  ShieldAlert,
  FileCheck,
  Sparkles,
  Share2
} from 'lucide-react';

interface HtmlMockTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  testName: string;
  duration?: number;
  totalMarks?: number;
}

export const HtmlMockTestModal: React.FC<HtmlMockTestModalProps> = ({
  isOpen,
  onClose,
  questions,
  testName,
  duration = 60,
  totalMarks
}) => {
  const [config, setConfig] = useState<HtmlMockTestConfig>(() => {
    const stored = getStoredHtmlMockTestConfig();
    return {
      ...stored,
      testName: testName || stored.testName,
      duration: duration || stored.duration,
      totalMarks: totalMarks || questions.length * (stored.positiveMarks || 1)
    };
  });

  const [copied, setCopied] = useState<boolean>(false);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredHtmlMockTestConfig();
      setConfig(prev => ({
        ...stored,
        ...prev,
        testName: testName || prev.testName,
        duration: duration || prev.duration,
        totalMarks: totalMarks || questions.length * (prev.positiveMarks || 1)
      }));
    }
  }, [isOpen, testName, duration, totalMarks, questions.length]);

  if (!isOpen) return null;

  const handleConfigChange = (key: keyof HtmlMockTestConfig, value: any) => {
    const updated = { ...config, [key]: value };
    if (key === 'positiveMarks') {
      updated.totalMarks = questions.length * Number(value);
    }
    setConfig(updated);
    saveStoredHtmlMockTestConfig(updated);
  };

  const getHtmlContent = (): string => {
    return generateInteractiveHtmlMockTest(questions, config);
  };

  const handleDownload = () => {
    if (questions.length === 0) {
      alert('No questions loaded to export HTML mock test.');
      return;
    }
    const htmlContent = getHtmlContent();
    const safeTitle = (config.testName || 'Mock_Test')
      .replace(/[^a-zA-Z0-9_\-\u0900-\u097F]/g, '_')
      .slice(0, 60);
    const filename = `${safeTitle}_CBT_Mock_Test.html`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 3000);
  };

  const handleOpenPreview = () => {
    if (questions.length === 0) {
      alert('No questions loaded to open preview.');
      return;
    }
    const htmlContent = getHtmlContent();
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleCopyHtml = async () => {
    if (questions.length === 0) return;
    const htmlContent = getHtmlContent();
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Failed to copy to clipboard.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl animate-fade-in my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-md">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">Interactive HTML Mock Test Generator</h3>
                <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1">
                  <Youtube className="w-3 h-3 text-red-400" />
                  <span>YouTube Gate</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Self-contained, offline-ready HTML exam file with YouTube subscribe gate & professional scorecard.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Settings */}
        <div className="space-y-4 text-xs">
          {/* Test Title & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="text-slate-300 block mb-1 font-semibold">Test Paper Name / Title</label>
              <input
                type="text"
                value={config.testName}
                onChange={e => handleConfigChange('testName', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>
            <div>
              <label className="text-slate-300 block mb-1 font-semibold flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Duration (Minutes)</span>
              </label>
              <input
                type="number"
                min={1}
                max={300}
                value={config.duration}
                onChange={e => handleConfigChange('duration', Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>
          </div>

          {/* Marking Scheme */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-slate-300 block mb-1 font-semibold flex items-center space-x-1">
                <Award className="w-3.5 h-3.5 text-emerald-400" />
                <span>Marks per Correct MCQ</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10"
                value={config.positiveMarks}
                onChange={e => handleConfigChange('positiveMarks', Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold flex items-center space-x-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Negative Marking (Penalty)</span>
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="5"
                value={config.negativeMarks}
                onChange={e => handleConfigChange('negativeMarks', Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="text-slate-300 block mb-1 font-semibold">Total Calculated Marks</label>
              <div className="bg-slate-950 border border-slate-800 text-emerald-400 rounded-xl p-2.5 text-xs font-bold">
                {questions.length * config.positiveMarks} Marks ({questions.length} MCQs)
              </div>
            </div>
          </div>

          {/* YouTube Subscribe Gate Settings Box */}
          <div className="p-4 bg-gradient-to-r from-red-950/40 via-rose-950/20 to-slate-950 border border-red-500/40 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Youtube className="w-4 h-4 text-red-500" />
                <span className="font-bold text-white text-xs">YouTube Channel Subscribe Gate</span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enableYoutubeGate}
                  onChange={e => handleConfigChange('enableYoutubeGate', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                <span className="ml-2 text-[11px] text-slate-300 font-medium">
                  {config.enableYoutubeGate ? 'Gate Enabled' : 'Gate Disabled'}
                </span>
              </label>
            </div>

            <p className="text-[11px] text-slate-400">
              When enabled, students must click to subscribe to your YouTube channel before starting the mock test.
            </p>

            {config.enableYoutubeGate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Channel Name / Handle</label>
                  <input
                    type="text"
                    value={config.youtubeChannelName}
                    onChange={e => handleConfigChange('youtubeChannelName', e.target.value)}
                    placeholder="e.g. Gradeup Study"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 text-xs focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-medium">Channel Subscribe URL</label>
                  <input
                    type="text"
                    value={config.youtubeChannelUrl}
                    onChange={e => handleConfigChange('youtubeChannelUrl', e.target.value)}
                    placeholder="https://www.youtube.com/@Channel?sub_confirmation=1"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 text-xs focus:outline-none focus:border-red-500 font-mono text-[11px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Feature Highlights Pill Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>100% Offline Standalone HTML</span>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Full CBT Interface & Timer</span>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Bilingual Hindi & English</span>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Explanations & Solutions</span>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Print/Download Result PDF</span>
            </div>
            <div className="p-2 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center space-x-2 text-slate-300">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>WhatsApp / Telegram Share</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <button
            onClick={handleCopyHtml}
            className="w-full sm:w-auto flex items-center justify-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied HTML!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy HTML Code</span>
              </>
            )}
          </button>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              onClick={handleOpenPreview}
              className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-colors"
              title="Open the generated HTML mock test in a new tab immediately"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Test in New Tab</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download HTML Mock Test</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
