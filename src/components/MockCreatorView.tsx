import React, { useState, useMemo, useEffect } from 'react';
import { Question, MockHistory, SectionConfig, ExamPreset } from '../types';
import { runIQSE, IQSEResult, IrtTargetProfile } from '../lib/iqse';
import { getStoredAiConfig } from '../lib/aiClient';
import { addMock, getAllExamPresets, saveExamPreset, deleteExamPreset } from '../lib/db';
import { syncMockHistoryToSupabase } from '../lib/supabaseClient';
import { GenerationProgressModal } from './GenerationProgressModal';
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
  Target,
  Bookmark,
  Save,
  BookmarkCheck,
  Settings2,
  BookOpen,
  Edit3,
  FileEdit
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

  // Exam Presets / Blueprints state
  const [examPresets, setExamPresets] = useState<ExamPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState<boolean>(false);
  const [presetNameInput, setPresetNameInput] = useState<string>('');
  const [examNameInput, setExamNameInput] = useState<string>('');
  const [isManagePresetsOpen, setIsManagePresetsOpen] = useState<boolean>(false);

  // Edit Blueprint Modal state
  const [isEditPresetModalOpen, setIsEditPresetModalOpen] = useState<boolean>(false);
  const [editingPreset, setEditingPreset] = useState<ExamPreset | null>(null);

  // Available subjects from imported questions
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

  // Comprehensive list of all selectable subjects
  const allSelectableSubjects = useMemo(() => {
    const fromQuestions = questions.map(q => q.subject).filter(Boolean);
    const fromPresets = examPresets.flatMap(p => p.sections?.map(s => s.subject) || []);
    const fromCurrentSections = (sections || []).map(s => s.subject).filter(Boolean);
    const defaults = [
      'General Knowledge',
      'Hindi Language',
      'English Language',
      'Quantitative Aptitude',
      'Reasoning Ability',
      'General Science',
      'Computer Knowledge',
      'Mathematics & Reasoning'
    ];
    return Array.from(new Set([...fromQuestions, ...fromPresets, ...fromCurrentSections, ...defaults])).sort();
  }, [questions, examPresets, sections]);

  // Load Exam Presets on mount
  const loadPresets = async () => {
    try {
      const loaded = await getAllExamPresets();
      setExamPresets(loaded);
    } catch (e) {
      console.error('Failed to load exam presets:', e);
    }
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const handleApplyPreset = (presetId: number | string) => {
    if (!presetId) {
      setSelectedPresetId('');
      return;
    }
    const found = examPresets.find(p => p.id === Number(presetId));
    if (!found) return;

    setSelectedPresetId(String(found.id));
    setTestName(`${found.examName} Mock Test - 01`);
    setTotalMarks(found.totalMarks);
    setDuration(found.duration);
    if (found.excludeLastN !== undefined) setExcludeLastN(found.excludeLastN);
    if (found.uniqueThreshold !== undefined) setUniqueThreshold(found.uniqueThreshold);
    if (found.irtProfile) setIrtProfile(found.irtProfile as IrtTargetProfile);

    // Deep clone sections so modifications don't mutate preset
    if (found.sections && Array.isArray(found.sections) && found.sections.length > 0) {
      const clonedSections: SectionConfig[] = found.sections.map((s, idx) => ({
        id: `sec_${Date.now()}_${idx}`,
        subject: s.subject || 'General Knowledge',
        questionCount: Number(s.questionCount) || 10,
        chapterDistribution: { ...(s.chapterDistribution || {}) }
      }));
      setSections(clonedSections);
    } else {
      setSections([
        { id: 'sec_1', subject: 'General Knowledge', questionCount: 20, chapterDistribution: {} },
        { id: 'sec_2', subject: 'Hindi Language', questionCount: 15, chapterDistribution: {} },
        { id: 'sec_3', subject: 'English Language', questionCount: 15, chapterDistribution: {} }
      ]);
    }

    setPresetNotice(`Applied Exam Preset "${found.presetName}"! All ${found.sections?.length || 0} sections loaded automatically.`);
    setTimeout(() => setPresetNotice(null), 3500);
  };

  const handleOpenSavePresetModal = () => {
    const defaultExam = testName.replace(/Mock Test.*$/i, '').trim() || 'Custom Exam';
    setPresetNameInput(`${defaultExam} Blueprint`);
    setExamNameInput(defaultExam);
    setIsSavePresetModalOpen(true);
  };

  const handleSaveCurrentPreset = async () => {
    if (!presetNameInput.trim() || !examNameInput.trim()) {
      alert('Please enter both Preset Name and Exam Name.');
      return;
    }

    const newPreset: ExamPreset = {
      presetName: presetNameInput.trim(),
      examName: examNameInput.trim(),
      totalMarks,
      duration,
      sections: sections.map(s => ({
        id: s.id,
        subject: s.subject,
        questionCount: s.questionCount,
        chapterDistribution: { ...(s.chapterDistribution || {}) }
      })),
      excludeLastN,
      uniqueThreshold,
      irtProfile
    };

    const savedId = await saveExamPreset(newPreset);
    await loadPresets();
    setSelectedPresetId(String(savedId));
    setIsSavePresetModalOpen(false);
    setPresetNotice(`Exam Preset "${presetNameInput.trim()}" saved permanently! You will not need to re-add sections manually.`);
    setTimeout(() => setPresetNotice(null), 4000);
  };

  const handleOpenEditPreset = (presetToEdit?: ExamPreset) => {
    let target = presetToEdit;
    if (!target && selectedPresetId) {
      target = examPresets.find(p => String(p.id) === selectedPresetId);
    }
    if (!target) {
      target = {
        presetName: `${testName.replace(/Mock Test.*$/i, '').trim() || 'Custom'} Blueprint`,
        examName: testName.replace(/Mock Test.*$/i, '').trim() || 'Custom Exam',
        totalMarks,
        duration,
        sections: sections.map(s => ({ ...s })),
        excludeLastN,
        uniqueThreshold,
        irtProfile
      };
    }

    setEditingPreset(JSON.parse(JSON.stringify(target)));
    setIsEditPresetModalOpen(true);
  };

  const handleSaveEditedPreset = async (asNew: boolean = false) => {
    if (!editingPreset) return;
    if (!editingPreset.presetName.trim() || !editingPreset.examName.trim()) {
      alert('Please provide both Preset Display Title and Exam Name.');
      return;
    }
    if (!editingPreset.sections || editingPreset.sections.length === 0) {
      alert('Please add at least one section to the blueprint.');
      return;
    }

    const toSave: ExamPreset = {
      ...editingPreset,
      id: asNew ? undefined : editingPreset.id
    };

    const savedId = await saveExamPreset(toSave);
    await loadPresets();

    // Automatically apply the saved preset to generator form
    handleApplyPreset(toSave.id || savedId);

    setIsEditPresetModalOpen(false);
    setEditingPreset(null);
    setPresetNotice(`Exam Blueprint "${toSave.presetName}" saved permanently with ${toSave.sections.length} sections!`);
    setTimeout(() => setPresetNotice(null), 4000);
  };

  const handleDeletePreset = async (id: number) => {
    if (!confirm('Are you sure you want to delete this saved Exam Preset?')) return;
    await deleteExamPreset(id);
    await loadPresets();
    if (selectedPresetId === String(id)) setSelectedPresetId('');
  };

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

    // CRITICAL: Force yield execution to the browser event loop so React paints the GenerationProgressModal modal BEFORE heavy processing begins (even when DU-XQE is OFF)
    await new Promise(resolve => setTimeout(resolve, 200));

    const mockId = Date.now();
    const activeAiConfig = getStoredAiConfig();
    const startTime = Date.now();

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

      // Ensure processing animation modal displays for at least 2.2 seconds so user sees full stage animation even if DU-XQE is OFF
      const minAnimationMs = 2200;
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < minAnimationMs) {
        await new Promise(resolve => setTimeout(resolve, minAnimationMs - elapsedTime));
      }

      setIqseResult(result);

      const newMockItem: MockHistory = {
        mockId,
        testName,
        marks: totalMarks,
        duration,
        questionIds: result.selectedQuestions.map(q => q.id!).filter(Boolean),
        questions: result.selectedQuestions,
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

      {/* Preset Notice Alert */}
      {presetNotice && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center space-x-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{presetNotice}</span>
        </div>
      )}

      {/* Saved Exam Presets & Blueprints Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 p-4 rounded-2xl space-y-3 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <BookmarkCheck className="w-5 h-5 text-indigo-400 shrink-0" />
            <div>
              <h3 className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>Saved Exam Templates & Section Blueprints</span>
                <span className="text-[10px] bg-indigo-900/80 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-700">
                  {examPresets.length} Saved
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Select an exam preset to load exam name, marks, duration, and section subjects automatically without manual entry!
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleOpenSavePresetModal}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-sm transition-colors"
              title="Save current exam parameters and section rules as a reusable preset"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Current Setup as Exam Preset</span>
            </button>

            <button
              type="button"
              onClick={() => setIsManagePresetsOpen(true)}
              className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
              title="Manage or delete saved exam presets"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Manage</span>
            </button>
          </div>
        </div>

        {/* Preset Selector Dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pt-1">
          <label className="sm:col-span-3 text-xs text-slate-300 font-semibold flex items-center space-x-1.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>Load Exam Blueprint:</span>
          </label>
          <div className="sm:col-span-9 flex flex-col sm:flex-row items-center gap-2">
            <select
              value={selectedPresetId}
              onChange={e => handleApplyPreset(e.target.value)}
              className="flex-1 w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 text-xs focus:outline-none focus:border-indigo-500 font-medium"
            >
              <option value="">-- Choose Exam Preset (e.g. HP Home Guard, SSC CGL, HP Police) --</option>
              {examPresets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  📌 {preset.presetName} ({preset.examName}) - {preset.sections.length} Sections ({preset.sections.reduce((a, b) => a + b.questionCount, 0)} Qs, {preset.duration}m)
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => handleOpenEditPreset()}
              className="w-full sm:w-auto flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs shadow-sm transition-colors shrink-0"
              title="Edit selected exam blueprint structure, title, duration, marks, or section rules"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{selectedPresetId ? 'Edit Blueprint' : 'Create Blueprint'}</span>
            </button>
          </div>
        </div>
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

                  {/* Subject Input with datalist */}
                  <div className="flex-1 max-w-xs">
                    <label className="text-[10px] text-slate-500 block mb-0.5 font-medium">Subject Name</label>
                    <div className="relative">
                      <input
                        type="text"
                        list={`subject-datalist-${sec.id}`}
                        value={sec.subject}
                        onChange={e => updateSection(sec.id, 'subject', e.target.value)}
                        placeholder="Select or type subject..."
                        className="w-full bg-slate-900 border border-slate-700 text-white font-semibold text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500"
                      />
                      <datalist id={`subject-datalist-${sec.id}`}>
                        {allSelectableSubjects.map(sub => (
                          <option key={sub} value={sub} />
                        ))}
                      </datalist>
                    </div>
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
      <GenerationProgressModal
        isOpen={isGenerating}
        testName={testName}
        totalQuestions={sections.reduce((a, b) => a + (Number(b.questionCount) || 0), 0)}
        sectionsCount={sections.length}
        totalBankQuestions={questions.length}
        uniqueThreshold={uniqueThreshold}
        irtProfile={irtProfile}
        enableDUXQE={enableDUXQE}
      />

      {/* Modal: Save Current Exam Setup as Blueprint / Preset */}
      {isSavePresetModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <BookmarkCheck className="w-4 h-4 text-indigo-400" />
                <span>Save Exam Preset / Blueprint</span>
              </h3>
              <button
                onClick={() => setIsSavePresetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Save these test parameters & sections ({sections.length} section(s), {sections.reduce((a, b) => a + b.questionCount, 0)} questions, {duration} mins) as a reusable exam template.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Exam Name (Category)</label>
                <input
                  type="text"
                  value={examNameInput}
                  onChange={e => setExamNameInput(e.target.value)}
                  placeholder="e.g. HP Home Guard, SSC CGL, HP Police Constable"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-indigo-500 font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Preset Display Title</label>
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={e => setPresetNameInput(e.target.value)}
                  placeholder="e.g. HP Home Guard Standard Blueprint"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-[11px] text-slate-400">
                <div className="font-semibold text-slate-200">Included Sections:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {sections.map(s => (
                    <li key={s.id}>
                      <strong className="text-indigo-300">{s.subject}</strong>: {s.questionCount} Questions
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsSavePresetModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-2 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCurrentPreset}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Preset Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manage Saved Exam Presets */}
      {isManagePresetsOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Settings2 className="w-4 h-4 text-indigo-400" />
                <span>Manage Saved Exam Presets ({examPresets.length})</span>
              </h3>
              <button
                onClick={() => setIsManagePresetsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
              {examPresets.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">No saved exam presets found.</p>
              ) : (
                examPresets.map(preset => (
                  <div
                    key={preset.id}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white truncate">{preset.presetName}</span>
                        <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-mono">
                          {preset.examName}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {preset.sections.length} Sections ({preset.sections.map(s => `${s.subject}: ${s.questionCount}`).join(', ')}) • {preset.duration} mins • {preset.totalMarks} marks
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => {
                          handleApplyPreset(preset.id!);
                          setIsManagePresetsOpen(false);
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => {
                          setIsManagePresetsOpen(false);
                          handleOpenEditPreset(preset);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1"
                        title="Edit Blueprint Details & Sections"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => handleDeletePreset(preset.id!)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors border border-slate-800"
                        title="Delete Preset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsManagePresetsOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-5 py-2 rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Exam Blueprint / Preset Structure */}
      {isEditPresetModalOpen && editingPreset && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-blue-400" />
                <span>Edit Exam Blueprint & Section Structure</span>
              </h3>
              <button
                onClick={() => {
                  setIsEditPresetModalOpen(false);
                  setEditingPreset(null);
                }}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Modify the exam parameters, titles, and section-by-section subject rule distribution for this blueprint. Changes will be saved permanently in IndexedDB.
            </p>

            <div className="space-y-4 text-xs">
              {/* Preset Name & Exam Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Preset Display Title</label>
                  <input
                    type="text"
                    value={editingPreset.presetName}
                    onChange={e => setEditingPreset({ ...editingPreset, presetName: e.target.value })}
                    placeholder="e.g. HP Home Guard Official Blueprint"
                    className="w-full bg-slate-950 border border-slate-700 text-white font-bold rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Exam Name (Category)</label>
                  <input
                    type="text"
                    value={editingPreset.examName}
                    onChange={e => setEditingPreset({ ...editingPreset, examName: e.target.value })}
                    placeholder="e.g. HP Home Guard Exam 2026"
                    className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-bold rounded-xl p-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Total Maximum Marks</label>
                  <input
                    type="number"
                    value={editingPreset.totalMarks}
                    onChange={e => setEditingPreset({ ...editingPreset, totalMarks: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={editingPreset.duration}
                    onChange={e => setEditingPreset({ ...editingPreset, duration: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2 focus:outline-none focus:border-blue-500 font-bold"
                  />
                </div>
              </div>

              {/* Section Structure Editor */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-white">Blueprint Sections & Subject Rules ({editingPreset.sections?.length || 0})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newSec: SectionConfig = {
                        id: `sec_edit_${Date.now()}`,
                        subject: allSelectableSubjects[0] || 'General Knowledge',
                        questionCount: 15,
                        chapterDistribution: {}
                      };
                      setEditingPreset({
                        ...editingPreset,
                        sections: [...(editingPreset.sections || []), newSec]
                      });
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center space-x-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Section</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {(editingPreset.sections || []).map((sec, idx) => (
                    <div
                      key={sec.id || idx}
                      className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center space-x-2 flex-1">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-blue-400 border border-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>

                        <div className="flex-1">
                          <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">Subject Name</label>
                          <input
                            type="text"
                            list={`modal-subject-list-${idx}`}
                            value={sec.subject}
                            onChange={e => {
                              const updated = [...editingPreset.sections];
                              updated[idx] = { ...updated[idx], subject: e.target.value };
                              setEditingPreset({ ...editingPreset, sections: updated });
                            }}
                            className="w-full bg-slate-950 border border-slate-700 text-white font-semibold rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                            placeholder="e.g. General Knowledge"
                          />
                          <datalist id={`modal-subject-list-${idx}`}>
                            {allSelectableSubjects.map(sub => (
                              <option key={sub} value={sub} />
                            ))}
                          </datalist>
                        </div>

                        <div className="w-24 shrink-0">
                          <label className="text-[10px] text-slate-400 block mb-0.5 font-medium">Question Count</label>
                          <input
                            type="number"
                            min={1}
                            value={sec.questionCount}
                            onChange={e => {
                              const updated = [...editingPreset.sections];
                              updated[idx] = { ...updated[idx], questionCount: Number(e.target.value) };
                              setEditingPreset({ ...editingPreset, sections: updated });
                            }}
                            className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-bold rounded-lg p-2 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {editingPreset.sections.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = editingPreset.sections.filter((_, i) => i !== idx);
                            setEditingPreset({ ...editingPreset, sections: updated });
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
                          title="Delete section from blueprint"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span>Total Blueprint Questions:</span>
                  <strong className="text-emerald-400 text-xs font-bold">
                    {(editingPreset.sections || []).reduce((a, b) => a + (Number(b.questionCount) || 0), 0)} Questions
                  </strong>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsEditPresetModalOpen(false);
                  setEditingPreset(null);
                }}
                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs"
              >
                Cancel
              </button>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveEditedPreset(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-4 py-2 rounded-xl text-xs transition-colors"
                  title="Save as a brand new blueprint copy"
                >
                  Save as New Blueprint
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveEditedPreset(false)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center space-x-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Blueprint Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

