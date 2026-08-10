import React, { useState, useMemo } from 'react';
import { Question, QuestionStatus, DifficultyLevel, AiConfig, DeletedMcqItem, AddedMcqItem } from '../types';
import { callAiExplain, callAiClassify, callAiTranslateDualLanguage, getStoredAiConfig } from '../lib/aiClient';
import { sanitizeBilingualQuestionAndTranslation } from '../lib/exportUtils';
import { formatMathSymbols } from '../lib/mathUtils';
import { getDuplicateStats } from '../lib/duplicateUtils';
import { PinModal } from './PinModal';
import { MathText } from './MathText';
import { MathToolbar } from './MathToolbar';
import {
  Database,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  BookOpen,
  Languages,
  CopyCheck,
  AlertTriangle,
  RotateCcw,
  History,
  Clock,
  CheckCircle2,
  ArrowRightLeft,
  FolderSync,
  MoveRight
} from 'lucide-react';

interface QuestionBankViewProps {
  questions: Question[];
  deletedMcqs?: DeletedMcqItem[];
  addedMcqs?: AddedMcqItem[];
  onAddQuestion: (q: Omit<Question, 'id'>) => Promise<void>;
  onUpdateQuestion: (q: Question) => Promise<void>;
  onDeleteQuestion: (id: number) => Promise<void>;
  onDeleteBatch: (ids: number[]) => Promise<void>;
  onUpdateBatch: (qs: Question[]) => Promise<void>;
  onClearAll?: () => Promise<void>;
  onRestoreDeletedMcq?: (item: DeletedMcqItem) => Promise<void>;
  onClearDeletedLog?: () => void;
  onOpenDuplicateModal?: () => void;
  aiConfig?: AiConfig;
  geminiApiKey?: string;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  questions,
  deletedMcqs = [],
  addedMcqs = [],
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onDeleteBatch,
  onUpdateBatch,
  onClearAll,
  onRestoreDeletedMcq,
  onClearDeletedLog,
  onOpenDuplicateModal,
  aiConfig,
  geminiApiKey
}) => {
  // View Mode: 'all' | 'added' | 'deleted'
  const [viewMode, setViewMode] = useState<'all' | 'added' | 'deleted'>('all');
  // Pin Modal State for Clear All
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  // Filters State
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedChapter, setSelectedChapter] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selection & Pagination
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('gradeup_question_bank_page_size');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 15;
  });

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    try {
      localStorage.setItem('gradeup_question_bank_page_size', newSize.toString());
    } catch (e) {
      // Ignore quota error if any
    }
  };

  // Modals
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Shift Subject & Chapter Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState<boolean>(false);
  const [shiftMode, setShiftMode] = useState<'STEP_BY_STEP_SHIFT' | 'SUBJECT_TO_SUBJECT' | 'SUBJECT_CHAPTER_TO_TARGET' | 'SELECTED_MCQS'>('STEP_BY_STEP_SHIFT');
  const [shiftSourceSubject, setShiftSourceSubject] = useState<string>('');
  const [shiftSourceChapter, setShiftSourceChapter] = useState<string>('');
  const [shiftTargetSubject, setShiftTargetSubject] = useState<string>('');
  const [shiftTargetChapter, setShiftTargetChapter] = useState<string>('');
  const [shiftMcqSelection, setShiftMcqSelection] = useState<Set<number>>(new Set());

  // Form State for Add/Edit
  const [formData, setFormData] = useState<Partial<Question>>({
    subject: 'Quantitative Aptitude',
    chapter: 'Number Systems',
    question: '',
    translation: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    answer: 'A',
    difficulty: 'Moderate',
    usageCount: 0,
    questionStatus: 'Fresh',
    chapterCoverageScore: 8
  });

  // Unique Subjects & Chapters
  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    questions.forEach(q => {
      if (q.subject && q.subject.trim()) {
        const trimmed = q.subject.trim();
        const lower = trimmed.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, trimmed);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [questions]);

  const chapters = useMemo(() => {
    const map = new Map<string, string>();
    const selSubLower = selectedSubject.trim().toLowerCase();
    questions.forEach(q => {
      const qSubLower = (q.subject || '').trim().toLowerCase();
      const matchesSub = selectedSubject === 'ALL' || qSubLower === selSubLower;
      if (matchesSub && q.chapter && q.chapter.trim()) {
        const trimmed = q.chapter.trim();
        const lower = trimmed.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, trimmed);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [questions, selectedSubject]);

  // Calculate Duplicate Stats
  const duplicateStats = useMemo(() => {
    return getDuplicateStats(questions);
  }, [questions]);

  // All Unique Chapters across entire Question Bank
  const allChapters = useMemo(() => {
    const map = new Map<string, string>();
    questions.forEach(q => {
      if (q.chapter && q.chapter.trim()) {
        const trimmed = q.chapter.trim();
        const lower = trimmed.toLowerCase();
        if (!map.has(lower)) map.set(lower, trimmed);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [questions]);

  // Chapters belonging specifically to shiftSourceSubject
  const chaptersForSourceSubject = useMemo(() => {
    const map = new Map<string, string>();
    const srcSubLower = shiftSourceSubject.trim().toLowerCase();
    questions.forEach(q => {
      const qSubLower = (q.subject || '').trim().toLowerCase();
      if (qSubLower === srcSubLower && q.chapter && q.chapter.trim()) {
        const trimmed = q.chapter.trim();
        const lower = trimmed.toLowerCase();
        if (!map.has(lower)) map.set(lower, trimmed);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [questions, shiftSourceSubject]);

  // All MCQs belonging to current source Subject & Chapter
  const mcqsInSourceChapter = useMemo(() => {
    const srcSubLower = shiftSourceSubject.trim().toLowerCase();
    const srcChapLower = shiftSourceChapter.trim().toLowerCase();
    if (!srcSubLower || !srcChapLower) return [];
    return questions.filter(q => 
      (q.subject || '').trim().toLowerCase() === srcSubLower &&
      (q.chapter || '').trim().toLowerCase() === srcChapLower
    );
  }, [questions, shiftSourceSubject, shiftSourceChapter]);

  // Shift MCQ Toggle Helpers
  const toggleShiftMcq = (id: number) => {
    setShiftMcqSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllShiftMcqs = () => {
    const ids = new Set(mcqsInSourceChapter.map(q => q.id!).filter(Boolean));
    setShiftMcqSelection(ids);
  };

  const deselectAllShiftMcqs = () => {
    setShiftMcqSelection(new Set());
  };

  // Questions matching current shift criteria
  const shiftMatchingQuestions = useMemo(() => {
    if (shiftMode === 'STEP_BY_STEP_SHIFT') {
      return mcqsInSourceChapter.filter(q => shiftMcqSelection.has(q.id!));
    }
    if (shiftMode === 'SELECTED_MCQS') {
      return questions.filter(q => selectedIds.has(q.id!));
    }
    const srcSubLower = shiftSourceSubject.trim().toLowerCase();
    if (!srcSubLower) return [];

    if (shiftMode === 'SUBJECT_TO_SUBJECT') {
      return questions.filter(q => (q.subject || '').trim().toLowerCase() === srcSubLower);
    }

    if (shiftMode === 'SUBJECT_CHAPTER_TO_TARGET') {
      const srcChapLower = shiftSourceChapter.trim().toLowerCase();
      if (!srcChapLower) return [];
      return questions.filter(q => 
        (q.subject || '').trim().toLowerCase() === srcSubLower &&
        (q.chapter || '').trim().toLowerCase() === srcChapLower
      );
    }

    return [];
  }, [questions, shiftMode, shiftSourceSubject, shiftSourceChapter, selectedIds, mcqsInSourceChapter, shiftMcqSelection]);

  const openShiftModal = (mode?: 'STEP_BY_STEP_SHIFT' | 'SUBJECT_TO_SUBJECT' | 'SUBJECT_CHAPTER_TO_TARGET' | 'SELECTED_MCQS') => {
    const defaultSub = selectedSubject !== 'ALL' ? selectedSubject : (subjects[0] || '');
    const srcChapsMap = new Map<string, string>();
    questions.forEach(q => {
      if ((q.subject || '').trim().toLowerCase() === defaultSub.trim().toLowerCase() && q.chapter && q.chapter.trim()) {
        const trimmed = q.chapter.trim();
        const lower = trimmed.toLowerCase();
        if (!srcChapsMap.has(lower)) srcChapsMap.set(lower, trimmed);
      }
    });
    const subChaps = Array.from(srcChapsMap.values());
    const defaultChap = selectedChapter !== 'ALL' ? selectedChapter : (subChaps[0] || '');

    setShiftSourceSubject(defaultSub);
    setShiftSourceChapter(defaultChap);
    setShiftTargetSubject(defaultSub);
    setShiftTargetChapter(defaultChap);

    // Pre-select all MCQs in this source subject/chapter
    const inChap = questions.filter(q => 
      (q.subject || '').trim().toLowerCase() === defaultSub.trim().toLowerCase() &&
      (q.chapter || '').trim().toLowerCase() === defaultChap.trim().toLowerCase()
    );
    setShiftMcqSelection(new Set(inChap.map(q => q.id!).filter(Boolean)));

    if (mode) {
      setShiftMode(mode);
    } else if (selectedIds.size > 0) {
      setShiftMode('SELECTED_MCQS');
    } else {
      setShiftMode('STEP_BY_STEP_SHIFT');
    }

    setIsShiftModalOpen(true);
  };

  const handleExecuteShift = async () => {
    const targetSubClean = shiftTargetSubject.trim();
    const targetChapClean = shiftTargetChapter.trim();

    if (shiftMode === 'STEP_BY_STEP_SHIFT') {
      if (!shiftSourceSubject.trim() || !shiftSourceChapter.trim()) {
        alert('Step 1 & 2: Please select both a Source Subject and Source Chapter.');
        return;
      }
      if (shiftMcqSelection.size === 0) {
        alert('Step 3: Please select at least 1 MCQ from the chapter list to shift.');
        return;
      }
      if (!targetSubClean) {
        alert('Step 4: Please enter or choose a Target Subject name.');
        return;
      }

      const finalChap = targetChapClean || shiftSourceChapter.trim();
      const matching = shiftMatchingQuestions;

      if (!confirm(`Are you sure you want to shift & paste ${matching.length} selected MCQs to Subject "${targetSubClean}" & Chapter "${finalChap}"?`)) {
        return;
      }

      setIsAiLoading(true);
      setAiNotice(`Shifting & pasting ${matching.length} MCQs to "${targetSubClean} / ${finalChap}"...`);

      try {
        const nowIso = new Date().toISOString();
        const updatedList: Question[] = matching.map(q => ({
          ...q,
          subject: targetSubClean,
          chapter: finalChap,
          updatedDate: nowIso
        }));

        await onUpdateBatch(updatedList);
        setAiNotice(`Successfully shifted and pasted ${updatedList.length} MCQs to "${targetSubClean}" / "${finalChap}"!`);
        setIsShiftModalOpen(false);
      } catch (err: any) {
        setAiNotice(`Shift Error: ${err.message}`);
      } finally {
        setIsAiLoading(false);
      }

    } else if (shiftMode === 'SUBJECT_TO_SUBJECT') {
      if (!shiftSourceSubject.trim()) {
        alert('Please select a source Subject to shift.');
        return;
      }
      if (!targetSubClean) {
        alert('Please select or type a Target Subject name.');
        return;
      }
      if (shiftSourceSubject.trim().toLowerCase() === targetSubClean.toLowerCase()) {
        alert('Source Subject and Target Subject are identical. Please enter a different target subject name.');
        return;
      }

      const matching = shiftMatchingQuestions;
      if (matching.length === 0) {
        alert(`No questions found in Question Bank under Subject "${shiftSourceSubject}".`);
        return;
      }

      if (!confirm(`Are you sure you want to shift ALL ${matching.length} questions from Subject "${shiftSourceSubject}" to "${targetSubClean}"?`)) {
        return;
      }

      setIsAiLoading(true);
      setAiNotice(`Shifting ${matching.length} questions to Subject "${targetSubClean}"...`);

      try {
        const nowIso = new Date().toISOString();
        const updatedList: Question[] = matching.map(q => ({
          ...q,
          subject: targetSubClean,
          updatedDate: nowIso
        }));

        await onUpdateBatch(updatedList);
        setAiNotice(`Successfully shifted ${updatedList.length} questions from Subject "${shiftSourceSubject}" ➔ "${targetSubClean}"!`);
        setIsShiftModalOpen(false);
      } catch (err: any) {
        setAiNotice(`Shift Error: ${err.message}`);
      } finally {
        setIsAiLoading(false);
      }

    } else if (shiftMode === 'SUBJECT_CHAPTER_TO_TARGET') {
      if (!shiftSourceSubject.trim() || !shiftSourceChapter.trim()) {
        alert('Please select both a source Subject and source Chapter.');
        return;
      }
      if (!targetSubClean) {
        alert('Please select or type a Target Subject name.');
        return;
      }

      const finalChap = targetChapClean || shiftSourceChapter.trim();
      const matching = shiftMatchingQuestions;

      if (matching.length === 0) {
        alert(`No questions found under Subject "${shiftSourceSubject}" ➔ Chapter "${shiftSourceChapter}".`);
        return;
      }

      if (
        shiftSourceSubject.trim().toLowerCase() === targetSubClean.toLowerCase() &&
        shiftSourceChapter.trim().toLowerCase() === finalChap.toLowerCase()
      ) {
        alert('Source Subject+Chapter and Target Subject+Chapter are identical.');
        return;
      }

      if (!confirm(`Are you sure you want to shift ${matching.length} questions from "${shiftSourceSubject} / ${shiftSourceChapter}" to "${targetSubClean} / ${finalChap}"?`)) {
        return;
      }

      setIsAiLoading(true);
      setAiNotice(`Shifting ${matching.length} questions to "${targetSubClean} / ${finalChap}"...`);

      try {
        const nowIso = new Date().toISOString();
        const updatedList: Question[] = matching.map(q => ({
          ...q,
          subject: targetSubClean,
          chapter: finalChap,
          updatedDate: nowIso
        }));

        await onUpdateBatch(updatedList);
        setAiNotice(`Successfully shifted ${updatedList.length} questions from "${shiftSourceSubject} / ${shiftSourceChapter}" ➔ "${targetSubClean} / ${finalChap}"!`);
        setIsShiftModalOpen(false);
      } catch (err: any) {
        setAiNotice(`Shift Error: ${err.message}`);
      } finally {
        setIsAiLoading(false);
      }

    } else if (shiftMode === 'SELECTED_MCQS') {
      if (selectedIds.size === 0) {
        alert('No questions selected. Please check at least one question in the table first.');
        return;
      }
      if (!targetSubClean) {
        alert('Please select or type a Target Subject name.');
        return;
      }

      const finalChap = targetChapClean || 'General';

      if (!confirm(`Are you sure you want to shift ${selectedIds.size} selected questions to Subject "${targetSubClean}" & Chapter "${finalChap}"?`)) {
        return;
      }

      setIsAiLoading(true);
      setAiNotice(`Shifting ${selectedIds.size} selected questions to "${targetSubClean} / ${finalChap}"...`);

      try {
        const nowIso = new Date().toISOString();
        const updatedList: Question[] = questions
          .filter(q => selectedIds.has(q.id!))
          .map(q => ({
            ...q,
            subject: targetSubClean,
            chapter: finalChap,
            updatedDate: nowIso
          }));

        await onUpdateBatch(updatedList);
        setSelectedIds(new Set());
        setAiNotice(`Successfully shifted ${updatedList.length} selected questions to "${targetSubClean}" / "${finalChap}"!`);
        setIsShiftModalOpen(false);
      } catch (err: any) {
        setAiNotice(`Shift Error: ${err.message}`);
      } finally {
        setIsAiLoading(false);
      }
    }
  };

  // Filtered Questions List
  const filteredQuestions = useMemo(() => {
    const selSubLower = selectedSubject.trim().toLowerCase();
    const selChapLower = selectedChapter.trim().toLowerCase();
    const query = searchQuery.trim().toLowerCase();

    return questions.filter(q => {
      const qSubLower = (q.subject || '').trim().toLowerCase();
      const qChapLower = (q.chapter || '').trim().toLowerCase();

      if (selectedSubject !== 'ALL' && qSubLower !== selSubLower) return false;
      if (selectedChapter !== 'ALL' && qChapLower !== selChapLower) return false;
      if (selectedDifficulty !== 'ALL' && q.difficulty !== selectedDifficulty) return false;
      
      if (selectedStatus === 'DUPLICATES') {
        if (!q.id || !duplicateStats.duplicateQuestionIds.has(q.id)) return false;
      } else if (selectedStatus !== 'ALL' && q.questionStatus !== selectedStatus) {
        return false;
      }

      if (query) {
        const inStem = (q.question || '').toLowerCase().includes(query);
        const inTrans = (q.translation || '').toLowerCase().includes(query);
        const inSubject = qSubLower.includes(query);
        const inChapter = qChapLower.includes(query);
        const inOpts = [q.optionA, q.optionB, q.optionC, q.optionD].some(o => (o || '').toLowerCase().includes(query));
        const inId = q.id?.toString() === query;
        return inStem || inTrans || inSubject || inChapter || inOpts || inId;
      }
      return true;
    });
  }, [questions, selectedSubject, selectedChapter, selectedDifficulty, selectedStatus, searchQuery, duplicateStats]);

  // Paginated Questions
  const totalPages = Math.ceil(filteredQuestions.length / pageSize) || 1;
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuestions.slice(start, start + pageSize);
  }, [filteredQuestions, currentPage, pageSize]);

  // Selection handlers
  const toggleSelectAllPage = () => {
    const pageIds = paginatedQuestions.map(q => q.id!).filter(Boolean);
    const allSelected = pageIds.every(id => selectedIds.has(id));

    const next = new Set(selectedIds);
    if (allSelected) {
      pageIds.forEach(id => next.delete(id));
    } else {
      pageIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleSelectRow = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIds.size} selected questions?`)) {
      await onDeleteBatch(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const activeAiConfig = aiConfig || getStoredAiConfig();

  const handleAiClassifySelected = async () => {
    if (selectedIds.size === 0) return;
    const targetQuestions = questions.filter(q => selectedIds.has(q.id!));

    setIsAiLoading(true);
    setAiNotice('Classifying selected questions with AI...');

    try {
      const classifications = await callAiClassify(targetQuestions, activeAiConfig);
      if (Array.isArray(classifications) && classifications.length > 0) {
        const diffMap = new Map<number, DifficultyLevel>();
        classifications.forEach(item => {
          if (item.id !== undefined) diffMap.set(item.id, item.difficulty);
        });

        const updatedList: Question[] = targetQuestions.map(q => {
          if (diffMap.has(q.id!)) {
            return { ...q, difficulty: diffMap.get(q.id!)!, updatedDate: new Date().toISOString() };
          }
          return q;
        });

        await onUpdateBatch(updatedList);
        setAiNotice(`Successfully re-classified ${updatedList.length} questions!`);
      } else {
        setAiNotice('AI Classification completed.');
      }
    } catch (err: any) {
      setAiNotice(`AI Error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const questionsWithoutExplanation = useMemo(() => {
    return filteredQuestions.filter(q => !q.explanation || q.explanation.trim() === '');
  }, [filteredQuestions]);

  const handleAiExplainBatch = async (mode: 'selected' | 'missing' | 'all') => {
    let targetQuestions: Question[] = [];

    if (mode === 'selected') {
      targetQuestions = questions.filter(q => selectedIds.has(q.id!));
    } else if (mode === 'missing') {
      targetQuestions = questionsWithoutExplanation;
    } else {
      targetQuestions = filteredQuestions;
    }

    if (targetQuestions.length === 0) {
      if (mode === 'missing') {
        alert('All questions in the current view already have AI explanations!');
      } else {
        alert('No questions found to generate explanations.');
      }
      return;
    }

    setIsAiLoading(true);
    setAiNotice(`Generating AI explanations for ${targetQuestions.length} MCQs...`);

    try {
      const explanations = await callAiExplain(
        targetQuestions.map((q, idx) => ({
          id: q.id,
          index: idx,
          subject: q.subject || 'General',
          chapter: q.chapter || 'General',
          question: q.question,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          answer: q.answer
        })),
        activeAiConfig
      );

      if (Array.isArray(explanations) && explanations.length > 0) {
        const expMap = new Map<number, string>();
        explanations.forEach(item => {
          if (item.explanation) {
            const qId = (item as any).id !== undefined 
              ? (item as any).id 
              : (item.idTemp !== undefined ? item.idTemp : targetQuestions[item.index]?.id);
            if (qId !== undefined) {
              expMap.set(qId, item.explanation);
            }
          }
        });

        const updatedList: Question[] = questions
          .filter(q => expMap.has(q.id!))
          .map(q => ({
            ...q,
            explanation: expMap.get(q.id!)!,
            updatedDate: new Date().toISOString()
          }));

        await onUpdateBatch(updatedList);
        setAiNotice(`Successfully created AI explanations for ${updatedList.length} questions in 1-click!`);
      } else {
        setAiNotice('AI Explanation generation completed.');
      }
    } catch (err: any) {
      setAiNotice(`AI Error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiTranslateDualLanguage = async (mode: 'selected' | 'all' | 'single', singleQuestion?: Question) => {
    let targetQuestions: Question[] = [];

    if (mode === 'single' && singleQuestion) {
      targetQuestions = [singleQuestion];
    } else if (mode === 'selected') {
      targetQuestions = questions.filter(q => selectedIds.has(q.id!));
    } else {
      targetQuestions = filteredQuestions;
    }

    if (targetQuestions.length === 0) {
      alert('Please select or filter at least one question to convert to Dual Language (English & Hindi).');
      return;
    }

    setIsAiLoading(true);
    setAiNotice(`Converting ${targetQuestions.length} MCQ(s) to Dual Language (English & Hindi)...`);

    try {
      const results = await callAiTranslateDualLanguage(targetQuestions, activeAiConfig);
      if (Array.isArray(results) && results.length > 0) {
        let updatedCount = 0;
        let skippedCount = 0;

        const resMap = new Map<number, typeof results[0]>();
        results.forEach(item => {
          const qId = item.id !== undefined ? item.id : targetQuestions[item.index]?.id;
          if (qId !== undefined) {
            resMap.set(qId, item);
          }
        });

        const updatedList: Question[] = questions
          .filter(q => resMap.has(q.id!))
          .map(q => {
            const item = resMap.get(q.id!)!;
            if (item.skippedLanguageSubject) {
              skippedCount++;
              return q;
            }
            updatedCount++;
            const sanitized = sanitizeBilingualQuestionAndTranslation(
              item.question || q.question,
              item.translation || q.translation
            );
            return {
              ...q,
              question: sanitized.question,
              translation: sanitized.translation,
              optionA: item.optionA || q.optionA,
              optionB: item.optionB || q.optionB,
              optionC: item.optionC || q.optionC,
              optionD: item.optionD || q.optionD,
              explanation: item.explanation || q.explanation,
              updatedDate: new Date().toISOString()
            };
          });

        if (updatedCount > 0) {
          await onUpdateBatch(updatedList);
        }

        let notice = `Successfully converted ${updatedCount} question(s) to Dual Language (English & Hindi)!`;
        if (skippedCount > 0) {
          notice += ` (${skippedCount} English/Hindi Grammar or Vocab question(s) excluded as requested).`;
        }
        setAiNotice(notice);
      } else {
        setAiNotice('Dual Language conversion completed.');
      }
    } catch (err: any) {
      setAiNotice(`Dual Language AI Error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const openAddModal = () => {
    setFormData({
      subject: subjects[0] || 'Quantitative Aptitude',
      chapter: 'General',
      question: '',
      translation: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      answer: 'A',
      difficulty: 'Moderate',
      usageCount: 0,
      questionStatus: 'Fresh',
      chapterCoverageScore: 8
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (q: Question) => {
    setEditingQuestion(q);
    setFormData({ ...q });
  };

  const handleGenerateSingleExplanation = async () => {
    if (!formData.question || !formData.optionA) {
      alert('Please enter at least the question stem and options before generating an AI explanation.');
      return;
    }

    setIsAiLoading(true);
    setAiNotice('Generating AI explanation...');

    try {
      const explanations = await callAiExplain(
        [{
          index: 0,
          subject: formData.subject || 'General',
          chapter: formData.chapter || '',
          question: formData.question,
          optionA: formData.optionA || '',
          optionB: formData.optionB || '',
          optionC: formData.optionC || '',
          optionD: formData.optionD || '',
          answer: formData.answer || 'A'
        }],
        activeAiConfig
      );

      if (explanations && explanations[0]?.explanation) {
        setFormData(prev => ({ ...prev, explanation: explanations[0].explanation }));
        setAiNotice('AI Explanation generated successfully!');
      } else {
        setAiNotice('Could not generate explanation. Please verify API key.');
      }
    } catch (err: any) {
      setAiNotice(`AI error: ${err.message}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveForm = async () => {
    if (!formData.question || !formData.optionA || !formData.optionB || !formData.optionC || !formData.optionD) {
      alert('Please fill in all required question and option fields.');
      return;
    }

    const nowIso = new Date().toISOString();

    if (editingQuestion) {
      await onUpdateQuestion({
        ...editingQuestion,
        ...formData,
        updatedDate: nowIso
      } as Question);
      setEditingQuestion(null);
    } else {
      await onAddQuestion({
        subject: formData.subject || 'General',
        chapter: formData.chapter || 'General',
        question: formData.question!,
        translation: formData.translation,
        optionA: formData.optionA!,
        optionB: formData.optionB!,
        optionC: formData.optionC!,
        optionD: formData.optionD!,
        answer: (formData.answer || 'A') as 'A' | 'B' | 'C' | 'D',
        difficulty: (formData.difficulty || 'Moderate') as DifficultyLevel,
        usageCount: 0,
        questionStatus: 'Fresh',
        chapterCoverageScore: 8,
        createdDate: nowIso,
        updatedDate: nowIso
      });
      setIsAddModalOpen(false);
    }
  };

  // Status Badge Colors mapping
  const getStatusBadge = (status: QuestionStatus) => {
    switch (status) {
      case 'Fresh':
        return <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-semibold">Fresh</span>;
      case 'Used':
        return <span className="bg-blue-950 text-blue-400 border border-blue-800 px-2 py-0.5 rounded text-[10px] font-semibold">Used</span>;
      case 'Frequent':
        return <span className="bg-amber-950 text-amber-400 border border-amber-800 px-2 py-0.5 rounded text-[10px] font-semibold">Frequent</span>;
      case 'Overused':
        return <span className="bg-rose-950 text-rose-400 border border-rose-800 px-2 py-0.5 rounded text-[10px] font-semibold">Overused</span>;
      case 'Retired':
        return <span className="bg-purple-950 text-purple-400 border border-purple-800 px-2 py-0.5 rounded text-[10px] font-semibold">Retired</span>;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Filter Sidebar */}
      <div className="w-full lg:w-64 space-y-4 flex-shrink-0">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4">
          <div className="flex items-center justify-between text-white font-semibold text-xs border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-blue-400" />
              <span>Filter Question Bank</span>
            </div>
            <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full font-semibold">
              {filteredQuestions.length} / {questions.length}
            </span>
          </div>

          {/* Global Question Bank Search Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-blue-300 flex items-center justify-between">
              <span className="flex items-center space-x-1">
                <Search className="w-3.5 h-3.5 text-blue-400" />
                <span>Search Questions (प्रश्न खोजें)</span>
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-[10px] text-slate-400 hover:text-rose-400 underline font-normal"
                >
                  Clear
                </button>
              )}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Type keywords, question stem, options, ID..."
                className="w-full bg-slate-950 border border-blue-500/40 text-slate-100 text-xs rounded-lg pl-8 pr-7 py-2 focus:outline-none focus:border-blue-400 placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-white p-0.5 rounded-full hover:bg-slate-800"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="text-[10px] text-blue-400 font-medium">
                Found <strong>{filteredQuestions.length}</strong> matching MCQ(s)
              </p>
            )}
          </div>

          {/* Subject Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400 flex items-center space-x-1">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Subject</span>
            </label>
            <select
              value={selectedSubject}
              onChange={e => {
                setSelectedSubject(e.target.value);
                setSelectedChapter('ALL');
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">All Subjects ({questions.length})</option>
              {subjects.map(s => {
                const sLower = s.toLowerCase();
                const count = questions.filter(q => (q.subject || '').trim().toLowerCase() === sLower).length;
                return (
                  <option key={s} value={s}>
                    {s} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Chapter Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Chapter / Topic</span>
            </label>
            <select
              value={selectedChapter}
              onChange={e => {
                setSelectedChapter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="ALL">
                All Chapters ({
                  selectedSubject === 'ALL'
                    ? questions.length
                    : questions.filter(q => (q.subject || '').trim().toLowerCase() === selectedSubject.trim().toLowerCase()).length
                })
              </option>
              {chapters.map(c => {
                const cLower = c.toLowerCase();
                const selSubLower = selectedSubject.trim().toLowerCase();
                const count = questions.filter(q => {
                  const matchSub = selectedSubject === 'ALL' || (q.subject || '').trim().toLowerCase() === selSubLower;
                  const matchChap = (q.chapter || '').trim().toLowerCase() === cLower;
                  return matchSub && matchChap;
                }).length;
                return (
                  <option key={c} value={c}>
                    {c} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Difficulty Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Difficulty Level</label>
            <select
              value={selectedDifficulty}
              onChange={e => {
                setSelectedDifficulty(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Difficulties</option>
              <option value="Easy">Easy</option>
              <option value="Moderate">Moderate</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-slate-400">Usage Status</label>
            <select
              value={selectedStatus}
              onChange={e => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DUPLICATES">⚠️ Duplicate MCQs ({duplicateStats.redundantMcqCount})</option>
              <option value="Fresh">Fresh (Unused)</option>
              <option value="Used">Used (1-2 mocks)</option>
              <option value="Frequent">Frequent (3-4 mocks)</option>
              <option value="Overused">Overused (5-7 mocks)</option>
              <option value="Retired">Retired (&gt; 7 mocks)</option>
            </select>
          </div>

          <button
            onClick={() => {
              setSelectedSubject('ALL');
              setSelectedChapter('ALL');
              setSelectedDifficulty('ALL');
              setSelectedStatus('ALL');
              setSearchQuery('');
              setCurrentPage(1);
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            Reset Filters
          </button>

          <button
            onClick={() => openShiftModal()}
            className="w-full bg-indigo-950/90 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 text-xs py-2 px-3 rounded-lg flex items-center justify-center space-x-2 font-bold transition-all shadow-sm"
            title="Shift or reassign Subject to Subject, or Subject Chapter to another Subject Chapter"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
            <span>Shift Subject / Chapter</span>
          </button>
        </div>
      </div>

      {/* Right Content Table */}
      <div className="flex-1 space-y-4">
        {/* View Mode Selection Tabs (All MCQs / Recently Added / Recently Deleted Recycle Bin) */}
        <div className="bg-[#10153d] border border-[#232f7a] p-2 rounded-xl flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                viewMode === 'all'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>All Question Bank</span>
              <span className="ml-1 bg-black/20 text-blue-200 px-2 py-0.5 rounded-full text-[10px]">
                {questions.length}
              </span>
            </button>

            <button
              onClick={() => setViewMode('added')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                viewMode === 'added'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-emerald-300" />
              <span>Recently Added MCQs</span>
              <span className="ml-1 bg-black/20 text-emerald-200 px-2 py-0.5 rounded-full text-[10px]">
                {addedMcqs.length}
              </span>
            </button>

            <button
              onClick={() => setViewMode('deleted')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
                viewMode === 'deleted'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-300" />
              <span>Recently Deleted / Recycle Bin</span>
              <span className="ml-1 bg-black/20 text-rose-200 px-2 py-0.5 rounded-full text-[10px]">
                {deletedMcqs.length}
              </span>
            </button>
          </div>

          {viewMode === 'all' && (
            <button
              onClick={openAddModal}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add MCQ</span>
            </button>
          )}
        </div>

        {viewMode === 'deleted' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Recently Deleted MCQs / Recycle Bin ({deletedMcqs.length})</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Memory audit log of deleted questions. Click "Restore Question" to re-add any MCQ back to your Question Bank.
                </p>
              </div>
              {deletedMcqs.length > 0 && onClearDeletedLog && (
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to permanently clear the Recycle Bin history log?')) {
                      onClearDeletedLog();
                    }
                  }}
                  className="bg-rose-950/80 hover:bg-rose-800 border border-rose-800/80 text-rose-200 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  Clear Recycle Bin Log
                </button>
              )}
            </div>

            {deletedMcqs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No deleted MCQs recorded in history log.
              </div>
            ) : (
              <div className="space-y-3">
                {deletedMcqs.map(item => (
                  <div
                    key={item.id + '_' + item.deletedAt}
                    className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col md:flex-row md:items-start justify-between gap-4 hover:border-slate-700 transition-all"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-1 text-[11px]">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                          ID: #{item.question.id || 'N/A'}
                        </span>
                        <span className="bg-blue-950 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded font-medium">
                          {item.question.subject}
                        </span>
                        <span className="bg-indigo-950 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded font-medium">
                          {item.question.chapter}
                        </span>
                        <span className="text-slate-400 flex items-center space-x-1 ml-auto text-[10px]">
                          <Clock className="w-3 h-3 text-rose-400 inline mr-0.5" />
                          Deleted on: {new Date(item.deletedAt).toLocaleString()}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-white leading-relaxed">
                        {item.question.question}
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                        <div className={item.question.answer === 'A' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          A) {item.question.optionA}
                        </div>
                        <div className={item.question.answer === 'B' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          B) {item.question.optionB}
                        </div>
                        <div className={item.question.answer === 'C' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          C) {item.question.optionC}
                        </div>
                        <div className={item.question.answer === 'D' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          D) {item.question.optionD}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 flex-shrink-0 self-end md:self-center">
                      {onRestoreDeletedMcq && (
                        <button
                          onClick={async () => {
                            await onRestoreDeletedMcq(item);
                          }}
                          className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition-colors shadow-md"
                          title="Restore this question back into the Question Bank"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Restore Question</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === 'added' && (
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Recently Added MCQs Log ({addedMcqs.length})</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Audit log of recently added questions saved in platform memory.
                </p>
              </div>
            </div>

            {addedMcqs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No recently added MCQs recorded in history log.
              </div>
            ) : (
              <div className="space-y-3">
                {addedMcqs.map(item => (
                  <div
                    key={item.id + '_' + item.addedAt}
                    className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col justify-between gap-2 hover:border-emerald-800/60 transition-all"
                  >
                    <div className="flex items-center space-x-2 flex-wrap gap-1 text-[11px]">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                        ID: #{item.question.id || 'N/A'}
                      </span>
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded font-medium">
                        {item.question.subject}
                      </span>
                      <span className="bg-blue-950 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded font-medium">
                        {item.question.chapter}
                      </span>
                      <span className="text-slate-400 flex items-center space-x-1 ml-auto text-[10px]">
                        <Clock className="w-3 h-3 text-emerald-400 inline mr-0.5" />
                        Added on: {new Date(item.addedAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-white leading-relaxed">
                      {item.question.question}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                      <div className={item.question.answer === 'A' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        A) {item.question.optionA}
                      </div>
                      <div className={item.question.answer === 'B' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        B) {item.question.optionB}
                      </div>
                      <div className={item.question.answer === 'C' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        C) {item.question.optionC}
                      </div>
                      <div className={item.question.answer === 'D' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        D) {item.question.optionD}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === 'all' && (
          <>
            {/* Top Controls Bar */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-blue-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Type to search entire Question Bank (Question stem, English/Hindi text, options, ID)..."
              className="w-full bg-slate-950 border border-blue-500/40 text-slate-100 text-xs rounded-lg pl-9 pr-20 py-2 focus:outline-none focus:border-blue-400 font-medium placeholder:text-slate-500 shadow-inner"
            />
            {searchQuery && (
              <div className="absolute right-2 top-1.5 flex items-center space-x-1">
                <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full font-bold">
                  {filteredQuestions.length} Found
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {selectedIds.size > 0 ? (
              <>
                <span className="text-xs bg-blue-950 border border-blue-800 text-blue-300 px-2.5 py-1 rounded-md font-medium">
                  {selectedIds.size} Selected
                </span>
                <button
                  onClick={() => handleAiTranslateDualLanguage('selected')}
                  disabled={isAiLoading}
                  className="flex items-center space-x-1.5 bg-cyan-900 hover:bg-cyan-800 text-cyan-100 border border-cyan-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                  title="Single-click AI Dual Language (English & Hindi) conversion for selected MCQs"
                >
                  <Languages className="w-3.5 h-3.5 text-cyan-300" />
                  <span>AI Dual Lang EN+HI ({selectedIds.size})</span>
                </button>
                <button
                  onClick={() => handleAiExplainBatch('selected')}
                  disabled={isAiLoading}
                  className="flex items-center space-x-1.5 bg-emerald-900 hover:bg-emerald-800 text-emerald-100 border border-emerald-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                  title="Generate AI explanations for all selected MCQs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>AI Explain ({selectedIds.size})</span>
                </button>
                <button
                  onClick={handleAiClassifySelected}
                  disabled={isAiLoading}
                  className="flex items-center space-x-1 bg-purple-900 hover:bg-purple-800 text-purple-200 border border-purple-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  <span>AI Classify</span>
                </button>
                <button
                  onClick={() => openShiftModal('SELECTED_MCQS')}
                  disabled={isAiLoading}
                  className="flex items-center space-x-1.5 bg-indigo-900 hover:bg-indigo-800 text-indigo-100 border border-indigo-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                  title="Shift selected questions to a new Subject & Chapter"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Shift ({selectedIds.size})</span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center space-x-1 bg-rose-900 hover:bg-rose-800 text-rose-200 border border-rose-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected</span>
                </button>
              </>
            ) : (
              <>
                {questions.length > 0 && (
                  <button
                    onClick={() => handleAiTranslateDualLanguage('all')}
                    disabled={isAiLoading || filteredQuestions.length === 0}
                    className="flex items-center space-x-1.5 bg-gradient-to-r from-cyan-700 to-blue-700 hover:from-cyan-600 hover:to-blue-600 text-white border border-cyan-500/50 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md"
                    title="1-click AI Convert all visible MCQs into Dual Language (English + Hindi)"
                  >
                    <Languages className="w-3.5 h-3.5 text-cyan-200" />
                    <span>1-Click AI Dual Lang (EN+HI)</span>
                  </button>
                )}
                {questionsWithoutExplanation.length > 0 && (
                  <button
                    onClick={() => handleAiExplainBatch('missing')}
                    disabled={isAiLoading}
                    className="flex items-center space-x-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border border-emerald-500/50 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md animate-pulse"
                    title="Generate AI explanations for all questions missing explanations in 1-click"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>1-Click AI Explain Missing ({questionsWithoutExplanation.length})</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => openShiftModal()}
              className="flex items-center space-x-1.5 bg-indigo-900 hover:bg-indigo-800 text-indigo-100 border border-indigo-600 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              title="Shift/Reassign entire Subject to another Subject, or Subject Chapter to another Subject Chapter"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-300" />
              <span>Shift Subject/Chapter</span>
            </button>

            {onOpenDuplicateModal && (
              <button
                onClick={onOpenDuplicateModal}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm ${
                  duplicateStats.redundantMcqCount > 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Manage and clean duplicate MCQs"
              >
                <CopyCheck className={`w-3.5 h-3.5 ${duplicateStats.redundantMcqCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
                <span>Duplicates ({duplicateStats.redundantMcqCount})</span>
              </button>
            )}

            <button
              onClick={openAddModal}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Question</span>
            </button>

            {questions.length > 0 && onClearAll && (
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="flex items-center space-x-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                title={`Wipe out all stored questions (PIN Protected: ${localStorage.getItem('app_security_pin') || '260298'})`}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Clear All MCQs ({questions.length})</span>
              </button>
            )}
          </div>
        </div>

        {aiNotice && (
          <div className="p-3 bg-purple-950/60 border border-purple-800/50 rounded-xl text-xs text-purple-200 flex items-center justify-between">
            <span>{aiNotice}</span>
            <button onClick={() => setAiNotice(null)} className="text-purple-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Data Table */}
        <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-900 shadow-sm">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      paginatedQuestions.length > 0 &&
                      paginatedQuestions.every(q => selectedIds.has(q.id!))
                    }
                    onChange={toggleSelectAllPage}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                  />
                </th>
                <th className="p-3 w-12">ID</th>
                <th className="p-3">Subject & Chapter</th>
                <th className="p-3 max-w-xs">Question Stem</th>
                <th className="p-3 text-center">Ans</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Difficulty</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {paginatedQuestions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 text-xs">
                    No questions found matching the selected filters.
                  </td>
                </tr>
              ) : (
                paginatedQuestions.map((q, idx) => {
                  const isSelected = selectedIds.has(q.id!);
                  return (
                    <tr
                      key={q.id}
                      className={`hover:bg-slate-800/60 transition-colors ${
                        isSelected ? 'bg-blue-950/20' : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(q.id!)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                        />
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">#{q.id}</td>
                      <td className="p-3 font-medium text-slate-200">
                        <div>{q.subject}</div>
                        <div className="text-[10px] text-slate-400">{q.chapter}</div>
                      </td>
                      <td className="p-3">
                        <p className="line-clamp-2 text-white font-medium">{formatMathSymbols(q.question)}</p>
                        {q.explanation ? (
                          <div className="mt-1 text-[11px] text-blue-300 bg-blue-950/40 border border-blue-900/50 p-1.5 rounded flex items-start space-x-1">
                            <Sparkles className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 font-normal"><strong>Explanation:</strong> {formatMathSymbols(q.explanation)}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-slate-800 border border-slate-700 text-blue-400 font-bold px-2 py-0.5 rounded text-xs">
                          {q.answer}
                        </span>
                      </td>
                      <td className="p-3 text-center space-y-1">
                        <div>{getStatusBadge(q.questionStatus)}</div>
                        {q.id && duplicateStats.duplicateQuestionIds.has(q.id) && (
                          <button
                            onClick={onOpenDuplicateModal}
                            className="inline-flex items-center space-x-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer"
                            title="Click to fix/delete duplicate MCQs"
                          >
                            <CopyCheck className="w-2.5 h-2.5 text-amber-400" />
                            <span>Duplicate</span>
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            q.difficulty === 'Easy'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : q.difficulty === 'Hard'
                              ? 'bg-rose-950 text-rose-400 border-rose-800'
                              : 'bg-amber-950 text-amber-400 border-amber-800'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleAiTranslateDualLanguage('single', q)}
                            disabled={isAiLoading}
                            className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
                            title="Convert this MCQ to Dual Language (English & Hindi)"
                          >
                            <Languages className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(q)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                            title="Edit MCQ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm('Delete this question?')) {
                                await onDeleteQuestion(q.id!);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                            title="Delete MCQ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
          <div className="flex items-center space-x-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:border-blue-500"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Showing {filteredQuestions.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to{' '}
              {Math.min(currentPage * pageSize, filteredQuestions.length)} of {filteredQuestions.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 bg-slate-900 border border-slate-800 disabled:opacity-40 rounded hover:bg-slate-800 text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 bg-slate-900 border border-slate-800 disabled:opacity-40 rounded hover:bg-slate-800 text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Edit / Add Modal */}
      {(isAddModalOpen || editingQuestion) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Database className="w-4 h-4 text-blue-400" />
                <span>{editingQuestion ? 'Edit Question' : 'Add New MCQ'}</span>
              </h3>
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setIsAddModalOpen(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Subject</label>
                <input
                  type="text"
                  list="existing-subjects-list"
                  value={formData.subject || ''}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g. Quantitative Aptitude"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium"
                />
                <datalist id="existing-subjects-list">
                  {subjects.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Chapter / Topic</label>
                <input
                  type="text"
                  list="existing-chapters-list"
                  value={formData.chapter || ''}
                  onChange={e => setFormData({ ...formData, chapter: e.target.value })}
                  placeholder="e.g. Number Systems"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-medium"
                />
                <datalist id="existing-chapters-list">
                  {chapters.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="col-span-2 space-y-1">
                <label className="text-slate-400 block font-semibold flex items-center justify-between">
                  <span>Question Stem *</span>
                  <span className="text-[10px] text-blue-400 font-normal">Math toolbar enabled (e.g. 2^7 → 2⁷)</span>
                </label>
                <textarea
                  rows={3}
                  value={formData.question || ''}
                  onChange={e => setFormData({ ...formData, question: e.target.value })}
                  placeholder="Enter main question text..."
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-sans"
                />
                <MathToolbar
                  value={formData.question || ''}
                  onChange={val => setFormData({ ...formData, question: val })}
                  compact={true}
                />
              </div>

              <div className="col-span-2">
                <label className="text-slate-400 block mb-1 font-semibold">Optional Translation (Hindi / Regional)</label>
                <input
                  type="text"
                  value={formData.translation || ''}
                  onChange={e => setFormData({ ...formData, translation: e.target.value })}
                  placeholder="Optional translated version..."
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Option A *</label>
                <input
                  type="text"
                  value={formData.optionA || ''}
                  onChange={e => setFormData({ ...formData, optionA: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Option B *</label>
                <input
                  type="text"
                  value={formData.optionB || ''}
                  onChange={e => setFormData({ ...formData, optionB: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Option C *</label>
                <input
                  type="text"
                  value={formData.optionC || ''}
                  onChange={e => setFormData({ ...formData, optionC: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Option D *</label>
                <input
                  type="text"
                  value={formData.optionD || ''}
                  onChange={e => setFormData({ ...formData, optionD: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 block font-semibold">Explanation (Educational solution / rationale)</label>
                  <button
                    type="button"
                    onClick={handleGenerateSingleExplanation}
                    disabled={isAiLoading}
                    className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-[11px] bg-blue-950/60 border border-blue-800/50 px-2 py-0.5 rounded transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    <span>{isAiLoading ? 'Generating...' : 'AI Generate Explanation'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={formData.explanation || ''}
                  onChange={e => setFormData({ ...formData, explanation: e.target.value })}
                  placeholder="Detailed explanation for why the answer is correct... (e.g. 128 = 2^7)"
                  className="w-full bg-slate-950 border border-slate-700 text-purple-200 rounded-lg p-2 focus:outline-none focus:border-purple-500 font-sans"
                />
                <MathToolbar
                  value={formData.explanation || ''}
                  onChange={val => setFormData({ ...formData, explanation: val })}
                  compact={true}
                />
                {formData.explanation && (
                  <div className="p-2.5 bg-purple-950/50 border border-purple-900/80 rounded-lg text-xs text-purple-100 font-sans">
                    <span className="text-[10px] text-purple-300 font-bold block mb-0.5">Math Preview:</span>
                    <MathText text={formData.explanation || ''} />
                  </div>
                )}
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Correct Answer *</label>
                <select
                  value={formData.answer || 'A'}
                  onChange={e => setFormData({ ...formData, answer: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Difficulty Level</label>
                <select
                  value={formData.difficulty || 'Moderate'}
                  onChange={e => setFormData({ ...formData, difficulty: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="Easy">Easy</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setIsAddModalOpen(false);
                }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveForm}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-md"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Subject & Chapter Modal */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-950 border border-indigo-700/60 rounded-xl text-indigo-400">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Shift Subject / Chapter</span>
                    <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded-full font-mono">
                      Shift Engine
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Reassign MCQs from one Subject to another, or from a specific Chapter to another Subject/Chapter.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShiftModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setShiftMode('STEP_BY_STEP_SHIFT')}
                className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center space-x-1 ${
                  shiftMode === 'STEP_BY_STEP_SHIFT'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <FolderSync className="w-3.5 h-3.5" />
                <span>Step-by-Step</span>
              </button>

              <button
                type="button"
                onClick={() => setShiftMode('SUBJECT_CHAPTER_TO_TARGET')}
                className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center space-x-1 ${
                  shiftMode === 'SUBJECT_CHAPTER_TO_TARGET'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Chapter ➔ Target</span>
              </button>

              <button
                type="button"
                onClick={() => setShiftMode('SUBJECT_TO_SUBJECT')}
                className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center space-x-1 ${
                  shiftMode === 'SUBJECT_TO_SUBJECT'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Subject ➔ Subject</span>
              </button>

              <button
                type="button"
                onClick={() => setShiftMode('SELECTED_MCQS')}
                className={`py-2 px-2 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center space-x-1 ${
                  shiftMode === 'SELECTED_MCQS'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Selected ({selectedIds.size})</span>
              </button>
            </div>

            {/* Form Fields for Mode 0: Step-by-Step MCQ Picker & Shift */}
            {shiftMode === 'STEP_BY_STEP_SHIFT' && (
              <div className="space-y-3.5">
                {/* Steps 1 & 2: Choose Source Subject & Source Chapter */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center">
                      <span className="w-4 h-4 rounded-full bg-indigo-900 text-indigo-200 text-[10px] inline-flex items-center justify-center font-mono mr-1.5">1</span>
                      <span>Source Subject & Chapter</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {mcqsInSourceChapter.length} MCQs Available
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-300 block mb-1">
                        1. Choose Source Subject (विषय)
                      </label>
                      <select
                        value={shiftSourceSubject}
                        onChange={e => {
                          const newSub = e.target.value;
                          setShiftSourceSubject(newSub);
                          const subChapsMap = new Map<string, string>();
                          questions.forEach(q => {
                            if ((q.subject || '').trim().toLowerCase() === newSub.trim().toLowerCase() && q.chapter && q.chapter.trim()) {
                              const trimmed = q.chapter.trim();
                              const lower = trimmed.toLowerCase();
                              if (!subChapsMap.has(lower)) subChapsMap.set(lower, trimmed);
                            }
                          });
                          const subChaps = Array.from(subChapsMap.values());
                          const firstChap = subChaps[0] || '';
                          setShiftSourceChapter(firstChap);

                          // Update selected MCQs for new subject/chapter
                          const inChap = questions.filter(q => 
                            (q.subject || '').trim().toLowerCase() === newSub.trim().toLowerCase() &&
                            (q.chapter || '').trim().toLowerCase() === firstChap.trim().toLowerCase()
                          );
                          setShiftMcqSelection(new Set(inChap.map(q => q.id!).filter(Boolean)));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-medium"
                      >
                        <option value="">Select Source Subject...</option>
                        {subjects.map(s => {
                          const count = questions.filter(q => (q.subject || '').trim().toLowerCase() === s.toLowerCase()).length;
                          return (
                            <option key={s} value={s}>
                              {s} ({count} MCQs)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-300 block mb-1">
                        2. Choose Source Chapter (अध्याय)
                      </label>
                      <select
                        value={shiftSourceChapter}
                        onChange={e => {
                          const newChap = e.target.value;
                          setShiftSourceChapter(newChap);
                          const inChap = questions.filter(q => 
                            (q.subject || '').trim().toLowerCase() === shiftSourceSubject.trim().toLowerCase() &&
                            (q.chapter || '').trim().toLowerCase() === newChap.trim().toLowerCase()
                          );
                          setShiftMcqSelection(new Set(inChap.map(q => q.id!).filter(Boolean)));
                        }}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-medium"
                      >
                        <option value="">Select Source Chapter...</option>
                        {chaptersForSourceSubject.map(c => {
                          const count = questions.filter(q => 
                            (q.subject || '').trim().toLowerCase() === shiftSourceSubject.trim().toLowerCase() &&
                            (q.chapter || '').trim().toLowerCase() === c.toLowerCase()
                          ).length;
                          return (
                            <option key={c} value={c}>
                              {c} ({count} MCQs)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 3: Select MCQs in Chapter */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center">
                      <span className="w-4 h-4 rounded-full bg-indigo-900 text-indigo-200 text-[10px] inline-flex items-center justify-center font-mono mr-1.5">3</span>
                      <span>Select MCQs to Shift ({shiftMcqSelection.size} / {mcqsInSourceChapter.length})</span>
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={selectAllShiftMcqs}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-indigo-300 px-2 py-0.5 rounded border border-slate-700 transition-colors font-medium"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={deselectAllShiftMcqs}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-2 py-0.5 rounded border border-slate-700 transition-colors font-medium"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Scrollable MCQ List */}
                  <div className="max-h-36 overflow-y-auto border border-slate-800 bg-slate-900/80 rounded-lg p-2 space-y-1.5 custom-scrollbar">
                    {mcqsInSourceChapter.length === 0 ? (
                      <p className="text-slate-500 text-xs italic text-center py-3">
                        No MCQs found in Subject "{shiftSourceSubject || 'Select Subject'}" ➔ Chapter "{shiftSourceChapter || 'Select Chapter'}"
                      </p>
                    ) : (
                      mcqsInSourceChapter.map((q, idx) => {
                        const isChecked = shiftMcqSelection.has(q.id!);
                        return (
                          <div
                            key={q.id || idx}
                            onClick={() => toggleShiftMcq(q.id!)}
                            className={`flex items-start space-x-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-indigo-950/70 border-indigo-600/80 text-slate-100'
                                : 'bg-slate-950/50 border-slate-800/80 text-slate-400 hover:bg-slate-800/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by parent div onClick
                              className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] text-indigo-400 font-bold">
                                  MCQ #{idx + 1} (ID: {q.id})
                                </span>
                                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                                  Ans: {q.answer}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-[11px] leading-tight font-medium text-slate-200">
                                {q.question || 'Empty Question text'}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Step 4: Choose Target Shift Subject & Chapter */}
                <div className="p-3 bg-indigo-950/30 border border-indigo-800/60 rounded-xl space-y-2.5">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                    <span className="w-4 h-4 rounded-full bg-emerald-900 text-emerald-200 text-[10px] inline-flex items-center justify-center font-mono mr-1.5">4</span>
                    Destination Target (Subject & Chapter)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-indigo-200 block mb-1">
                        Target Subject (नया विषय)
                      </label>
                      <input
                        type="text"
                        list="target-subjects-list"
                        value={shiftTargetSubject}
                        onChange={e => setShiftTargetSubject(e.target.value)}
                        placeholder="Select or enter target subject..."
                        className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-400 font-medium"
                      />
                      <datalist id="target-subjects-list">
                        {subjects.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-indigo-200 block mb-1">
                        Target Chapter (नया अध्याय)
                      </label>
                      <input
                        type="text"
                        list="target-chapters-list"
                        value={shiftTargetChapter}
                        onChange={e => setShiftTargetChapter(e.target.value)}
                        placeholder="Select or enter target chapter..."
                        className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-400 font-medium"
                      />
                      <datalist id="target-chapters-list">
                        {allChapters.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Summary Card */}
                <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-xs space-y-1">
                  <div className="flex items-center justify-between text-indigo-200 font-bold">
                    <span className="flex items-center space-x-1.5">
                      <FolderSync className="w-4 h-4 text-indigo-400" />
                      <span>Shift Action Summary:</span>
                    </span>
                    <span className="bg-indigo-900 border border-indigo-700 text-indigo-200 px-2 py-0.5 rounded text-[11px]">
                      {shiftMcqSelection.size} MCQs Ready to Shift & Paste
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Shifting <strong className="text-white">{shiftMcqSelection.size} selected MCQs</strong> from{' '}
                    <strong className="text-indigo-300">"{shiftSourceSubject || 'Source Subject'}"</strong> ➔ Chapter{' '}
                    <strong className="text-indigo-300">"{shiftSourceChapter || 'Source Chapter'}"</strong> to Target Subject{' '}
                    <strong className="text-emerald-400">"{shiftTargetSubject.trim() || 'Target Subject'}"</strong> ➔ Chapter{' '}
                    <strong className="text-emerald-400">"{shiftTargetChapter.trim() || shiftSourceChapter || 'Target Chapter'}"</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Form Fields for Mode 1: Subject to Subject */}
            {shiftMode === 'SUBJECT_TO_SUBJECT' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Source Subject (वर्तमान विषय)
                    </label>
                    <select
                      value={shiftSourceSubject}
                      onChange={e => {
                        setShiftSourceSubject(e.target.value);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500 font-medium"
                    >
                      <option value="">Select Source Subject...</option>
                      {subjects.map(s => {
                        const count = questions.filter(q => (q.subject || '').trim().toLowerCase() === s.toLowerCase()).length;
                        return (
                          <option key={s} value={s}>
                            {s} ({count} MCQs)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-indigo-300 block">
                      Target Subject (नया विषय)
                    </label>
                    <input
                      type="text"
                      list="existing-subjects-list"
                      value={shiftTargetSubject}
                      onChange={e => setShiftTargetSubject(e.target.value)}
                      placeholder="Select existing or type new subject name..."
                      className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-400 font-medium placeholder:text-slate-500"
                    />
                    <datalist id="existing-subjects-list">
                      {subjects.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                </div>

                {/* Live Preview Card */}
                <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-indigo-200 font-bold">
                    <span className="flex items-center space-x-1.5">
                      <FolderSync className="w-4 h-4 text-indigo-400" />
                      <span>Shift Action Summary:</span>
                    </span>
                    <span className="bg-indigo-900 border border-indigo-700 text-indigo-200 px-2 py-0.5 rounded text-[11px]">
                      {shiftMatchingQuestions.length} MCQs Affected
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    All <strong className="text-white">{shiftMatchingQuestions.length} MCQs</strong> in Subject{' '}
                    <strong className="text-indigo-300">"{shiftSourceSubject || 'None'}"</strong> will be shifted to Target Subject{' '}
                    <strong className="text-emerald-400">"{shiftTargetSubject.trim() || 'New Subject'}"</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Form Fields for Mode 2: Subject in Chapter to Other Subject in Chapter */}
            {shiftMode === 'SUBJECT_CHAPTER_TO_TARGET' && (
              <div className="space-y-4">
                {/* Source Selection */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    1. Source Location (स्थान जहाँ से शिफ्ट करना है)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Source Subject
                      </label>
                      <select
                        value={shiftSourceSubject}
                        onChange={e => {
                          const newSub = e.target.value;
                          setShiftSourceSubject(newSub);
                          const subChaps = questions
                            .filter(q => (q.subject || '').trim().toLowerCase() === newSub.trim().toLowerCase())
                            .map(q => q.chapter)
                            .filter(Boolean);
                          if (subChaps.length > 0) {
                            setShiftSourceChapter(subChaps[0]);
                          } else {
                            setShiftSourceChapter('');
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-medium"
                      >
                        <option value="">Select Source Subject...</option>
                        {subjects.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Source Chapter
                      </label>
                      <select
                        value={shiftSourceChapter}
                        onChange={e => setShiftSourceChapter(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-medium"
                      >
                        <option value="">Select Source Chapter...</option>
                        {chaptersForSourceSubject.map(c => {
                          const count = questions.filter(q => 
                            (q.subject || '').trim().toLowerCase() === shiftSourceSubject.trim().toLowerCase() &&
                            (q.chapter || '').trim().toLowerCase() === c.toLowerCase()
                          ).length;
                          return (
                            <option key={c} value={c}>
                              {c} ({count} MCQs)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Target Selection */}
                <div className="p-3 bg-indigo-950/30 border border-indigo-800/60 rounded-xl space-y-3">
                  <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">
                    2. Destination Location (स्थान जहाँ भेजना है)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-indigo-200 block mb-1">
                        Target Subject
                      </label>
                      <input
                        type="text"
                        list="target-subjects-list"
                        value={shiftTargetSubject}
                        onChange={e => setShiftTargetSubject(e.target.value)}
                        placeholder="Select or enter target subject..."
                        className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-400 font-medium"
                      />
                      <datalist id="target-subjects-list">
                        {subjects.map(s => <option key={s} value={s} />)}
                      </datalist>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-indigo-200 block mb-1">
                        Target Chapter
                      </label>
                      <input
                        type="text"
                        list="target-chapters-list"
                        value={shiftTargetChapter}
                        onChange={e => setShiftTargetChapter(e.target.value)}
                        placeholder="Select or enter target chapter..."
                        className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-lg p-2 focus:outline-none focus:border-indigo-400 font-medium"
                      />
                      <datalist id="target-chapters-list">
                        {allChapters.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                </div>

                {/* Live Preview Card */}
                <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-indigo-200 font-bold">
                    <span className="flex items-center space-x-1.5">
                      <FolderSync className="w-4 h-4 text-indigo-400" />
                      <span>Shift Action Summary:</span>
                    </span>
                    <span className="bg-indigo-900 border border-indigo-700 text-indigo-200 px-2 py-0.5 rounded text-[11px]">
                      {shiftMatchingQuestions.length} MCQs Found
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Shifting <strong className="text-white">{shiftMatchingQuestions.length} MCQs</strong> from{' '}
                    <strong className="text-indigo-300">"{shiftSourceSubject || 'Sub'}"</strong> ➔ Chapter{' '}
                    <strong className="text-indigo-300">"{shiftSourceChapter || 'Chap'}"</strong> to Target Subject{' '}
                    <strong className="text-emerald-400">"{shiftTargetSubject.trim() || 'Target Sub'}"</strong> ➔ Chapter{' '}
                    <strong className="text-emerald-400">"{shiftTargetChapter.trim() || shiftSourceChapter || 'Target Chap'}"</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Form Fields for Mode 3: Selected MCQs */}
            {shiftMode === 'SELECTED_MCQS' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-indigo-300 block">
                      Target Subject (नया विषय)
                    </label>
                    <input
                      type="text"
                      list="existing-subjects-list"
                      value={shiftTargetSubject}
                      onChange={e => setShiftTargetSubject(e.target.value)}
                      placeholder="Select existing or type target subject..."
                      className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-400 font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-indigo-300 block">
                      Target Chapter (नया अध्याय)
                    </label>
                    <input
                      type="text"
                      list="existing-chapters-list"
                      value={shiftTargetChapter}
                      onChange={e => setShiftTargetChapter(e.target.value)}
                      placeholder="Select existing or type target chapter..."
                      className="w-full bg-slate-950 border border-indigo-500/60 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-400 font-medium"
                    />
                  </div>
                </div>

                {/* Live Preview Card */}
                <div className="p-3.5 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-indigo-200 font-bold">
                    <span className="flex items-center space-x-1.5">
                      <FolderSync className="w-4 h-4 text-indigo-400" />
                      <span>Shift Selected MCQs:</span>
                    </span>
                    <span className="bg-indigo-900 border border-indigo-700 text-indigo-200 px-2 py-0.5 rounded text-[11px]">
                      {selectedIds.size} Selected Questions
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Reassigning <strong className="text-white">{selectedIds.size} checked MCQs</strong> to Subject{' '}
                    <strong className="text-emerald-400">"{shiftTargetSubject.trim() || 'Target Subject'}"</strong> & Chapter{' '}
                    <strong className="text-emerald-400">"{shiftTargetChapter.trim() || 'Target Chapter'}"</strong>.
                  </p>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-500 font-medium">
                Updates local database & syncs with cloud.
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteShift}
                  disabled={shiftMatchingQuestions.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all flex items-center space-x-1.5"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Execute Shift ({shiftMatchingQuestions.length})</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        requiredPin="260298"
        title="Clear All MCQs Security Verification"
        description={`Wiping all ${questions.length} pre-stored questions requires security PIN authorization.`}
        onSuccess={async () => {
          if (onClearAll) {
            await onClearAll();
            setSelectedIds(new Set());
          }
        }}
      />

      {/* Interactive AI Processing Overlay */}
      {isAiLoading && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e1230] border border-purple-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-3 max-w-sm w-full text-center animate-in fade-in zoom-in-95">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin" />
              <Sparkles className="w-5 h-5 text-purple-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">AI Engine Processing...</h3>
              <p className="text-xs text-purple-200 mt-1">
                {aiNotice || 'Executing Gemini AI operation for Question Bank...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
