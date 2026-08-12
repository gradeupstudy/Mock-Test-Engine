import { deflate, inflate } from 'pako';
import { OnlineMockConfig } from '../types';

/**
 * Encodes an OnlineMockConfig into an ultra-compact zlib-compressed URL-safe Base64 string
 * so portable fallback links stay under ~1,000 characters and never trigger URI_TOO_LONG errors.
 */
export function encodeMockForUrl(config: OnlineMockConfig): string {
  try {
    const minified = {
      s: config.shareId,
      n: config.testName,
      i: config.instituteName || 'Gradeup Study',
      d: config.duration || 60,
      tm: config.totalMarks || 100,
      mq: config.marksPerQuestion || 2,
      nm: config.negativeMarksPerQuestion || 0.5,
      st: (config.socialTasks || []).map(t => ({
        id: t.id,
        p: t.platform,
        t: t.title,
        u: t.url,
        r: t.isRequired
      })),
      q: (config.questions || []).map((q, idx) => ({
        id: q.id || idx + 1,
        sub: q.subject || 'General',
        ch: q.chapter || 'General',
        q: q.question,
        tr: q.translation,
        a: q.optionA,
        b: q.optionB,
        c: q.optionC,
        d: q.optionD,
        ans: q.answer,
        exp: q.explanation
      }))
    };

    const jsonStr = JSON.stringify(minified);
    // Compress with zlib deflate
    const compressed = deflate(jsonStr);

    // Convert Uint8Array to binary string
    let binary = '';
    const len = compressed.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(compressed[i]);
    }

    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    console.warn('Failed to encode mock for URL with pako:', e);
    return '';
  }
}

/**
 * Decodes a URL-safe Base64 string back into an OnlineMockConfig object,
 * handling both pako zlib-compressed strings and legacy uncompressed strings.
 */
export function decodeMockFromUrl(encodedStr: string): OnlineMockConfig | null {
  if (!encodedStr || typeof encodedStr !== 'string') return null;

  try {
    let base64 = encodedStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const binaryStr = atob(base64);
    let jsonStr = '';

    // Try pako inflate first
    try {
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      jsonStr = inflate(bytes, { to: 'string' });
    } catch (_inflateErr) {
      // Fallback for legacy uncompressed base64 strings
      const percentEncoded = Array.prototype.map.call(binaryStr, (c: string) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('');
      jsonStr = decodeURIComponent(percentEncoded);
    }

    const min = JSON.parse(jsonStr);

    if (!min || !min.n || !Array.isArray(min.q)) {
      return null;
    }

    return {
      shareId: min.s || `mock_${Date.now()}`,
      testName: min.n,
      instituteName: min.i || 'Gradeup Study',
      duration: min.d || 60,
      totalMarks: min.tm || (min.q.length * (min.mq || 2)),
      marksPerQuestion: min.mq || 2,
      negativeMarksPerQuestion: min.nm || 0.5,
      socialTasks: (min.st || []).map((t: any) => ({
        id: t.id || `task_${Math.random().toString(36).substring(2, 7)}`,
        platform: t.p || 'telegram',
        title: t.t || 'Follow Channel',
        url: t.u || '#',
        isRequired: t.r !== false
      })),
      questions: (min.q || []).map((q: any, idx: number) => ({
        id: q.id || idx + 1,
        subject: q.sub || 'General',
        chapter: q.ch || 'General',
        question: q.q,
        translation: q.tr,
        optionA: q.a,
        optionB: q.b,
        optionC: q.c,
        optionD: q.d,
        answer: q.ans,
        explanation: q.exp
      })),
      createdDate: new Date().toISOString(),
      isActive: true
    };
  } catch (e) {
    console.warn('Failed to decode mock from URL:', e);
    return null;
  }
}

