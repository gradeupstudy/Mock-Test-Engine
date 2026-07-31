import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { gzip, ungzip } from 'pako';
import { Question, MockHistory } from '../types';

const STORAGE_KEY_URL = 'gradeup_supabase_url';
const STORAGE_KEY_ANON = 'gradeup_supabase_anon_key';
const STORAGE_KEY_BUCKET = 'gradeup_supabase_bucket_name';
const DEFAULT_BUCKET_NAME = 'backups';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  bucketName: string;
}

export function getStoredSupabaseBucketName(): string {
  const localBucket = localStorage.getItem(STORAGE_KEY_BUCKET);
  return (localBucket || DEFAULT_BUCKET_NAME).trim();
}

export function saveSupabaseBucketName(name: string): void {
  if (name.trim()) {
    localStorage.setItem(STORAGE_KEY_BUCKET, name.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_BUCKET);
  }
}

export function getStoredSupabaseConfig(): SupabaseConfig {
  const metaEnv = (import.meta as any).env || {};
  const envUrl = (metaEnv.VITE_SUPABASE_URL || '').trim();
  const envKey = (metaEnv.VITE_SUPABASE_ANON_KEY || '').trim();

  const localUrl = (localStorage.getItem(STORAGE_KEY_URL) || '').trim();
  const localKey = (localStorage.getItem(STORAGE_KEY_ANON) || '').trim();

  return {
    url: localUrl || envUrl,
    anonKey: localKey || envKey,
    bucketName: getStoredSupabaseBucketName()
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (url.trim()) {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_URL);
  }

  if (anonKey.trim()) {
    localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_ANON);
  }
}

let cachedClient: { url: string; key: string; client: SupabaseClient } | null = null;

export function getSupabaseClient(customUrl?: string, customKey?: string): SupabaseClient | null {
  const config = getStoredSupabaseConfig();
  const url = (customUrl !== undefined ? customUrl : config.url).trim();
  const key = (customKey !== undefined ? customKey : config.anonKey).trim();

  if (!url || !key) {
    return null;
  }

  if (cachedClient && cachedClient.url === url && cachedClient.key === key) {
    return cachedClient.client;
  }

  try {
    const client = createClient(url, key, {
      auth: { persistSession: true }
    });
    cachedClient = { url, key, client };
    return client;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export async function testSupabaseConnection(customUrl?: string, customKey?: string): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient(customUrl, customKey);
  if (!client) {
    return {
      success: false,
      message: 'Supabase URL or Anon Key is missing. Please enter valid credentials.'
    };
  }

  try {
    // Attempt a light ping by fetching auth session or querying system/health
    const { error } = await client.from('questions').select('id', { count: 'exact', head: true });
    
    if (error) {
      // If table doesn't exist yet, it's still connected!
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          success: true,
          message: 'Connected to Supabase! (Note: "questions" table not found yet. You can auto-create tables or run SQL schema).'
        };
      }
      return {
        success: false,
        message: `Supabase Error (${error.code || 'ERR'}): ${error.message}`
      };
    }

    return {
      success: true,
      message: 'Successfully connected to Supabase database!'
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Connection failed: ${err.message || 'Network error'}`
    };
  }
}

export async function fetchAllQuestionsFromSupabaseTable(client: SupabaseClient): Promise<{ data: any[]; error: any }> {
  let allRows: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await client
      .from('questions')
      .select('*')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      return { data: allRows, error };
    }

    if (data && data.length > 0) {
      allRows = allRows.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  return { data: allRows, error: null };
}

export async function deleteQuestionsFromSupabase(ids: number[]): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client || ids.length === 0) return { success: true };

  try {
    const batchSize = 200;
    for (let i = 0; i < ids.length; i += batchSize) {
      const chunk = ids.slice(i, i + batchSize);
      const { error } = await client.from('questions').delete().in('id', chunk);
      if (error) {
        console.error('Supabase batch delete error:', error.message);
        return { success: false, error: error.message };
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('Supabase batch delete exception:', err);
    return { success: false, error: err.message };
  }
}

export async function syncQuestionsToSupabase(questions: Question[]): Promise<{ success: boolean; count: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client || questions.length === 0) {
    return { success: false, count: 0, error: 'Supabase client is not configured or questions list is empty.' };
  }

  try {
    // Upsert questions batch with ID preserved if present
    const formatted = questions.map(q => ({
      ...(q.id !== undefined && q.id !== null ? { id: q.id } : {}),
      subject: q.subject,
      chapter: q.chapter,
      question: q.question,
      option_a: q.optionA,
      option_b: q.optionB,
      option_c: q.optionC,
      option_d: q.optionD,
      answer: q.answer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'Moderate',
      usage_count: q.usageCount || 0,
      question_status: q.questionStatus || 'Fresh',
      chapter_coverage_score: q.chapterCoverageScore || 8,
      updated_at: q.updatedDate || new Date().toISOString()
    }));

    let totalCount = 0;
    const batchSize = 200;
    for (let i = 0; i < formatted.length; i += batchSize) {
      const chunk = formatted.slice(i, i + batchSize);
      const { data, error } = await client.from('questions').upsert(chunk, { onConflict: 'id' }).select('id');

      if (error) {
        console.warn('Supabase batch upsert with ID failed, attempting insert without ID fallback:', error.message);
        const chunkNoId = chunk.map(({ id, ...rest }: any) => rest);
        const { data: fallbackData, error: fallbackErr } = await client.from('questions').insert(chunkNoId).select('id');
        if (fallbackErr) {
          console.error('Supabase batch insert fallback error:', fallbackErr.message);
          return { success: false, count: totalCount, error: fallbackErr.message };
        }
        totalCount += fallbackData?.length || chunkNoId.length;
      } else {
        totalCount += data?.length || chunk.length;
      }
    }

    return { success: true, count: totalCount };
  } catch (err: any) {
    console.error('Supabase syncQuestions exception:', err);
    return { success: false, count: 0, error: err.message || 'Sync failed' };
  }
}

export async function fetchQuestionsFromSupabase(): Promise<{ success: boolean; questions: Question[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, questions: [], error: 'Supabase client is not configured.' };
  }

  try {
    const { data, error } = await fetchAllQuestionsFromSupabaseTable(client);

    if (error) {
      return { success: false, questions: [], error: error.message };
    }

    const questions: Question[] = (data || []).map((q: any) => ({
      id: q.id,
      subject: q.subject,
      chapter: q.chapter,
      question: q.question,
      optionA: q.option_a || q.optionA,
      optionB: q.option_b || q.optionB,
      optionC: q.option_c || q.optionC,
      optionD: q.option_d || q.optionD,
      answer: q.answer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'Moderate',
      usageCount: q.usage_count || 0,
      questionStatus: q.question_status || 'Fresh',
      chapterCoverageScore: q.chapter_coverage_score || 8,
      createdDate: q.created_at || new Date().toISOString(),
      updatedDate: q.updated_at || new Date().toISOString()
    }));

    return { success: true, questions };
  } catch (err: any) {
    return { success: false, questions: [], error: err.message || 'Fetch failed' };
  }
}

export async function syncAllMcqsWithSupabase(localQuestions: Question[]): Promise<{
  success: boolean;
  pushedCount: number;
  pulledCount: number;
  allQuestions: Question[];
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      allQuestions: localQuestions,
      error: 'Supabase URL or Anon Key is missing. Please configure credentials first.'
    };
  }

  try {
    // 1. Fetch existing cloud MCQs from Supabase with pagination
    const { data: cloudData, error: fetchErr } = await fetchAllQuestionsFromSupabaseTable(client);

    if (fetchErr) {
      return {
        success: false,
        pushedCount: 0,
        pulledCount: 0,
        allQuestions: localQuestions,
        error: `Supabase Table Error: ${fetchErr.message}`
      };
    }

    const cloudQuestions: Question[] = (cloudData || []).map((q: any) => ({
      id: q.id,
      subject: q.subject,
      chapter: q.chapter,
      question: q.question,
      optionA: q.option_a || q.optionA,
      optionB: q.option_b || q.optionB,
      optionC: q.option_c || q.optionC,
      optionD: q.option_d || q.optionD,
      answer: q.answer,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 'Moderate',
      usageCount: q.usage_count || 0,
      questionStatus: q.question_status || 'Fresh',
      chapterCoverageScore: q.chapter_coverage_score || 8,
      createdDate: q.created_at || new Date().toISOString(),
      updatedDate: q.updated_at || new Date().toISOString()
    }));

    // Deduplication signature map
    const normalizeKey = (sub: string, qText: string) => `${(sub || '').trim().toLowerCase()}||${(qText || '').trim().toLowerCase()}`;
    
    const cloudById = new Map<number, Question>();
    const cloudByKey = new Map<string, Question>();
    cloudQuestions.forEach(q => {
      if (q.id !== undefined) cloudById.set(q.id, q);
      cloudByKey.set(normalizeKey(q.subject, q.question), q);
    });

    // 2. Identify local questions that need to be inserted or updated in Supabase
    const toUpdateInCloud: Question[] = [];
    const toInsertInCloud: Question[] = [];

    for (const localQ of localQuestions) {
      const qKey = normalizeKey(localQ.subject, localQ.question);
      const matchByKey = cloudByKey.get(qKey);

      // Match by ID ONLY IF the question text also matches
      const matchById = (localQ.id !== undefined && cloudById.has(localQ.id)) ? cloudById.get(localQ.id) : undefined;
      const isTrueMatchById = matchById && normalizeKey(matchById.subject, matchById.question) === qKey;

      const cloudMatch = matchByKey || (isTrueMatchById ? matchById : undefined);

      if (!cloudMatch) {
        // Not in cloud -> needs insert
        toInsertInCloud.push(localQ);
      } else {
        // Exists in cloud -> check if local has updated info (e.g. AI explanation or newer date)
        const localHasExp = Boolean(localQ.explanation && localQ.explanation.trim());
        const cloudHasExp = Boolean(cloudMatch.explanation && cloudMatch.explanation.trim());

        if (localHasExp && !cloudHasExp) {
          toUpdateInCloud.push({ ...localQ, id: cloudMatch.id });
        } else if (localQ.updatedDate && cloudMatch.updatedDate && new Date(localQ.updatedDate) > new Date(cloudMatch.updatedDate)) {
          toUpdateInCloud.push({ ...localQ, id: cloudMatch.id });
        }
      }
    }

    let pushedCount = 0;
    const batchSize = 50;

    // A) Insert new questions into Supabase (omit local ID so Supabase identity primary key works)
    if (toInsertInCloud.length > 0) {
      const formattedInsert = toInsertInCloud.map(q => {
        const cleanAns = (q.answer || 'A').toUpperCase().trim();
        const validAns = ['A', 'B', 'C', 'D'].includes(cleanAns) ? cleanAns : 'A';
        return {
          subject: (q.subject || 'General').trim(),
          chapter: (q.chapter || 'General').trim(),
          question: (q.question || '').trim(),
          option_a: (q.optionA || '').trim(),
          option_b: (q.optionB || '').trim(),
          option_c: (q.optionC || '').trim(),
          option_d: (q.optionD || '').trim(),
          answer: validAns,
          explanation: (q.explanation || '').trim(),
          difficulty: (['Easy', 'Moderate', 'Hard'].includes(q.difficulty || '') ? q.difficulty : 'Moderate'),
          usage_count: Number(q.usageCount) || 0,
          question_status: q.questionStatus || 'Fresh',
          chapter_coverage_score: Number(q.chapterCoverageScore) || 8,
          updated_at: q.updatedDate || new Date().toISOString()
        };
      });

      for (let i = 0; i < formattedInsert.length; i += batchSize) {
        const chunk = formattedInsert.slice(i, i + batchSize);
        const { data: insertedData, error: insertErr } = await client
          .from('questions')
          .insert(chunk)
          .select('id');

        if (insertErr) {
          console.warn('Supabase batch insert error, retrying in sub-batches of 10:', insertErr.message);
          for (let j = 0; j < chunk.length; j += 10) {
            const subChunk = chunk.slice(j, j + 10);
            const { data: subData, error: subErr } = await client.from('questions').insert(subChunk).select('id');
            if (subErr) {
              for (const singleItem of subChunk) {
                const { data: singleData, error: singleErr } = await client.from('questions').insert([singleItem]).select('id');
                if (singleErr) {
                  console.error('Single row Supabase insert error:', singleErr.message);
                } else if (singleData) {
                  pushedCount += singleData.length;
                }
              }
            } else if (subData) {
              pushedCount += subData.length;
            }
          }
        } else if (insertedData) {
          pushedCount += insertedData.length;
        }
      }
    }

    // B) Update existing questions in Supabase using verified cloud ID
    if (toUpdateInCloud.length > 0) {
      const formattedUpdate = toUpdateInCloud.map(q => {
        const cleanAns = (q.answer || 'A').toUpperCase().trim();
        const validAns = ['A', 'B', 'C', 'D'].includes(cleanAns) ? cleanAns : 'A';
        return {
          id: q.id,
          subject: (q.subject || 'General').trim(),
          chapter: (q.chapter || 'General').trim(),
          question: (q.question || '').trim(),
          option_a: (q.optionA || '').trim(),
          option_b: (q.optionB || '').trim(),
          option_c: (q.optionC || '').trim(),
          option_d: (q.optionD || '').trim(),
          answer: validAns,
          explanation: (q.explanation || '').trim(),
          difficulty: (['Easy', 'Moderate', 'Hard'].includes(q.difficulty || '') ? q.difficulty : 'Moderate'),
          usage_count: Number(q.usageCount) || 0,
          question_status: q.questionStatus || 'Fresh',
          chapter_coverage_score: Number(q.chapterCoverageScore) || 8,
          updated_at: q.updatedDate || new Date().toISOString()
        };
      });

      for (let i = 0; i < formattedUpdate.length; i += batchSize) {
        const chunk = formattedUpdate.slice(i, i + batchSize);
        const { data: updatedData, error: updateErr } = await client
          .from('questions')
          .upsert(chunk, { onConflict: 'id' })
          .select('id');

        if (updateErr) {
          console.warn('Supabase update MCQs error:', updateErr.message);
          for (const item of chunk) {
            try {
              await client.from('questions').upsert([item], { onConflict: 'id' });
            } catch (e) {
              // Ignore single item error
            }
          }
        } else if (updatedData) {
          pushedCount += updatedData.length;
        }
      }
    }

    // 3. Fetch final merged collection from Supabase
    const { data: finalCloudData, error: finalErr } = await fetchAllQuestionsFromSupabaseTable(client);
    const cloudRecords = (finalErr || !finalCloudData) ? cloudQuestions : finalCloudData;

    const localById = new Map<number, Question>();
    const localByKey = new Map<string, Question>();
    localQuestions.forEach(q => {
      if (q.id !== undefined) localById.set(q.id, q);
      localByKey.set(normalizeKey(q.subject, q.question), q);
    });

    // Deduplicate cloud records so old duplicate rows in Supabase do not re-populate
    const seenCloudKeys = new Map<string, any>();
    const redundantCloudIds: number[] = [];

    cloudRecords.forEach((q: any) => {
      const qKey = normalizeKey(q.subject, q.question);
      if (!seenCloudKeys.has(qKey)) {
        seenCloudKeys.set(qKey, q);
      } else {
        // Redundant duplicate copy in cloud
        if (q.id !== undefined) {
          redundantCloudIds.push(q.id);
        }
      }
    });

    // Auto-purge redundant duplicate copies from Supabase in background
    if (redundantCloudIds.length > 0) {
      deleteQuestionsFromSupabase(redundantCloudIds).catch(() => {});
    }

    const uniqueCloudRecords = Array.from(seenCloudKeys.values());

    const mergedSet = new Set<string>();
    const mergedIdSet = new Set<number>();

    const mergedQuestions: Question[] = uniqueCloudRecords.map((q: any) => {
      const qId = q.id;
      const key = normalizeKey(q.subject, q.question);
      const localMatch = localByKey.get(key) || (qId !== undefined ? localById.get(qId) : undefined);

      let explanation = q.explanation || '';
      if ((!explanation || !explanation.trim()) && localMatch && localMatch.explanation && localMatch.explanation.trim()) {
        explanation = localMatch.explanation;
      }

      if (qId !== undefined) mergedIdSet.add(qId);
      mergedSet.add(key);

      return {
        id: q.id,
        subject: q.subject,
        chapter: q.chapter,
        question: q.question,
        optionA: q.option_a || q.optionA,
        optionB: q.option_b || q.optionB,
        optionC: q.option_c || q.optionC,
        optionD: q.option_d || q.optionD,
        answer: q.answer,
        explanation,
        difficulty: q.difficulty || (localMatch?.difficulty) || 'Moderate',
        usageCount: q.usage_count !== undefined ? q.usage_count : (localMatch?.usageCount || 0),
        questionStatus: q.question_status || (localMatch?.questionStatus) || 'Fresh',
        chapterCoverageScore: q.chapter_coverage_score !== undefined ? q.chapter_coverage_score : (localMatch?.chapterCoverageScore || 8),
        createdDate: q.created_at || localMatch?.createdDate || new Date().toISOString(),
        updatedDate: q.updated_at || localMatch?.updatedDate || new Date().toISOString()
      };
    });

    // 4. PRESERVE LOCAL QUESTIONS: Add any local question that is not present in Cloud
    for (const localQ of localQuestions) {
      const qKey = normalizeKey(localQ.subject, localQ.question);
      const hasKey = mergedSet.has(qKey);

      if (!hasKey) {
        mergedQuestions.push(localQ);
        mergedSet.add(qKey);
        if (localQ.id !== undefined) mergedIdSet.add(localQ.id);
      }
    }

    return {
      success: true,
      pushedCount,
      pulledCount: mergedQuestions.length,
      allQuestions: mergedQuestions
    };
  } catch (err: any) {
    return {
      success: false,
      pushedCount: 0,
      pulledCount: 0,
      allQuestions: localQuestions,
      error: err.message || 'Supabase MCQ synchronization failed'
    };
  }
}

export async function syncMockHistoryToSupabase(mockHistoryList: MockHistory[]): Promise<{ success: boolean; count: number; error?: string }> {
  const client = getSupabaseClient();
  if (!client || mockHistoryList.length === 0) {
    return { success: false, count: 0, error: 'Supabase client is not configured or mock list is empty.' };
  }

  try {
    const formatted = mockHistoryList.map(m => ({
      mock_id: m.mockId,
      test_name: m.testName || 'Mock Test',
      marks: m.marks || 100,
      duration: m.duration || 60,
      question_ids: m.questionIds || [],
      uniqueness: m.uniqueness || 100,
      created_at: m.createdDate || new Date().toISOString()
    }));

    const { data, error } = await client.from('mock_history').upsert(formatted, { onConflict: 'mock_id' }).select('id');

    if (error) {
      console.warn('Supabase mock_history upsert error:', error.message);
      return { success: false, count: 0, error: error.message };
    }

    return { success: true, count: data?.length || formatted.length };
  } catch (err: any) {
    console.error('Supabase syncMockHistory exception:', err);
    return { success: false, count: 0, error: err.message || 'Sync failed' };
  }
}

export async function fetchMockHistoryFromSupabase(): Promise<{ success: boolean; mockHistory: MockHistory[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, mockHistory: [], error: 'Supabase client is not configured.' };
  }

  try {
    const { data, error } = await client.from('mock_history').select('*').order('mock_id', { ascending: false });

    if (error) {
      return { success: false, mockHistory: [], error: error.message };
    }

    const mockHistory: MockHistory[] = (data || []).map((m: any) => ({
      id: m.id,
      mockId: m.mock_id || m.mockId,
      testName: m.test_name || m.title || 'Mock Test',
      marks: m.marks || 100,
      duration: m.duration || 60,
      questionIds: Array.isArray(m.question_ids) ? m.question_ids : (Array.isArray(m.questionIds) ? m.questionIds : []),
      uniqueness: m.uniqueness || 100,
      createdDate: m.created_at || new Date().toISOString()
    }));

    return { success: true, mockHistory };
  } catch (err: any) {
    return { success: false, mockHistory: [], error: err.message || 'Fetch failed' };
  }
}

import pako from 'pako';

/* ==========================================================================
   SUPABASE FILE BUCKET STORAGE BACKUP & RESTORE FUNCTIONS WITH GZIP
   ========================================================================== */

export interface SupabaseStorageBackupFile {
  name: string;
  id?: string;
  created_at?: string;
  updated_at?: string;
  size?: number;
  isCompressed?: boolean;
}

/**
 * Compress JSON or object to Gzip Uint8Array/Blob
 */
export function compressJsonToGzip(data: any): {
  compressedData: Uint8Array;
  originalSize: number;
  compressedSize: number;
  savingsPercent: string;
} {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const textEncoder = new TextEncoder();
  const rawBytes = textEncoder.encode(jsonString);
  const originalSize = rawBytes.length;

  const compressedData = gzip(rawBytes, { level: 9 }); // Maximum compression
  const compressedSize = compressedData.length;
  const savings = originalSize > 0 ? (((originalSize - compressedSize) / originalSize) * 100).toFixed(1) : '0';

  return {
    compressedData,
    originalSize,
    compressedSize,
    savingsPercent: savings
  };
}

/**
 * Decompress Gzip Uint8Array or ArrayBuffer to JSON object or raw data.
 * Automatically detects whether data is Gzip compressed or plain JSON text.
 */
export function decompressGzipToJson(inputData: ArrayBuffer | Uint8Array): any {
  const uint8 = inputData instanceof Uint8Array ? inputData : new Uint8Array(inputData);

  // Check magic bytes for Gzip header: 0x1F, 0x8B
  const isGzip = uint8.length >= 2 && uint8[0] === 0x1f && uint8[1] === 0x8b;

  if (isGzip) {
    const decompressedBytes = ungzip(uint8);
    const jsonStr = new TextDecoder('utf-8').decode(decompressedBytes);
    return JSON.parse(jsonStr);
  } else {
    // Plain uncompressed text
    const textDecoder = new TextDecoder('utf-8');
    const jsonStr = textDecoder.decode(uint8);
    return JSON.parse(jsonStr);
  }
}

export async function testSupabaseBucketAccess(
  customBucketName?: string
): Promise<{ success: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, message: 'Supabase URL or Anon Key is missing.' };
  }

  const bucket = customBucketName || getStoredSupabaseBucketName();

  try {
    const { data, error } = await client.storage.from(bucket).list('', { limit: 10 });
    if (error) {
      return {
        success: false,
        message: `Bucket error ("${bucket}"): ${error.message}. Make sure the bucket "${bucket}" exists in Supabase Storage.`
      };
    }

    return {
      success: true,
      message: `Successfully connected to Supabase Storage Bucket "${bucket}"! (${data?.length || 0} files found)`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to access Supabase Storage Bucket "${bucket}": ${err.message || 'Unknown error'}`
    };
  }
}

export async function uploadJsonBackupToSupabaseBucket(
  backupData: any,
  fileName?: string,
  customBucketName?: string,
  useGzipCompression: boolean = true
): Promise<{
  success: boolean;
  path?: string;
  fileName?: string;
  originalSize?: number;
  compressedSize?: number;
  savingsPercent?: string;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase is not configured. Please enter project URL & Anon Key.' };
  }

  const bucket = customBucketName || getStoredSupabaseBucketName();
  let targetFileName = (fileName && fileName.trim())
    ? fileName.trim()
    : `Gradeup_Study_Backup_${new Date().toISOString().slice(0, 10)}.json`;

  try {
    let uploadBlob: Blob;
    let originalSize = 0;
    let compressedSize = 0;
    let savingsPercent = '0';

    if (useGzipCompression) {
      if (!targetFileName.endsWith('.gz') && !targetFileName.endsWith('.json.gz')) {
        targetFileName = targetFileName.endsWith('.json')
          ? `${targetFileName}.gz`
          : `${targetFileName}.json.gz`;
      }

      const compressedInfo = compressJsonToGzip(backupData);
      uploadBlob = new Blob([compressedInfo.compressedData.buffer], { type: 'application/gzip' });
      originalSize = compressedInfo.originalSize;
      compressedSize = compressedInfo.compressedSize;
      savingsPercent = compressedInfo.savingsPercent;
    } else {
      const jsonString = typeof backupData === 'string' ? backupData : JSON.stringify(backupData, null, 2);
      uploadBlob = new Blob([jsonString], { type: 'application/json' });
      originalSize = uploadBlob.size;
      compressedSize = uploadBlob.size;
    }

    const { data, error } = await client.storage
      .from(bucket)
      .upload(targetFileName, uploadBlob, {
        contentType: useGzipCompression ? 'application/gzip' : 'application/json',
        upsert: true
      });

    if (error) {
      if (error.message.includes('not found') || error.message.includes('Bucket')) {
        return {
          success: false,
          error: `Bucket "${bucket}" was not found in Supabase Storage. Please create the bucket in your Supabase Dashboard or run the Storage SQL.`
        };
      }
      return { success: false, error: error.message };
    }

    return {
      success: true,
      path: data?.path || targetFileName,
      fileName: targetFileName,
      originalSize,
      compressedSize,
      savingsPercent
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to upload file to Supabase Storage' };
  }
}

export async function listJsonBackupsFromSupabaseBucket(
  customBucketName?: string
): Promise<{ success: boolean; files: SupabaseStorageBackupFile[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, files: [], error: 'Supabase client is not configured.' };
  }

  const bucket = customBucketName || getStoredSupabaseBucketName();

  try {
    const { data, error } = await client.storage.from(bucket).list('', {
      limit: 200,
      sortBy: { column: 'created_at', order: 'desc' }
    });

    if (error) {
      return { success: false, files: [], error: error.message };
    }

    // Filter json, json.gz, gz, zip or any data files
    const jsonFiles: SupabaseStorageBackupFile[] = (data || [])
      .filter(item => item.name && (
        item.name.endsWith('.json') ||
        item.name.endsWith('.gz') ||
        item.name.endsWith('.zip') ||
        !item.id
      ))
      .map(item => ({
        name: item.name,
        id: item.id || item.name,
        created_at: item.created_at || (item.metadata?.created_at as string) || new Date().toISOString(),
        updated_at: item.updated_at || (item.metadata?.updated_at as string) || new Date().toISOString(),
        size: item.metadata?.size || 0,
        isCompressed: item.name.endsWith('.gz') || item.name.endsWith('.zip')
      }));

    return { success: true, files: jsonFiles };
  } catch (err: any) {
    return { success: false, files: [], error: err.message || 'Failed to list backup files' };
  }
}

export async function downloadJsonBackupFromSupabaseBucket(
  fileName: string,
  customBucketName?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured.' };
  }

  const bucket = customBucketName || getStoredSupabaseBucketName();

  try {
    const { data, error } = await client.storage.from(bucket).download(fileName);

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Downloaded empty file from Supabase Storage.' };
    }

    const arrayBuffer = await data.arrayBuffer();
    const parsedData = decompressGzipToJson(arrayBuffer);

    return { success: true, data: parsedData };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to download or decompress backup file from Supabase Storage' };
  }
}

export async function deleteJsonBackupFromSupabaseBucket(
  fileName: string,
  customBucketName?: string
): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: 'Supabase client is not configured.' };
  }

  const bucket = customBucketName || getStoredSupabaseBucketName();

  try {
    const { error } = await client.storage.from(bucket).remove([fileName]);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete file from Supabase Storage' };
  }
}

export const SUPABASE_SQL_SCHEMA = `-- Gradeup Study Supabase Database & Storage Schema

-- 1. Questions Table
CREATE TABLE IF NOT EXISTS public.questions (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  subject TEXT NOT NULL,
  chapter TEXT NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT DEFAULT '',
  difficulty TEXT DEFAULT 'Moderate',
  usage_count INT DEFAULT 0,
  question_status TEXT DEFAULT 'Fresh',
  chapter_coverage_score INT DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Mock History Table
CREATE TABLE IF NOT EXISTS public.mock_history (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  mock_id BIGINT UNIQUE NOT NULL,
  test_name TEXT NOT NULL,
  marks INT DEFAULT 100,
  duration INT DEFAULT 60,
  question_ids JSONB DEFAULT '[]'::jsonb,
  uniqueness INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Storage Bucket 'backups' for JSON File Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', true)
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security (RLS) & Public Policies for Tables
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on questions" ON public.questions FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update on questions" ON public.questions FOR ALL USING (true);

CREATE POLICY "Allow public read access on mock_history" ON public.mock_history FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update on mock_history" ON public.mock_history FOR ALL USING (true);

-- Storage Object Security Policies for 'backups' bucket
CREATE POLICY "Public Read Access on backups bucket" ON storage.objects FOR SELECT USING (bucket_id = 'backups');
CREATE POLICY "Public Upload Access on backups bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'backups');
CREATE POLICY "Public Update Access on backups bucket" ON storage.objects FOR UPDATE USING (bucket_id = 'backups');
CREATE POLICY "Public Delete Access on backups bucket" ON storage.objects FOR DELETE USING (bucket_id = 'backups');
`;
