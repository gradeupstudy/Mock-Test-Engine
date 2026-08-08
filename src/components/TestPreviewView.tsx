import React, { useState, useEffect, useMemo } from 'react';
import { Question, MockHistory } from '../types';
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
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// Helper: Extract Exam Category Name from Test Title (e.g. "HP Home Guard Mock Test - 24" -> "HP Home Guard")
export function extractExamCategory(title: string): string {
  if (!title) return 'General Exam';
  let t = title.trim();
  // Remove trailing numbers or series indicators, e.g. "- 24", "#24", "01", "24"
  t = t.replace(/(?:[-#:]\s*|\s+)\d+\s*$/i, '');
  // Remove common mock test suffixes
  t = t.replace(/\s*\b(Mock\s*Test|Mock\s*Paper|Mock|Test\s*Paper|Practice\s*Set|Test|Set|Paper|Series)\b.*$/i, '');
  // Remove trailing dashes/colons/whitespace
  t = t.replace(/[-#:]+$/, '').trim();
  return t || title.trim();
}

interface TestPreviewViewProps {
  testQuestions: Question[];
  testName: string;
  totalMarks: number;
  duration: number;
  uniquenessScore?: number;
  allBankQuestions?: Question[];
  mockHistory?: MockHistory[];
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
  mockHistory = [],
  onUpdateTestQuestions,
  onNavigateToExport
}) => {
  const [questions, setQuestions] = useState<Question[]>(testQuestions);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    if (testQuestions && testQuestions.length > 0) {
      setQuestions(testQuestions);
    }
  }, [testQuestions]);
  const [isSavingEdits, setIsSavingEdits] = useState<boolean>(false);
  const [selectedFilterSection, setSelectedFilterSection] = useState<string>('ALL');
  const [editingModalIndex, setEditingModalIndex] = useState<number | null>(null);
  const [generatingAiIdx, setGeneratingAiIdx] = useState<number | null>(null);

  // Quick Jump to Position state
  const [jumpModalIdx, setJumpModalIdx] = useState<number | null>(null);
  const [targetPosInput, setTargetPosInput] = useState<string>('');

  // Smart Swap & Swipe Deck State
  const [smartSwappingIdx, setSmartSwappingIdx] = useState<number | null>(null);
  const [swipeDeckIdx, setSwipeDeckIdx] = useState<number | null>(null);
  const [swipeCandidatePos, setSwipeCandidatePos] = useState<number>(0);
  const [isGeneratingSwipeAi, setIsGeneratingSwipeAi] = useState<boolean>(false);

  // Uniqueness Filter State
  const [selectedUniquenessFilter, setSelectedUniquenessFilter] = useState<'ALL' | 'FRESH' | 'USED' | 'REPEATED'>('ALL');

  // Uniqueness Detail Modal State
  const [uniquenessDetailModal, setUniquenessDetailModal] = useState<{
    question: Question;
    questionIndex: number;
  } | null>(null);

  // Dual Language Translation State
  const [isTranslatingBilingual, setIsTranslatingBilingual] = useState<boolean>(false);
  const [translatingSingleIdx, setTranslatingSingleIdx] = useState<number | null>(null);
  const [translationNotification, setTranslationNotification] = useState<string | null>(null);

  // MCQs Inspection Suite Modal State
  const [isInspectionModalOpen, setIsInspectionModalOpen] = useState<boolean>(false);

  const currentExamCategory = useMemo(() => extractExamCategory(testName), [testName]);

  // Helper: Calculate question uniqueness details and past mock paper matches
  const getQuestionUniquenessDetails = (q: Question) => {
    // Exclude the current active mock test paper currently being created/previewed
    const pastMocks = (mockHistory || []).filter(m => {
      if (!testName) return true;
      const mName = (m.testName || '').trim().toLowerCase();
      const currentName = testName.trim().toLowerCase();
      // Exclude exact match of current test name
      if (mName === currentName) return false;
      return true;
    });

    const matchedMocks = pastMocks.filter(m => {
      if (q.id !== undefined && m.questionIds && m.questionIds.map(String).includes(String(q.id))) {
        return true;
      }
      if (m.questions && Array.isArray(m.questions)) {
        return m.questions.some(mq =>
          (q.id !== undefined && String(mq.id) === String(q.id)) ||
          (mq.question && q.question && mq.question.trim().toLowerCase() === q.question.trim().toLowerCase())
        );
      }
      return false;
    });

    // Group matched past mocks into Same Exam vs Other Exams
    const sameExamMocks: MockHistory[] = [];
    const otherExamMocks: MockHistory[] = [];

    matchedMocks.forEach(m => {
      const cat = extractExamCategory(m.testName || '');
      if (cat.toLowerCase() === currentExamCategory.toLowerCase()) {
        sameExamMocks.push(m);
      } else {
        otherExamMocks.push(m);
      }
    });

    const sameExamCount = sameExamMocks.length;
    const otherExamCount = otherExamMocks.length;
    const totalPastUsage = sameExamCount + otherExamCount;

    const allMockNames = Array.from(new Set(matchedMocks.map(m => m.testName || `Mock Test #${m.mockId || m.id}`)));
    const sameExamMockNames = Array.from(new Set(sameExamMocks.map(m => m.testName || `Mock Test #${m.mockId || m.id}`)));
    const otherExamMockNames = Array.from(new Set(otherExamMocks.map(m => m.testName || `Mock Test #${m.mockId || m.id}`)));

    if (totalPastUsage === 0) {
      return {
        status: 'Fresh' as const,
        uniquenessPercent: 100,
        badgeLabel: '100% Fresh - Never Used in Past Mocks',
        badgeHindi: '100% नया - पिछले किसी भी मॉक में प्रयुक्त नहीं',
        colorClass: 'bg-emerald-950/90 text-emerald-300 border-emerald-600/70 shadow-sm',
        badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
        icon: ShieldCheck,
        sameExamCount: 0,
        otherExamCount: 0,
        sameExamMockNames: [],
        otherExamMockNames: [],
        sameExamMocks: [],
        otherExamMocks: [],
        totalPastUsage: 0,
        mockNames: [],
        currentExamCategory
      };
    } else if (sameExamCount > 0 && otherExamCount === 0) {
      const firstMock = sameExamMockNames[0] || currentExamCategory;
      const badgeLabel = sameExamCount === 1
        ? `Used 1x in Same Exam (${firstMock})`
        : `Used ${sameExamCount}x in Same Exam (${currentExamCategory})`;
      const badgeHindi = sameExamCount === 1
        ? `समान परीक्षा में 1 बार प्रयुक्त (${firstMock})`
        : `समान परीक्षा (${currentExamCategory}) में ${sameExamCount} बार प्रयुक्त`;

      return {
        status: sameExamCount === 1 ? ('Used' as const) : ('Repeated' as const),
        uniquenessPercent: Math.max(20, 100 - sameExamCount * 25),
        badgeLabel,
        badgeHindi,
        colorClass: 'bg-amber-950/90 text-amber-300 border-amber-600/70 shadow-sm',
        badgeBg: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
        icon: AlertTriangle,
        sameExamCount,
        otherExamCount: 0,
        sameExamMockNames,
        otherExamMockNames: [],
        sameExamMocks,
        otherExamMocks: [],
        totalPastUsage,
        mockNames: allMockNames,
        currentExamCategory
      };
    } else if (otherExamCount > 0 && sameExamCount === 0) {
      const firstOther = otherExamMockNames[0] || 'Other Exam';
      const badgeLabel = otherExamCount === 1
        ? `Used 1x in Other Exam (${firstOther})`
        : `Used ${otherExamCount}x in Other Exams (${otherExamMockNames.slice(0, 2).map(extractExamCategory).join(', ')})`;
      const badgeHindi = otherExamCount === 1
        ? `अन्य परीक्षा में 1 बार प्रयुक्त (${firstOther})`
        : `अन्य परीक्षाओं में ${otherExamCount} बार प्रयुक्त`;

      return {
        status: otherExamCount === 1 ? ('Used' as const) : ('Repeated' as const),
        uniquenessPercent: Math.max(30, 100 - otherExamCount * 20),
        badgeLabel,
        badgeHindi,
        colorClass: 'bg-indigo-950/90 text-indigo-300 border-indigo-600/70 shadow-sm',
        badgeBg: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/40',
        icon: AlertTriangle,
        sameExamCount: 0,
        otherExamCount,
        sameExamMockNames: [],
        otherExamMockNames,
        sameExamMocks: [],
        otherExamMocks,
        totalPastUsage,
        mockNames: allMockNames,
        currentExamCategory
      };
    } else {
      const badgeLabel = `Used ${totalPastUsage}x (${sameExamCount}x Same Exam: ${currentExamCategory} + ${otherExamCount}x Other Exams)`;
      const badgeHindi = `${totalPastUsage} बार प्रयुक्त (${sameExamCount}x समान परीक्षा + ${otherExamCount}x अन्य परीक्षा)`;

      return {
        status: 'Repeated' as const,
        uniquenessPercent: Math.max(10, 100 - totalPastUsage * 20),
        badgeLabel,
        badgeHindi,
        colorClass: 'bg-rose-950/90 text-rose-300 border-rose-600/70 shadow-sm',
        badgeBg: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
        icon: ShieldAlert,
        sameExamCount,
        otherExamCount,
        sameExamMockNames,
        otherExamMockNames,
        sameExamMocks,
        otherExamMocks,
        totalPastUsage,
        mockNames: allMockNames,
        currentExamCategory
      };
    }
  };

  // Overall Uniqueness Statistics
  const uniquenessStats = useMemo(() => {
    let fresh = 0;
    let used = 0;
    let repeated = 0;

    questions.forEach(q => {
      const info = getQuestionUniquenessDetails(q);
      if (info.status === 'Fresh') fresh++;
      else if (info.status === 'Used') used++;
      else repeated++;
    });

    const total = questions.length;
    const overallFreshPercent = total > 0 ? Math.round((fresh / total) * 100) : 100;

    return { fresh, used, repeated, total, overallFreshPercent };
  }, [questions, mockHistory]);

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

  // Filtered Questions list preserving original index and applying section + uniqueness filters
  const filteredQuestionsList = useMemo(() => {
    return questions
      .map((q, originalIndex) => ({ q, originalIndex }))
      .filter(item => {
        if (selectedFilterSection !== 'ALL') {
          if ((item.q.subject || '').trim().toLowerCase() !== selectedFilterSection.trim().toLowerCase()) {
            return false;
          }
        }
        if (selectedUniquenessFilter !== 'ALL') {
          const info = getQuestionUniquenessDetails(item.q);
          if (selectedUniquenessFilter === 'FRESH' && info.status !== 'Fresh') return false;
          if (selectedUniquenessFilter === 'USED' && info.status !== 'Used') return false;
          if (selectedUniquenessFilter === 'REPEATED' && info.status !== 'Repeated') return false;
        }
        return true;
      });
  }, [questions, selectedFilterSection, selectedUniquenessFilter, mockHistory]);

  // Swipe Deck Candidates Computation
  const swipeCandidates = useMemo(() => {
    if (swipeDeckIdx === null || !questions[swipeDeckIdx]) return [];
    const targetQ = questions[swipeDeckIdx];
    const targetSub = (targetQ.subject || '').trim().toLowerCase();
    const targetChap = (targetQ.chapter || '').trim().toLowerCase();

    const combinedBank = [...bankQuestions, ...allBankQuestions];
    const currentTestTexts = new Set(questions.map(q => q.question.trim().toLowerCase()));

    const available = combinedBank.filter(q => {
      const text = q.question.trim().toLowerCase();
      return !currentTestTexts.has(text);
    });

    const uniqueMap = new Map<string, Question>();
    available.forEach(q => {
      const text = q.question.trim().toLowerCase();
      if (!uniqueMap.has(text)) {
        uniqueMap.set(text, q);
      }
    });

    const candidateList = Array.from(uniqueMap.values());

    const tier1 = candidateList.filter(q => {
      const s = (q.subject || '').trim().toLowerCase();
      const c = (q.chapter || '').trim().toLowerCase();
      return (s === targetSub || !targetSub) && (c === targetChap || !targetChap);
    });

    const tier2 = candidateList.filter(q => {
      const s = (q.subject || '').trim().toLowerCase();
      return (s === targetSub || !targetSub) && !tier1.includes(q);
    });

    const tier3 = candidateList.filter(q => !tier1.includes(q) && !tier2.includes(q));

    const sortFresh = (arr: Question[]) => [...arr].sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));

    return [...sortFresh(tier1), ...sortFresh(tier2), ...sortFresh(tier3)];
  }, [swipeDeckIdx, questions, bankQuestions, allBankQuestions]);

  // Keyboard listener for Swipe Deck navigation
  useEffect(() => {
    if (swipeDeckIdx === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSwipeCandidatePos(prev => (prev > 0 ? prev - 1 : Math.max(0, swipeCandidates.length - 1)));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSwipeCandidatePos(prev => (swipeCandidates.length > 0 ? (prev + 1) % swipeCandidates.length : 0));
      } else if (e.key === 'Escape') {
        setSwipeDeckIdx(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [swipeDeckIdx, swipeCandidates.length]);

  // Apply candidate replacement from Swipe Deck
  const handleApplySwipeCandidate = (candidate: Question) => {
    if (swipeDeckIdx === null) return;
    const updated = [...questions];
    updated[swipeDeckIdx] = candidate;
    setQuestions(updated);
    setIsSaved(false);
    onUpdateTestQuestions(updated);

    setAddNotification(`👆 Swapped Q #${swipeDeckIdx + 1} with a fresh candidate from "${candidate.subject || 'Subject'}"!`);
    setTimeout(() => setAddNotification(null), 3500);

    setSwipeDeckIdx(null);
    setSwipeCandidatePos(0);
  };

  // Generate fresh AI candidate directly inside Swipe Deck
  const handleGenerateAiSwipeCandidate = async () => {
    if (swipeDeckIdx === null || !questions[swipeDeckIdx]) return;
    const targetQ = questions[swipeDeckIdx];
    const sub = (targetQ.subject || 'General').trim();
    const chap = (targetQ.chapter || 'General').trim();
    const diff = targetQ.difficulty || 'Moderate';

    setIsGeneratingSwipeAi(true);
    try {
      const systemInstruction = `You are an expert exam question author. Generate 1 high-quality Multiple Choice Question (MCQ) in JSON format.
Return ONLY valid JSON matching this schema:
{
  "question": "Question statement here",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "A",
  "explanation": "Brief explanation",
  "subject": "${sub}",
  "chapter": "${chap}",
  "difficulty": "${diff}"
}`;

      const prompt = `Generate a fresh, unique MCQ for Subject: "${sub}", Chapter: "${chap}", Difficulty: "${diff}". Ensure accuracy.`;

      const aiResponseText = await directClientAiCall(prompt, systemInstruction);
      const cleanJson = aiResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

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
        subject: parsed.subject || sub,
        chapter: parsed.chapter || chap,
        difficulty: (parsed.difficulty || diff) as any,
        usageCount: 0,
        questionStatus: 'Fresh',
        chapterCoverageScore: 100,
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString()
      };

      handleApplySwipeCandidate(newMcq);
    } catch (err: any) {
      alert('AI Candidate generation failed: ' + err.message);
    } finally {
      setIsGeneratingSwipeAi(false);
    }
  };

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
        
        const updated = questions.map((prevQ, i) =>
          i === index ? { ...prevQ, explanation: expStr, updatedDate: new Date().toISOString() } : prevQ
        );
        setQuestions(updated);
        setIsSaved(false);
        if (onUpdateTestQuestions) {
          onUpdateTestQuestions(updated);
        }
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
        const updatedList = questions.map((q, idx) => {
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
        });
        setQuestions(updatedList);
        if (onUpdateTestQuestions) {
          onUpdateTestQuestions(updatedList);
        }
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
        const updatedList = questions.map((item, i) => {
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
        });
        setQuestions(updatedList);
        if (onUpdateTestQuestions) {
          onUpdateTestQuestions(updatedList);
        }
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
          {/* Uniqueness & Usage Indicator Summary & Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">
                  Question Uniqueness & Repeat Tracking (प्रश्न मौलिकता संकेतक)
                </span>
                <span className="text-[11px] bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded-md font-mono">
                  {uniquenessStats.overallFreshPercent}% Fresh Paper
                </span>
              </div>

              {/* Uniqueness Filter Tabs */}
              <div className="flex items-center space-x-1 flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedUniquenessFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                    selectedUniquenessFilter === 'ALL'
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  All ({uniquenessStats.total})
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedUniquenessFilter('FRESH')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border flex items-center space-x-1 ${
                    selectedUniquenessFilter === 'FRESH'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>100% Fresh ({uniquenessStats.fresh})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedUniquenessFilter('USED')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border flex items-center space-x-1 ${
                    selectedUniquenessFilter === 'USED'
                      ? 'bg-amber-600 text-white border-amber-500'
                      : 'bg-amber-950/60 text-amber-300 border-amber-800/80 hover:bg-amber-900'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                  <span>Used 1x ({uniquenessStats.used})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedUniquenessFilter('REPEATED')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border flex items-center space-x-1 ${
                    selectedUniquenessFilter === 'REPEATED'
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-rose-950/60 text-rose-300 border-rose-800/80 hover:bg-rose-900'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-300" />
                  <span>Repeated ({uniquenessStats.repeated})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  Each MCQ displays a live <strong>Uniqueness Indicator</strong> showing past paper usage. Click <strong className="text-purple-300 bg-purple-950 border border-purple-800 px-1.5 py-0.5 rounded text-[10px]">Manual Swap</strong> to swipe through fresh candidate questions!
                </span>
              </div>
              {selectedUniquenessFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedUniquenessFilter('ALL')}
                  className="text-blue-400 hover:underline text-[11px]"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {filteredQuestionsList.map(({ q, originalIndex: idx }) => {
            const uniqInfo = getQuestionUniquenessDetails(q);
            const UniqIcon = uniqInfo.icon;

            return (
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

                      {/* Uniqueness & Usage Indicator Badge */}
                      <div
                        onClick={() => setUniquenessDetailModal({ question: q, questionIndex: idx })}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1.5 flex-wrap gap-1 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all shadow-sm ${uniqInfo.badgeBg} ${uniqInfo.colorClass}`}
                        title="Click to view complete details: Exam names and Mock Test numbers where this MCQ was repeated"
                      >
                        <UniqIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{uniqInfo.badgeLabel}</span>

                        {/* Breakdown Pills for Same Exam vs Other Exam */}
                        {uniqInfo.sameExamCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUniquenessDetailModal({ question: q, questionIndex: idx });
                            }}
                            className="bg-amber-900/90 hover:bg-amber-800 text-amber-200 border border-amber-700/80 px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center space-x-1 ml-1 cursor-pointer transition-colors shadow-xs"
                            title={`Same Exam (${uniqInfo.currentExamCategory}) Past Papers: ${uniqInfo.sameExamMockNames.join(', ')} - Click for complete details`}
                          >
                            <span>🎯 Same Exam: {uniqInfo.sameExamCount}x</span>
                          </button>
                        )}

                        {uniqInfo.otherExamCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUniquenessDetailModal({ question: q, questionIndex: idx });
                            }}
                            className="bg-indigo-900/90 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/80 px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center space-x-1 ml-1 cursor-pointer transition-colors shadow-xs"
                            title={`Other Exam Past Papers: ${uniqInfo.otherExamMockNames.join(', ')} - Click for complete details`}
                          >
                            <span>🌐 Other Exams: {uniqInfo.otherExamCount}x</span>
                          </button>
                        )}
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

                    {/* Interactive Swipe & Swap Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setSwipeDeckIdx(idx);
                        setSwipeCandidatePos(0);
                      }}
                      className="px-2.5 py-1.5 bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 hover:from-purple-800 hover:to-blue-800 text-purple-200 border border-purple-600/80 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md hover:scale-[1.02]"
                      title="Open interactive candidate carousel to manually swap this question with a fresh MCQ from Question Bank or AI"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-purple-300" />
                      <span>Manual Swap</span>
                    </button>

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
                      <span>Auto Swap</span>
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
                    <div className="p-3 bg-purple-950/50 border border-purple-800/60 rounded-xl space-y-2 mt-2">
                      <div className="text-[11px] font-bold text-purple-300 tracking-wider uppercase flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                        <span>FORMATTED SOLUTION / EXPLANATION PREVIEW:</span>
                      </div>
                      <div className="text-xs text-purple-100 leading-relaxed font-sans bg-slate-950/80 p-3 rounded-lg border border-purple-900/50 shadow-inner">
                        <MathText text={q.explanation} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
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
                  <div className="p-3 bg-purple-950/60 border border-purple-800 rounded-xl space-y-2 mt-2">
                    <div className="text-[11px] font-bold text-purple-300 tracking-wider uppercase flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Live Formatted Math Preview:</span>
                    </div>
                    <div className="text-xs text-purple-100 leading-relaxed font-sans bg-slate-950/80 p-3 rounded-lg border border-purple-900/50 shadow-inner">
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

      {/* Modal: Interactive Candidate Swipe Deck & Question Swap Carousel */}
      {swipeDeckIdx !== null && questions[swipeDeckIdx] && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-purple-500/50 rounded-2xl w-full max-w-3xl p-6 space-y-5 shadow-2xl my-8 animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <ArrowLeftRight className="w-5 h-5 text-purple-400" />
                  <span>Interactive Question Swipe & Swap (प्रश्न स्वाइप एवं प्रतिस्थापन)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Target Position: <strong>Q #{swipeDeckIdx + 1}</strong> | Subject: <strong className="text-blue-300">{questions[swipeDeckIdx].subject}</strong> → Chapter: <strong className="text-purple-300">{questions[swipeDeckIdx].chapter}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSwipeDeckIdx(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Question Currently in Test Paper */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Current MCQ in Test Paper (Q #{swipeDeckIdx + 1}):
                </span>
                {(() => {
                  const currentUniq = getQuestionUniquenessDetails(questions[swipeDeckIdx]);
                  const CIcon = currentUniq.icon;
                  return (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${currentUniq.badgeBg} ${currentUniq.colorClass} flex items-center space-x-1`}>
                      <CIcon className="w-3 h-3" />
                      <span>{currentUniq.badgeLabel}</span>
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-white font-medium line-clamp-2">
                {questions[swipeDeckIdx].question}
              </p>
            </div>

            {/* Candidate Swipe Carousel Box */}
            {swipeCandidates.length > 0 ? (
              <div className="bg-gradient-to-b from-slate-950 to-slate-900 border border-purple-500/40 p-5 rounded-2xl space-y-4 shadow-xl relative">
                {/* Top Carousel Navigation Controls */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-purple-300 bg-purple-950 border border-purple-800 px-2.5 py-1 rounded-lg">
                      Candidate #{swipeCandidatePos + 1} of {swipeCandidates.length}
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      (Use ← / → Arrow keys or Swipe buttons)
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSwipeCandidatePos(prev => (prev > 0 ? prev - 1 : swipeCandidates.length - 1))}
                      className="bg-slate-800 hover:bg-purple-900 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all"
                      title="Swipe Left / Previous Candidate (Key: ←)"
                    >
                      <ChevronLeft className="w-4 h-4 text-purple-300" />
                      <span>Swipe Prev</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSwipeCandidatePos(prev => (swipeCandidates.length > 0 ? (prev + 1) % swipeCandidates.length : 0))}
                      className="bg-slate-800 hover:bg-purple-900 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-all"
                      title="Swipe Right / Next Candidate (Key: →)"
                    >
                      <span>Swipe Next</span>
                      <ChevronRight className="w-4 h-4 text-purple-300" />
                    </button>
                  </div>
                </div>

                {/* Active Swipe Candidate Card Display */}
                {(() => {
                  const activeCandidate = swipeCandidates[swipeCandidatePos] || swipeCandidates[0];
                  const candidateUniq = getQuestionUniquenessDetails(activeCandidate);
                  const CandIcon = candidateUniq.icon;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white bg-indigo-950 border border-indigo-700/80 px-2.5 py-1 rounded-lg">
                            Subject: {activeCandidate.subject}
                          </span>
                          <span className="text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                            Topic: {activeCandidate.chapter}
                          </span>
                        </div>

                        <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center space-x-1 ${candidateUniq.badgeBg} ${candidateUniq.colorClass}`}>
                          <CandIcon className="w-3.5 h-3.5" />
                          <span>{candidateUniq.badgeLabel}</span>
                        </div>
                      </div>

                      {/* Question Statement */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-[10px] text-purple-300 font-bold uppercase tracking-wider block">
                          Candidate Question Statement:
                        </span>
                        <p className="text-sm font-semibold text-white leading-relaxed">
                          <MathText text={activeCandidate.question} />
                        </p>
                        {activeCandidate.translation && (
                          <p className="text-xs text-indigo-300 font-medium pt-1 border-t border-slate-800">
                            <MathText text={activeCandidate.translation} />
                          </p>
                        )}
                      </div>

                      {/* Options Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className={`p-2.5 rounded-lg border ${activeCandidate.answer === 'A' ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                          <strong className="mr-1.5">A.</strong> <MathText text={activeCandidate.optionA} />
                        </div>
                        <div className={`p-2.5 rounded-lg border ${activeCandidate.answer === 'B' ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                          <strong className="mr-1.5">B.</strong> <MathText text={activeCandidate.optionB} />
                        </div>
                        <div className={`p-2.5 rounded-lg border ${activeCandidate.answer === 'C' ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                          <strong className="mr-1.5">C.</strong> <MathText text={activeCandidate.optionC} />
                        </div>
                        <div className={`p-2.5 rounded-lg border ${activeCandidate.answer === 'D' ? 'bg-emerald-950/60 border-emerald-600 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-300'}`}>
                          <strong className="mr-1.5">D.</strong> <MathText text={activeCandidate.optionD} />
                        </div>
                      </div>

                      {activeCandidate.explanation && (
                        <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-900/40 text-xs text-purple-200">
                          <strong className="text-purple-400 block text-[10px] uppercase mb-0.5">Solution / Explanation:</strong>
                          <MathText text={activeCandidate.explanation} />
                        </div>
                      )}

                      {/* Primary Swap Action Button */}
                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <span className="text-xs text-emerald-400 font-semibold flex items-center space-x-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Candidate ready to swap into Q #{swipeDeckIdx + 1}</span>
                        </span>

                        <button
                          type="button"
                          onClick={() => handleApplySwipeCandidate(activeCandidate)}
                          className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg transition-all flex items-center justify-center space-x-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>Apply Swipe & Swap Question (स्वाइप लागू करें)</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="bg-slate-950 p-8 rounded-2xl border border-dashed border-slate-800 text-center space-y-3">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-xs text-slate-300">
                  No additional unused questions found in Question Bank for Subject "{questions[swipeDeckIdx].subject}".
                </p>
                <p className="text-[11px] text-slate-400">
                  You can generate a brand new 100% fresh MCQ using AI instantly below!
                </p>
              </div>
            )}

            {/* AI Candidate Generation Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleGenerateAiSwipeCandidate}
                disabled={isGeneratingSwipeAi}
                className="w-full sm:w-auto bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-600 px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isGeneratingSwipeAi ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-purple-300" />
                    <span>Generating Fresh AI Candidate...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-300" />
                    <span>Generate Fresh AI Candidate for this Topic</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSwipeDeckIdx(null)}
                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-4 py-2 rounded-xl text-xs"
              >
                Close Swipe Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Uniqueness Usage Breakdown Detail Modal */}
      {uniquenessDetailModal !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0e1230] border border-blue-500/60 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl relative my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <span>MCQ Past Papers Repetition History</span>
                    <span className="text-xs font-normal text-slate-400">(Q #{uniquenessDetailModal.questionIndex + 1})</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Current Exam Category: <strong className="text-amber-300 font-bold">{currentExamCategory}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setUniquenessDetailModal(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Question Statement Box */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5 flex-shrink-0">
              <div className="flex items-center space-x-2">
                <span className="bg-blue-950 text-blue-300 border border-blue-800/60 text-[10px] font-bold px-2 py-0.5 rounded">
                  {uniquenessDetailModal.question.subject || 'General'}
                </span>
                {uniquenessDetailModal.question.chapter && (
                  <span className="text-slate-400 text-[10px]">
                    • {uniquenessDetailModal.question.chapter}
                  </span>
                )}
              </div>
              <p className="text-xs text-white font-medium line-clamp-3 leading-relaxed">
                "{uniquenessDetailModal.question.question}"
              </p>
            </div>

            {/* Modal Content Details */}
            {(() => {
              const details = getQuestionUniquenessDetails(uniquenessDetailModal.question);
              return (
                <div className="space-y-4 flex-1 overflow-y-auto pr-1 my-1">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-950/90 border border-slate-800 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-400 block font-semibold">Total Past Usage</span>
                      <span className="text-base font-extrabold text-amber-400">{details.totalPastUsage}x</span>
                    </div>
                    <div className="bg-amber-950/40 border border-amber-800/60 p-2.5 rounded-xl">
                      <span className="text-[10px] text-amber-300 block font-semibold">Same Exam ({details.currentExamCategory})</span>
                      <span className="text-base font-extrabold text-amber-300">{details.sameExamCount}x</span>
                    </div>
                    <div className="bg-indigo-950/40 border border-indigo-800/60 p-2.5 rounded-xl">
                      <span className="text-[10px] text-indigo-300 block font-semibold">Other Exams</span>
                      <span className="text-base font-extrabold text-indigo-300">{details.otherExamCount}x</span>
                    </div>
                  </div>

                  {/* Same Exam Mock Papers List */}
                  {details.sameExamMocks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-amber-400 text-xs font-bold border-b border-amber-900/40 pb-1">
                        <span>🎯 Same Exam Past Mock Papers ({details.currentExamCategory})</span>
                        <span className="bg-amber-950 text-amber-300 border border-amber-700/60 px-2 py-0.5 rounded text-[10px]">
                          {details.sameExamMocks.length} Papers
                        </span>
                      </div>
                      <div className="space-y-2">
                        {details.sameExamMocks.map((mock, mIdx) => (
                          <div
                            key={mock.id || mIdx}
                            className="bg-amber-950/30 border border-amber-800/60 hover:border-amber-600 p-3 rounded-xl flex items-center justify-between text-xs transition-colors"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-amber-200">{mock.testName}</span>
                                <span className="bg-slate-950 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-800">
                                  #{mock.mockId || mock.id || `M-${mIdx + 1}`}
                                </span>
                              </div>
                              <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                                <span>📅 Date: {mock.createdDate ? new Date(mock.createdDate).toLocaleDateString('en-GB') : 'N/A'}</span>
                                <span>•</span>
                                <span>📝 {mock.questionIds?.length || mock.questions?.length || 'N/A'} MCQs</span>
                                <span>•</span>
                                <span>⏱️ {mock.duration || 60} Mins</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-900/80 border border-amber-700 px-2.5 py-1 rounded-lg whitespace-nowrap">
                              Repeated Here
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other Exam Mock Papers List */}
                  {details.otherExamMocks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-indigo-400 text-xs font-bold border-b border-indigo-900/40 pb-1">
                        <span>🌐 Other Exam Past Mock Papers</span>
                        <span className="bg-indigo-950 text-indigo-300 border border-indigo-700/60 px-2 py-0.5 rounded text-[10px]">
                          {details.otherExamMocks.length} Papers
                        </span>
                      </div>
                      <div className="space-y-2">
                        {details.otherExamMocks.map((mock, mIdx) => {
                          const otherCategory = extractExamCategory(mock.testName || '');
                          return (
                            <div
                              key={mock.id || mIdx}
                              className="bg-indigo-950/30 border border-indigo-800/60 hover:border-indigo-600 p-3 rounded-xl flex items-center justify-between text-xs transition-colors"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center space-x-2 flex-wrap gap-1">
                                  <span className="font-bold text-indigo-200">{mock.testName}</span>
                                  <span className="bg-indigo-900 text-indigo-200 px-2 py-0.5 rounded text-[10px] font-semibold border border-indigo-700">
                                    {otherCategory}
                                  </span>
                                  <span className="bg-slate-950 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-800">
                                    #{mock.mockId || mock.id || `M-${mIdx + 1}`}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                                  <span>📅 Date: {mock.createdDate ? new Date(mock.createdDate).toLocaleDateString('en-GB') : 'N/A'}</span>
                                  <span>•</span>
                                  <span>📝 {mock.questionIds?.length || mock.questions?.length || 'N/A'} MCQs</span>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-indigo-300 bg-indigo-900/80 border border-indigo-700 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                Used Here
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {details.totalPastUsage === 0 && (
                    <div className="p-6 bg-emerald-950/30 border border-emerald-800/60 rounded-xl text-center space-y-2">
                      <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                      <h4 className="text-xs font-bold text-emerald-300">100% Fresh Question</h4>
                      <p className="text-[11px] text-slate-300">
                        This question has never been included in any previously saved mock test paper in your library.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Footer with Actions */}
            <div className="flex items-center justify-between border-t border-slate-800 pt-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  const idx = uniquenessDetailModal.questionIndex;
                  setUniquenessDetailModal(null);
                  handleSmartSwap(idx);
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-md transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Auto Swap with Fresh MCQ</span>
              </button>

              <button
                type="button"
                onClick={() => setUniquenessDetailModal(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
