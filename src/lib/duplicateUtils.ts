import { Question } from '../types';

export interface DuplicateGroup {
  key: string;
  sampleQuestionText: string;
  subject: string;
  chapter: string;
  questions: Question[];
  primaryQuestionId?: number;
  repeatCount: number;
}

export type DuplicateMatchMode = 'strict' | 'questionOnly';

/**
 * Normalizes string for comparison by trimming, lowercasing,
 * replacing multiple spaces / line breaks, stripping punctuation,
 * and normalizing HTML/math entities.
 */
export function normalizeText(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '') // remove HTML tags if any
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[?.!;,:"'()\-]+/g, '')
    .trim();
}

export interface MinimalMcqRow {
  question: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
}

/**
 * Generates duplicate comparison key for a question or parsed row.
 * Mode 'strict' (default): Question text + Option A + Option B + Option C + Option D
 * Mode 'questionOnly': Question text only
 */
export function getQuestionDuplicateKey(q: MinimalMcqRow, mode: DuplicateMatchMode = 'strict'): string {
  const normQ = normalizeText(q.question);
  if (!normQ) return '';

  if (mode === 'questionOnly') {
    return normQ;
  }

  // Strict match: Question + Options (A, B, C, D)
  const normA = normalizeText(q.optionA || '');
  const normB = normalizeText(q.optionB || '');
  const normC = normalizeText(q.optionC || '');
  const normD = normalizeText(q.optionD || '');

  return `${normQ}||a:${normA}||b:${normB}||c:${normC}||d:${normD}`;
}

/**
 * Finds all duplicate question groups in the dataset.
 */
export function findDuplicateGroups(
  questions: Question[],
  mode: DuplicateMatchMode = 'strict'
): DuplicateGroup[] {
  const map = new Map<string, Question[]>();

  for (const q of questions) {
    const key = getQuestionDuplicateKey(q, mode);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(q);
  }

  const duplicateGroups: DuplicateGroup[] = [];

  for (const [key, groupQs] of map.entries()) {
    if (groupQs.length > 1) {
      // Pick the primary question to keep: prefer one with non-empty explanation, or lower ID / earlier creation
      const primary = groupQs.reduce((best, curr) => {
        if (curr.explanation && !best.explanation) return curr;
        if (!curr.explanation && best.explanation) return best;
        if (curr.id !== undefined && best.id !== undefined) {
          return curr.id < best.id ? curr : best;
        }
        return best;
      }, groupQs[0]);

      duplicateGroups.push({
        key,
        sampleQuestionText: primary.question,
        subject: primary.subject || 'Uncategorized',
        chapter: primary.chapter || 'General',
        questions: groupQs,
        primaryQuestionId: primary.id,
        repeatCount: groupQs.length
      });
    }
  }

  return duplicateGroups;
}

/**
 * Computes duplicate statistics across the question collection.
 */
export function getDuplicateStats(
  questions: Question[],
  mode: DuplicateMatchMode = 'strict'
) {
  const groups = findDuplicateGroups(questions, mode);
  let redundantMcqCount = 0;
  const duplicateQuestionIds = new Set<number>();
  const redundantQuestionIds: number[] = [];

  for (const group of groups) {
    const totalInGroup = group.questions.length;
    redundantMcqCount += (totalInGroup - 1);

    for (const q of group.questions) {
      if (q.id !== undefined) {
        duplicateQuestionIds.add(q.id);
        if (q.id !== group.primaryQuestionId) {
          redundantQuestionIds.push(q.id);
        }
      }
    }
  }

  return {
    duplicateGroupCount: groups.length,
    redundantMcqCount,
    duplicateQuestionIds,
    redundantQuestionIds,
    groups
  };
}

export interface ParsedDuplicateAnalysis<T extends { idTemp: number; question: string; optionA: string; optionB: string; optionC: string; optionD: string }> {
  internalDuplicateIds: Set<number>; // extra copies within file (to be removed)
  internalKeepIds: Set<number>; // first copy kept within file
  bankDuplicateIds: Set<number>; // exists in existing Question Bank
  repeatCounts: Map<number, number>; // idTemp -> total times repeated in file
  bankMatchCountMap: Map<number, number>; // idTemp -> match count in bank
  internalDuplicateCount: number;
  bankDuplicateCount: number;
  totalRedundantCount: number;
}

/**
 * Analyzes parsed upload rows against themselves AND against existing Question Bank
 */
export function analyzeParsedDuplicates<T extends { idTemp: number; question: string; optionA: string; optionB: string; optionC: string; optionD: string }>(
  parsedRows: T[],
  existingBank: Question[],
  mode: DuplicateMatchMode = 'strict'
): ParsedDuplicateAnalysis<T> {
  // 1. Build map of existing bank keys
  const bankKeyCounts = new Map<string, number>();
  for (const bankQ of existingBank) {
    const key = getQuestionDuplicateKey(bankQ, mode);
    if (key) {
      bankKeyCounts.set(key, (bankKeyCounts.get(key) || 0) + 1);
    }
  }

  // 2. Build internal duplicate map for parsed rows
  const internalGroups = new Map<string, T[]>();
  for (const row of parsedRows) {
    const key = getQuestionDuplicateKey(row, mode);
    if (!key) continue;
    if (!internalGroups.has(key)) {
      internalGroups.set(key, []);
    }
    internalGroups.get(key)!.push(row);
  }

  const internalDuplicateIds = new Set<number>();
  const internalKeepIds = new Set<number>();
  const bankDuplicateIds = new Set<number>();
  const repeatCounts = new Map<number, number>();
  const bankMatchCountMap = new Map<number, number>();

  let internalDuplicateCount = 0;

  for (const [key, rows] of internalGroups.entries()) {
    const bankCount = bankKeyCounts.get(key) || 0;

    // First row in internal group is the 'keep' candidate unless it's in bank
    const keepCandidate = rows[0];
    internalKeepIds.add(keepCandidate.idTemp);

    rows.forEach((row, idx) => {
      repeatCounts.set(row.idTemp, rows.length);
      if (bankCount > 0) {
        bankDuplicateIds.add(row.idTemp);
        bankMatchCountMap.set(row.idTemp, bankCount);
      }

      if (idx > 0) {
        internalDuplicateIds.add(row.idTemp);
        internalDuplicateCount++;
      }
    });
  }

  const bankDuplicateCount = bankDuplicateIds.size;
  const totalRedundantCount = internalDuplicateCount + bankDuplicateCount;

  return {
    internalDuplicateIds,
    internalKeepIds,
    bankDuplicateIds,
    repeatCounts,
    bankMatchCountMap,
    internalDuplicateCount,
    bankDuplicateCount,
    totalRedundantCount
  };
}


