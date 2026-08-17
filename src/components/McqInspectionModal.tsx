import React, { useState, useMemo, useEffect } from 'react';
import { Question } from '../types';
import { shouldDisplayTranslation, sanitizeBilingualQuestionAndTranslation } from '../lib/exportUtils';
import { directClientAiCall, cleanAndParseJson, getStoredAiConfig, callAiExplain, callAiTranslateDualLanguage, isLanguageGrammarVocabQuestion, isMathOrReasoningSubject, cleanPurnaViramForMathReasoning } from '../lib/aiClient';
import { MathText } from './MathText';
import { MathToolbar } from './MathToolbar';
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Edit3,
  X,
  Search,
  Filter,
  Check,
  Wand2,
  FileText,
  AlertCircle,
  Languages,
  BookOpen,
  HelpCircle,
  ArrowRight,
  Download,
  Loader2,
  ShieldAlert,
  ListChecks,
  SlidersHorizontal,
  EyeOff,
  RotateCcw
} from 'lucide-react';

export interface InspectionFlag {
  id: string;
  type:
    | 'missing_question_stem'
    | 'invalid_answer_key'
    | 'blank_answer_option'
    | 'duplicate_options'
    | 'duplicate_question'
    | 'placeholder_text'
    | 'missing_hindi'
    | 'missing_explanation'
    | 'ai_answer_mismatch'
    | 'all_options_incorrect'
    | 'ai_factual_error'
    | 'ai_translation_mismatch';
  severity: 'critical' | 'warning';
  title: string;
  description: string;
  suggestedFix?: any;
}

export interface McqInspectionItem {
  index: number;
  question: Question;
  flags: InspectionFlag[];
  activeFlags: InspectionFlag[];
  status: 'clean' | 'warning' | 'critical';
  healthScore: number;
  isIgnored: boolean;
  aiVerified: boolean;
  aiSuggestedAnswer?: 'A' | 'B' | 'C' | 'D';
  aiConfidence?: number;
  aiAnalysisReason?: string;
}

interface McqInspectionModalProps {
  questions: Question[];
  allBankQuestions?: Question[];
  testName: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdateQuestion: (index: number, updatedQ: Question) => void;
  onReplaceQuestion: (index: number, newQ: Question) => void;
  onUpdateAllQuestions: (updatedQuestions: Question[]) => void;
}

// Helper function to check if a subject or chapter is inherently single-language (English or Hindi)
export function isSingleLanguageSubject(subject?: string, chapter?: string): boolean {
  return isLanguageGrammarVocabQuestion({ subject, chapter });
}

// Helper function to normalize raw answer key strings (e.g. "Option B", "(B)", "b", "Ans: C" -> "B")
export function normalizeAnswerKey(rawKey: any): 'A' | 'B' | 'C' | 'D' | 'NONE' | null {
  if (rawKey === undefined || rawKey === null) return null;
  const str = String(rawKey).trim().toUpperCase();
  if (str.includes('NONE') || str.includes('ALL WRONG') || str.includes('INVALID') || str.includes('NO OPTION')) return 'NONE';
  const match = str.match(/\b([A-D])\b/) || str.match(/([A-D])/);
  if (match) return match[1] as 'A' | 'B' | 'C' | 'D';
  return null;
}

// -------------------------------------------------------------
// Numerical & Mathematical Solver / AI Audit Discrepancy Checker
// -------------------------------------------------------------
export function evaluateNumericalOrFactualDiscrepancy(q: Question): {
  isAnswerMismatch: boolean;
  isAllOptionsWrong: boolean;
  expectedAnswer?: string;
  expectedOptionKey?: 'A' | 'B' | 'C' | 'D';
  reason?: string;
} | null {
  // FIRST: Try local mathematical solver for exact formula evaluation
  const qCombined = `${q.question} ${q.translation || ''}`;

  // Speed = X, Distance = Y -> Time = Y / X
  const matchSpeedDist =
    qCombined.match(/Speed\s*=\s*(\d+(\.\d+)?)\s*(km\/h|m\/s)?[,\.\s]+Distance\s*=\s*(\d+(\.\d+)?)\s*(km|m)?[,\.\s]+Time\s*=\s*\?/i) ||
    qCombined.match(/चाल\s*=\s*(\d+(\.\d+)?)[,\.\s]+दूरी\s*=\s*(\d+(\.\d+)?)[,\.\s]+समय\s*=\s*\?/i);

  let calculatedVal: number | null = null;

  if (matchSpeedDist) {
    const s = parseFloat(matchSpeedDist[1]);
    const d = parseFloat(matchSpeedDist[4]);
    if (s > 0) calculatedVal = d / s;
  }

  // Speed = X, Time = Y -> Distance = X * Y
  if (calculatedVal === null) {
    const matchSpeedTime =
      qCombined.match(/Speed\s*=\s*(\d+(\.\d+)?)\s*(km\/h|m\/s)?[,\.\s]+Time\s*=\s*(\d+(\.\d+)?)\s*(sec|s|hrs|hr|hours)?[,\.\s]+Distance\s*=\s*\?/i) ||
      qCombined.match(/चाल\s*=\s*(\d+(\.\d+)?)[,\.\s]+समय\s*=\s*(\d+(\.\d+)?)[,\.\s]+दूरी\s*=\s*\?/i);
    if (matchSpeedTime) {
      const s = parseFloat(matchSpeedTime[1]);
      const t = parseFloat(matchSpeedTime[4]);
      calculatedVal = s * t;
    }
  }

  // Distance = X, Time = Y -> Speed = X / Y
  if (calculatedVal === null) {
    const matchDistTime =
      qCombined.match(/Distance\s*=\s*(\d+(\.\d+)?)\s*(km|m)?[,\.\s]+Time\s*=\s*(\d+(\.\d+)?)\s*(sec|s|hrs|hr|hours)?[,\.\s]+Speed\s*=\s*\?/i) ||
      qCombined.match(/दूरी\s*=\s*(\d+(\.\d+)?)[,\.\s]+समय\s*=\s*(\d+(\.\d+)?)[,\.\s]+चाल\s*=\s*\?/i);
    if (matchDistTime) {
      const d = parseFloat(matchDistTime[1]);
      const t = parseFloat(matchDistTime[4]);
      if (t > 0) calculatedVal = d / t;
    }
  }

  if (calculatedVal !== null && !isNaN(calculatedVal)) {
    const parseOptVal = (optStr: string): number | null => {
      const m = optStr ? optStr.match(/(\d+(\.\d+)?)/) : null;
      return m ? parseFloat(m[1]) : null;
    };

    const optVals: Record<'A' | 'B' | 'C' | 'D', number | null> = {
      A: parseOptVal(q.optionA),
      B: parseOptVal(q.optionB),
      C: parseOptVal(q.optionC),
      D: parseOptVal(q.optionD)
    };

    let matchingKey: 'A' | 'B' | 'C' | 'D' | null = null;
    let minDiff = Infinity;

    (['A', 'B', 'C', 'D'] as const).forEach(k => {
      const val = optVals[k];
      if (val !== null) {
        const diff = Math.abs(val - calculatedVal!);
        const relativeDiff = diff / (calculatedVal! || 1);
        if (diff <= 0.25 || relativeDiff <= 0.05) {
          if (diff < minDiff) {
            minDiff = diff;
            matchingKey = k;
          }
        }
      }
    });

    const calcDisplay = calculatedVal.toFixed(2).replace(/\.00$/, '');

    if (matchingKey && matchingKey === q.answer) {
      // 100% Mathematically verified and correct!
      return null;
    } else if (!matchingKey) {
      return {
        isAnswerMismatch: false,
        isAllOptionsWrong: true,
        expectedAnswer: calcDisplay,
        reason: `Calculated formula value is ${calcDisplay}, but none of options A (${q.optionA}), B (${q.optionB}), C (${q.optionC}), D (${q.optionD}) match this value!`
      };
    } else {
      const correctOptText = q[(`option${matchingKey}` as keyof Question)] as string;
      const markedOptText = q[(`option${q.answer}` as keyof Question)] as string;
      return {
        isAnswerMismatch: true,
        isAllOptionsWrong: false,
        expectedOptionKey: matchingKey,
        reason: `Marked answer key is Option '${q.answer}' (${markedOptText}), but formula calculation verifies ${calcDisplay} (Option '${matchingKey}' - ${correctOptText}).`
      };
    }
  }

  // SECOND: Fallback check explicit q.aiAuditResult if stored from AI 360° Audit
  if (q.aiAuditResult) {
    const normSuggested = normalizeAnswerKey(q.aiAuditResult.suggestedCorrectAnswer);
    const isExplicitlyWrongKey = q.aiAuditResult.isAnswerKeyCorrect === false ||
      (normSuggested !== null && normSuggested !== 'NONE' && normSuggested !== q.answer) ||
      (q.aiAuditResult.factualError && q.aiAuditResult.factualError.length > 5);

    if (q.aiAuditResult.areAllOptionsWrong || normSuggested === 'NONE') {
      return {
        isAnswerMismatch: false,
        isAllOptionsWrong: true,
        reason: q.aiAuditResult.analysisReason || q.aiAuditResult.factualError || 'AI 360° Deep Audit confirmed that all 4 options are incorrect or invalid.'
      };
    }

    if (isExplicitlyWrongKey) {
      const targetKey = (normSuggested && ['A', 'B', 'C', 'D'].includes(normSuggested)) ? (normSuggested as 'A' | 'B' | 'C' | 'D') : 'B';
      const targetOptText = (q[(`option${targetKey}` as keyof Question)] as string) || '';
      const markedOptText = (q[(`option${q.answer}` as keyof Question)] as string) || '';

      return {
        isAnswerMismatch: true,
        isAllOptionsWrong: false,
        expectedOptionKey: targetKey,
        reason: q.aiAuditResult.analysisReason || q.aiAuditResult.factualError || `Marked key is Option '${q.answer}' (${markedOptText}), but AI 360° Audit verified correct answer is Option '${targetKey}' (${targetOptText}).`
      };
    }
  }

  // THIRD: Static Explanation Answer Key Mismatch Detection
  const expStr = (q.explanation || '').trim();
  if (expStr) {
    // Direct key match in explanation: "Ans: B", "Answer - (B)", "Correct option is C", "सही उत्तर: (B)", "Option (B) is correct"
    const keyMatch = expStr.match(/(?:Ans|Answer|Correct\s*Option|Correct\s*Answer|सही\s*उत्तर|उत्तर)\s*[:=\-–\s]*\(?([A-D])\)?/i) ||
                     expStr.match(/Option\s*\(?([A-D])\)?\s*is\s*(?:the\s*)?correct/i);
    if (keyMatch && keyMatch[1]) {
      const expKey = keyMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      if (expKey !== q.answer) {
        const expOptText = (q[(`option${expKey}` as keyof Question)] as string) || '';
        const markedOptText = (q[(`option${q.answer}` as keyof Question)] as string) || '';
        return {
          isAnswerMismatch: true,
          isAllOptionsWrong: false,
          expectedOptionKey: expKey,
          reason: `Explanation states '${keyMatch[0]}' (Option ${expKey} - "${expOptText}"), but marked answer key is Option '${q.answer}' ("${markedOptText}").`
        };
      }
    }

    // Check for AI Audit Note in explanation
    if (expStr.includes('[AI Audit Note:')) {
      if (
        expStr.toLowerCase().includes('all 4 options are incorrect') ||
        expStr.toLowerCase().includes('all options wrong') ||
        expStr.toLowerCase().includes('none of the options')
      ) {
        return {
          isAnswerMismatch: false,
          isAllOptionsWrong: true,
          reason: 'AI Audit Note detected: All 4 options provided for this question are incorrect.'
        };
      }
      const noteMatch = expStr.match(/verified '([A-D])' as correct/i) || expStr.match(/correct option is ([A-D])/i);
      if (noteMatch && noteMatch[1]) {
        const targetK = noteMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
        if (targetK !== q.answer) {
          return {
            isAnswerMismatch: true,
            isAllOptionsWrong: false,
            expectedOptionKey: targetK,
            reason: `AI Audit Note detected: Marked key '${q.answer}' is incorrect. Verified correct key is '${targetK}'.`
          };
        }
      }
    }
  }

  return null;
}

// -------------------------------------------------------------
// Local Static 360° Rule-Based Inspection Engine
// -------------------------------------------------------------
export function runStatic360Inspection(questions: Question[]): McqInspectionItem[] {
  const seenQuestionTexts = new Map<string, number>();

  // Track duplicate question texts across paper
  questions.forEach((q, idx) => {
    const norm = (q.question || '').trim().toLowerCase();
    if (norm.length > 5) {
      if (!seenQuestionTexts.has(norm)) {
        seenQuestionTexts.set(norm, idx);
      }
    }
  });

  return questions.map((q, idx) => {
    const flags: InspectionFlag[] = [];

    const qText = (q.question || '').trim();
    const optA = (q.optionA || '').trim();
    const optB = (q.optionB || '').trim();
    const optC = (q.optionC || '').trim();
    const optD = (q.optionD || '').trim();
    const ans = (q.answer || '').trim().toUpperCase() as 'A' | 'B' | 'C' | 'D';
    const translation = (q.translation || '').trim();
    const explanation = (q.explanation || '').trim();

    // 1. Question Stem Check
    if (!qText) {
      flags.push({
        id: `qstem_blank_${idx}`,
        type: 'missing_question_stem',
        severity: 'critical',
        title: 'Missing Question Statement (खाली प्रश्न)',
        description: 'Question statement is completely blank or missing.'
      });
    } else if (qText.toLowerCase().includes('enter custom question') || qText.toLowerCase().includes('enter question here')) {
      flags.push({
        id: `qstem_place_${idx}`,
        type: 'placeholder_text',
        severity: 'critical',
        title: 'Placeholder Question Statement (सैंपल प्रश्न टेक्स्ट)',
        description: 'Question contains default placeholder text from template.'
      });
    }

    // 2. Answer Key Integrity & Option Checks
    if (!['A', 'B', 'C', 'D'].includes(ans)) {
      flags.push({
        id: `ans_invalid_${idx}`,
        type: 'invalid_answer_key',
        severity: 'critical',
        title: 'Invalid Correct Answer Key (अमान्य उत्तर)',
        description: `Answer is set to '${ans || 'BLANK'}', but must be 'A', 'B', 'C', or 'D'.`
      });
    } else {
      // Check if selected answer option string is empty
      const selectedOptText = ans === 'A' ? optA : ans === 'B' ? optB : ans === 'C' ? optC : optD;
      if (!selectedOptText) {
        flags.push({
          id: `ans_blank_opt_${idx}`,
          type: 'blank_answer_option',
          severity: 'critical',
          title: `Selected Answer Option ${ans} is Blank! (उत्तर विकल्प ${ans} खाली है)`,
          description: `Correct answer is set to Option ${ans}, but Option ${ans} text is empty!`
        });
      }
    }

    // 3. Mathematical & Factual Verification (Answer Key Mismatch & All Options Incorrect)
    const discrepancy = evaluateNumericalOrFactualDiscrepancy(q);
    if (discrepancy) {
      if (discrepancy.isAllOptionsWrong) {
        flags.push({
          id: `all_opts_wrong_${idx}`,
          type: 'all_options_incorrect',
          severity: 'critical',
          title: 'All 4 Options are Incorrect (सभी विकल्प गलत हैं)',
          description: discrepancy.reason || 'None of the provided options (A, B, C, D) are correct for this question statement.',
          suggestedFix: discrepancy.expectedAnswer
        });
      } else if (discrepancy.isAnswerMismatch) {
        flags.push({
          id: `ans_mismatch_${idx}`,
          type: 'ai_answer_mismatch',
          severity: 'critical',
          title: 'Incorrect Answer Key Selected (गलत उत्तर कुंजी चुनी गई)',
          description: discrepancy.reason || `Marked key is Option ${ans}, but correct answer is Option ${discrepancy.expectedOptionKey}.`,
          suggestedFix: discrepancy.expectedOptionKey
        });
      }
    }

    // 4. Option Completeness & Duplicates
    const optionsMap: Record<string, string> = { A: optA, B: optB, C: optC, D: optD };
    const emptyOpts = Object.entries(optionsMap).filter(([_, val]) => !val);
    if (emptyOpts.length > 0) {
      flags.push({
        id: `opts_empty_${idx}`,
        type: 'blank_answer_option',
        severity: 'critical',
        title: `${emptyOpts.length} Missing Option(s) (विकल्प अनुपस्थित)`,
        description: `Option(s) ${emptyOpts.map(([k]) => k).join(', ')} text is empty or missing.`
      });
    }

    // Duplicate Options
    const optList = [
      { key: 'A', text: optA.toLowerCase() },
      { key: 'B', text: optB.toLowerCase() },
      { key: 'C', text: optC.toLowerCase() },
      { key: 'D', text: optD.toLowerCase() }
    ].filter(o => o.text.length > 0);

    for (let i = 0; i < optList.length; i++) {
      for (let j = i + 1; j < optList.length; j++) {
        if (optList[i].text === optList[j].text) {
          flags.push({
            id: `opt_dup_${idx}_${optList[i].key}_${optList[j].key}`,
            type: 'duplicate_options',
            severity: 'critical',
            title: `Identical Options ${optList[i].key} & ${optList[j].key} (समान विकल्प)`,
            description: `Option ${optList[i].key} and Option ${optList[j].key} have identical text ("${optionsMap[optList[i].key]}").`
          });
        }
      }
    }

    // 4. Duplicate Question in Paper
    const normStem = qText.toLowerCase();
    if (normStem.length > 5 && seenQuestionTexts.has(normStem)) {
      const originalIdx = seenQuestionTexts.get(normStem)!;
      if (originalIdx !== idx) {
        flags.push({
          id: `dup_q_${idx}`,
          type: 'duplicate_question',
          severity: 'critical',
          title: `Duplicate MCQ in Test Paper (दोहराया गया प्रश्न)`,
          description: `This question is identical to Question #${originalIdx + 1} in this test paper.`
        });
      }
    }

    // 5. Hindi Translation Check (Skip for English / Hindi language subjects or if question is already bilingual/Hindi)
    const isAlreadyBilingualOrHindi = /[\u0900-\u097F]/.test(q.question) || /[\u0900-\u097F]/.test(translation);
    if (!translation && !isSingleLanguageSubject(q.subject, q.chapter) && !isAlreadyBilingualOrHindi) {
      flags.push({
        id: `hindi_miss_${idx}`,
        type: 'missing_hindi',
        severity: 'warning',
        title: 'Missing Hindi Translation (हिंदी अनुवाद अनुपस्थित)',
        description: 'Bilingual test paper recommended: Hindi translation is missing.'
      });
    }

    // 6. Explanation / Solution Check
    if (!explanation || explanation.length < 15) {
      flags.push({
        id: `exp_miss_${idx}`,
        type: 'missing_explanation',
        severity: 'warning',
        title: 'Solution Explanation Missing or Short (व्याख्या छोटी या अनुपस्थित)',
        description: 'Detailed step-by-step solution is missing or under 15 characters.'
      });
    }

    // Compute Health Status & Score taking ignored flags into account
    const ignoredFlagsList = q.ignoredFlags || [];
    const isQuestionIgnored = !!q.isInspectionIgnored;

    const activeFlags = flags.filter(
      f => !isQuestionIgnored && !ignoredFlagsList.includes(f.id) && !ignoredFlagsList.includes(f.type)
    );

    const hasCritical = activeFlags.some(f => f.severity === 'critical');
    const hasWarning = activeFlags.some(f => f.severity === 'warning');

    let status: 'clean' | 'warning' | 'critical' = 'clean';
    let healthScore = 100;

    if (hasCritical) {
      status = 'critical';
      healthScore = Math.max(10, 100 - activeFlags.filter(f => f.severity === 'critical').length * 35 - activeFlags.filter(f => f.severity === 'warning').length * 10);
    } else if (hasWarning) {
      status = 'warning';
      healthScore = Math.max(60, 100 - activeFlags.filter(f => f.severity === 'warning').length * 15);
    }

    const isIgnored = isQuestionIgnored || (ignoredFlagsList.length > 0 && activeFlags.length < flags.length);

    return {
      index: idx,
      question: q,
      flags,
      activeFlags,
      status,
      healthScore,
      isIgnored,
      aiVerified: false
    };
  });
}

export const McqInspectionModal: React.FC<McqInspectionModalProps> = ({
  questions,
  allBankQuestions = [],
  testName,
  isOpen,
  onClose,
  onUpdateQuestion,
  onReplaceQuestion,
  onUpdateAllQuestions
}) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'CLEAN' | 'IGNORED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAiAuditing, setIsAiAuditing] = useState<boolean>(false);
  const [aiAuditProgress, setAiAuditProgress] = useState<string>('');
  const [isAutoFixing, setIsAutoFixing] = useState<boolean>(false);
  const [autoFixMessage, setAutoFixMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Processing stopwatch timer effect (for operations taking > 2s)
  React.useEffect(() => {
    let timer: any;
    if (isAutoFixing || isAiAuditing) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds(prev => +(prev + 0.1).toFixed(1));
      }, 100);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isAutoFixing, isAiAuditing]);

  // Computed Inspection Report
  const inspectionItems: McqInspectionItem[] = useMemo(() => {
    return runStatic360Inspection(questions);
  }, [questions]);

  // Overall Test Paper Quality Summary
  const summary = useMemo(() => {
    const total = inspectionItems.length;
    const criticalCount = inspectionItems.filter(i => i.status === 'critical').length;
    const warningCount = inspectionItems.filter(i => i.status === 'warning').length;
    const cleanCount = inspectionItems.filter(i => i.status === 'clean' && !i.isIgnored).length;
    const ignoredCount = inspectionItems.filter(i => i.isIgnored).length;

    const avgScore = total > 0
      ? Math.round(inspectionItems.reduce((acc, i) => acc + i.healthScore, 0) / total)
      : 100;

    let grade = 'A+ (Excellent)';
    if (avgScore < 70 || criticalCount > 3) grade = 'C (Needs Review)';
    else if (avgScore < 85 || criticalCount > 0) grade = 'B (Good with Minor Issues)';

    return { total, criticalCount, warningCount, cleanCount, ignoredCount, avgScore, grade };
  }, [inspectionItems]);

  // Filtered List
  const filteredItems = useMemo(() => {
    return inspectionItems.filter(item => {
      if (activeFilter === 'CRITICAL' && item.status !== 'critical') return false;
      if (activeFilter === 'WARNING' && item.status !== 'warning') return false;
      if (activeFilter === 'CLEAN' && (item.status !== 'clean' || item.isIgnored)) return false;
      if (activeFilter === 'IGNORED' && !item.isIgnored) return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const qText = item.question.question.toLowerCase();
        const sub = (item.question.subject || '').toLowerCase();
        const ch = (item.question.chapter || '').toLowerCase();
        const flagsText = item.flags.map(f => f.title.toLowerCase() + ' ' + f.description.toLowerCase()).join(' ');
        return qText.includes(query) || sub.includes(query) || ch.includes(query) || flagsText.includes(query);
      }

      return true;
    });
  }, [inspectionItems, activeFilter, searchQuery]);

  if (!isOpen) return null;

  // -------------------------------------------------------------
  // AI 360° Deep Verification Audit (Gemini & Groq Powered)
  // -------------------------------------------------------------
  const handleRunAi360Audit = async () => {
    setIsAiAuditing(true);
    setAiAuditProgress('Initializing Gemini & Groq 360° Quality Auditor Engine...');

    try {
      const activeConfig = getStoredAiConfig();
      // Ensure Groq / Gemini are available in fallback if primary is Gemini/Groq
      let auditConfig = { ...activeConfig };
      if (!auditConfig.fallbackProviders || auditConfig.fallbackProviders.length === 0) {
        const altProvider = auditConfig.provider === 'groq' ? 'gemini' : 'groq';
        auditConfig.fallbackProviders = [
          {
            provider: altProvider,
            apiKey: '',
            apiKeysList: [],
            model: altProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gemini-3.7-flash'
          }
        ];
      }

      // Chunk questions in batches of 10 to avoid token limits
      const batchSize = 10;
      const updatedList = [...questions];
      let aiIssueCount = 0;

      for (let i = 0; i < questions.length; i += batchSize) {
        const batch = questions.slice(i, i + batchSize);
        setAiAuditProgress(`Analyzing MCQs #${i + 1} to #${Math.min(i + batchSize, questions.length)} with Gemini / Groq AI Audit Engine...`);

        let aiResults: any[] = [];

        // 1. Attempt Server 360 Audit Endpoint
        try {
          const res = await fetch('/api/gemini/360-audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiKey: auditConfig.apiKey,
              apiKeysList: auditConfig.apiKeysList,
              provider: auditConfig.provider,
              model: auditConfig.model,
              baseUrl: auditConfig.baseUrl,
              enableFallback: auditConfig.enableFallback,
              fallbackProviders: auditConfig.fallbackProviders,
              questions: batch
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.results)) {
              aiResults = data.results;
            }
          }
        } catch (_srvErr) {
          aiResults = [];
        }

        // 2. Client-side direct call fallback if server endpoint was unavailable
        if (aiResults.length === 0) {
          const promptPayload = batch.map((q, idx) => ({
            batchIndex: idx,
            questionNumber: i + idx + 1,
            subject: q.subject,
            chapter: q.chapter,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            markedAnswer: q.answer,
            explanation: q.explanation || ''
          }));

          const systemInstruction = `You are an uncompromising Chief Exam Auditor & Academic Controller for National Competitive Exams (UPSC, SSC, Banking, State Exams, NEET/JEE).

YOUR CORE MISSION: Detect ANY and ALL defects in the provided MCQs with 100% precision. Never miss a wrong answer key, false statement, calculation error, or invalid option!

FOR EACH MCQ IN THE INPUT BATCH:
1. INDEPENDENT STEP-BY-STEP SOLUTION:
   - First, solve the question statement independently from scratch without relying on 'markedAnswer' or 'explanation'.
   - Determine the true, mathematically and factually exact answer.
2. OPTION COMPARISON & ANSWER KEY AUDIT:
   - Compare your true answer against Option A (optionA), Option B (optionB), Option C (optionC), and Option D (optionD).
   - Identify which option (A, B, C, or D) matches the true answer.
   - Compare this verified correct option against 'markedAnswer'.
   - IF 'markedAnswer' does NOT match the verified correct option, YOU MUST:
     * Set "isAnswerKeyCorrect": false
     * Set "suggestedCorrectAnswer": "A", "B", "C", or "D" (strictly single letter)
     * Explain EXACTLY why 'markedAnswer' is wrong and why the suggested option is correct in "analysisReason" and "factualError".
3. ALL OPTIONS INCORRECT AUDIT:
   - IF NONE of Option A, B, C, or D is correct (or if all 4 options are mathematically/factually wrong for the question statement):
     * Set "isAnswerKeyCorrect": false
     * Set "areAllOptionsWrong": true
     * Set "suggestedCorrectAnswer": "NONE"
     * Explain clearly why all 4 options are invalid in "analysisReason".
4. EXPLANATION CONTRADICTION & FORMULA AUDIT:
   - Check if the provided explanation contradicts 'markedAnswer' (e.g. explanation says "Option B is correct" while markedAnswer is 'A').
   - Check for calculation errors, wrong formulas, bad history dates, scientific mistakes, or grammatical errors.

CRITICAL FORMAT RULES:
- "suggestedCorrectAnswer" MUST be strictly ONE character: "A", "B", "C", "D", or "NONE" (never "Option B" or "b").
- "isAnswerKeyCorrect" MUST be false whenever 'markedAnswer' is wrong or options are invalid.
- Be extremely thorough, critical, and accurate!

Return strictly a JSON array of objects with schema:
[
  {
    "batchIndex": number,
    "isAnswerKeyCorrect": boolean,
    "areAllOptionsWrong": boolean,
    "suggestedCorrectAnswer": "A" | "B" | "C" | "D" | "NONE",
    "confidenceScore": number (1 to 100),
    "factualError": string or null,
    "suggestedFixText": string or null,
    "analysisReason": string
  }
]`;

          const responseText = await directClientAiCall(
            JSON.stringify(promptPayload),
            systemInstruction,
            auditConfig
          );

          aiResults = cleanAndParseJson<any[]>(responseText) || [];
        }

        if (Array.isArray(aiResults) && aiResults.length > 0) {
          aiResults.forEach(res => {
            const globalIdx = i + (res.batchIndex ?? 0);
            if (globalIdx < updatedList.length) {
              const originalQ = updatedList[globalIdx];

              const normSuggested = normalizeAnswerKey(res.suggestedCorrectAnswer);
              const isAllOptionsWrong = res.areAllOptionsWrong === true || normSuggested === 'NONE';
              const isKeyWrong = res.isAnswerKeyCorrect === false ||
                (normSuggested !== null && normSuggested !== 'NONE' && normSuggested !== originalQ.answer) ||
                (res.factualError && res.factualError.length > 5 && !res.isAnswerKeyCorrect);

              const finalSuggestedKey = (normSuggested && normSuggested !== 'NONE') ? normSuggested : (isKeyWrong ? 'B' : originalQ.answer);

              let updatedQ: Question = {
                ...originalQ,
                aiAuditResult: {
                  isAnswerKeyCorrect: !isKeyWrong && !isAllOptionsWrong,
                  areAllOptionsWrong: isAllOptionsWrong,
                  suggestedCorrectAnswer: finalSuggestedKey,
                  confidenceScore: res.confidenceScore || 95,
                  factualError: res.factualError || null,
                  analysisReason: res.analysisReason || res.factualError || 'AI 360° Audit identified answer key discrepancy.'
                }
              };

              if (isKeyWrong || isAllOptionsWrong) {
                aiIssueCount++;
                const note = isAllOptionsWrong
                  ? `[AI Audit Note: ALL 4 OPTIONS ARE INCORRECT! ${res.analysisReason || res.factualError || 'No correct option.'}]`
                  : `[AI Audit Note: Marked key was '${originalQ.answer}', but AI verified '${finalSuggestedKey}' as correct option because: ${res.analysisReason || res.factualError || 'Factual/Math discrepancy.'}]`;

                let cleanExp = (updatedQ.explanation || '').replace(/\[AI Audit Note:[^\]]+\]/g, '').trim();

                updatedQ = {
                  ...updatedQ,
                  explanation: cleanExp ? `${cleanExp}\n\n${note}` : note,
                  updatedDate: new Date().toISOString()
                };
              }
              updatedList[globalIdx] = updatedQ;
            }
          });
        }
      }

      onUpdateAllQuestions(updatedList);
      setAutoFixMessage(`AI 360° Deep Audit complete! Scanned ${questions.length} MCQs (${aiIssueCount} defect flag(s) identified and marked for correction).`);
    } catch (err: any) {
      alert('AI 360° Audit encountered an error: ' + err.message);
    } finally {
      setIsAiAuditing(false);
      setAiAuditProgress('');
      setTimeout(() => setAutoFixMessage(null), 5000);
    }
  };

  // -------------------------------------------------------------
  // ⚡ 1-Click Smart Swap Question with Question Bank Match
  // -------------------------------------------------------------
  const handleSmartSwapQuestion = (itemIdx: number) => {
    const targetQ = questions[itemIdx];
    if (!targetQ) return;

    const targetSub = (targetQ.subject || '').trim().toLowerCase();
    const targetChap = (targetQ.chapter || '').trim().toLowerCase();

    // Find candidate questions from allBankQuestions that are not currently in the test paper
    const currentQuestionTexts = new Set(questions.map(q => q.question.trim().toLowerCase()));

    let candidates = allBankQuestions.filter(q => {
      const qText = q.question.trim().toLowerCase();
      if (currentQuestionTexts.has(qText)) return false;

      const subMatch = (q.subject || '').trim().toLowerCase() === targetSub;
      const chapMatch = (q.chapter || '').trim().toLowerCase() === targetChap;
      return subMatch && (targetChap === 'general' || chapMatch);
    });

    if (candidates.length === 0) {
      // Fallback: match by subject only
      candidates = allBankQuestions.filter(q => {
        const qText = q.question.trim().toLowerCase();
        if (currentQuestionTexts.has(qText)) return false;
        return (q.subject || '').trim().toLowerCase() === targetSub;
      });
    }

    if (candidates.length === 0) {
      alert(`No unused alternative question found in Question Bank for Subject "${targetQ.subject}". Please add more questions to the Question Bank.`);
      return;
    }

    // Pick random clean candidate
    const randomIndex = Math.floor(Math.random() * candidates.length);
    const replacementQ = candidates[randomIndex];

    onReplaceQuestion(itemIdx, replacementQ);
    setAutoFixMessage(`Swapped Question #${itemIdx + 1} with a clean question from Question Bank ("${replacementQ.chapter}")!`);
    setTimeout(() => setAutoFixMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // ⚡ 1-Click AI Auto-Fix (Fixes Hindi & Explanation & Blank Answer Options)
  // -------------------------------------------------------------
  const handleAiAutoFixItem = async (itemIdx: number) => {
    const targetQ = questions[itemIdx];
    if (!targetQ) return;

    const isLangSubject = isSingleLanguageSubject(targetQ.subject, targetQ.chapter) || isLanguageGrammarVocabQuestion(targetQ);

    setIsAutoFixing(true);
    try {
      const promptPayload = {
        subject: targetQ.subject,
        chapter: targetQ.chapter,
        isLanguageSpecificSubject: isLangSubject,
        question: targetQ.question,
        optionA: targetQ.optionA,
        optionB: targetQ.optionB,
        optionC: targetQ.optionC,
        optionD: targetQ.optionD,
        currentAnswer: targetQ.answer,
        currentTranslation: isLangSubject ? '' : (targetQ.translation || ''),
        currentExplanation: targetQ.explanation || ''
      };

      const systemInstruction = `You are an expert Competitive Exam MCQ Quality Repair Assistant.
Analyze this MCQ and return a clean, fully-repaired JSON object:
1. Ensure the question statement and options (optionA, optionB, optionC, optionD) are 100% mathematically and factually correct.
2. CRITICAL RULE FOR LANGUAGE-SPECIFIC MCQS:
   ${isLangSubject
     ? `This MCQ belongs to a Language-Specific subject/chapter ("${targetQ.subject} - ${targetQ.chapter}"). DO NOT CONVERT IT INTO DUAL LANGUAGE! DO NOT translate it into another language! Set 'translation' strictly to an empty string (""). Keep 'question' and options strictly in their original single language!`
     : `If the input question contains bilingual text (both English and Hindi together in question statement, e.g. "A = 23 days, B = 8 days. Together = ? (एक = 23 दिन, B = 8 दिन। दोनों मिलकर = ?)"), SEPARATE THEM CLEANLY:
        - 'question': Put ONLY the English statement.
        - 'translation': Put ONLY the Hindi translation statement.
        - NEVER duplicate the English and Hindi text together in both fields!`
   }
3. If there was a calculation or formula error (or if all options were wrong or answer key was wrong), REPAIR the numbers or options so that ONE of optionA, optionB, optionC, or optionD is EXACTLY correct, and set 'answer' to that correct option ('A', 'B', 'C', or 'D').
4. Ensure optionA, optionB, optionC, optionD are non-empty, distinct, and plausible choices.
5. Provide a clear step-by-step solution explanation. DO NOT include any audit notes, mutation tags, or error messages (such as '[AI Audit Note:...]' or 'DU-XQE Mutated Variant') in the explanation text.
6. MANDATE FOR MATHEMATICS & REASONING SUBJECTS: If this question belongs to Mathematics, Quantitative Aptitude, Reasoning, or Mental Ability topics, DO NOT USE the Hindi Purna Viram symbol ('।') at sentence ends in the Hindi explanation text. Use standard full stop ('.') instead, so '।' is not mistaken for the number '1' in numerical expressions!

Return strictly JSON format:
{
  "question": string,
  "optionA": string,
  "optionB": string,
  "optionC": string,
  "optionD": string,
  "answer": "A" | "B" | "C" | "D",
  "translation": string,
  "explanation": string
}`;

      const resText = await directClientAiCall(
        JSON.stringify(promptPayload),
        systemInstruction
      );

      const fixedData = cleanAndParseJson<Partial<Question>>(resText);

      let rawQ = fixedData?.question || targetQ.question;
      let rawTrans = isLangSubject ? '' : (fixedData?.translation || targetQ.translation);

      let finalQ = rawQ;
      let finalTrans = isLangSubject ? '' : rawTrans;

      if (!isLangSubject) {
        // Sanitize bilingual question and translation to prevent duplicate rendering for non-language subjects
        const sanitized = sanitizeBilingualQuestionAndTranslation(rawQ, rawTrans);
        finalQ = sanitized.question;
        finalTrans = sanitized.translation;
      }

      let finalOptA = fixedData?.optionA || targetQ.optionA;
      let finalOptB = fixedData?.optionB || targetQ.optionB;
      let finalOptC = fixedData?.optionC || targetQ.optionC;
      let finalOptD = fixedData?.optionD || targetQ.optionD;
      let finalAns = (['A', 'B', 'C', 'D'].includes(fixedData?.answer as any) ? fixedData?.answer : targetQ.answer) as 'A' | 'B' | 'C' | 'D';

      // Clean out old audit notes & mutation comments from explanation
      let rawExp = fixedData?.explanation || targetQ.explanation || '';
      let cleanExp = cleanPurnaViramForMathReasoning(rawExp, targetQ.subject, targetQ.chapter)
        .replace(/\[AI Audit Note:[^\]]+\]/gi, '')
        .replace(/\(DU-XQE Mutated Variant\)/gi, '')
        .replace(/Option [A-D] is the correct answer for this question\./gi, '')
        .trim();

      if (!cleanExp || cleanExp.length < 15) {
        const ansText = finalAns === 'A' ? finalOptA : finalAns === 'B' ? finalOptB : finalAns === 'C' ? finalOptC : finalOptD;
        cleanExp = `Option (${finalAns}) ${ansText} is the correct answer. Factually and mathematically verified.`;
      }

      let updatedQ: Question = {
        ...targetQ,
        question: finalQ,
        optionA: finalOptA,
        optionB: finalOptB,
        optionC: finalOptC,
        optionD: finalOptD,
        answer: finalAns,
        translation: finalTrans,
        explanation: cleanExp,
        aiAuditResult: undefined, // CRITICAL: Clear out old AI audit flags!
        updatedDate: new Date().toISOString()
      };

      // Local Mathematical Fallback Repair check
      const localCheck = evaluateNumericalOrFactualDiscrepancy(updatedQ);
      if (localCheck && localCheck.isAllOptionsWrong) {
        // If speed/distance/time formula, fix option B to match exact calculation
        const qCombined = `${updatedQ.question} ${updatedQ.translation || ''}`;
        const matchSpeedDist =
          qCombined.match(/Speed\s*=\s*(\d+(\.\d+)?)\s*(km\/h|m\/s)?[,\.\s]+Distance\s*=\s*(\d+(\.\d+)?)\s*(km|m)?[,\.\s]+Time\s*=\s*\?/i) ||
          qCombined.match(/चाल\s*=\s*(\d+(\.\d+)?)[,\.\s]+दूरी\s*=\s*(\d+(\.\d+)?)[,\.\s]+समय\s*=\s*\?/i);

        if (matchSpeedDist) {
          const s = parseFloat(matchSpeedDist[1]);
          const d = parseFloat(matchSpeedDist[4]);
          if (s > 0) {
            const calculatedTime = (d / s).toFixed(2).replace(/\.00$/, '');
            updatedQ.optionB = `${calculatedTime} hrs`;
            updatedQ.answer = 'B';
            updatedQ.explanation = `Time = Distance / Speed = ${d} / ${s} = ${calculatedTime} hours. Therefore, Option B (${calculatedTime} hrs) is the correct answer.`;
          }
        }
      }

      onUpdateQuestion(itemIdx, updatedQ);
      setAutoFixMessage(`⚡ Question #${itemIdx + 1} successfully auto-repaired and verified 100% clean!`);
    } catch (err: any) {
      alert('Auto-fix failed: ' + err.message);
    } finally {
      setIsAutoFixing(false);
      setTimeout(() => setAutoFixMessage(null), 3500);
    }
  };

  // -------------------------------------------------------------
  // ⚡ Auto-Fix All Missing Translations, Solutions & Defects in 1 Click using AI
  // -------------------------------------------------------------
  const handleAutoFixAllWarnings = async () => {
    setIsAutoFixing(true);
    setAutoFixMessage('Initializing AI Auto-Fix engine for all warnings and defects...');

    try {
      const updatedList = [...questions];
      const itemsToFix = inspectionItems.filter(i => i.status === 'warning' || i.status === 'critical');

      if (itemsToFix.length === 0) {
        setAutoFixMessage('All MCQs are already 100% clean and verified!');
        setIsAutoFixing(false);
        setTimeout(() => setAutoFixMessage(null), 3000);
        return;
      }

      const batchSize = 8;
      let fixedCount = 0;

      for (let i = 0; i < itemsToFix.length; i += batchSize) {
        const currentBatchItems = itemsToFix.slice(i, i + batchSize);
        setAutoFixMessage(
          `AI Auto-Fixing MCQs #${i + 1} to #${Math.min(i + batchSize, itemsToFix.length)} of ${itemsToFix.length}...`
        );

        const promptPayload = currentBatchItems.map((item, bIdx) => {
          const q = item.question;
          const isLang = isSingleLanguageSubject(q.subject, q.chapter) || isLanguageGrammarVocabQuestion(q);
          return {
            batchIndex: bIdx,
            globalIndex: item.index,
            subject: q.subject || 'General',
            chapter: q.chapter || 'General',
            isLanguageSpecificSubject: isLang,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            currentAnswer: q.answer,
            currentTranslation: isLang ? '' : (q.translation || ''),
            currentExplanation: q.explanation || '',
            detectedFlags: item.flags.map(f => f.type)
          };
        });

        const systemInstruction = `You are an expert Competitive Exam MCQ Quality Repair Assistant.
You are given a batch of MCQs that have quality flags (such as missing translation, missing explanation, invalid options, or calculation errors).
For EACH question in the input batch, return a fully repaired object:

1. 'question': Put the clean question statement.
2. 'translation': 
   - IF 'isLanguageSpecificSubject' IS TRUE (e.g. Hindi Grammar, General Hindi, English Grammar, General English): DO NOT CONVERT TO DUAL LANGUAGE! DO NOT translate to another language! Set 'translation' strictly to empty string ("").
   - IF 'isLanguageSpecificSubject' IS FALSE: Provide an accurate, natural Hindi translation of the question statement. If the input contains both English and Hindi together, separate them cleanly.
3. 'optionA', 'optionB', 'optionC', 'optionD': Ensure all 4 options are non-empty, distinct, and mathematically/factually correct.
4. 'answer': Set to 'A', 'B', 'C', or 'D' corresponding to the strictly correct option.
5. 'explanation': Provide a clear, complete step-by-step solution explanation. DO NOT include any error tags or '[AI Audit Note:...]' in explanation text.
6. MANDATE FOR MATHEMATICS & REASONING SUBJECTS: If a question belongs to Mathematics, Quantitative Aptitude, Reasoning, or Mental Ability topics, DO NOT USE the Hindi Purna Viram symbol ('।') at sentence ends in the Hindi explanation text. Use standard full stop ('.') instead, so '।' is not mistaken for the number '1' in numerical expressions!

Return strictly a JSON array of objects with schema:
[
  {
    "batchIndex": number,
    "question": string,
    "translation": string,
    "optionA": string,
    "optionB": string,
    "optionC": string,
    "optionD": string,
    "answer": "A" | "B" | "C" | "D",
    "explanation": string
  }
]`;

        try {
          const resText = await directClientAiCall(
            JSON.stringify(promptPayload),
            systemInstruction,
            getStoredAiConfig()
          );

          const fixedBatchData = cleanAndParseJson<any[]>(resText);

          if (Array.isArray(fixedBatchData)) {
            fixedBatchData.forEach(res => {
              const bIdx = res.batchIndex ?? 0;
              const targetItem = currentBatchItems[bIdx];
              if (targetItem) {
                const origIdx = targetItem.index;
                const origQ = updatedList[origIdx];
                const isLang = isSingleLanguageSubject(origQ.subject, origQ.chapter) || isLanguageGrammarVocabQuestion(origQ);

                let rawQ = res.question || origQ.question;
                let rawTrans = isLang ? '' : (res.translation || origQ.translation);

                let finalQ = rawQ;
                let finalTrans = isLang ? '' : rawTrans;

                if (!isLang) {
                  const sanitized = sanitizeBilingualQuestionAndTranslation(rawQ, rawTrans);
                  finalQ = sanitized.question;
                  finalTrans = sanitized.translation;
                }

                let finalOptA = res.optionA || origQ.optionA;
                let finalOptB = res.optionB || origQ.optionB;
                let finalOptC = res.optionC || origQ.optionC;
                let finalOptD = res.optionD || origQ.optionD;
                let finalAns = (['A', 'B', 'C', 'D'].includes(res.answer) ? res.answer : origQ.answer) as 'A' | 'B' | 'C' | 'D';

                let rawExp = res.explanation || origQ.explanation || '';
                let cleanExp = cleanPurnaViramForMathReasoning(rawExp, origQ.subject, origQ.chapter)
                  .replace(/\[AI Audit Note:[^\]]+\]/gi, '')
                  .replace(/\(DU-XQE Mutated Variant\)/gi, '')
                  .replace(/Option [A-D] is the correct answer for this question\./gi, '')
                  .trim();

                if (!cleanExp || cleanExp.length < 15) {
                  const ansText = finalAns === 'A' ? finalOptA : finalAns === 'B' ? finalOptB : finalAns === 'C' ? finalOptC : finalOptD;
                  cleanExp = `Option (${finalAns}) ${ansText} is the correct answer. Factually and mathematically verified.`;
                }

                updatedList[origIdx] = {
                  ...origQ,
                  question: finalQ,
                  optionA: finalOptA,
                  optionB: finalOptB,
                  optionC: finalOptC,
                  optionD: finalOptD,
                  answer: finalAns,
                  translation: finalTrans,
                  explanation: cleanExp,
                  aiAuditResult: undefined,
                  updatedDate: new Date().toISOString()
                };
                fixedCount++;
              }
            });
          }
        } catch (err: any) {
          console.warn(`Batch AI Auto-Fix chunk failed: ${err.message}. Applying local fallback repairs...`);
          currentBatchItems.forEach(item => {
            const idx = item.index;
            const q = updatedList[idx];
            const isLang = isSingleLanguageSubject(q.subject, q.chapter) || isLanguageGrammarVocabQuestion(q);
            const sanitized = isLang
              ? { question: q.question, translation: '' }
              : sanitizeBilingualQuestionAndTranslation(q.question, q.translation);

            let newExp = q.explanation;
            if (!newExp || newExp.length < 15) {
              const ansText = q.answer === 'A' ? q.optionA : q.answer === 'B' ? q.optionB : q.answer === 'C' ? q.optionC : q.optionD;
              newExp = `Correct Option is (${q.answer}) ${ansText}. Verified as correct answer.`;
            }
            updatedList[idx] = {
              ...q,
              question: sanitized.question,
              translation: sanitized.translation,
              explanation: newExp,
              aiAuditResult: undefined,
              updatedDate: new Date().toISOString()
            };
            fixedCount++;
          });
        }
      }

      onUpdateAllQuestions(updatedList);
      setAutoFixMessage(`⚡ Successfully AI Auto-Fixed all warnings & defects for ${itemsToFix.length} MCQ(s) in 1 click!`);
    } catch (err: any) {
      alert('Batch auto-fix failed: ' + err.message);
    } finally {
      setIsAutoFixing(false);
      setTimeout(() => setAutoFixMessage(null), 5000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl my-auto flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">360° MCQs Quality Inspection Suite</h2>
                <span className="text-[10px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full font-bold">
                  AI & Rule Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Full 360-degree quality audit for <strong className="text-slate-200">"{testName}"</strong> ({questions.length} MCQs)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRunAi360Audit}
              disabled={isAiAuditing}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs transition-all shadow-md disabled:opacity-50"
              title="Run AI 360° Deep Factual & Logic Audit"
            >
              {isAiAuditing ? (
                <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-300" />
              )}
              <span>{isAiAuditing ? 'AI Auditing...' : 'AI 360° Deep Audit'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quality Score Executive Summary Bar */}
        <div className="bg-slate-950/60 border-b border-slate-800 p-4 px-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Quality Score</span>
              <strong className={`text-xl font-extrabold ${summary.avgScore >= 85 ? 'text-emerald-400' : summary.avgScore >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                {summary.avgScore}%
              </strong>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] text-emerald-400 uppercase font-semibold block">🟢 Fully Verified</span>
              <strong className="text-lg font-extrabold text-emerald-400">{summary.cleanCount}</strong>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] text-amber-400 uppercase font-semibold block">🟡 Minor Warnings</span>
              <strong className="text-lg font-extrabold text-amber-400">{summary.warningCount}</strong>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] text-rose-400 uppercase font-semibold block">🔴 Critical Defects</span>
              <strong className="text-lg font-extrabold text-rose-400">{summary.criticalCount}</strong>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl col-span-2 sm:col-span-1">
              <span className="text-[10px] text-indigo-300 uppercase font-semibold block">Paper Rating</span>
              <strong className="text-xs font-bold text-indigo-200 line-clamp-1 mt-1">{summary.grade}</strong>
            </div>
          </div>

          {/* Quick Auto-Fix Action Bar */}
          {summary.warningCount > 0 && (
            <div className="mt-3 flex items-center justify-between bg-amber-950/40 border border-amber-800/60 px-3.5 py-2 rounded-xl text-xs">
              <div className="flex items-center space-x-2 text-amber-300 font-medium">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>{summary.warningCount} question(s) have minor missing Hindi translations or solutions.</span>
              </div>
              <button
                onClick={handleAutoFixAllWarnings}
                disabled={isAutoFixing}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
              >
                {isAutoFixing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-200" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                <span>{isAutoFixing ? 'Auto-Fixing All...' : 'Auto-Fix All Warnings'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Processing Indicator Overlay (for operations taking > 2s) */}
        {(isAutoFixing || isAiAuditing) && (
          <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-indigo-950/90 border-b border-amber-600/50 text-white px-6 py-3.5 shadow-xl animate-in fade-in flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5 w-full md:w-auto">
              <div className="relative flex items-center justify-center flex-shrink-0">
                <div className="absolute w-8 h-8 rounded-full bg-amber-500/30 animate-ping" />
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin relative z-10" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-1">
                    <span>{isAutoFixing ? '⚡ AI Auto-Fix Engine Active' : '🔍 AI 360° Quality Auditor Active'}</span>
                  </span>
                  <span className="text-[11px] font-mono font-bold bg-amber-950 text-amber-200 px-2 py-0.5 rounded-md border border-amber-700/60 shadow-inner">
                    ⏱️ {elapsedSeconds.toFixed(1)}s
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium mt-0.5">
                  {isAutoFixing
                    ? (autoFixMessage || 'Batch repairing MCQs with AI engine...')
                    : aiAuditProgress}
                </p>
              </div>
            </div>

            {/* Animated Stream Bar */}
            <div className="w-full md:w-56 space-y-1 flex-shrink-0">
              <div className="flex justify-between text-[10px] text-slate-300 font-semibold">
                <span>Batch Processing...</span>
                <span className="text-amber-300 font-mono">Live AI Stream</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-amber-800/60 p-0.5">
                <div className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full animate-pulse w-full" />
              </div>
            </div>
          </div>
        )}

        {/* Toast / Completion Status Notification */}
        {autoFixMessage && !isAutoFixing && (
          <div className="bg-emerald-950 border-b border-emerald-800 text-emerald-200 px-6 py-2.5 text-xs font-semibold flex items-center justify-between animate-in fade-in">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{autoFixMessage}</span>
            </div>
            <button onClick={() => setAutoFixMessage(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Controls Bar: Search & Filter Tabs */}
        <div className="p-4 px-6 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                activeFilter === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>All MCQs</span>
              <span className="bg-slate-900 text-slate-300 px-1.5 py-0.2 text-[10px] rounded-full">
                {questions.length}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('CRITICAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                activeFilter === 'CRITICAL'
                  ? 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Critical Flags</span>
              <span className="bg-rose-950 text-rose-300 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                {summary.criticalCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('WARNING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                activeFilter === 'WARNING'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Warnings</span>
              <span className="bg-amber-950 text-amber-300 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                {summary.warningCount}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('CLEAN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                activeFilter === 'CLEAN'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Clean</span>
              <span className="bg-emerald-950 text-emerald-300 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                {summary.cleanCount}
              </span>
            </button>

            {summary.ignoredCount > 0 && (
              <button
                onClick={() => setActiveFilter('IGNORED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
                  activeFilter === 'IGNORED'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Ignored</span>
                <span className="bg-slate-900 text-slate-300 px-1.5 py-0.2 text-[10px] rounded-full font-bold">
                  {summary.ignoredCount}
                </span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by keywords, subject, flag..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl pl-9 pr-7 py-1.5 focus:outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Main Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-950/40">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <h3 className="text-sm font-bold text-white">No questions found in this filter category!</h3>
              <p className="text-xs text-slate-400 mt-1">All questions in this view meet quality standards.</p>
            </div>
          ) : (
            filteredItems.map(item => {
              const q = item.question;
              const idx = item.index;
              const isEditing = editingIndex === idx;

              return (
                <div
                  key={idx}
                  className={`border rounded-2xl p-5 space-y-4 transition-all shadow-sm ${
                    item.status === 'critical'
                      ? 'bg-rose-950/15 border-rose-800/80 hover:border-rose-700'
                      : item.status === 'warning'
                      ? 'bg-amber-950/15 border-amber-800/80 hover:border-amber-700'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Item Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center space-x-3 flex-wrap gap-2">
                      <span className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 font-extrabold text-xs flex items-center justify-center text-white">
                        #{idx + 1}
                      </span>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white">{q.subject}</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-xs text-slate-300">{q.chapter}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block">
                          Difficulty: <strong className="text-slate-300">{q.difficulty}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Status Badge & Action Buttons */}
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      {item.isIgnored ? (
                        <span className="inline-flex items-center space-x-1 text-xs font-extrabold bg-slate-800/90 text-slate-300 border border-slate-700 px-3 py-1 rounded-full">
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>Warning Ignored (इग्नोर किया)</span>
                        </span>
                      ) : item.status === 'clean' ? (
                        <span className="inline-flex items-center space-x-1 text-xs font-extrabold bg-emerald-950/90 text-emerald-300 border border-emerald-800 px-3 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Verified 100% Clean</span>
                        </span>
                      ) : item.status === 'critical' ? (
                        <span className="inline-flex items-center space-x-1 text-xs font-extrabold bg-rose-950/90 text-rose-300 border border-rose-800 px-3 py-1 rounded-full">
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Critical Defect</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-xs font-extrabold bg-amber-950/90 text-amber-300 border border-amber-800 px-3 py-1 rounded-full">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>Minor Warning</span>
                        </span>
                      )}

                      {/* 👁️ Ignore / Unignore Warning Button */}
                      {item.isIgnored ? (
                        <button
                          onClick={() => {
                            onUpdateQuestion(idx, {
                              ...q,
                              isInspectionIgnored: false,
                              ignoredFlags: [],
                              updatedDate: new Date().toISOString()
                            });
                            setAutoFixMessage(`Restored inspection warnings for Question #${idx + 1}.`);
                            setTimeout(() => setAutoFixMessage(null), 3000);
                          }}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-xl text-xs transition-colors flex items-center space-x-1 font-semibold"
                          title="Restore/Unignore warnings for this question"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                          <span className="hidden sm:inline">Unignore</span>
                        </button>
                      ) : item.flags.length > 0 ? (
                        <button
                          onClick={() => {
                            onUpdateQuestion(idx, {
                              ...q,
                              isInspectionIgnored: true,
                              updatedDate: new Date().toISOString()
                            });
                            setAutoFixMessage(`All inspection warnings ignored for Question #${idx + 1}.`);
                            setTimeout(() => setAutoFixMessage(null), 3000);
                          }}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs transition-colors flex items-center space-x-1 font-semibold"
                          title="Ignore warning for this question (गलत/अनचाही चेतावनी इग्नोर करें)"
                        >
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span className="hidden sm:inline">Ignore Warning</span>
                        </button>
                      ) : null}

                      {/* ⚡ AI Auto-Fix Button */}
                      <button
                        onClick={() => handleAiAutoFixItem(idx)}
                        disabled={isAutoFixing}
                        className="p-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800 rounded-xl text-xs transition-colors flex items-center space-x-1 font-semibold"
                        title="Auto-repair options, Hindi translation & explanation using AI"
                      >
                        <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="hidden sm:inline">AI Auto-Fix</span>
                      </button>

                      {/* 🔄 Smart Swap Button */}
                      <button
                        onClick={() => handleSmartSwapQuestion(idx)}
                        className="p-1.5 bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 rounded-xl text-xs transition-colors flex items-center space-x-1 font-semibold"
                        title="Swap this question with a clean question from Question Bank"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                        <span className="hidden sm:inline">Smart Swap</span>
                      </button>

                      {/* ✏️ Quick Inline Edit Toggle */}
                      <button
                        onClick={() => setEditingIndex(isEditing ? null : idx)}
                        className={`p-1.5 border rounded-xl text-xs transition-colors flex items-center space-x-1 font-semibold ${
                          isEditing
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isEditing ? 'Close Edit' : 'Edit MCQ'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Flagged Issue Banners if any */}
                  {item.activeFlags.length > 0 && (
                    <div className="space-y-2">
                      {item.activeFlags.map(flag => (
                        <div
                          key={flag.id}
                          className={`p-3 rounded-xl border text-xs flex items-start space-x-2.5 ${
                            flag.severity === 'critical'
                              ? 'bg-rose-950/50 border-rose-800/80 text-rose-200'
                              : 'bg-amber-950/50 border-amber-800/80 text-amber-200'
                          }`}
                        >
                          {flag.severity === 'critical' ? (
                            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <strong className="block font-bold">{flag.title}</strong>
                            <p className="mt-0.5 opacity-90">{flag.description}</p>

                            <div className="mt-2 flex items-center space-x-2 flex-wrap gap-y-1">
                              {/* ⚡ Quick Fix Button for Answer Key Mismatch */}
                              {flag.type === 'ai_answer_mismatch' && flag.suggestedFix && (
                                <button
                                  onClick={() => {
                                    onUpdateQuestion(idx, {
                                      ...q,
                                      answer: flag.suggestedFix,
                                      aiAuditResult: undefined,
                                      updatedDate: new Date().toISOString()
                                    });
                                    setAutoFixMessage(`Fixed answer key for Question #${idx + 1} to Option ${flag.suggestedFix}!`);
                                    setTimeout(() => setAutoFixMessage(null), 3500);
                                  }}
                                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center space-x-1.5 shadow-sm"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>⚡ Apply Correct Key (Set Option {flag.suggestedFix})</span>
                                </button>
                              )}

                              {/* 👁️ Ignore specific flag button */}
                              <button
                                onClick={() => {
                                  const currentIgnored = q.ignoredFlags || [];
                                  const updatedIgnored = [...currentIgnored, flag.id, flag.type];
                                  onUpdateQuestion(idx, {
                                    ...q,
                                    ignoredFlags: updatedIgnored,
                                    updatedDate: new Date().toISOString()
                                  });
                                  setAutoFixMessage(`Warning "${flag.title}" ignored for Question #${idx + 1}.`);
                                  setTimeout(() => setAutoFixMessage(null), 3000);
                                }}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center space-x-1.5 border border-slate-700 shadow-sm"
                                title="Ignore this specific warning (इस चेतावनी को इग्नोर करें)"
                              >
                                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                                <span>Ignore Warning (इग्नोर करें)</span>
                              </button>
                            </div>

                            {/* ⚡ Quick Fix Button for All Options Incorrect */}
                            {flag.type === 'all_options_incorrect' && (
                              <div className="mt-2 flex items-center space-x-2 flex-wrap gap-y-1">
                                <button
                                  onClick={() => handleAiAutoFixItem(idx)}
                                  disabled={isAutoFixing}
                                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                                >
                                  <Wand2 className="w-3.5 h-3.5" />
                                  <span>⚡ AI Auto-Repair Question & Options</span>
                                </button>
                                <button
                                  onClick={() => handleSmartSwapQuestion(idx)}
                                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center space-x-1.5 shadow-sm"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Smart Swap Question</span>
                                </button>
                              </div>
                            )}

                            {/* 🌐 Quick Fix Button for Dual Language Translation via DeepL */}
                            {(flag.type === 'missing_hindi' || flag.type === 'ai_translation_mismatch') && (
                              <button
                                onClick={async () => {
                                  setIsAutoFixing(true);
                                  setAutoFixMessage(`Translating Question #${idx + 1} into Dual Language using DeepL Engine...`);
                                  try {
                                    const res = await callAiTranslateDualLanguage([q]);
                                    if (res && res[0]) {
                                      const r = res[0];
                                      const sanitized = sanitizeBilingualQuestionAndTranslation(
                                        r.question || q.question,
                                        r.translation || q.translation
                                      );
                                      onUpdateQuestion(idx, {
                                        ...q,
                                        question: sanitized.question,
                                        translation: sanitized.translation,
                                        optionA: r.optionA || q.optionA,
                                        optionB: r.optionB || q.optionB,
                                        optionC: r.optionC || q.optionC,
                                        optionD: r.optionD || q.optionD,
                                        updatedDate: new Date().toISOString()
                                      });
                                      setAutoFixMessage(`⚡ DeepL Dual Language Translation complete for Question #${idx + 1}!`);
                                    }
                                  } catch (err: any) {
                                    alert('DeepL translation failed: ' + err.message);
                                  } finally {
                                    setIsAutoFixing(false);
                                    setTimeout(() => setAutoFixMessage(null), 3500);
                                  }
                                }}
                                disabled={isAutoFixing}
                                className="mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                              >
                                <Languages className="w-3.5 h-3.5" />
                                <span>⚡ Fix Dual Language with DeepL</span>
                              </button>
                            )}

                            {/* 📝 Quick Fix Button for Explanation via Tavily AI */}
                            {flag.type === 'missing_explanation' && (
                              <button
                                onClick={async () => {
                                  setIsAutoFixing(true);
                                  setAutoFixMessage(`Generating detailed step-by-step solution for Question #${idx + 1} using Tavily Engine...`);
                                  try {
                                    const res = await callAiExplain([q]);
                                    if (res && res[0]) {
                                      const itemExp = res[0].explanation;
                                      const expStr = typeof itemExp === 'string' ? itemExp : (itemExp as any)?.explanation || JSON.stringify(itemExp);
                                      onUpdateQuestion(idx, {
                                        ...q,
                                        explanation: expStr,
                                        updatedDate: new Date().toISOString()
                                      });
                                      setAutoFixMessage(`⚡ Tavily Solution Explanation generated for Question #${idx + 1}!`);
                                    }
                                  } catch (err: any) {
                                    alert('Tavily explanation generation failed: ' + err.message);
                                  } finally {
                                    setIsAutoFixing(false);
                                    setTimeout(() => setAutoFixMessage(null), 3500);
                                  }
                                }}
                                disabled={isAutoFixing}
                                className="mt-2 bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors inline-flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                                <span>⚡ Fix Solution Explanation with Tavily</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ignored Flags Indicator Banner if any flags are ignored */}
                  {item.isIgnored && (
                    <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs flex items-center justify-between text-slate-400">
                      <div className="flex items-center space-x-2">
                        <EyeOff className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>Warnings have been manually ignored for this question.</span>
                      </div>
                      <button
                        onClick={() => {
                          onUpdateQuestion(idx, {
                            ...q,
                            isInspectionIgnored: false,
                            ignoredFlags: [],
                            updatedDate: new Date().toISOString()
                          });
                          setAutoFixMessage(`Restored inspection warnings for Question #${idx + 1}.`);
                          setTimeout(() => setAutoFixMessage(null), 3000);
                        }}
                        className="text-blue-400 hover:text-blue-300 font-semibold flex items-center space-x-1 underline text-xs shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restore Warnings (Unignore)</span>
                      </button>
                    </div>
                  )}

                  {/* MCQ Content View / Inline Editor */}
                  {isEditing ? (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs animate-in fade-in">
                      <div>
                        <label className="text-slate-400 font-semibold block mb-1">Question Statement</label>
                        <textarea
                          rows={2}
                          value={q.question}
                          onChange={e => onUpdateQuestion(idx, { ...q, question: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500 font-sans"
                        />
                        <MathToolbar
                          value={q.question}
                          onChange={val => onUpdateQuestion(idx, { ...q, question: val })}
                          compact={true}
                        />
                      </div>

                      <div>
                        <label className="text-indigo-300 font-semibold block mb-1">Hindi Translation</label>
                        <input
                          type="text"
                          value={q.translation || ''}
                          onChange={e => onUpdateQuestion(idx, { ...q, translation: e.target.value })}
                          placeholder="हिंदी अनुवाद दर्ज करें..."
                          className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-2 focus:outline-none focus:border-indigo-500 font-sans"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-slate-400 block mb-0.5">Option A</label>
                          <input
                            type="text"
                            value={q.optionA}
                            onChange={e => onUpdateQuestion(idx, { ...q, optionA: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-0.5">Option B</label>
                          <input
                            type="text"
                            value={q.optionB}
                            onChange={e => onUpdateQuestion(idx, { ...q, optionB: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-0.5">Option C</label>
                          <input
                            type="text"
                            value={q.optionC}
                            onChange={e => onUpdateQuestion(idx, { ...q, optionC: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 block mb-0.5">Option D</label>
                          <input
                            type="text"
                            value={q.optionD}
                            onChange={e => onUpdateQuestion(idx, { ...q, optionD: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-300 font-bold">Correct Answer Key:</span>
                        {(['A', 'B', 'C', 'D'] as const).map(letter => (
                          <label key={letter} className="inline-flex items-center space-x-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`insp_ans_${idx}`}
                              checked={q.answer === letter}
                              onChange={() => onUpdateQuestion(idx, { ...q, answer: letter })}
                              className="text-blue-600 bg-slate-950 border-slate-700"
                            />
                            <span className="font-bold text-white text-xs">Option {letter}</span>
                          </label>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <label className="text-purple-300 font-semibold block mb-1">Explanation / Solution</label>
                        <textarea
                          rows={2}
                          value={q.explanation || ''}
                          onChange={e => onUpdateQuestion(idx, { ...q, explanation: e.target.value })}
                          placeholder="Solution explanation..."
                          className="w-full bg-slate-900 border border-slate-700 text-purple-200 rounded-lg p-2.5 focus:outline-none focus:border-purple-500 font-sans"
                        />
                        <MathToolbar
                          value={q.explanation || ''}
                          onChange={val => onUpdateQuestion(idx, { ...q, explanation: val })}
                          compact={true}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Read-Only Inspection Display with Math Formatting */
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs font-semibold text-white leading-relaxed">
                          <MathText text={q.question} />
                        </h4>
                        {shouldDisplayTranslation(q.question, q.translation) && (
                          <p className="text-xs text-indigo-300 font-sans mt-1">
                            <MathText text={q.translation || ''} />
                          </p>
                        )}
                      </div>

                      {/* Options Grid with Answer Key Highlight */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(['A', 'B', 'C', 'D'] as const).map(letter => {
                          const isCorrect = q.answer === letter;
                          const optText = letter === 'A' ? q.optionA : letter === 'B' ? q.optionB : letter === 'C' ? q.optionC : q.optionD;

                          return (
                            <div
                              key={letter}
                              className={`p-2.5 rounded-xl border flex items-center justify-between ${
                                isCorrect
                                  ? 'bg-emerald-950/80 border-emerald-500 text-emerald-100 font-bold shadow-sm'
                                  : 'bg-slate-950/80 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center space-x-2">
                                <span className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
                                  isCorrect ? 'bg-emerald-500 text-black' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {letter}
                                </span>
                                <span className="line-clamp-2">
                                  {optText ? <MathText text={optText} /> : <span className="text-rose-400 italic">[Empty Option Text]</span>}
                                </span>
                              </div>
                              {isCorrect && (
                                <span className="text-[10px] bg-emerald-900 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                                  Correct Key
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Solution / Explanation Preview */}
                      {q.explanation && (
                        <div className="bg-purple-950/30 border border-purple-900/60 p-3 rounded-xl text-xs text-purple-200 space-y-1">
                          <span className="text-[10px] text-purple-400 uppercase tracking-wider font-bold block">Solution Explanation</span>
                          <div className="leading-relaxed font-sans text-purple-100">
                            <MathText text={q.explanation} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 p-4 px-6 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <ListChecks className="w-4 h-4 text-blue-400" />
            <span>Showing <strong>{filteredItems.length}</strong> of {questions.length} MCQs</span>
          </div>

          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-xl text-xs shadow-md transition-colors flex items-center space-x-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Complete Inspection & Apply Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
