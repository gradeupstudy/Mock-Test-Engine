import { gzip, ungzip } from 'pako';
import { Question, MockHistory } from '../types';
import { generateBackupFilename } from './supabaseClient';

const STORAGE_KEY_R2_ACCOUNT_ID = 'gradeup_r2_account_id';
const STORAGE_KEY_R2_ACCESS_KEY_ID = 'gradeup_r2_access_key_id';
const STORAGE_KEY_R2_SECRET_ACCESS_KEY = 'gradeup_r2_secret_access_key';
const STORAGE_KEY_R2_BUCKET = 'gradeup_r2_bucket_name';
const STORAGE_KEY_R2_CUSTOM_DOMAIN = 'gradeup_r2_custom_domain';

const DEFAULT_R2_BUCKET = 'backups';

export interface CloudflareR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  customDomain?: string;
}

export interface CloudflareR2File {
  key: string;
  name: string;
  size: number;
  lastModified?: string;
  etag?: string;
}

export function getStoredR2Config(): CloudflareR2Config {
  const metaEnv = (import.meta as any).env || {};
  const envAccountId = (metaEnv.VITE_R2_ACCOUNT_ID || '').trim();
  const envAccessKey = (metaEnv.VITE_R2_ACCESS_KEY_ID || '').trim();
  const envSecretKey = (metaEnv.VITE_R2_SECRET_ACCESS_KEY || '').trim();
  const envBucket = (metaEnv.VITE_R2_BUCKET_NAME || '').trim();

  const localAccountId = (localStorage.getItem(STORAGE_KEY_R2_ACCOUNT_ID) || '').trim();
  const localAccessKey = (localStorage.getItem(STORAGE_KEY_R2_ACCESS_KEY_ID) || '').trim();
  const localSecretKey = (localStorage.getItem(STORAGE_KEY_R2_SECRET_ACCESS_KEY) || '').trim();
  const localBucket = (localStorage.getItem(STORAGE_KEY_R2_BUCKET) || '').trim();
  const localCustomDomain = (localStorage.getItem(STORAGE_KEY_R2_CUSTOM_DOMAIN) || '').trim();

  return {
    accountId: localAccountId || envAccountId,
    accessKeyId: localAccessKey || envAccessKey,
    secretAccessKey: localSecretKey || envSecretKey,
    bucketName: localBucket || envBucket || DEFAULT_R2_BUCKET,
    customDomain: localCustomDomain
  };
}

export function saveR2Config(config: Partial<CloudflareR2Config>): void {
  if (config.accountId !== undefined) {
    if (config.accountId.trim()) localStorage.setItem(STORAGE_KEY_R2_ACCOUNT_ID, config.accountId.trim());
    else localStorage.removeItem(STORAGE_KEY_R2_ACCOUNT_ID);
  }
  if (config.accessKeyId !== undefined) {
    if (config.accessKeyId.trim()) localStorage.setItem(STORAGE_KEY_R2_ACCESS_KEY_ID, config.accessKeyId.trim());
    else localStorage.removeItem(STORAGE_KEY_R2_ACCESS_KEY_ID);
  }
  if (config.secretAccessKey !== undefined) {
    if (config.secretAccessKey.trim()) localStorage.setItem(STORAGE_KEY_R2_SECRET_ACCESS_KEY, config.secretAccessKey.trim());
    else localStorage.removeItem(STORAGE_KEY_R2_SECRET_ACCESS_KEY);
  }
  if (config.bucketName !== undefined) {
    if (config.bucketName.trim()) localStorage.setItem(STORAGE_KEY_R2_BUCKET, config.bucketName.trim());
    else localStorage.removeItem(STORAGE_KEY_R2_BUCKET);
  }
  if (config.customDomain !== undefined) {
    if (config.customDomain.trim()) localStorage.setItem(STORAGE_KEY_R2_CUSTOM_DOMAIN, config.customDomain.trim());
    else localStorage.removeItem(STORAGE_KEY_R2_CUSTOM_DOMAIN);
  }
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

  const compressedData = gzip(rawBytes, { level: 9 });
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
 * Decompress Gzip or parse raw JSON
 */
export function decompressGzipToJson(data: ArrayBuffer | Uint8Array | string): any {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }

  const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);

  // Check magic numbers for Gzip (0x1f 0x8b)
  const isGzip = uint8.length >= 2 && uint8[0] === 0x1f && uint8[1] === 0x8b;

  if (isGzip) {
    const decompressedBytes = ungzip(uint8);
    const jsonStr = new TextDecoder('utf-8').decode(decompressedBytes);
    return JSON.parse(jsonStr);
  } else {
    const textDecoder = new TextDecoder('utf-8');
    const text = textDecoder.decode(uint8);
    return JSON.parse(text);
  }
}

/**
 * Test Cloudflare R2 Connection via Server Proxy Endpoint
 */
export async function testR2Connection(customConfig?: Partial<CloudflareR2Config>): Promise<{ success: boolean; message: string }> {
  const config = { ...getStoredR2Config(), ...customConfig };

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return {
      success: false,
      message: 'Cloudflare Account ID, Access Key ID, or Secret Access Key is missing. Please enter credentials.'
    };
  }

  try {
    const res = await fetch('/api/r2/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || `Successfully connected to Cloudflare R2 Bucket "${config.bucketName}"!`
      };
    } else {
      return {
        success: false,
        message: data.error || data.message || 'Failed to connect to Cloudflare R2 Bucket.'
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Connection Error: ${err.message || 'Server endpoint unreachable.'}`
    };
  }
}

/**
 * List Backup files in Cloudflare R2 Bucket
 */
export async function listR2BucketFiles(customBucketName?: string): Promise<{ success: boolean; files: CloudflareR2File[]; error?: string }> {
  const config = getStoredR2Config();
  if (customBucketName) config.bucketName = customBucketName;

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return { success: false, files: [], error: 'Cloudflare R2 credentials not configured.' };
  }

  try {
    const res = await fetch('/api/r2/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, files: data.files || [] };
    } else {
      return { success: false, files: [], error: data.error || 'Failed to list bucket files.' };
    }
  } catch (err: any) {
    return { success: false, files: [], error: err.message || 'Network error listing R2 files.' };
  }
}

/**
 * Upload JSON / Compressed Backup to Cloudflare R2 Bucket
 */
export async function uploadBackupToR2Bucket(
  backupData: { version: string; exportDate: string; questions: Question[]; mockHistory?: MockHistory[] },
  fileName: string,
  customBucketName?: string,
  compressGzip: boolean = true
): Promise<{
  success: boolean;
  fileName: string;
  originalSize?: number;
  compressedSize?: number;
  savingsPercent?: string;
  error?: string;
}> {
  const config = getStoredR2Config();
  if (customBucketName) config.bucketName = customBucketName;

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return { success: false, fileName, error: 'Cloudflare R2 credentials missing. Please configure credentials first.' };
  }

  let finalFileName = fileName.trim() || generateBackupFilename('Gradeup_Study_Backup', compressGzip ? 'json.gz' : 'json');

  let payloadBase64: string;
  let contentType: string;
  let originalSize = 0;
  let compressedSize = 0;
  let savingsPercent = '0';

  if (compressGzip) {
    if (!finalFileName.endsWith('.gz')) finalFileName += '.gz';
    const { compressedData, originalSize: orig, compressedSize: comp, savingsPercent: sav } = compressJsonToGzip(backupData);
    originalSize = orig;
    compressedSize = comp;
    savingsPercent = sav;

    // Convert Uint8Array to Base64 safely
    let binary = '';
    const bytes = compressedData;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    payloadBase64 = btoa(binary);
    contentType = 'application/gzip';
  } else {
    if (finalFileName.endsWith('.gz')) finalFileName = finalFileName.replace(/\.gz$/, '');
    const jsonStr = JSON.stringify(backupData, null, 2);
    originalSize = new TextEncoder().encode(jsonStr).length;
    compressedSize = originalSize;
    payloadBase64 = btoa(unescape(encodeURIComponent(jsonStr)));
    contentType = 'application/json';
  }

  try {
    const res = await fetch('/api/r2/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        fileName: finalFileName,
        fileContentBase64: payloadBase64,
        contentType
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        fileName: finalFileName,
        originalSize,
        compressedSize,
        savingsPercent
      };
    } else {
      return {
        success: false,
        fileName: finalFileName,
        error: data.error || 'Failed to upload backup file to Cloudflare R2.'
      };
    }
  } catch (err: any) {
    return {
      success: false,
      fileName: finalFileName,
      error: `Upload Error: ${err.message || 'Network failure.'}`
    };
  }
}

/**
 * Download & Decompress Backup file from Cloudflare R2 Bucket
 */
export async function downloadBackupFromR2Bucket(
  fileName: string,
  customBucketName?: string
): Promise<{
  success: boolean;
  data?: { questions: Question[]; mockHistory?: MockHistory[] };
  error?: string;
}> {
  const config = getStoredR2Config();
  if (customBucketName) config.bucketName = customBucketName;

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return { success: false, error: 'Cloudflare R2 credentials missing.' };
  }

  try {
    const res = await fetch('/api/r2/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        fileName
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      return { success: false, error: errData.error || 'Failed to download file from Cloudflare R2.' };
    }

    const arrayBuffer = await res.arrayBuffer();
    const parsed = decompressGzipToJson(arrayBuffer);

    if (!parsed || (typeof parsed !== 'object')) {
      return { success: false, error: 'File content is not valid JSON or Gzip backup.' };
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : []);
    const mockHistory = Array.isArray(parsed.mockHistory) ? parsed.mockHistory : [];

    return {
      success: true,
      data: { questions, mockHistory }
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Download/Decompression Error: ${err.message || 'Invalid file format.'}`
    };
  }
}

/**
 * Delete Backup file from Cloudflare R2 Bucket
 */
export async function deleteBackupFromR2Bucket(
  fileName: string,
  customBucketName?: string
): Promise<{ success: boolean; error?: string }> {
  const config = getStoredR2Config();
  if (customBucketName) config.bucketName = customBucketName;

  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey) {
    return { success: false, error: 'Cloudflare R2 credentials missing.' };
  }

  try {
    const res = await fetch('/api/r2/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...config,
        fileName
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error || 'Failed to delete file from Cloudflare R2.' };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}
