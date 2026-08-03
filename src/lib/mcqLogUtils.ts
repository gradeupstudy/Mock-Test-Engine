import { Question, DeletedMcqItem, AddedMcqItem } from '../types';

const KEY_DELETED_MCQS = 'gradeup_recent_deleted_mcqs';
const KEY_ADDED_MCQS = 'gradeup_recent_added_mcqs';
const MAX_LOG_SIZE = 500;

export function getDeletedMcqsLog(): DeletedMcqItem[] {
  try {
    const raw = localStorage.getItem(KEY_DELETED_MCQS);
    if (!raw) return [];
    return JSON.parse(raw) as DeletedMcqItem[];
  } catch (err) {
    console.warn('Failed to load deleted MCQs log:', err);
    return [];
  }
}

export function addDeletedMcqsToLog(questions: Question[]): void {
  if (!questions || questions.length === 0) return;
  const current = getDeletedMcqsLog();
  const now = new Date().toISOString();

  const newItems: DeletedMcqItem[] = questions.map(q => ({
    id: q.id || Math.floor(Math.random() * 10000000),
    question: q,
    deletedAt: now
  }));

  // Put newest deleted questions at the beginning, keeping max limit
  const updated = [...newItems, ...current].slice(0, MAX_LOG_SIZE);
  try {
    localStorage.setItem(KEY_DELETED_MCQS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save deleted MCQs log:', err);
  }
}

export function removeDeletedMcqFromLog(id: number): void {
  const current = getDeletedMcqsLog();
  const updated = current.filter(item => item.id !== id && item.question.id !== id);
  try {
    localStorage.setItem(KEY_DELETED_MCQS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to update deleted MCQs log:', err);
  }
}

export function removeQuestionsFromDeletedLog(questions: Question[]): void {
  if (!questions || questions.length === 0) return;
  const current = getDeletedMcqsLog();
  if (current.length === 0) return;

  const idsToRemove = new Set<number>();
  const textKeysToRemove = new Set<string>();

  questions.forEach(q => {
    if (q.id !== undefined && q.id !== null) idsToRemove.add(q.id);
    if (q.question && q.question.trim()) {
      const key = `${(q.subject || '').trim().toLowerCase()}:::${q.question.trim().toLowerCase()}`;
      textKeysToRemove.add(key);
      textKeysToRemove.add(q.question.trim().toLowerCase());
    }
  });

  const updated = current.filter(item => {
    if (!item || !item.question) return false;
    if (item.id !== undefined && idsToRemove.has(item.id)) return false;
    if (item.question.id !== undefined && idsToRemove.has(item.question.id)) return false;
    
    if (item.question.question && item.question.question.trim()) {
      const itemText = item.question.question.trim().toLowerCase();
      const itemKey = `${(item.question.subject || '').trim().toLowerCase()}:::${itemText}`;
      if (textKeysToRemove.has(itemKey) || textKeysToRemove.has(itemText)) return false;
    }

    return true;
  });

  try {
    localStorage.setItem(KEY_DELETED_MCQS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to update deleted MCQs log:', err);
  }
}

export function clearDeletedMcqsLog(): void {
  try {
    localStorage.removeItem(KEY_DELETED_MCQS);
  } catch (err) {
    console.warn('Failed to clear deleted MCQs log:', err);
  }
}

export function getAddedMcqsLog(): AddedMcqItem[] {
  try {
    const raw = localStorage.getItem(KEY_ADDED_MCQS);
    if (!raw) return [];
    return JSON.parse(raw) as AddedMcqItem[];
  } catch (err) {
    console.warn('Failed to load added MCQs log:', err);
    return [];
  }
}

export function addAddedMcqsToLog(questions: Question[]): void {
  if (!questions || questions.length === 0) return;
  const current = getAddedMcqsLog();
  const now = new Date().toISOString();

  const newItems: AddedMcqItem[] = questions.map(q => ({
    id: q.id || Math.floor(Math.random() * 10000000),
    question: q,
    addedAt: now
  }));

  const updated = [...newItems, ...current].slice(0, MAX_LOG_SIZE);
  try {
    localStorage.setItem(KEY_ADDED_MCQS, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save added MCQs log:', err);
  }
}

export function clearAddedMcqsLog(): void {
  try {
    localStorage.removeItem(KEY_ADDED_MCQS);
  } catch (err) {
    console.warn('Failed to clear added MCQs log:', err);
  }
}
