import React, { useState, useEffect, useMemo } from 'react';
import { Question } from '../types';
import { callAiExplain, callAiTranslateDualLanguage, directClientAiCall } from '../lib/aiClient';
import { sanitizeBilingualQuestionAndTranslation } from '../lib/exportUtils';
import { getAllQuestions } from '../lib/db';
import { McqInspectionModal, runStatic360Inspection } from './McqInspectionModal';
import { MathText } from './MathText';
import { MathToolbar } from './MathToolbar';
import {
  FileCheck,
  Plus,
  Trash2,
  Save,
  ArrowRight,
  Sparkles,
  Layers,
  Edit2,
  X,
  CheckCircle2,
  BookOpen,
  Languages,
  Loader2,
  ArrowUp,
  ArrowDown,
  Search,
  Filter,
  Database,
  Check,
  PlusCircle,
  FileText,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Move,
  ArrowLeftRight,
  RefreshCw
} from 'lucide-react';

interface TestPreviewViewProps {
  testQuestions: Question[];
  testName: string;
  totalMarks: number;
  duration: number;
  uniquenessScore?: number;
  allBankQuestions?: Question[];
  onUpdateTestQuestions: (qs: Question[]) => void;
  onNavigateToExport: () => void;
}

export const TestPreviewView: React.FC<TestPreviewViewProps> = ({
  testQuestions,
  testName,
  totalMarks,
  duration,
  uniquenessScore = 100,
  allBankQuestions = [],
  onUpdateTestQuestions,
  onNavigateToExport
}) => {
  const [questions, setQuestions] = useState<Question[]>(testQuestions);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSavingEdits, setIsSavingEdits] = useState<boolean>(false);
  const [selectedFilterSection, setSelectedFilterSection] = useState<string>('ALL');
  const [editingModalIndex, setEditingModalIndex] = useState<number | null>(null);
  const [generatingAiIdx, setGeneratingAiIdx] = useState<number | null>(null);

  // Quick Jump to Position state
  const [jumpModalIdx, setJumpModalIdx] = useState<number | null>(null);
  const [targetPosInput, setTargetPosInput] = useState<string>('');

  // Smart Swap State
  const [smartSwappingIdx, setSmartSwappingIdx] = useState<number | null>(null);

  // Dual Language Translation State
  const [isTranslatingBilingual, setIsTranslatingBilingual] = useState<boolean>(false);
  const [translatingSingleIdx, setTranslatingSingleIdx] = useState<number | null>(null);
  const [translationNotification, setTranslationNotification] = useState<string | null>(null);

  // MCQs Inspection Suite Modal State
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState<boolean>(false);

  // Quick 360 Inspection Stats for Badge
  const inspectionSummary = useMemo(() => {
    const items = runStatic360Inspection(questions);
    const criticals = items.filter(i => i.status === 'critical').length;
    const warnings = items.filter(i => i.status === 'warning').length;
    return { total: items.length, criticals, warnings };
  }, [questions]);

  // Bank Question Picker Modal State
  const [bankQuestions, setBankQuestions] = useState<Question[]>(allBankQuestions);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addModalTab, setAddModalTab] = useState<'bank' | 'manual'>('bank');
  const [selectedAddSubject, setSelectedAddSubject] = useState<string>('ALL');
  const [selectedAddChapter, setSelectedAddChapter] = useState<string>('ALL');
  const [addSearchQuery, setAddSearchQuery] = useState<string>('');
  const [addNotification, setAddNotification] = useState<string | null>(null);

  // Section Wise Distribution Summary
  const sectionWiseBreakdown = useMemo(() => {
    const map: Record<string, { count: number; chapters: Record<string, number> }> = {};
    questions.forEach(q => {
      const sub = (q.subject || 'General Knowledge').trim();
      const chap = (q.chapter || 'General').trim();
      if (!map[sub]) {
        map[sub] = { count: 0, chapters: {} };
      }
      map[sub].count += 1;
      map[sub].chapters[chap] = (map[sub].chapters[chap] || 0) + 1;
    });

    const total = questions.length;
    return Object.entries(map).map(([subject, data]) => ({
      subject,
      count: data.count,
      percent: total > 0 ? Math.round((data.count / total) * 100) : 0,
      chapters: Object.entries(data.chapters).map(([chap, cnt]) => ({ chapter: chap, count: cnt }))
    })).sort((a, b) => b.count - a.count);
  }, [questions]);

  // Filtered Questions list preserving original index
  const filteredQuestionsList = useMemo(() => {
    if (selectedFilterSection === 'ALL') {
      return questions.map((q, originalIndex) => ({ q, originalIndex }));
    }
    return questions
      .map((q, originalIndex) => ({ q, originalIndex }))
      .filter(item => (item.q.subject || '').trim().toLowerCase() === selectedFilterSection.trim().toLowerCase());
  }, [questions, selectedFilterSection]);

  // Custom question form state
  const [customSubject, setCustomSubject] = useState<string>('');
  const [customChapter, setCustomChapter] = useState<string>('General');

  useEffect(() => {
    if (allBankQuestions && allBankQuestions.length > 0) {
      setBankQuestions(allBankQuestions);
    } else {
      getAllQuestions().then(qs => {
        if (qs && qs.length > 0) {
          setBankQuestions(qs);
        }
      }).catch(() => {});
    }
  }, [allBankQuestions]);

  // Unique subjects and chapters from question bank
  const uniqueSubjects = useMemo(() => {
    const subs = new Set<string>();
    bankQuestions.forEach(q => {
      if (q.subject && q.subject.trim()) subs.add(q.subject.trim());
    });
    return Array.from(subs).sort();
  }, [bankQuestions]);

  const uniqueChapters = useMemo(() => {
    const chaps = new Set<string>();
    bankQuestions.forEach(q => {
      if (selectedAddSubject === 'ALL' || q.subject.trim().toLowerCase() === selectedAddSubject.toLowerCase()) {
        if (q.chapter && q.chapter.trim()) chaps.add(q.chapter.trim());
      }
    });
    return Array.from(chaps).sort();
  }, [bankQuestions, selectedAddSubject]);

  // Filtered bank questions for selector
  const filteredBankQuestions = useMemo(() => {
    return bankQuestions.filter(q => {
      if (selectedAddSubject !== 'ALL' && q.subject.trim().toLowerCase() !== selectedAddSubject.toLowerCase()) {
        return false;
      }
      if (selectedAddChapter !== 'ALL' && q.chapter.trim().toLowerCase() !== selectedAddChapter.toLowerCase()) {
        return false;
      }
      if (addSearchQuery.trim()) {
        const query = addSearchQuery.toLowerCase();
        const matchQ = q.question.toLowerCase().includes(query);
        const matchSub = q.subject.toLowerCase().includes(query);
        const matchChap = q.chapter.toLowerCase().includes(query);
        return matchQ || matchSub || matchChap;
      }
      return true;
    });
  }, [bankQuestions, selectedAddSubject, selectedAddChapter, addSearchQuery]);

  const isQuestionInTest = (bankQ: Question) => {
    if (bankQ.id !== undefined) {
      return questions.some(q => q.id === bankQ.id);
    }
    return questions.some(q => q.question.trim().toLowerCase() === bankQ.question.trim().toLowerCase());
  };

  const handleFieldChange = (index: number, field: keyof Question, value: any) => {
    setIsSaved(false);
    setQuestions(prev =>
      prev.map((q, i) => {
        if (i === index) {
          return { ...q, [field]: value, updatedDate: new Date().toISOString() };
        }
        return q;
      })
    );
  };

  const handleRemoveQuestion = (index: number) => {
    setIsSaved(false);
    setQuestions(prev => prev.filter((_, i) => i !== index));
    if (editingModalIndex === index) setEditingModalIndex(null);
  };

  // Reorder Up
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setIsSaved(false);
    const next = [...questions];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    setQuestions(next);
    onUpdateTestQuestions(next); // Auto-save new order for export
  };

  // Reorder Down
  const handleMoveDown = (index: number) => {
    if (index >= questions.length - 1) return;
    setIsSaved(false);
    const next = [...questions];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    setQuestions(next);
    onUpdateTestQuestions(next); // Auto-save new order for export
  };

  // Direct Jump to Position Handler
  const handleJumpToPosition = (fromIdx: number, new1BasedPosition: number) => {
    const toIdx = new1BasedPosition - 1;
    if (isNaN(toIdx) || toIdx < 0 || toIdx >= questions.length || fromIdx === toIdx) {
      setJumpModalIdx(null);
      return;
    }
    const updated = [...questions];
    const [movedItem] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, movedItem);

    setQuestions(updated);
    setIsSaved(false);
    onUpdateTestQuestions(updated); // Persist reordered array immediately for export!

    setAddNotification(`Question #${fromIdx + 1} moved to Position #${new1BasedPosition}! Order saved for export.`);
    setTimeout(() => setAddNotification(null), 3500);
    setJumpModalIdx(null);
  };

  // Smart Swap Handler: Replaces Q #idx with an unused MCQ from the SAME Subject & Chapter in Question Bank.
  // If no bank match exists, generates a brand new MCQ using AI for the exact same Subject & Chapter.
  const handleSmartSwap = async (idx: number) => {
    const targetQ = questions[idx];
    if (!targetQ) return;

    const sub = (targetQ.subject || '').trim();
    const chap = (targetQ.chapter || '').trim();
    const subLower = sub.toLowerCase();
    const chapLower = chap.toLowerCase();
    const diff = targetQ.difficulty || 'Moderate';

    // Current set of active question texts to avoid duplicate MCQs
    const activeQuestionTexts = new Set(questions.map(q => q.question.trim().toLowerCase()));

    // Pool of bank questions (combining prop & loaded DB questions)
    const combinedBank = [...allBankQuestions, ...(bankQuestions || [])];

    // Candidate Tier 1: Exact Subject AND Exact Chapter match from bank
    const tier1Candidates = combinedBank.filter(q => {
      const qText = q.question.trim().toLowerCase();
      if (activeQuestionTexts.has(qText)) return false;
      const qSub = (q.subject || '').trim().toLowerCase();
      const qChap = (q.chapter || '').trim().toLowerCase();
      return (qSub === subLower || !subLower) && (qChap === chapLower || !chapLower);
    });

    if (tier1Candidates.length > 0) {
      const selected = tier1Candidates[Math.floor(Math.random() * tier1Candidates.length)];
      const updated = [...questions];
      updated[idx] = selected;
      setQuestions(updated);
      setIsSaved(false);
      onUpdateTestQuestions(updated);

      setAddNotification(`🔄 Smart Swapped Q #${idx + 1} with an unused MCQ from "${sub || 'General'}" → "${chap || 'General'}"!`);
      setTimeout(() => setAddNotification(null), 3500);
      return;
    }

    // Candidate Tier 2: Same Subject match from bank (different chapter)
    const tier2Candidates = combinedBank.filter(q => {
      const qText = q.question.trim().toLowerCase();
      if (activeQuestionTexts.has(qText)) return false;
      const qSub = (q.subject || '').trim().toLowerCase();
      return qSub === subLower || !subLower;
    });

    if (tier2Candidates.length > 0) {
      const selected = tier2Candidates[Math.floor(Math.random() * tier2Candidates.length)];
      const updated = [...questions];
      updated[idx] = selected;
      setQuestions(updated);
      setIsSaved(false);
      onUpdateTestQuestions(updated);

      setAddNotification(`🔄 Smart Swapped Q #${idx + 1} with an unused MCQ from Subject "${sub || 'General'}"!`);
      setTimeout(() => setAddNotification(null), 3500);
      return;
    }

    // Candidate Tier 3: AI Generation for the exact Subject & Chapter
    try {
      setSmartSwappingIdx(idx);
      const systemInstruction = `You are an expert exam question author. Generate 1 high-quality Multiple Choice Question (MCQ) in JSON format.
Return ONLY valid JSON matching this schema:
{
  "question": "Question statement here",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "A",
  "explanation": "Brief explanation",
  "subject": "${sub || 'General'}",
  "chapter": "${chap || 'General'}",
  "difficulty": "${diff}"
}`;

      const prompt = `Generate a fresh, unique MCQ for Subject: "${sub || 'General'}", Chapter/Topic: "${chap || 'General'}", Difficulty: "${diff}". Ensure high accuracy and relevancy.`;

      const aiResponseText = await directClientAiCall(prompt, systemInstruction);
      let parsed: any;
      try {
        const cleanJson = aiResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (_e) {
        throw new Error('Failed to parse AI response as JSON.');
      }

      if (!parsed || !parsed.question) {
        throw new Error('AI generated incomplete MCQ payload.');
      }

      const opts = parsed.options || {};
      const newMcq: Question = {
        question: parsed.question,
        optionA: opts.A || parsed.optionA || 'Option A',
        optionB: opts.B || parsed.optionB || 'Option B',
        optionC: opts.C || parsed.optionC || 'Option C',
        optionD: opts.D || parsed.optionD || 'Option D',
        answer: (parsed.answer || 'A').toString().trim().toUpperCase().slice(0, 1) as 'A' | 'B' | 'C' | 'D',
        explanation: parsed.explanation || '',
        subject: parsed.subject || sub || 'General',
        chapter: parsed.chapter || chap || 'General',
        difficulty: (parsed.difficulty || diff || 'Moderate') as any,
        usageCount: 0,
        questionStatus: 'Fresh',
        chapterCoverageScore: 100,
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString()
      };

      const updated = [...questions];
      updated[idx] = newMcq;
      setQuestions(updated);
      setIsSaved(false);
      onUpdateTestQuestions(updated);

      setAddNotification(`✨ Smart Swapped Q #${idx + 1} with a newly AI-generated MCQ for "${sub || 'General'}" → "${chap || 'General'}"!`);
      setTimeout(() => setAddNotification(null), 3500);
    } catch (err: any) {
      console.error('Smart Swap AI error:', err);
      setAddNotification(`⚠️ Smart Swap error: ${err.message || 'Could not fetch replacement MCQ'}`);
      setTimeout(() => setAddNotification(null), 4000);
    } finally {
      setSmartSwappingIdx(null);
    }
  };

  // Insert question right under the last question of the same subject section
  const insertQuestionBySubject = (newQ: Question) => {
    setIsSaved(false);
    const targetSub = (newQ.subject || '').trim().toLowerCase();

    setQuestions(prev => {
      let lastIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if ((prev[i].subject || '').trim().toLowerCase() === targetSub) {
          lastIdx = i;
          break;
        }
      }

      const updated = [...prev];
      if (lastIdx !== -1) {
        updated.splice(lastIdx + 1, 0, newQ);
        setAddNotification(`Added question to "${newQ.subject}" section at position #${lastIdx + 2}!`);
      } else {
        updated.push(newQ);
        setAddNotification(`Added new section "${newQ.subject}" question at position #${updated.length}!`);
      }
      return updated;
    });

    setTimeout(() => setAddNotification(null), 3000);
  };

  const handleAddManualBlank = () => {
    const sub = customSubject.trim() || selectedAddSubject !== 'ALL' ? (customSubject.trim() || selectedAddSubject) : (questions[0]?.subject || 'General Knowledge');
    const chap = customChapter.trim() || (selectedAddChapter !== 'ALL' ? selectedAddChapter : 'General');

    const newQ: Question = {
      subject: sub,
      chapter: chap,
      question: 'Enter custom question statement here...',
      optionA: 'Option A text',
      optionB: 'Option B text',
      optionC: 'Option C text',
      optionD: 'Option D text',
      answer: 'A',
      explanation: 'Explanation / Solution step-by-step detailing why Option A is correct.',
      difficulty: 'Moderate',
      usageCount: 0,
      questionStatus: 'Fresh',
      chapterCoverageScore: 8,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString()
    };

    insertQuestionBySubject(newQ);
  };

  const handleSaveAll = async () => {
    setIsSavingEdits(true);
    await new Promise(r => setTimeout(r, 400));
    onUpdateTestQuestions(questions);
    setIsSavingEdits(false);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleAiExplainQuestion = async (index: number) => {
    const q = questions[index];
    if (!q) return;
    setGeneratingAiIdx(index);
    try {
      const explanations = await callAiExplain([q]);
      if (explanations && explanations[0]) {
        const item = explanations[0];
        const expStr = typeof item === 'string'
          ? item
          : (typeof item.explanation === 'string'
              ? item.explanation
              : (typeof item.explanation === 'object' && item.explanation !== null
                  ? ((item.explanation as any).text || (item.explanation as any).explanation || JSON.stringify(item.explanation))
                  : String(item.explanation || '')));
        handleFieldChange(index, 'explanation', expStr);
      }
    } catch (err: any) {
      alert('AI Explanation failed: ' + err.message);
    } finally {
      setGeneratingAiIdx(null);
    }
  };

  // Translate ALL questions in test paper to Dual Language (English + Hindi)
  const handleTranslateAllDualLanguage = async () => {
    if (questions.length === 0) return;
    setIsTranslatingBilingual(true);
    setTranslationNotification('Translating test paper MCQs to Dual Language (English + Hindi) via AI / DeepL API...');

    try {
      const results = await callAiTranslateDualLanguage(questions);
      if (results && results.length > 0) {
        setIsSaved(false);
        setQuestions(prev => prev.map((q, idx) => {
          const res = results.find(r => r.index === idx) || results[idx];
          if (!res || res.skippedLanguageSubject) return q;
          const sanitized = sanitizeBilingualQuestionAndTranslation(
            res.question || q.question,
            res.translation || q.translation
          );
          return {
            ...q,
            question: sanitized.question,
            translation: sanitized.translation,
            optionA: res.optionA || q.optionA,
            optionB: res.optionB || q.optionB,
            optionC: res.optionC || q.optionC,
            optionD: res.optionD || q.optionD,
            explanation: res.explanation || q.explanation,
            updatedDate: new Date().toISOString()
          };
        }));
        setTranslationNotification(`Successfully translated ${questions.length} MCQs into Dual Language (Hindi + English)!`);
      } else {
        setTranslationNotification('Translation returned no changes.');
      }
    } catch (err: any) {
      alert('Dual Language Translation failed: ' + (err.message || 'Unknown error'));
      setTranslationNotification(null);
    } finally {
      setIsTranslatingBilingual(false);
      setTimeout(() => setTranslationNotification(null), 5000);
    }
  };

  // Translate a single question to Dual Language
  const handleTranslateSingleDualLanguage = async (idx: number) => {
    const q = questions[idx];
    if (!q) return;
    setTranslatingSingleIdx(idx);
    try {
      const results = await callAiTranslateDualLanguage([q]);
      if (results && results[0]) {
        const res = results[0];
        if (res.skippedLanguageSubject) {
          alert('This question belongs to a Language/Grammar subject and was skipped to preserve original text.');
          return;
        }
        setIsSaved(false);
        setQuestions(prev => prev.map((item, i) => {
          if (i === idx) {
            const sanitized = sanitizeBilingualQuestionAndTranslation(
              res.question || item.question,
              res.translation || item.translation
            );
            return {
              ...item,
              question: sanitized.question,
              translation: sanitized.translation,
              optionA: res.optionA || item.optionA,
              optionB: res.optionB || item.optionB,
              optionC: res.optionC || item.optionC,
              optionD: res.optionD || item.optionD,
              explanation: res.explanation || item.explanation,
              updatedDate: new Date().toISOString()
            };
          }
          return item;
        }));
        setTranslationNotification(`Question #${idx + 1} translated to Dual Language!`);
        setTimeout(() => setTranslationNotification(null), 4000);
      }
    } catch (err: any) {
      alert('Single Question Translation failed: ' + (err.message || 'Unknown error'));
    } finally {
      setTranslatingSingleIdx(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <FileCheck className="w-5 h-5 text-blue-400" />
            <span>Interactive Test Paper Editor</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review and fine-tune questions, edit options, reorder question positions with arrows, and select questions from Question Bank.
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-2">
          {/* Dual Language Translation Button */}
          <button
            onClick={handleTranslateAllDualLanguage}
            disabled={isTranslatingBilingual}
            className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-md border border-indigo-400/30 disabled:opacity-50"
            title="Auto translate all MCQs into Dual Language (English + Hindi)"
          >
            {isTranslatingBilingual ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-indigo-200" />
                <span>Translating All...</span>
              </>
            ) : (
              <>
                <Languages className="w-4 h-4 text-indigo-200" />
                <span>Dual Language Translate</span>
              </>
            )}
          </button>

          {/* 360° MCQs Inspection Suite Button */}
          <button
            onClick={() => setIsInspectionModalOpen(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 hover:from-purple-600 hover:to-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md border border-purple-500/40 relative group"
            title="Inspect selected MCQs with 360° quality verification & AI auditor"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <span>MCQs Inspection</span>
            {inspectionSummary.criticals > 0 ? (
              <span className="bg-rose-500 text-white text-[10px] font-extrabold px-1.5 py-0.2 rounded-full animate-pulse">
                {inspectionSummary.criticals} Flagged
              </span>
            ) : inspectionSummary.warnings > 0 ? (
              <span className="bg-amber-500 text-black text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                {inspectionSummary.warnings} Warnings
              </span>
            ) : (
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-500/40">
                100% Verified
              </span>
            )}
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </button>

          <button
            onClick={handleSaveAll}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            <Save className="w-4 h-4 text-emerald-400" />
            <span>{isSaved ? 'Saved!' : 'Save All Edits'}</span>
          </button>

          <button
            onClick={() => {
              handleSaveAll();
              onNavigateToExport();
            }}
            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-md transition-colors"
          >
            <span>Proceed to Export</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Dual Language Translation Notification Bar */}
      {translationNotification && (
        <div className="bg-indigo-950/80 border border-indigo-500/50 text-indigo-200 text-xs p-3.5 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-2">
            {isTranslatingBilingual ? (
              <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            ) : (
              <Languages className="w-4 h-4 text-indigo-400" />
            )}
            <span className="font-semibold">{translationNotification}</span>
          </div>
          <button onClick={() => setTranslationNotification(null)} className="text-indigo-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Meta Bar */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Test Paper Title</span>
          <h3 className="text-sm font-bold text-white">{testName}</h3>
        </div>

        <div className="flex items-center space-x-6 text-xs flex-wrap gap-3">
          <div>
            <span className="text-slate-400 block text-[10px]">Total Items</span>
            <strong className="text-white">{questions.length} MCQs</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Total Sections</span>
            <strong className="text-indigo-400">{sectionWiseBreakdown.length} Sections</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Total Marks</span>
            <strong className="text-blue-400">{totalMarks} Marks</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Time Allowed</span>
            <strong className="text-purple-400">{duration} Mins</strong>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">IQSE Uniqueness</span>
            <strong className="text-emerald-400">{uniquenessScore}%</strong>
          </div>
        </div>
      </div>

      {/* Section-wise Number of MCQs List / Distribution Summary */}
      <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>Section-wise MCQ Distribution (भाग अनुसार प्रश्न संख्या)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Breakdown of total MCQs per section in this mock test paper. Click any section card to filter questions below.
            </p>
          </div>

          {selectedFilterSection !== 'ALL' && (
            <button
              onClick={() => setSelectedFilterSection('ALL')}
              className="bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/80 text-xs px-3 py-1 rounded-lg font-semibold transition-colors flex items-center space-x-1"
            >
              <span>Show All Sections ({questions.length} MCQs)</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sectionWiseBreakdown.map((sec, idx) => {
            const isSelected = selectedFilterSection === sec.subject;
            const badgeColors = [
              'bg-blue-950 text-blue-300 border-blue-800/80',
              'bg-purple-950 text-purple-300 border-purple-800/80',
              'bg-emerald-950 text-emerald-300 border-emerald-800/80',
              'bg-amber-950 text-amber-300 border-amber-800/80',
              'bg-rose-950 text-rose-300 border-rose-800/80',
              'bg-cyan-950 text-cyan-300 border-cyan-800/80'
            ];
            const badgeStyle = badgeColors[idx % badgeColors.length];

            return (
              <div
                key={sec.subject}
                onClick={() => setSelectedFilterSection(isSelected ? 'ALL' : sec.subject)}
                className={`cursor-pointer rounded-xl p-3.5 border transition-all relative overflow-hidden group ${
                  isSelected
                    ? 'bg-blue-900/40 border-blue-400 ring-2 ring-blue-500/50 shadow-lg'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Section #{idx + 1}</span>
                    <h4 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors line-clamp-1">
                      {sec.subject}
                    </h4>
                  </div>
                  <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${badgeStyle}`}>
                    {sec.count} MCQs
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden my-2">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${sec.percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Weightage: <strong className="text-slate-200">{sec.percent}%</strong></span>
                  <span>{sec.chapters.length} Topic(s)</span>
                </div>

                {/* Chapter breakdown pills */}
                {sec.chapters.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pt-2 mt-1 border-t border-slate-800/60">
                    {sec.chapters.slice(0, 3).map(ch => (
                      <span key={ch.chapter} className="text-[9px] bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                        {ch.chapter}: <strong className="text-blue-400">{ch.count}</strong>
                      </span>
                    ))}
                    {sec.chapters.length > 3 && (
                      <span className="text-[9px] text-slate-500">+{sec.chapters.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Notification Toast */}
      {addNotification && (
        <div className="bg-emerald-950/90 border border-emerald-600/50 text-emerald-200 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold">{addNotification}</span>
          </div>
          <button onClick={() => setAddNotification(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Questions List Editable Cards */}
      {questions.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
          <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No questions in test paper.</p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-3 inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add First Question</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Position Reorder Notice */}
          <div className="bg-slate-950/90 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs text-slate-300 shadow-sm">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <span>
                <strong className="text-purple-300">Smart Question Swap:</strong> Click <strong className="text-purple-300 bg-purple-950 border border-purple-800 px-1.5 py-0.5 rounded text-[11px]">🔄 Smart Swap</strong> on any question to replace it with another MCQ from the same Subject & Chapter (from Bank or AI generated), or use <strong className="text-blue-300 bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded font-mono text-[11px]">Move to #</strong> / <span className="bg-slate-900 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono text-[11px]">▲ / ▼</span> to reorder!
              </span>
            </div>
            <span className="hidden md:inline-block text-[10px] bg-blue-950 text-blue-300 px-2.5 py-1 rounded-md border border-blue-800 font-semibold whitespace-nowrap">
              {questions.length} MCQs Auto-Saved
            </span>
          </div>

          {filteredQuestionsList.map(({ q, originalIndex: idx }) => (
            <div
              key={idx}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-5 rounded-2xl space-y-4 transition-all shadow-sm relative"
            >
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-3 flex-wrap gap-2">
                  <div className="flex items-center space-x-1.5">
                    {/* Q # Badge */}
                    <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                      <span className="text-xs font-bold text-white">Q #{idx + 1}</span>
                    </div>

                    {/* Up / Down Arrow Position Controls */}
                    <div className="flex items-center space-x-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(idx)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-blue-400 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors"
                        title="Move Question Up (▲)"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(idx)}
                        disabled={idx === questions.length - 1}
                        className="p-1 text-slate-400 hover:text-blue-400 disabled:opacity-20 disabled:hover:text-slate-400 rounded transition-colors"
                        title="Move Question Down (▼)"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Jump to Position Popover Trigger */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setJumpModalIdx(jumpModalIdx === idx ? null : idx);
                          setTargetPosInput((idx + 1).toString());
                        }}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-blue-300 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1"
                        title="Jump question directly to specific position number (e.g. Move to #15)"
                      >
                        <Move className="w-3 h-3 text-blue-400" />
                        <span className="hidden sm:inline">Move to #</span>
                      </button>

                      {jumpModalIdx === idx && (
                        <div className="absolute top-full left-0 mt-1 bg-slate-950 border border-blue-500/80 p-2.5 rounded-xl shadow-2xl z-30 flex items-center space-x-2 animate-in fade-in zoom-in-95">
                          <span className="text-[11px] text-slate-300 font-medium whitespace-nowrap">Target Pos:</span>
                          <input
                            type="number"
                            min={1}
                            max={questions.length}
                            value={targetPosInput}
                            onChange={e => setTargetPosInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                handleJumpToPosition(idx, parseInt(targetPosInput, 10));
                              }
                            }}
                            className="w-14 bg-slate-900 border border-slate-700 text-white text-xs rounded px-2 py-1 font-bold text-center focus:outline-none focus:border-blue-400"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleJumpToPosition(idx, parseInt(targetPosInput, 10))}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-1 rounded font-bold transition-colors"
                          >
                            Go
                          </button>
                          <button
                            type="button"
                            onClick={() => setJumpModalIdx(null)}
                            className="text-slate-400 hover:text-white p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={q.subject}
                      onChange={e => handleFieldChange(idx, 'subject', e.target.value)}
                      placeholder="Subject"
                      className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-blue-500 font-semibold"
                    />
                    <span className="text-slate-600">•</span>
                    <input
                      type="text"
                      value={q.chapter}
                      onChange={e => handleFieldChange(idx, 'chapter', e.target.value)}
                      placeholder="Chapter"
                      className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={q.difficulty}
                    onChange={e => handleFieldChange(idx, 'difficulty', e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded px-2 py-1"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleSmartSwap(idx)}
                    disabled={smartSwappingIdx === idx}
                    className="px-2.5 py-1.5 bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-700/80 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 disabled:opacity-50 hover:scale-[1.02] shadow-sm"
                    title={`Smart Swap this question with another question from Subject "${q.subject || 'Same'}" → Chapter "${q.chapter || 'Same'}" (from Question Bank or AI generated)`}
                  >
                    {smartSwappingIdx === idx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-purple-300" />
                    )}
                    <span>Smart Swap</span>
                  </button>

                  <button
                    onClick={() => handleTranslateSingleDualLanguage(idx)}
                    disabled={translatingSingleIdx === idx || isTranslatingBilingual}
                    className="p-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 rounded-lg text-xs transition-colors flex items-center space-x-1 disabled:opacity-50"
                    title="Translate this MCQ into Dual Language (English + Hindi)"
                  >
                    {translatingSingleIdx === idx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    ) : (
                      <Languages className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    <span className="hidden sm:inline">Dual Translate</span>
                  </button>

                  <button
                    onClick={() => setEditingModalIndex(idx)}
                    className="p-1.5 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 rounded-lg text-xs transition-colors flex items-center space-x-1"
                    title="Open Full Edit Modal"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Edit Modal</span>
                  </button>

                  <button
                    onClick={() => handleRemoveQuestion(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                    title="Remove Question from Test"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Question Textarea & Math Toolbar */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-medium block">Question Statement</label>
                <textarea
                  rows={2}
                  value={q.question}
                  onChange={e => handleFieldChange(idx, 'question', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-sans"
                />
                <MathToolbar
                  value={q.question}
                  onChange={val => handleFieldChange(idx, 'question', val)}
                  compact={true}
                />
                {q.question && (q.question.includes('^') || q.question.includes('$') || q.question.includes('√')) && (
                  <div className="p-2 bg-slate-950/80 border border-blue-900/40 rounded-lg text-xs text-blue-200 space-x-1">
                    <span className="text-[10px] text-blue-400 font-bold">Math Preview:</span>
                    <MathText text={q.question} />
                  </div>
                )}
              </div>

              {/* Hindi / Dual Language Translation Textarea */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-medium block flex items-center space-x-1">
                  <Languages className="w-3 h-3 text-indigo-400" />
                  <span>Hindi Translation (Optional)</span>
                </label>
                <input
                  type="text"
                  value={q.translation || ''}
                  onChange={e => handleFieldChange(idx, 'translation', e.target.value)}
                  placeholder="हिंदी अनुवाद दर्ज करें..."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-300 text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-sans"
                />
                {q.translation && (q.translation.includes('^') || q.translation.includes('$') || q.translation.includes('√')) && (
                  <div className="p-2 bg-slate-950/80 border border-indigo-900/40 rounded-lg text-xs text-indigo-200 space-x-1">
                    <span className="text-[10px] text-indigo-400 font-bold">Hindi Math Preview:</span>
                    <MathText text={q.translation} />
                  </div>
                )}
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Option A</label>
                  <input
                    type="text"
                    value={q.optionA}
                    onChange={e => handleFieldChange(idx, 'optionA', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Option B</label>
                  <input
                    type="text"
                    value={q.optionB}
                    onChange={e => handleFieldChange(idx, 'optionB', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Option C</label>
                  <input
                    type="text"
                    value={q.optionC}
                    onChange={e => handleFieldChange(idx, 'optionC', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">Option D</label>
                  <input
                    type="text"
                    value={q.optionD}
                    onChange={e => handleFieldChange(idx, 'optionD', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Correct Answer & Explanation Section */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-slate-300 font-semibold">Correct Answer:</span>
                    {(['A', 'B', 'C', 'D'] as const).map(letter => (
                      <label key={letter} className="inline-flex items-center space-x-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`ans_${idx}`}
                          checked={q.answer === letter}
                          onChange={() => handleFieldChange(idx, 'answer', letter)}
                          className="text-blue-600 bg-slate-900 border-slate-700 focus:ring-0"
                        />
                        <span
                          className={`text-xs font-bold ${
                            q.answer === letter ? 'text-blue-400' : 'text-slate-400'
                          }`}
                        >
                          Option {letter}
                        </span>
                      </label>
                    ))}
                  </div>

                  <button
                    onClick={() => handleAiExplainQuestion(idx)}
                    disabled={generatingAiIdx === idx}
                    className="text-[11px] bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center space-x-1"
                  >
                    {generatingAiIdx === idx ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>AI Generate Explanation</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Explanation Textarea & Live Math Formatting */}
                <div className="space-y-2">
                  <label className="text-[10px] text-purple-300 font-semibold block flex items-center space-x-1">
                    <BookOpen className="w-3 h-3 text-purple-400" />
                    <span>Detailed Explanation / Solution Text</span>
                  </label>
                  <textarea
                    rows={2}
                    value={q.explanation || ''}
                    onChange={e => handleFieldChange(idx, 'explanation', e.target.value)}
                    placeholder="Enter detailed step-by-step Hindi / English explanation for the answer key..."
                    className="w-full bg-slate-950 border border-purple-900/60 text-purple-100 text-xs rounded-xl p-2.5 focus:outline-none focus:border-purple-500 font-sans"
                  />

                  <MathToolbar
                    value={q.explanation || ''}
                    onChange={val => handleFieldChange(idx, 'explanation', val)}
                    compact={true}
                  />

                  {q.explanation && (
                    <div className="p-3 bg-purple-950/40 border border-purple-800/60 rounded-xl space-y-1">
                      <div className="text-[10px] font-bold text-purple-300 tracking-wider uppercase flex items-center space-x-1">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        <span>Formatted Solution / Explanation Preview:</span>
                      </div>
                      <div className="text-xs text-purple-100 leading-relaxed font-sans">
                        <MathText text={q.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Question Selector Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e1230] border border-[#2d3a8c] rounded-2xl p-6 max-w-3xl w-full space-y-4 shadow-2xl relative my-8 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <Database className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Add Question to Test Paper</h3>
                  <p className="text-[11px] text-slate-400">
                    Questions are automatically placed under the last question of their section.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800 flex-shrink-0">
              <button
                onClick={() => setAddModalTab('bank')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                  addModalTab === 'bank'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>Select from Question Bank ({filteredBankQuestions.length})</span>
              </button>

              <button
                onClick={() => setAddModalTab('manual')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                  addModalTab === 'manual'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create Custom Blank Question</span>
              </button>
            </div>

            {/* Notification Bar inside Modal */}
            {addNotification && (
              <div className="bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs px-3.5 py-2 rounded-xl flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold">{addNotification}</span>
                </div>
              </div>
            )}

            {addModalTab === 'bank' ? (
              <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                {/* Filters Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-shrink-0">
                  {/* Subject Dropdown */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">Section / Subject</label>
                    <select
                      value={selectedAddSubject}
                      onChange={e => {
                        setSelectedAddSubject(e.target.value);
                        setSelectedAddChapter('ALL');
                      }}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl p-2 focus:outline-none focus:border-blue-500 font-semibold"
                    >
                      <option value="ALL">All Subjects ({uniqueSubjects.length})</option>
                      {uniqueSubjects.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  {/* Chapter Dropdown */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">Chapter / Topic</label>
                    <select
                      value={selectedAddChapter}
                      onChange={e => setSelectedAddChapter(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl p-2 focus:outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="ALL">All Chapters ({uniqueChapters.length})</option>
                      {uniqueChapters.map(chap => (
                        <option key={chap} value={chap}>{chap}</option>
                      ))}
                    </select>
                  </div>

                  {/* Search Input */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1">Search Keywords</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={addSearchQuery}
                        onChange={e => setAddSearchQuery(e.target.value)}
                        placeholder="Search question..."
                        className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Questions List */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 my-2">
                  {filteredBankQuestions.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl">
                      <p className="text-xs text-slate-400">No matching questions found in Question Bank.</p>
                    </div>
                  ) : (
                    filteredBankQuestions.map((bq, bIdx) => {
                      const inTest = isQuestionInTest(bq);
                      return (
                        <div
                          key={bq.id || bIdx}
                          className={`p-3.5 rounded-xl border text-xs transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                            inTest
                              ? 'bg-slate-950/60 border-slate-800/80 opacity-75'
                              : 'bg-slate-900 border-slate-800 hover:border-blue-800/80'
                          }`}
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center space-x-2 flex-wrap gap-1">
                              <span className="bg-blue-950 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                                {bq.subject}
                              </span>
                              {bq.chapter && (
                                <span className="text-slate-400 text-[10px]">
                                  • {bq.chapter}
                                </span>
                              )}
                              {bq.difficulty && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  bq.difficulty === 'Easy'
                                    ? 'bg-emerald-950 text-emerald-400'
                                    : bq.difficulty === 'Moderate'
                                    ? 'bg-amber-950 text-amber-400'
                                    : 'bg-rose-950 text-rose-400'
                                }`}>
                                  {bq.difficulty}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-200 font-medium line-clamp-2">
                              {bq.question}
                            </p>
                          </div>

                          <div className="flex-shrink-0">
                            {inTest ? (
                              <div className="inline-flex items-center space-x-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-3 py-1.5 rounded-lg text-xs font-semibold">
                                <Check className="w-3.5 h-3.5" />
                                <span>In Test Paper</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => insertQuestionBySubject(bq)}
                                className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+ Add to Test</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Manual Blank Question Tab */
              <div className="space-y-4 py-2 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Target Section / Subject</label>
                    <input
                      type="text"
                      value={customSubject}
                      onChange={e => setCustomSubject(e.target.value)}
                      placeholder={selectedAddSubject !== 'ALL' ? selectedAddSubject : 'e.g. English Grammar, General Knowledge'}
                      className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-slate-300 font-semibold block mb-1">Target Chapter / Topic</label>
                    <input
                      type="text"
                      value={customChapter}
                      onChange={e => setCustomChapter(e.target.value)}
                      placeholder="e.g. Tenses, Himachal Rivers, Algebra"
                      className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-slate-300">
                  <p className="font-semibold text-blue-400 flex items-center space-x-1.5">
                    <FileText className="w-4 h-4" />
                    <span>How Custom Insertion Works:</span>
                  </p>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    When you click "Add Custom Question", a new blank question form will be inserted directly under the last question of section <strong className="text-white">"{customSubject.trim() || selectedAddSubject}"</strong>. You can then edit its statement, options, correct answer, and explanation.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleAddManualBlank}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Custom Question Structure</span>
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end border-t border-slate-800 pt-3 flex-shrink-0">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Edit Focused Modal */}
      {editingModalIndex !== null && questions[editingModalIndex] && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e1230] border border-[#2d3a8c] rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>Edit Question #{editingModalIndex + 1} Details</span>
              </h3>
              <button
                onClick={() => setEditingModalIndex(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Subject</label>
                  <input
                    type="text"
                    value={questions[editingModalIndex].subject}
                    onChange={e => handleFieldChange(editingModalIndex, 'subject', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Chapter</label>
                  <input
                    type="text"
                    value={questions[editingModalIndex].chapter}
                    onChange={e => handleFieldChange(editingModalIndex, 'chapter', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-medium block mb-1">Difficulty</label>
                  <select
                    value={questions[editingModalIndex].difficulty}
                    onChange={e => handleFieldChange(editingModalIndex, 'difficulty', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Question Text</label>
                <textarea
                  rows={3}
                  value={questions[editingModalIndex].question}
                  onChange={e => handleFieldChange(editingModalIndex, 'question', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl p-3 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold block">Hindi / Dual Language Translation</label>
                  <button
                    type="button"
                    onClick={() => handleTranslateSingleDualLanguage(editingModalIndex)}
                    disabled={translatingSingleIdx === editingModalIndex}
                    className="text-[11px] bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center space-x-1 disabled:opacity-50"
                  >
                    {translatingSingleIdx === editingModalIndex ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                        <span>Translating...</span>
                      </>
                    ) : (
                      <>
                        <Languages className="w-3 h-3 text-indigo-400" />
                        <span>AI Dual Language Translate</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  value={questions[editingModalIndex].translation || ''}
                  onChange={e => handleFieldChange(editingModalIndex, 'translation', e.target.value)}
                  placeholder="हिंदी अनुवाद..."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Option A</label>
                  <input
                    type="text"
                    value={questions[editingModalIndex].optionA}
                    onChange={e => handleFieldChange(editingModalIndex, 'optionA', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Option B</label>
                  <input
                    type="text"
                    value={questions[editingModalIndex].optionB}
                    onChange={e => handleFieldChange(editingModalIndex, 'optionB', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Option C</label>
                  <input
                    type="text"
                    value={questions[editingModalIndex].optionC}
                    onChange={e => handleFieldChange(editingModalIndex, 'optionC', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Option D</label>
                  <input
                    type="text"
                    value={questions[editingModalIndex].optionD}
                    onChange={e => handleFieldChange(editingModalIndex, 'optionD', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Correct Answer</label>
                <div className="flex items-center space-x-4 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  {(['A', 'B', 'C', 'D'] as const).map(letter => (
                    <label key={letter} className="inline-flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`modal_ans_${editingModalIndex}`}
                        checked={questions[editingModalIndex].answer === letter}
                        onChange={() => handleFieldChange(editingModalIndex, 'answer', letter)}
                        className="text-blue-600 bg-slate-900 border-slate-700"
                      />
                      <span className="font-bold text-slate-200">Option {letter}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-purple-300 font-bold block flex items-center justify-between">
                  <span>Explanation / Solution</span>
                  <span className="text-[10px] text-purple-400 font-normal">Supports powers (2^7 → 2⁷), KaTeX ($x^2$), formulas</span>
                </label>
                <textarea
                  rows={3}
                  value={questions[editingModalIndex].explanation || ''}
                  onChange={e => handleFieldChange(editingModalIndex, 'explanation', e.target.value)}
                  placeholder="Detailed explanation..."
                  className="w-full bg-slate-950 border border-purple-900 text-purple-100 text-xs rounded-xl p-3 focus:outline-none focus:border-purple-500 font-sans"
                />

                <MathToolbar
                  value={questions[editingModalIndex].explanation || ''}
                  onChange={val => handleFieldChange(editingModalIndex, 'explanation', val)}
                  compact={false}
                />

                {questions[editingModalIndex].explanation && (
                  <div className="p-3 bg-purple-950/60 border border-purple-800 rounded-xl space-y-1">
                    <div className="text-[10px] font-bold text-purple-300 tracking-wider uppercase flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Live Formatted Math Preview:</span>
                    </div>
                    <div className="text-xs text-purple-100 leading-relaxed font-sans">
                      <MathText text={questions[editingModalIndex].explanation || ''} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingModalIndex(null)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center space-x-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Done Editing</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Processing Overlay for Save Edits */}
      {isSavingEdits && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1230] border border-blue-500/40 p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-3 max-w-sm w-full text-center animate-in fade-in zoom-in-95">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
              <Sparkles className="w-5 h-5 text-blue-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Saving Test Paper Modifications...</h3>
              <p className="text-xs text-slate-400 mt-1">Updating section sequence and synchronizing test paper records.</p>
            </div>
          </div>
        </div>
      )}

      {/* Floating Processing Indicator for AI Explanation Generation */}
      {generatingAiIdx !== null && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0e1230] border border-purple-500/60 p-4 rounded-2xl shadow-2xl flex items-center space-x-3 text-white animate-in slide-in-from-bottom-5">
          <div className="relative flex-shrink-0">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            <Sparkles className="w-3 h-3 text-purple-300 absolute inset-0 m-auto animate-pulse" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-purple-200">AI Explanation in Progress...</h4>
            <p className="text-[11px] text-purple-300">Generating step-by-step bilingual solution for Question #{generatingAiIdx + 1}...</p>
          </div>
        </div>
      )}

      {/* 360° MCQs Quality Inspection Suite Modal */}
      <McqInspectionModal
        questions={questions}
        allBankQuestions={allBankQuestions}
        testName={testName}
        isOpen={isInspectionModalOpen}
        onClose={() => setIsInspectionModalOpen(false)}
        onUpdateQuestion={(idx, updatedQ) => {
          setIsSaved(false);
          setQuestions(prev => {
            const next = [...prev];
            next[idx] = updatedQ;
            return next;
          });
        }}
        onReplaceQuestion={(idx, newQ) => {
          setIsSaved(false);
          setQuestions(prev => {
            const next = [...prev];
            next[idx] = newQ;
            return next;
          });
        }}
        onUpdateAllQuestions={(updatedList) => {
          setIsSaved(false);
          setQuestions(updatedList);
        }}
      />
    </div>
  );
};
