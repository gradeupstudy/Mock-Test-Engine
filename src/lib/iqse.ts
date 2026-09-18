import { Question, MockHistory, SectionConfig, QuestionStatus, DifficultyLevel, AiConfig } from '../types';
import { updateQuestionsBatch } from './db';
import { directClientAiCall, cleanAndParseJson } from './aiClient';

export type IrtTargetProfile = 'balanced' | 'hard_exam' | 'foundation_easy' | 'speed_test';

export interface IQSEOptions {
  excludeLastN?: number;
  uniqueThreshold?: number;
  mockId?: number;
  // Engine 1: DU-XQE Mutation
  enableDUXQE?: boolean;
  duxqeAiConfig?: AiConfig;
  // Engine 2: Semantic Vector Deduplication
  semanticDeduplicationThreshold?: number; // 0.10 to 0.90, default 0.60
  // Engine 3: IRT Engine Profile
  irtProfile?: IrtTargetProfile;
}

export interface IQSEResult {
  selectedQuestions: Question[];
  uniquenessScore: number;
  semanticUniquenessScore: number;
  irtBalanceScore: number;
  duxqeMutationsApplied: number;
  attempts: number;
  engineSummary: {
    duxqeActive: boolean;
    vectorDeduplicationActive: boolean;
    irtProfileActive: IrtTargetProfile;
  };
  sectionBreakdown: {
    sectionId: string;
    subject: string;
    requestedCount: number;
    selectedCount: number;
    chaptersCovered: string[];
  }[];
}

export function computeQuestionStatus(usageCount: number): QuestionStatus {
  if (usageCount === 0) return 'Fresh';
  if (usageCount <= 2) return 'Used';
  if (usageCount <= 4) return 'Frequent';
  if (usageCount <= 7) return 'Overused';
  return 'Retired';
}

// ==========================================
// ENGINE 1: SEMANTIC VECTOR DEDUPLICATION
// ==========================================
export function extractNgramVector(text: string): Set<string> {
  if (!text) return new Set();
  const clean = text.toLowerCase().replace(/[^\w\s\u0900-\u097F]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 1);
  const ngrams = new Set<string>();

  // Word 1-grams
  words.forEach(w => ngrams.add(`1g_${w}`));

  // Word 2-grams
  for (let i = 0; i < words.length - 1; i++) {
    ngrams.add(`2g_${words[i]}_${words[i + 1]}`);
  }

  // Character 3-grams for multi-language matching
  const flatText = words.join('');
  for (let i = 0; i < flatText.length - 2; i++) {
    ngrams.add(`c3_${flatText.slice(i, i + 3)}`);
  }

  return ngrams;
}

export function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// ==========================================
// ENGINE 2: IRT (ITEM RESPONSE THEORY - 3PL)
// ==========================================
export function compute3PLInformation(difficulty: DifficultyLevel, targetTheta: number): number {
  // b: difficulty parameter
  const b = difficulty === 'Easy' ? -1.2 : difficulty === 'Hard' ? 1.2 : 0.0;
  const a = 1.4; // discrimination index
  const c = 0.25; // pseudo-guessing index for 4 options

  const expVal = Math.exp(-a * (targetTheta - b));
  const P = c + (1 - c) / (1 + expVal);
  const Q = 1 - P;

  const num = a * a * Math.pow(P - c, 2) * Q;
  const den = Math.pow(1 - c, 2) * P;
  return den > 0 ? num / den : 0;
}

export function getIrtTargetThetas(profile: IrtTargetProfile = 'balanced'): number[] {
  switch (profile) {
    case 'hard_exam':
      return [-0.5, 0.5, 1.2, 1.8];
    case 'foundation_easy':
      return [-1.8, -1.2, -0.5, 0.0];
    case 'speed_test':
      return [-1.2, -0.5, 0.0, 0.5];
    case 'balanced':
    default:
      return [-1.2, -0.4, 0.4, 1.2];
  }
}

// ==========================================
// ENGINE 3: DU-XQE (DYNAMIC MUTATION ENGINE)
// ==========================================
export function mutateQuestionNumericalsLocal(q: Question): Question {
  const text = q.question || '';
  // Match simple numbers/percentages e.g. "50 km/h", "20%", "Rs. 500"
  const hasNumbers = /\b\d+(\.\d+)?\b/.test(text);
  if (!hasNumbers) return q;

  // Scale numbers slightly e.g. 1.2x or +5
  const scale = 1.25;
  const newQuestionText = text.replace(/\b(\d+)\b/g, (_match, numStr) => {
    const val = parseInt(numStr, 10);
    if (val > 1900 && val < 2030) return numStr; // Preserve years e.g. 1947
    if (val === 1 || val === 2 || val === 3 || val === 4) return numStr; // Preserve option numbers
    return Math.round(val * scale).toString();
  });

  const mutateOpt = (opt: string) => {
    if (!opt) return opt;
    return opt.replace(/\b(\d+)\b/g, (_match, numStr) => {
      const val = parseInt(numStr, 10);
      if (val > 1900 && val < 2030) return numStr;
      return Math.round(val * scale).toString();
    });
  };

  return {
    ...q,
    question: newQuestionText,
    optionA: mutateOpt(q.optionA),
    optionB: mutateOpt(q.optionB),
    optionC: mutateOpt(q.optionC),
    optionD: mutateOpt(q.optionD),
    explanation: q.explanation ? `${q.explanation} (DU-XQE Mutated Variant)` : '(DU-XQE Dynamic Variant)'
  };
}

export async function runDUXQEAiMutation(
  questions: Question[],
  aiConfig?: AiConfig
): Promise<{ mutatedQuestions: Question[]; mutationCount: number }> {
  if (!questions || questions.length === 0) return { mutatedQuestions: [], mutationCount: 0 };

  // Select questions with math/numeric data or overused status for mutation
  const candidateIndices: number[] = [];
  questions.forEach((q, idx) => {
    const isMathOrNumeric = /\b\d+(\.\d+)?\b/.test(q.question) || ['quantitative aptitude', 'mathematics', 'reasoning', 'physics', 'chemistry', 'economics'].includes((q.subject || '').toLowerCase());
    if (isMathOrNumeric || q.questionStatus === 'Used' || q.questionStatus === 'Frequent' || q.questionStatus === 'Overused') {
      candidateIndices.push(idx);
    }
  });

  if (candidateIndices.length === 0) {
    return { mutatedQuestions: questions, mutationCount: 0 };
  }

  // Limit AI mutation batch to top 8 candidates per call for speed
  const selectedForAi = candidateIndices.slice(0, 8);
  const payload = selectedForAi.map(idx => {
    const q = questions[idx];
    return {
      index: idx,
      id: q.id,
      question: q.question,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      answer: q.answer,
      explanation: q.explanation || ''
    };
  });

  let mutatedMap = new Map<number, Partial<Question>>();

  if (aiConfig && aiConfig.apiKey) {
    const prompt = `DU-XQE Engine Mutation Request:
You are an expert exam question variation generator.
For each MCQ provided below:
1. Mutate numerical parameters, values, entity names, or scenarios slightly to create a 100% UNIQUE variant of the question.
2. Adjust all options (A, B, C, D) accordingly so that the correct answer key (${payload.map(p => p.answer).join(', ')}) remains 100% mathematically and conceptually accurate!
3. Output JSON array with objects: index (number), question (string), optionA (string), optionB (string), optionC (string), optionD (string), explanation (string).

Questions:
${JSON.stringify(payload, null, 2)}`;

    try {
      const rawRes = await directClientAiCall(prompt, 'Output JSON array of mutated questions.', aiConfig);
      const parsed = cleanAndParseJson(rawRes);
      const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.questions || []);
      items.forEach((item: any) => {
        if (item.index !== undefined) {
          mutatedMap.set(item.index, item);
        }
      });
    } catch (_e) {
      // AI call failed -> fallback to local DU-XQE numerical mutation
    }
  }

  let count = 0;
  const mutatedQuestions = questions.map((q, idx) => {
    if (mutatedMap.has(idx)) {
      const m = mutatedMap.get(idx)!;
      count++;
      return {
        ...q,
        question: m.question || q.question,
        optionA: m.optionA || q.optionA,
        optionB: m.optionB || q.optionB,
        optionC: m.optionC || q.optionC,
        optionD: m.optionD || q.optionD,
        explanation: m.explanation || q.explanation,
        updatedDate: new Date().toISOString()
      };
    } else if (candidateIndices.includes(idx)) {
      // Local fallback mutation
      count++;
      return mutateQuestionNumericalsLocal(q);
    }
    return q;
  });

  return { mutatedQuestions, mutationCount: count };
}

// ==========================================
export function getQuestionUniqueKey(q: Question): string {
  if (q.id && q.id > 0) {
    return `id_${q.id}`;
  }
  const qText = (q.question || '').trim().toLowerCase().slice(0, 120);
  const qOptA = (q.optionA || '').trim().toLowerCase().slice(0, 40);
  return `txt_${qText}_${qOptA}`;
}

export interface ExcludedQuestionContext {
  excludedIds: Set<number>;
  excludedKeys: Set<string>;
  excludedTexts: Set<string>;
  excludedMockIds: Set<number>;
  recentMockQuestionVectors: Set<string>[];
  questionsInLast50: Set<number>;
}

export function buildExcludedContext(
  mockHistory: MockHistory[],
  excludeLastN: number,
  allQuestions: Question[]
): ExcludedQuestionContext {
  const excludedIds = new Set<number>();
  const excludedKeys = new Set<string>();
  const excludedTexts = new Set<string>();
  const excludedMockIds = new Set<number>();
  const questionsInLast50 = new Set<number>();
  const recentMockQuestionVectors: Set<string>[] = [];

  // Sort mockHistory descending (newest first)
  const sortedMocks = [...(mockHistory || [])].sort((a, b) => {
    const tA = (typeof a.mockId === 'number' && a.mockId > 0) ? a.mockId : (a.createdDate ? new Date(a.createdDate).getTime() : (a.id || 0));
    const tB = (typeof b.mockId === 'number' && b.mockId > 0) ? b.mockId : (b.createdDate ? new Date(b.createdDate).getTime() : (b.id || 0));
    return tB - tA;
  });

  const targetExcludedMocks = sortedMocks.slice(0, Math.max(0, excludeLastN));
  targetExcludedMocks.forEach(m => {
    if (typeof m.mockId === 'number') excludedMockIds.add(m.mockId);
    if (typeof m.id === 'number') excludedMockIds.add(m.id);

    if (Array.isArray(m.questionIds)) {
      m.questionIds.forEach(id => {
        if (typeof id === 'number' && id > 0) excludedIds.add(id);
      });
    }

    if (Array.isArray(m.questions)) {
      m.questions.forEach(q => {
        if (typeof q.id === 'number' && q.id > 0) excludedIds.add(q.id);
        const key = getQuestionUniqueKey(q);
        if (key) excludedKeys.add(key);
        const norm = (q.question || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (norm) excludedTexts.add(norm);
      });
    }
  });

  // Also collect up to 50 recent mocks for general usage history
  sortedMocks.slice(0, 50).forEach(m => {
    if (Array.isArray(m.questionIds)) {
      m.questionIds.forEach(id => {
        if (typeof id === 'number' && id > 0) questionsInLast50.add(id);
      });
    }
    if (Array.isArray(m.questions)) {
      m.questions.forEach(q => {
        if (typeof q.id === 'number' && q.id > 0) questionsInLast50.add(q.id);
      });
    }
  });

  // Vectors for recent mock questions for vector deduplication
  const recentQuestions = allQuestions.filter(q =>
    (typeof q.id === 'number' && questionsInLast50.has(q.id)) ||
    (typeof q.id === 'number' && excludedIds.has(q.id)) ||
    excludedKeys.has(getQuestionUniqueKey(q))
  );

  recentQuestions.forEach(q => {
    recentMockQuestionVectors.push(extractNgramVector(q.question));
  });

  return {
    excludedIds,
    excludedKeys,
    excludedTexts,
    excludedMockIds,
    recentMockQuestionVectors,
    questionsInLast50
  };
}

export function isQuestionExcluded(q: Question, ctx: ExcludedQuestionContext): boolean {
  if (typeof q.id === 'number' && q.id > 0 && ctx.excludedIds.has(q.id)) return true;
  const key = getQuestionUniqueKey(q);
  if (ctx.excludedKeys.has(key)) return true;
  const norm = (q.question || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm && ctx.excludedTexts.has(norm)) return true;
  if (typeof q.lastUsedMockId === 'number' && ctx.excludedMockIds.has(q.lastUsedMockId)) return true;
  return false;
}

// MAIN UNIFIED X-IQSE ENGINE RUNNER
// ==========================================
export async function runIQSE(
  allQuestions: Question[],
  sections: SectionConfig[],
  mockHistory: MockHistory[],
  excludeLastNParam: number | IQSEOptions = 3,
  uniqueThresholdParam: number = 85,
  mockIdParam: number = Date.now()
): Promise<IQSEResult> {
  // Normalize options parameter
  let options: IQSEOptions = {};
  if (typeof excludeLastNParam === 'object') {
    options = excludeLastNParam;
  } else {
    options = {
      excludeLastN: excludeLastNParam,
      uniqueThreshold: uniqueThresholdParam,
      mockId: mockIdParam
    };
  }

  const excludeLastN = options.excludeLastN ?? 3;
  const uniqueThreshold = options.uniqueThreshold ?? 85;
  const mockId = options.mockId ?? Date.now();
  const enableDUXQE = options.enableDUXQE ?? false;
  const semanticThreshold = options.semanticDeduplicationThreshold ?? 0.60;
  const irtProfile = options.irtProfile ?? 'balanced';

  // Deduplicate input Question Bank first
  const uniqueInputQuestions: Question[] = [];
  const seenInputKeys = new Set<string>();
  allQuestions.forEach(q => {
    const key = getQuestionUniqueKey(q);
    if (!seenInputKeys.has(key)) {
      seenInputKeys.add(key);
      uniqueInputQuestions.push(q);
    }
  });

  // Build comprehensive exclusion context from mock history
  const ctx = buildExcludedContext(mockHistory, excludeLastN, uniqueInputQuestions);

  // Yield execution to UI thread
  await new Promise(r => setTimeout(r, 40));

  // Pre-calculate vectors for all questions in pool
  const questionVectorMap = new Map<number, Set<string>>();
  uniqueInputQuestions.forEach(q => {
    if (q.id) {
      questionVectorMap.set(q.id, extractNgramVector(q.question));
    }
  });

  const irtThetas = getIrtTargetThetas(irtProfile);

  let bestSelection: Question[] = [];
  let bestUniqueness = -1;
  let bestSemanticUniqueness = 0;
  let bestIrtBalance = 0;
  let attempts = 0;
  const maxAttempts = 8;

  while (attempts < maxAttempts) {
    attempts++;
    // Yield event loop between attempt iterations so progress bar & animations stay silky smooth
    await new Promise(r => setTimeout(r, 30));

    const selectedThisAttempt: Question[] = [];
    const usedSimilarityGroups = new Set<number>();
    const selectedKeysThisSession = new Set<string>();
    const selectedVectorsThisSession: Set<string>[] = [];

    for (const section of sections) {
      if (section.questionCount <= 0) continue;

      const subjectPool = uniqueInputQuestions.filter(
        q => (q.subject || '').trim().toLowerCase() === section.subject.trim().toLowerCase()
      );
      const chapterQuotas = section.chapterDistribution || {};
      const hasChapterQuotas = Object.values(chapterQuotas).some(val => val > 0);

      let sectionPickedCount = 0;

      if (hasChapterQuotas) {
        for (const [chapterName, targetCount] of Object.entries(chapterQuotas)) {
          if (targetCount <= 0) continue;

          const targetChap = chapterName.trim().toLowerCase();
          const chapterPool = subjectPool.filter(q => {
            const key = getQuestionUniqueKey(q);
            if (selectedKeysThisSession.has(key)) return false;
            const qChap = (q.chapter && q.chapter.trim()) ? q.chapter.trim().toLowerCase() : 'general';
            return qChap === targetChap;
          });

          const picked = pickQuestionsFromPool(
            chapterPool,
            targetCount,
            ctx,
            excludeLastN,
            uniqueThreshold,
            usedSimilarityGroups,
            selectedVectorsThisSession,
            questionVectorMap,
            irtThetas,
            semanticThreshold
          );

          picked.forEach(q => {
            const key = getQuestionUniqueKey(q);
            if (!selectedKeysThisSession.has(key)) {
              selectedThisAttempt.push(q);
              selectedKeysThisSession.add(key);
              sectionPickedCount++;
              if (q.id) {
                selectedVectorsThisSession.push(questionVectorMap.get(q.id) || extractNgramVector(q.question));
              }
              if (q.similarityGroupId) usedSimilarityGroups.add(q.similarityGroupId);
            }
          });
        }
      }

      // If chapter quotas didn't fill the total section question count, pick remaining required questions
      if (sectionPickedCount < section.questionCount) {
        const remainingNeeded = section.questionCount - sectionPickedCount;
        const availablePool = subjectPool.filter(q => !selectedKeysThisSession.has(getQuestionUniqueKey(q)));

        const picked = pickQuestionsFromPool(
          availablePool,
          remainingNeeded,
          ctx,
          excludeLastN,
          uniqueThreshold,
          usedSimilarityGroups,
          selectedVectorsThisSession,
          questionVectorMap,
          irtThetas,
          semanticThreshold
        );

        picked.forEach(q => {
          const key = getQuestionUniqueKey(q);
          if (!selectedKeysThisSession.has(key)) {
            selectedThisAttempt.push(q);
            selectedKeysThisSession.add(key);
            sectionPickedCount++;
            if (q.id) {
              selectedVectorsThisSession.push(questionVectorMap.get(q.id) || extractNgramVector(q.question));
            }
            if (q.similarityGroupId) usedSimilarityGroups.add(q.similarityGroupId);
          }
        });
      }
    }

    // 1. Calculate Standard Usage Uniqueness Score:
    // Check how many questions are completely non-repeated from the excluded mocks
    const nonExcludedCount = selectedThisAttempt.filter(q => !isQuestionExcluded(q, ctx)).length;
    const freshZeroUsageCount = selectedThisAttempt.filter(q => !isQuestionExcluded(q, ctx) && (q.usageCount || 0) === 0).length;

    const uniqueness = selectedThisAttempt.length > 0
      ? (excludeLastN > 0
          ? Math.round((nonExcludedCount / selectedThisAttempt.length) * 100)
          : (uniqueThreshold === 100
              ? Math.round((freshZeroUsageCount / selectedThisAttempt.length) * 100)
              : Math.round((nonExcludedCount / selectedThisAttempt.length) * 100)))
      : 100;

    // 2. Calculate Semantic Vector Uniqueness Score
    let semanticallyUniqueCount = 0;
    selectedThisAttempt.forEach((q, idx) => {
      const vec = questionVectorMap.get(q.id!) || extractNgramVector(q.question);
      let maxSim = 0;
      selectedVectorsThisSession.forEach((otherVec, oIdx) => {
        if (idx !== oIdx) {
          const sim = calculateJaccardSimilarity(vec, otherVec);
          if (sim > maxSim) maxSim = sim;
        }
      });
      if (maxSim < 0.40) {
        semanticallyUniqueCount++;
      }
    });

    const semanticUniqueness = selectedThisAttempt.length > 0
      ? Math.round((semanticallyUniqueCount / selectedThisAttempt.length) * 100)
      : 100;

    // 3. Calculate IRT Balance Score
    let totalIrtInfo = 0;
    selectedThisAttempt.forEach(q => {
      irtThetas.forEach(theta => {
        totalIrtInfo += compute3PLInformation(q.difficulty, theta);
      });
    });
    const irtBalance = selectedThisAttempt.length > 0
      ? Math.min(100, Math.round((totalIrtInfo / (selectedThisAttempt.length * irtThetas.length)) * 120))
      : 90;

    if (uniqueness > bestUniqueness) {
      bestUniqueness = uniqueness;
      bestSemanticUniqueness = semanticUniqueness;
      bestIrtBalance = irtBalance;
      bestSelection = selectedThisAttempt;
    }

    if (bestUniqueness >= uniqueThreshold) {
      break;
    }
  }

  // ENGINE 3: Execute DU-XQE Dynamic Mutation if enabled
  let finalQuestions = bestSelection;
  let duxqeMutationsApplied = 0;

  if (enableDUXQE && bestSelection.length > 0) {
    const duResult = await runDUXQEAiMutation(bestSelection, options.duxqeAiConfig);
    finalQuestions = duResult.mutatedQuestions;
    duxqeMutationsApplied = duResult.mutationCount;
  }

  // Update questions usage count in database
  const nowIso = new Date().toISOString();
  const updatedQuestionsToSave: Question[] = [];

  finalQuestions = finalQuestions.map(q => {
    const newCount = (q.usageCount || 0) + 1;
    const newStatus = computeQuestionStatus(newCount);
    const updated: Question = {
      ...q,
      usageCount: newCount,
      lastUsedMockId: mockId,
      lastUsedDate: nowIso,
      questionStatus: newStatus,
      updatedDate: nowIso
    };
    updatedQuestionsToSave.push(updated);
    return updated;
  });

  if (updatedQuestionsToSave.length > 0) {
    await updateQuestionsBatch(updatedQuestionsToSave);
  }

  const sectionBreakdown = sections.map(sec => {
    const secQs = finalQuestions.filter(q => q.subject.toLowerCase() === sec.subject.toLowerCase());
    const chaptersCovered = Array.from(new Set(secQs.map(q => q.chapter)));
    return {
      sectionId: sec.id,
      subject: sec.subject,
      requestedCount: sec.questionCount,
      selectedCount: secQs.length,
      chaptersCovered
    };
  });

  return {
    selectedQuestions: finalQuestions,
    uniquenessScore: bestUniqueness,
    semanticUniquenessScore: bestSemanticUniqueness,
    irtBalanceScore: bestIrtBalance,
    duxqeMutationsApplied,
    attempts,
    engineSummary: {
      duxqeActive: enableDUXQE,
      vectorDeduplicationActive: true,
      irtProfileActive: irtProfile
    },
    sectionBreakdown
  };
}

// 2-Tier Candidate Pool Partitioning:
// Guarantees zero repetition from excluded mocks unless question bank is genuinely exhausted
function pickQuestionsFromPool(
  pool: Question[],
  neededCount: number,
  ctx: ExcludedQuestionContext,
  excludeLastN: number,
  _uniqueThreshold: number,
  usedSimilarityGroups: Set<number>,
  selectedVectorsThisSession: Set<string>[],
  questionVectorMap: Map<number, Set<string>>,
  irtThetas: number[],
  semanticThreshold: number
): Question[] {
  if (neededCount <= 0 || !pool || pool.length === 0) return [];

  // Partition pool into fresh (non-excluded) and excluded questions
  const freshQuestions: Question[] = [];
  const excludedQuestions: Question[] = [];

  for (const q of pool) {
    if (excludeLastN > 0 && isQuestionExcluded(q, ctx)) {
      excludedQuestions.push(q);
    } else {
      freshQuestions.push(q);
    }
  }

  const picked: Question[] = [];

  // Priority 1: Pick from freshQuestions (100% strictly non-repeated)
  if (freshQuestions.length > 0) {
    const scoredFresh = scoreAndSortQuestionsTrio(
      freshQuestions,
      ctx,
      usedSimilarityGroups,
      selectedVectorsThisSession,
      questionVectorMap,
      irtThetas,
      semanticThreshold,
      true,
      false
    );
    const takeCount = Math.min(neededCount, scoredFresh.length);
    picked.push(...scoredFresh.slice(0, takeCount));
  }

  // Priority 2: ONLY IF freshQuestions had fewer questions than requested
  // (Question Bank shortage), draw the remaining deficit from excluded questions
  const remainingNeeded = neededCount - picked.length;
  if (remainingNeeded > 0 && excludedQuestions.length > 0) {
    const scoredExcluded = scoreAndSortQuestionsTrio(
      excludedQuestions,
      ctx,
      usedSimilarityGroups,
      selectedVectorsThisSession,
      questionVectorMap,
      irtThetas,
      semanticThreshold,
      true,
      true // isExcludedPool = true: strongly prefer lowest usageCount and oldest lastUsedDate
    );
    picked.push(...scoredExcluded.slice(0, remainingNeeded));
  }

  return picked;
}

function scoreAndSortQuestionsTrio(
  pool: Question[],
  ctx: ExcludedQuestionContext,
  usedSimilarityGroups: Set<number>,
  selectedVectorsThisSession: Set<string>[],
  questionVectorMap: Map<number, Set<string>>,
  irtThetas: number[],
  semanticThreshold: number,
  applyJitter: boolean = true,
  isExcludedPool: boolean = false
): Question[] {
  if (!pool || pool.length === 0) return [];

  // Fisher-Yates Shuffle pool first so equal-scored items are randomly distributed across the Question Bank
  const poolCopy = [...pool];
  if (applyJitter) {
    for (let i = poolCopy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [poolCopy[i], poolCopy[j]] = [poolCopy[j], poolCopy[i]];
    }
  }

  const scored = poolCopy.map(q => {
    let score = 0;

    // 1. Basic Usage status bonus/penalty
    switch (q.questionStatus) {
      case 'Fresh':
        score += 80;
        break;
      case 'Used':
        score += 30;
        break;
      case 'Frequent':
        score += 0;
        break;
      case 'Overused':
        score -= 60;
        break;
      case 'Retired':
        score -= 120;
        break;
    }

    // Heavy penalty if question was in excluded mocks (extra safeguard)
    if (isQuestionExcluded(q, ctx)) {
      score -= 50000;
    }

    // Long-term history penalty (used in last 50 mocks)
    if (typeof q.id === 'number' && ctx.questionsInLast50.has(q.id)) {
      score -= 40;
    }

    // Similarity group avoidance within same mock test
    if (typeof q.similarityGroupId === 'number' && usedSimilarityGroups.has(q.similarityGroupId)) {
      score -= 200;
    }

    // 2. SEMANTIC VECTOR DEDUPLICATION ENGINE SCORE
    const qVec = (typeof q.id === 'number' ? questionVectorMap.get(q.id) : null) || extractNgramVector(q.question);

    let maxSessionSim = 0;
    selectedVectorsThisSession.forEach(sVec => {
      const sim = calculateJaccardSimilarity(qVec, sVec);
      if (sim > maxSessionSim) maxSessionSim = sim;
    });

    let maxRecentSim = 0;
    ctx.recentMockQuestionVectors.forEach(rVec => {
      const sim = calculateJaccardSimilarity(qVec, rVec);
      if (sim > maxRecentSim) maxRecentSim = sim;
    });

    if (maxSessionSim >= semanticThreshold) {
      score -= 500; // Heavily penalize duplicate in current test
    } else {
      score -= maxSessionSim * 150;
    }

    if (maxRecentSim >= semanticThreshold) {
      score -= 250; // Penalize duplicate from recent tests
    }

    // 3. IRT ENGINE PSYCHOMETRIC INFORMATION BOOST
    let irtInfoSum = 0;
    irtThetas.forEach(theta => {
      irtInfoSum += compute3PLInformation(q.difficulty, theta);
    });
    score += irtInfoSum * 15;

    // Days since last used boost
    if (q.lastUsedDate) {
      const days = Math.floor((Date.now() - new Date(q.lastUsedDate).getTime()) / (1000 * 60 * 60 * 24));
      score += Math.min(days, 60);
    } else {
      score += 40; // Never used bonus
    }

    score += (q.chapterCoverageScore || 5) * 2;

    // If drawn from fallback excluded pool, strictly prefer lowest usage count and oldest date
    if (isExcludedPool) {
      score -= (q.usageCount || 1) * 50;
    }

    // Gentle jitter
    if (applyJitter) {
      score += (Math.random() - 0.5) * 40;
    }

    return { question: q, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.question);
}

