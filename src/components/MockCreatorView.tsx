import React, { useState, useMemo } from 'react';
import { Question, MockHistory, SectionConfig } from '../types';
import { runIQSE, IQSEResult, IrtTargetProfile } from '../lib/iqse';
import { getStoredAiConfig } from '../lib/aiClient';
import { addMock } from '../lib/db';
import { syncMockHistoryToSupabase } from '../lib/supabaseClient';
import {
  Sparkles,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Sliders,
  ArrowRight,
  ShieldCheck,
  Cpu,
  BarChart3,
  Shuffle,
  Zap,
  Target
} from 'lucide-react';

interface MockCreatorViewProps {
  questions: Question[];
  mockHistory: MockHistory[];
  onMockGenerated: (selectedQs: Question[], mockId: number, testName: string, marks: number, duration: number) => void;
  onNavigateToPreview: () => void;
}

export const MockCreatorView: React.FC<MockCreatorViewProps> = ({
  questions,
  mockHistory,
  onMockGenerated,
  onNavigateToPreview
}) => {
  // Test Settings
  const [testName, setTestName] = useState<string>('All India Competitive Mock Test - Series 01');
  const [totalMarks, setTotalMarks] = useState<number>(100);
  const [duration, setDuration] = useState<number>(60);
  const [excludeLastN, setExcludeLastN] = useState<number>(3);
  const [uniqueThreshold, setUniqueThreshold] = useState<number>(85);

  // Trio Engine Parameters
  const [enableDUXQE, setEnableDUXQE] = useState<boolean>(true);
  const [semanticThreshold, setSemanticThreshold] = useState<number>(0.60); // 0.60 default
  const [irtProfile, setIrtProfile] = useState<IrtTargetProfile>('balanced');

  // Available Subjects
  const availableSubjects = useMemo(() => {
    return Array.from(new Set(questions.map(q => q.subject))).filter((s): s is string => Boolean(s)).sort();
  }, [questions]);

  // Sections State
  const [sections, setSections] = useState<SectionConfig[]>([
    {
      id: 'sec_1',
      subject: availableSubjects[0] || 'Quantitative Aptitude',
      questionCount: 10,
      chapterDistribution: {}
    },
    {
      id: 'sec_2',
      subject: availableSubjects[1] || 'Logical Reasoning',
      questionCount: 10,
      chapterDistribution: {}
    }
  ]);

  // Active Chapter Distribution Modal Section
  const [activeChapterSecId, setActiveChapterSecId] = useState<string | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [iqseResult, setIqseResult] = useState<IQSEResult | null>(null);

  const addSection = () => {
    const nextSub = availableSubjects.find(s => !sections.some(sec => sec.subject === s)) || availableSubjects[0] || 'General';
    setSections(prev => [
      ...prev,
      {
        id: `sec_${Date.now()}`,
        subject: nextSub,
        questionCount: 10,
        chapterDistribution: {}
      }
    ]);
  };

  const removeSection = (id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));
  };

  const updateSection = (id: string, key: keyof SectionConfig, value: any) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id === id) {
          if (key === 'subject') {
            return { ...s, subject: value, chapterDistribution: {} };
          }
          return { ...s, [key]: value };
        }
        return s;
      })
    );
  };

  const handleAutoDistribute = (secId: string) => {
    const sec = sections.find(s => s.id === secId);
    if (!sec) return;

    const subjectQuestions = questions.filter(
      q => (q.subject || '').trim().toLowerCase() === sec.subject.trim().toLowerCase()
    );

    const chapterSet = new Set<string>();
    subjectQuestions.forEach(q => {
      const ch = (q.chapter && q.chapter.trim()) ? q.chapter.trim() : 'General';
      chapterSet.add(ch);
    });

    const chapters: string[] = Array.from(chapterSet).sort((a, b) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b);
    });

    if (chapters.length === 0) return;

    const baseQuota = Math.floor(sec.questionCount / chapters.length);
    const remainder = sec.questionCount % chapters.length;

    // Shuffle chapter array indices for remainder distribution so remainder is not always given to the first chapter
    const shuffledIndices = chapters.map((_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    const remainderIndices = new Set(shuffledIndices.slice(0, remainder));

    const dist: Record<string, number> = {};
    chapters.forEach((ch: string, idx: number) => {
      dist[ch] = baseQuota + (remainderIndices.has(idx) ? 1 : 0);
    });

    updateSection(secId, 'chapterDistribution', dist);
  };

  const handleGenerate = async () => {
    const totalQsRequested = sections.reduce((acc, s) => acc + s.questionCount, 0);
    if (totalQsRequested <= 0) {
      alert('Please request at least 1 question across your test sections.');
      return;
    }

    setIsGenerating(true);
    setIqseResult(null);

    const mockId = Date.now();
    const activeAiConfig = getStoredAiConfig();

    try {
      const result = await runIQSE(questions, sections, mockHistory, {
        excludeLastN,
        uniqueThreshold,
        mockId,
        enableDUXQE,
        duxqeAiConfig: activeAiConfig,
        semanticDeduplicationThreshold: semanticThreshold,
        irtProfile
      });

      setIqseResult(result);

      const newMockItem: MockHistory = {
        mockId,
        testName,
        marks: totalMarks,
        duration,
        questionIds: result.selectedQuestions.map(q => q.id!).filter(Boolean),
        uniqueness: result.uniquenessScore,
        createdDate: new Date().toISOString()
      };

      // Save to mockHistory in IndexedDB
      await addMock(newMockItem);

      // Also sync created mock test record to Supabase if configured
      syncMockHistoryToSupabase([newMockItem]).catch(() => {});

      onMockGenerated(result.selectedQuestions, mockId, testName, totalMarks, duration);
    } catch (err: any) {
      alert(`X-IQSE Engine Generation Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const activeSec = sections.find(s => s.id === activeChapterSecId);
  const activeSecChapters: string[] = useMemo(() => {
    if (!activeSec) return [];
    const subjectQuestions = questions.filter(
      q => (q.subject || '').trim().toLowerCase() === activeSec.subject.trim().toLowerCase()
    );
    const chapterSet = new Set<string>();
    subjectQuestions.forEach(q => {
      const ch = (q.chapter && q.chapter.trim()) ? q.chapter.trim() : 'General';
      chapterSet.add(ch);
    });
    return Array.from(chapterSet).sort((a, b) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b);
    });
  }, [activeSec, questions]);

  const activeSecChapterTotal = activeSec && activeSec.chapterDistribution
    ? Object.values(activeSec.chapterDistribution).reduce<number>((acc, val) => acc + (Number(val) || 0), 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <span>Mock Test Creator (IQSE Engine)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Intelligent Question Selection Engine with chapter-wise distribution, uniqueness scoring, and recent mock exclusions.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || questions.length === 0}
          className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md hover:shadow-blue-500/20 transition-all"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>IQSE Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate Mock Test</span>
            </>
          )}
        </button>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Test Parameters Card */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-sm">
          <div className="flex items-center space-x-2 text-white font-semibold text-xs border-b border-slate-800 pb-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Test Parameters & Meta Information</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="sm:col-span-2">
              <label className="text-slate-400 block mb-1 font-medium">Test Name / Title</label>
              <input
                type="text"
                value={testName}
                onChange={e => setTestName(e.target.value)}
                placeholder="e.g. SSC CGL General Awareness Model Paper 01"
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Total Maximum Marks</label>
              <input
                type="number"
                value={totalMarks}
                onChange={e => setTotalMarks(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Duration (Minutes)</label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* X-IQSE Trio Algorithm Fine-tuning Panel */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2 text-white font-semibold text-xs">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>X-IQSE v3.0 Multi-Engine Tuning</span>
            </div>
            <span className="text-[10px] bg-cyan-950 border border-cyan-800 text-cyan-300 px-2 py-0.5 rounded-full font-bold">
              3-Engine Active
            </span>
          </div>

          <div className="space-y-4 text-xs">
            {/* Engine A: DU-XQE Mutation Toggle */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-slate-200">A. DU-XQE Mutation Engine</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnableDUXQE(!enableDUXQE)}
                  className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    enableDUXQE ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      enableDUXQE ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Dynamically mutates numerical values, parameters & context in selected MCQs so repeat questions become 100% unique variants while keeping answer logic exact.
              </p>
            </div>

            {/* Engine B: Semantic Vector Deduplication */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between font-medium">
                <div className="flex items-center space-x-2 text-slate-200">
                  <Shuffle className="w-4 h-4 text-purple-400" />
                  <span className="font-bold">B. Semantic Vector Deduplication</span>
                </div>
                <strong className="text-purple-300">{(semanticThreshold * 100).toFixed(0)}% Similarity Cutoff</strong>
              </div>
              <input
                type="range"
                min={0.40}
                max={0.85}
                step={0.05}
                value={semanticThreshold}
                onChange={e => setSemanticThreshold(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                N-gram token vector similarity engine blocks near-identical questions across different chapters or recent tests.
              </p>
            </div>

            {/* Engine C: IRT Psychometric Profile */}
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center space-x-2 text-slate-200 font-medium mb-1">
                <Target className="w-4 h-4 text-emerald-400" />
                <span className="font-bold">C. Item Response Theory (IRT) Profile</span>
              </div>
              <select
                value={irtProfile}
                onChange={e => setIrtProfile(e.target.value as IrtTargetProfile)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500 font-medium"
              >
                <option value="balanced">Standard Exam Balanced (30% Easy, 50% Med, 20% Hard)</option>
                <option value="hard_exam">High Difficulty / Competition Level (10% Easy, 40% Med, 50% Hard)</option>
                <option value="speed_test">Speed & Accuracy Test (40% Easy, 50% Med, 10% Hard)</option>
                <option value="foundation_easy">Foundation & Practice Mode (60% Easy, 35% Med, 5% Hard)</option>
              </select>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Uses 3PL Item Characteristic Curve parameters to maximize psychometric information $I(\theta)$ at target difficulty levels.
              </p>
            </div>

            {/* Standard Settings */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              <div>
                <div className="flex justify-between text-slate-400 mb-1 font-medium">
                  <span>Exclude Last N Mock Tests</span>
                  <strong className="text-white">{excludeLastN} Mocks</strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={excludeLastN}
                  onChange={e => setExcludeLastN(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1 font-medium">
                  <span>Uniqueness Target Threshold</span>
                  <strong className="text-emerald-400">{uniqueThreshold}%</strong>
                </div>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={uniqueThreshold}
                  onChange={e => setUniqueThreshold(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sections Configuration Panel */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Section & Subject Blueprint</h3>
          </div>
          <button
            onClick={addSection}
            className="flex items-center space-x-1 text-xs bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Section</span>
          </button>
        </div>

        <div className="space-y-3">
          {sections.map((sec, index) => {
            const availCount = questions.filter(
              q => q.subject.toLowerCase() === sec.subject.toLowerCase()
            ).length;

            const chapterQuotaCount = sec.chapterDistribution
              ? Object.values(sec.chapterDistribution).reduce<number>((acc, val) => acc + (Number(val) || 0), 0)
              : 0;

            return (
              <div
                key={sec.id}
                className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-blue-400 border border-slate-700 text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>

                  {/* Subject Dropdown */}
                  <div className="flex-1 max-w-xs">
                    <label className="text-[10px] text-slate-500 block">Subject</label>
                    <select
                      value={sec.subject}
                      onChange={e => updateSection(sec.id, 'subject', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:border-blue-500"
                    >
                      {availableSubjects.map(sub => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Question Count Input */}
                  <div className="w-28">
                    <label className="text-[10px] text-slate-500 block">Questions</label>
                    <input
                      type="number"
                      min={1}
                      value={sec.questionCount}
                      onChange={e => updateSection(sec.id, 'questionCount', Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Available Badge */}
                  <div className="text-[11px] text-slate-400 pt-4">
                    Pool: <strong className="text-white">{availCount}</strong> available
                  </div>
                </div>

                {/* Chapter Distribution Button & Remove */}
                <div className="flex items-center space-x-2 pt-2 md:pt-0">
                  <button
                    onClick={() => setActiveChapterSecId(sec.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      chapterQuotaCount > 0
                        ? 'bg-indigo-950/80 border-indigo-600 text-indigo-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>
                      Chapter Distribution ({chapterQuotaCount}/{sec.questionCount})
                    </span>
                  </button>

                  {sections.length > 1 && (
                    <button
                      onClick={() => removeSection(sec.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Remove section"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* IQSE Generation Result Card */}
      {iqseResult && (
        <div className="bg-slate-900 border border-emerald-500/40 p-6 rounded-2xl space-y-5 shadow-lg animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>X-IQSE v3.0 Mock Test Successfully Generated!</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-cyan-300 bg-cyan-950/80 border border-cyan-800/80 px-2.5 py-1 rounded-full font-semibold">
                3-Engine Active
              </span>
              <span className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
                {iqseResult.attempts} Attempt(s)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Selected MCQs</span>
              <strong className="text-lg font-extrabold text-white">
                {iqseResult.selectedQuestions.length}
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Usage Uniqueness</span>
              <strong className="text-lg font-extrabold text-emerald-400">
                {iqseResult.uniquenessScore}%
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-purple-300 block">Vector Deduplication</span>
              <strong className="text-lg font-extrabold text-purple-400">
                {iqseResult.semanticUniquenessScore}%
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-cyan-300 block">IRT Balance Score</span>
              <strong className="text-lg font-extrabold text-cyan-400">
                {iqseResult.irtBalanceScore}%
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-amber-300 block">DU-XQE Mutated</span>
              <strong className="text-lg font-extrabold text-amber-400">
                {iqseResult.duxqeMutationsApplied} MCQs
              </strong>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block">Total Marks</span>
              <strong className="text-lg font-extrabold text-blue-400">{totalMarks}</strong>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={onNavigateToPreview}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl text-xs shadow-md transition-colors"
            >
              <FileCheck className="w-4 h-4" />
              <span>Review & Edit Test Paper</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Chapter Distribution Modal */}
      {activeChapterSecId && activeSec && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>Chapter Distribution for {activeSec.subject}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Target total: <strong>{activeSec.questionCount}</strong> questions
                </p>
              </div>

              <button onClick={() => setActiveChapterSecId(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {/* Auto Distribute & Clear Controls */}
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center space-x-2">
                <span>Status:</span>
                {activeSecChapterTotal === activeSec.questionCount ? (
                  <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>✅ Balanced ({activeSecChapterTotal}/{activeSec.questionCount})</span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>⚠️ Mismatch ({activeSecChapterTotal}/{activeSec.questionCount})</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleAutoDistribute(activeSec.id)}
                  className="bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 px-3 py-1 rounded text-xs transition-colors"
                >
                  Auto Even Distribute
                </button>
                <button
                  onClick={() => updateSection(activeSec.id, 'chapterDistribution', {})}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded text-xs transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Chapters Inputs List */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {activeSecChapters.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 text-center">No distinct chapters found for this subject.</p>
              ) : (
                activeSecChapters.map(ch => {
                  const val = activeSec.chapterDistribution?.[ch] || 0;
                  return (
                    <div key={ch} className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg text-xs">
                      <span className="font-medium text-slate-200">{ch}</span>
                      <input
                        type="number"
                        min={0}
                        value={val}
                        onChange={e => {
                          const num = Math.max(0, Number(e.target.value));
                          const newDist = { ...activeSec.chapterDistribution, [ch]: num };
                          updateSection(activeSec.id, 'chapterDistribution', newDist);
                        }}
                        className="w-20 bg-slate-900 border border-slate-700 text-white rounded p-1 text-center font-bold"
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setActiveChapterSecId(null)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2 rounded-xl text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Processing Overlay for IQSE Test Paper Generation */}
      {isGenerating && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0e1230] border border-blue-500/50 p-7 rounded-3xl shadow-2xl max-w-md w-full space-y-5 text-center relative overflow-hidden animate-in fade-in zoom-in-95">
            {/* Animated glowing pulse background */}
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-blue-600/20 rounded-full blur-2xl animate-pulse" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-purple-600/20 rounded-full blur-2xl animate-pulse" />

            <div className="relative flex flex-col items-center space-y-3">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 border-r-purple-500 animate-spin" />
                <Sparkles className="w-7 h-7 text-blue-400 absolute inset-0 m-auto animate-pulse" />
              </div>

              <div>
                <h3 className="text-base font-bold text-white flex items-center justify-center space-x-2">
                  <span>IQSE 3-Engine Processing...</span>
                </h3>
                <p className="text-xs text-blue-300 font-medium mt-1">
                  Generating "{testName}" ({sections.reduce((a, b) => a + b.questionCount, 0)} MCQs)
                </p>
              </div>
            </div>

            {/* Interactive Progress Steps Animation */}
            <div className="space-y-2 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 text-left text-xs">
              <div className="flex items-center space-x-2 text-blue-400">
                <CheckCircle2 className="w-4 h-4 text-blue-400 animate-pulse flex-shrink-0" />
                <span>1. Scanning Question Bank ({questions.length} Total Questions)...</span>
              </div>
              <div className="flex items-center space-x-2 text-indigo-300">
                <Zap className="w-4 h-4 text-indigo-400 animate-bounce flex-shrink-0" />
                <span>2. Executing DUXQE Mutation & DU-RIR Vector Analysis...</span>
              </div>
              <div className="flex items-center space-x-2 text-purple-300">
                <Target className="w-4 h-4 text-purple-400 animate-pulse flex-shrink-0" />
                <span>3. IRT Difficulty Curve Balancing ({irtProfile} profile)...</span>
              </div>
              <div className="flex items-center space-x-2 text-emerald-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>4. Assembling Section-wise Paper & Uniqueness Score...</span>
              </div>
            </div>

            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
              <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 animate-pulse rounded-full w-full" />
            </div>

            <p className="text-[10px] text-slate-400 italic">
              Please wait... AI and algorithms are selecting optimum non-repetitive MCQs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
