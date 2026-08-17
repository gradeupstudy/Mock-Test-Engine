import { Question } from '../types';
import { shouldDisplayTranslation, formatMathSymbols } from './exportUtils';

export interface MeasuredQuestion {
  question: Question;
  originalIndex: number;
  height: number;
  isOversized: boolean;
  splitType?: 'full' | 'question_only' | 'options_only' | 'options_ab' | 'options_cd';
}

export interface EnginePageLayout {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  col1: MeasuredQuestion[];
  col2: MeasuredQuestion[];
  col1Height: number;
  col2Height: number;
  availableHeight: number;
  utilization: number;
  balanceScore: number;
  unusedSpace: number;
  hasOverflow: boolean;
  warnings: string[];
}

export interface LayoutValidationReport {
  isPass: boolean;
  totalPages: number;
  totalQuestions: number;
  renderedQuestions: number;
  missingQuestions: number;
  duplicateQuestions: number;
  overflowCount: number;
  clippedCount: number;
  blankPagesCount: number;
  averageUtilization: number;
  averageBalance: number;
  details: string[];
}

export interface HeaderFooterDimensions {
  headerPage1Height: number;
  headerOtherHeight: number;
  footerHeight: number;
  availablePage1ColHeight: number;
  availableOtherColHeight: number;
}

// Standard A4 Dimensions at 96 DPI: 210mm x 297mm => 794px x 1123px
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
export const A4_PADDING_TOP = 20;
export const A4_PADDING_BOTTOM = 16;
export const A4_PADDING_X = 24;
export const COLUMN_WIDTH_PX = 356; // (794 - 48 - 16) / 2 = ~365px, safely 356px inner text box

// In-memory cache for measured heights to ensure ultra-fast re-renders and smooth UI
const measurementCache = new Map<string, number>();

/**
 * Generate cache key for a question under given typography parameters
 */
function getQuestionCacheKey(
  q: Question,
  density: 'compact' | 'ultra-compact' | 'normal',
  colWidth: number = COLUMN_WIDTH_PX,
  splitType: string = 'full'
): string {
  return `${q.id || ''}_${q.question || ''}_${q.translation || ''}_${q.optionA || ''}_${q.optionB || ''}_${q.optionC || ''}_${q.optionD || ''}_${density}_${colWidth}_${splitType}`;
}

/**
 * Helper to escape HTML characters safely
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Creates or retrieves the hidden measurement container in the DOM
 */
function getMeasurementContainer(colWidth: number = COLUMN_WIDTH_PX): HTMLElement {
  let container = document.getElementById('a4-engine-measurement-sandbox');
  if (!container) {
    container = document.createElement('div');
    container.id = 'a4-engine-measurement-sandbox';
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '-9999';
    document.body.appendChild(container);
  }
  container.style.width = `${colWidth}px`;
  container.style.maxWidth = `${colWidth}px`;
  container.style.minWidth = `${colWidth}px`;
  return container;
}

/**
 * Generates identical HTML markup for a question item as used in the real 2-column print paper
 */
export function buildQuestionMeasurementHtml(
  q: Question,
  qNum: number,
  density: 'compact' | 'ultra-compact' | 'normal' = 'compact',
  splitType: 'full' | 'question_only' | 'options_only' | 'options_ab' | 'options_cd' = 'full'
): string {
  const isUltra = density === 'ultra-compact';
  const isNormal = density === 'normal';

  const fontPt = isUltra ? '10.5px' : isNormal ? '12.5px' : '11.5px';
  const optFontPt = isUltra ? '10px' : isNormal ? '11.5px' : '11px';
  const qSpacing = isUltra ? '5px' : isNormal ? '8px' : '6.5px';

  const hasTranslation = shouldDisplayTranslation(q.question, q.translation);

  const optA = formatMathSymbols(`(A) ${q.optionA || ''}`);
  const optB = formatMathSymbols(`(B) ${q.optionB || ''}`);
  const optC = formatMathSymbols(`(C) ${q.optionC || ''}`);
  const optD = formatMathSymbols(`(D) ${q.optionD || ''}`);

  const rawA = q.optionA || '';
  const rawB = q.optionB || '';
  const rawC = q.optionC || '';
  const rawD = q.optionD || '';

  const isShort =
    rawA.length < 22 &&
    rawB.length < 22 &&
    rawC.length < 22 &&
    rawD.length < 22 &&
    !rawA.includes('\n') &&
    !rawB.includes('\n') &&
    !rawC.includes('\n') &&
    !rawD.includes('\n');

  let qHeaderHtml = '';
  if (splitType === 'full' || splitType === 'question_only') {
    qHeaderHtml = `
      <div style="font-weight: 700; color: #000000; margin-bottom: 2px; line-height: 1.32;">
        <span>Q${qNum}. </span>
        <span>${formatMathSymbols(escapeHtml(q.question || ''))}</span>
      </div>
      ${
        hasTranslation && q.translation
          ? `<div style="font-weight: 500; color: #1e293b; margin-bottom: 2px; font-size: ${optFontPt}; line-height: 1.32;">
              ${formatMathSymbols(escapeHtml(q.translation))}
            </div>`
          : ''
      }
    `;
  }

  let optContent = '';
  if (splitType === 'question_only') {
    optContent = '';
  } else if (splitType === 'options_only') {
    optContent = `
      <div style="font-weight: 700; color: #000000; font-size: ${optFontPt}; margin-bottom: 2px;">
        <span>Q${qNum}. (Options):</span>
      </div>
      ${
        isShort
          ? `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>`
          : `<div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>`
      }
    `;
  } else if (splitType === 'options_ab') {
    optContent = `
      <div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
        <div>${optA}</div>
        <div>${optB}</div>
      </div>
    `;
  } else if (splitType === 'options_cd') {
    optContent = `
      <div style="font-weight: 700; color: #000000; font-size: ${optFontPt}; margin-bottom: 2px;">
        <span>Q${qNum}. (Contd):</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
        <div>${optC}</div>
        <div>${optD}</div>
      </div>
    `;
  } else {
    optContent = isShort
      ? `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
          <div>${optA}</div>
          <div>${optB}</div>
          <div>${optC}</div>
          <div>${optD}</div>
        </div>`
      : `<div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
          <div>${optA}</div>
          <div>${optB}</div>
          <div>${optC}</div>
          <div>${optD}</div>
        </div>`;
  }

  return `
    <div class="a4-measure-item" style="box-sizing: border-box; padding: 1px 2px; margin-bottom: ${qSpacing}; font-size: ${fontPt}; line-height: 1.35; font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif; color: #000000; width: 100%;">
      ${qHeaderHtml}
      ${optContent}
    </div>
  `;
}

/**
 * Measures the physical DOM dimensions of Header (Page 1 vs Other) and Footer
 */
export function measureHeaderFooterDimensions(
  testTitle: string,
  duration: number,
  totalMarks: number,
  instructions: string,
  logoDataUrl?: string,
  showRollNo: boolean = true
): HeaderFooterDimensions {
  if (typeof document === 'undefined') {
    return {
      headerPage1Height: 180,
      headerOtherHeight: 32,
      footerHeight: 24,
      availablePage1ColHeight: 810,
      availableOtherColHeight: 980
    };
  }

  const container = getMeasurementContainer(A4_WIDTH_PX - 48); // Full page width inside padding

  // Build Page 1 Header
  const logoHtml = logoDataUrl
    ? `<div style="text-align: center; margin-bottom: 4px;"><img src="${logoDataUrl}" style="height: 44px; width: auto; object-fit: contain;" /></div>`
    : '';

  const header1Html = `
    <div id="measure-header-p1" style="font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif; box-sizing: border-box; width: 100%;">
      <div style="text-align: center; margin-bottom: 5px;">
        ${logoHtml}
        <h1 style="margin: 0; font-size: 16px; font-weight: 800; color: #000000; text-transform: uppercase;">
          ${escapeHtml(testTitle)}
        </h1>
        <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 3px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: center; gap: 16px;">
          <span>Time Allowed: ${duration} Mins</span>
          <span>|</span>
          <span>Max Marks: ${totalMarks}</span>
          ${showRollNo ? `<span>|</span><span>Roll No: ____________</span>` : ''}
        </div>
      </div>
      ${
        instructions
          ? `<div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 4px 8px; margin-bottom: 5px; font-size: 9.5px; line-height: 1.3; color: #000000; background: #ffffff;">
              <strong style="display: block; margin-bottom: 1px;">General Instructions:</strong>
              ${escapeHtml(instructions).replace(/\n/g, '<br/>')}
            </div>`
          : ''
      }
    </div>
  `;

  // Build Page 2+ Header
  const headerOtherHtml = `
    <div id="measure-header-other" style="font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif; box-sizing: border-box; width: 100%; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #000000; min-height: 24px;">
      <span style="font-weight: 800; font-size: 11px; text-transform: uppercase;">${escapeHtml(testTitle)}</span>
      <span style="display: inline-block; font-size: 9.5px; font-weight: 800; background: #000000; color: #ffffff; padding: 2px 8px; border-radius: 3px;">PAGE 2 OF 5</span>
    </div>
  `;

  // Build Footer
  const footerHtml = `
    <div id="measure-footer" style="font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif; box-sizing: border-box; width: 100%; border-top: 1px solid #000000; padding-top: 2px; display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #000000;">
      <span>Gradeup Study Official Test Series</span>
      <span>Page 1 of 5</span>
    </div>
  `;

  container.innerHTML = `${header1Html}${headerOtherHtml}${footerHtml}`;

  const elH1 = document.getElementById('measure-header-p1');
  const elHOther = document.getElementById('measure-header-other');
  const elF = document.getElementById('measure-footer');

  const headerPage1Height = elH1 ? Math.ceil(elH1.getBoundingClientRect().height) : 180;
  const headerOtherHeight = elHOther ? Math.ceil(elHOther.getBoundingClientRect().height) : 32;
  const footerHeight = elF ? Math.ceil(elF.getBoundingClientRect().height) : 24;

  // Clear measurement container
  container.innerHTML = '';

  // Box border & inner margins inside 2-column box (outer border 3px, top/bottom padding 12px)
  const innerBoxOverhead = 16;
  const pageUsableHeight = A4_HEIGHT_PX - (A4_PADDING_TOP + A4_PADDING_BOTTOM);

  const availablePage1ColHeight = Math.max(200, pageUsableHeight - headerPage1Height - footerHeight - innerBoxOverhead);
  const availableOtherColHeight = Math.max(300, pageUsableHeight - headerOtherHeight - footerHeight - innerBoxOverhead);

  return {
    headerPage1Height,
    headerOtherHeight,
    footerHeight,
    availablePage1ColHeight,
    availableOtherColHeight
  };
}

/**
 * Batched, high-speed DOM measurement of questions using actual rendered DOM nodes
 */
export async function measureQuestionsActualHeight(
  questions: Question[],
  density: 'compact' | 'ultra-compact' | 'normal' = 'compact',
  colWidth: number = COLUMN_WIDTH_PX
): Promise<MeasuredQuestion[]> {
  if (!questions || questions.length === 0) return [];

  // 1. Ensure fonts are ready
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Continue if fonts.ready fails
    }
  }

  // 2. Identify questions needing measurement vs cached
  const results: (MeasuredQuestion | null)[] = new Array(questions.length).fill(null);
  const unmeasuredIndices: number[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const key = getQuestionCacheKey(q, density, colWidth, 'full');
    if (measurementCache.has(key)) {
      const h = measurementCache.get(key)!;
      results[i] = {
        question: q,
        originalIndex: i,
        height: h,
        isOversized: h > 750,
        splitType: 'full'
      };
    } else {
      unmeasuredIndices.push(i);
    }
  }

  // 3. Batch render unmeasured items in hidden DOM sandbox
  if (unmeasuredIndices.length > 0 && typeof document !== 'undefined') {
    const container = getMeasurementContainer(colWidth);
    const htmlChunks = unmeasuredIndices.map(idx => {
      return `<div data-measure-idx="${idx}" style="box-sizing: border-box; width: 100%;">${buildQuestionMeasurementHtml(questions[idx], idx + 1, density, 'full')}</div>`;
    });

    container.innerHTML = htmlChunks.join('');

    // Wait for any embedded images if present
    const images = container.getElementsByTagName('img');
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(img =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
        )
      );
    }

    // Measure bounding client rect for all unmeasured items
    const renderedNodes = container.querySelectorAll('[data-measure-idx]');
    renderedNodes.forEach(node => {
      const idx = Number(node.getAttribute('data-measure-idx'));
      const rect = node.getBoundingClientRect();
      const measuredH = Math.max(18, Math.ceil(rect.height));
      const q = questions[idx];
      const key = getQuestionCacheKey(q, density, colWidth, 'full');
      measurementCache.set(key, measuredH);

      results[idx] = {
        question: q,
        originalIndex: idx,
        height: measuredH,
        isOversized: measuredH > 750,
        splitType: 'full'
      };
    });

    container.innerHTML = '';
  }

  // Fallback if any remain unmeasured
  return results.map((res, i) => {
    if (res) return res;
    return {
      question: questions[i],
      originalIndex: i,
      height: 48,
      isOversized: false,
      splitType: 'full'
    };
  });
}

/**
 * Intelligent Column Height Balancer:
 * Finds the optimal split index k for sequential questions Q1..Qk (Col 1) and Qk+1..Qn (Col 2)
 * to strictly minimize the vertical height difference |col1Height - col2Height|
 */
export function balanceColumnsByRenderedHeight(
  items: MeasuredQuestion[],
  maxColHeight: number
): { col1: MeasuredQuestion[]; col2: MeasuredQuestion[]; col1Height: number; col2Height: number } {
  if (!items || items.length === 0) {
    return { col1: [], col2: [], col1Height: 0, col2Height: 0 };
  }
  if (items.length === 1) {
    return { col1: [items[0]], col2: [], col1Height: items[0].height, col2Height: 0 };
  }

  const n = items.length;
  const totalH = items.reduce((sum, it) => sum + it.height, 0);

  let bestK = Math.ceil(n / 2);
  let bestScore = Infinity;

  let runningSum = 0;
  for (let k = 1; k < n; k++) {
    runningSum += items[k - 1].height;
    const col2H = totalH - runningSum;
    const diff = Math.abs(runningSum - col2H);

    // Penalize if any column exceeds max available height
    const col1Overflow = Math.max(0, runningSum - maxColHeight);
    const col2Overflow = Math.max(0, col2H - maxColHeight);
    const overflowPenalty = (col1Overflow + col2Overflow) * 50;

    const score = diff + overflowPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestK = k;
    }
  }

  const col1 = items.slice(0, bestK);
  const col2 = items.slice(bestK);
  const col1Height = col1.reduce((sum, it) => sum + it.height, 0);
  const col2Height = col2.reduce((sum, it) => sum + it.height, 0);

  return { col1, col2, col1Height, col2Height };
}

/**
 * Master Height-Aware 2-Column Pagination Engine:
 * Intelligently distributes questions across A4 pages to achieve maximum page utilization,
 * strictly prevents clipping, maintains sequential question ordering, and balances columns.
 */
export function paginateQuestionsA4MasterEngine(
  measuredQuestions: MeasuredQuestion[],
  dimensions: HeaderFooterDimensions,
  autoBalance: boolean = true,
  manualPage1Cap?: number,
  manualOtherCap?: number
): EnginePageLayout[] {
  if (!measuredQuestions || measuredQuestions.length === 0) return [];

  const totalN = measuredQuestions.length;
  const pages: EnginePageLayout[] = [];
  const remaining = [...measuredQuestions];

  const hasManualCaps = !!(manualPage1Cap && manualOtherCap && manualPage1Cap > 0 && manualOtherCap > 0);

  if (hasManualCaps) {
    // Mode A: Fixed Manual Capacity with Height-Overflow Guards
    let pageNum = 1;
    while (remaining.length > 0) {
      const isFirst = pageNum === 1;
      const targetCount = isFirst ? manualPage1Cap! : manualOtherCap!;
      const availableHeight = isFirst ? dimensions.availablePage1ColHeight : dimensions.availableOtherColHeight;

      const takeCount = Math.min(remaining.length, targetCount);
      const pageItems = remaining.splice(0, takeCount);
      let { col1, col2, col1Height, col2Height } = balanceColumnsByRenderedHeight(pageItems, availableHeight);

      // Height-overflow guard: push excess questions to next page if exceeding available height
      while (pageItems.length > 1 && (col1Height > availableHeight + 4 || col2Height > availableHeight + 4)) {
        const popped = pageItems.pop()!;
        remaining.unshift(popped);
        const rebalanced = balanceColumnsByRenderedHeight(pageItems, availableHeight);
        col1 = rebalanced.col1;
        col2 = rebalanced.col2;
        col1Height = rebalanced.col1Height;
        col2Height = rebalanced.col2Height;
      }

      const maxColH = Math.max(col1Height, col2Height);
      const utilization = Math.min(100, Math.round(((col1Height + col2Height) / (2 * availableHeight)) * 100));
      const balanceScore = Math.max(0, Math.round(100 - (Math.abs(col1Height - col2Height) / availableHeight) * 100));
      const unusedSpace = Math.max(0, 100 - utilization);
      const hasOverflow = col1Height > availableHeight || col2Height > availableHeight;

      const warnings: string[] = [];
      if (hasOverflow) {
        warnings.push(`Page ${pageNum} exceeds A4 height by ${Math.round(maxColH - availableHeight)}px.`);
      }

      pages.push({
        pageNumber: pageNum,
        totalPages: 1,
        isFirstPage: isFirst,
        col1,
        col2,
        col1Height,
        col2Height,
        availableHeight,
        utilization,
        balanceScore,
        unusedSpace,
        hasOverflow,
        warnings
      });

      pageNum++;
    }
  } else {
    // Mode B: Intelligent Height-Driven Auto-Packing & Balancing
    // Calculate total height of all questions
    const totalContentHeight = measuredQuestions.reduce((sum, q) => sum + q.height, 0);

    // Calculate realistic page capacity in total question height
    const p1ColCapacity = dimensions.availablePage1ColHeight;
    const p1TotalCapacity = p1ColCapacity * 2;
    const otherColCapacity = dimensions.availableOtherColHeight;
    const otherTotalCapacity = otherColCapacity * 2;

    // Estimate minimum required pages based on actual measured content height
    let targetPages = 1;
    if (totalContentHeight > p1TotalCapacity * 0.95) {
      const remainingHeight = totalContentHeight - p1TotalCapacity * 0.9;
      const additionalPages = Math.ceil(remainingHeight / (otherTotalCapacity * 0.92));
      targetPages = 1 + additionalPages;
    }

    // Allocate fair target quotas across pages to eliminate huge empty gaps on the last page
    let pageQuotas: number[] = [];
    if (targetPages === 1) {
      pageQuotas = [totalN];
    } else {
      // Calculate even proportion of question count per page
      const p1Ratio = p1TotalCapacity / (p1TotalCapacity + (targetPages - 1) * otherTotalCapacity);
      let p1Count = Math.min(24, Math.max(4, Math.round(totalN * p1Ratio)));
      if (p1Count % 2 !== 0 && p1Count + 1 <= totalN) p1Count++;
      pageQuotas.push(p1Count);

      const remainingQuestionsCount = totalN - p1Count;
      const otherPagesCount = targetPages - 1;
      const baseOther = Math.floor(remainingQuestionsCount / otherPagesCount);
      const remainder = remainingQuestionsCount % otherPagesCount;

      for (let p = 0; p < otherPagesCount; p++) {
        pageQuotas.push(baseOther + (p < remainder ? 1 : 0));
      }
    }

    let pIdx = 0;
    while (remaining.length > 0) {
      const isFirst = pIdx === 0;
      const availableHeight = isFirst ? dimensions.availablePage1ColHeight : dimensions.availableOtherColHeight;
      const quota = pageQuotas[pIdx] || Math.min(remaining.length, isFirst ? 20 : 28);

      const takeCount = Math.min(remaining.length, quota);
      const pageItems = remaining.splice(0, takeCount);

      let { col1, col2, col1Height, col2Height } = balanceColumnsByRenderedHeight(pageItems, availableHeight);

      // If columns overflow, pop items back to remaining
      while (pageItems.length > 2 && (col1Height > availableHeight + 4 || col2Height > availableHeight + 4)) {
        const popped = pageItems.pop()!;
        remaining.unshift(popped);
        const rebalanced = balanceColumnsByRenderedHeight(pageItems, availableHeight);
        col1 = rebalanced.col1;
        col2 = rebalanced.col2;
        col1Height = rebalanced.col1Height;
        col2Height = rebalanced.col2Height;
      }

      // If this is NOT the last planned page and we have plenty of remaining questions and unused space, greedily pack
      while (remaining.length > 0 && pIdx < targetPages - 1) {
        const nextQ = remaining[0];
        const testItems = [...pageItems, nextQ];
        const testBalanced = balanceColumnsByRenderedHeight(testItems, availableHeight);
        if (testBalanced.col1Height <= availableHeight && testBalanced.col2Height <= availableHeight) {
          pageItems.push(remaining.shift()!);
          col1 = testBalanced.col1;
          col2 = testBalanced.col2;
          col1Height = testBalanced.col1Height;
          col2Height = testBalanced.col2Height;
        } else {
          break;
        }
      }

      const maxColH = Math.max(col1Height, col2Height);
      const utilization = Math.min(100, Math.round(((col1Height + col2Height) / (2 * availableHeight)) * 100));
      const balanceScore = Math.max(0, Math.round(100 - (Math.abs(col1Height - col2Height) / availableHeight) * 100));
      const unusedSpace = Math.max(0, 100 - utilization);
      const hasOverflow = col1Height > availableHeight || col2Height > availableHeight;

      const warnings: string[] = [];
      if (hasOverflow) {
        warnings.push(`Page ${pIdx + 1} exceeds A4 height by ${Math.round(maxColH - availableHeight)}px.`);
      }

      pages.push({
        pageNumber: pIdx + 1,
        totalPages: 1, // updated below
        isFirstPage: isFirst,
        col1,
        col2,
        col1Height,
        col2Height,
        availableHeight,
        utilization,
        balanceScore,
        unusedSpace,
        hasOverflow,
        warnings
      });

      pIdx++;
    }
  }

  // Synchronize total pages count across all pages
  const finalTotalPages = pages.length;
  pages.forEach(p => {
    p.totalPages = finalTotalPages;
  });

  return pages;
}

/**
 * Validates the generated layout and produces an audit report
 */
export function validatePrintLayoutReport(
  pages: EnginePageLayout[],
  originalQuestions: Question[]
): LayoutValidationReport {
  const totalQuestions = originalQuestions.length;
  let renderedCount = 0;
  const seenIndices = new Set<number>();
  let duplicateCount = 0;
  let overflowCount = 0;
  let blankPagesCount = 0;
  let totalUtil = 0;
  let totalBalance = 0;
  const details: string[] = [];

  pages.forEach((p, idx) => {
    const pageItems = [...p.col1, ...p.col2];
    if (pageItems.length === 0) {
      blankPagesCount++;
      details.push(`⚠️ Page ${p.pageNumber} is completely empty!`);
    }

    if (p.hasOverflow) {
      overflowCount++;
      details.push(`⚠️ Page ${p.pageNumber} column overflow (Col 1: ${p.col1Height}px, Col 2: ${p.col2Height}px / Max: ${p.availableHeight}px)`);
    }

    totalUtil += p.utilization;
    totalBalance += p.balanceScore;

    pageItems.forEach(item => {
      renderedCount++;
      if (seenIndices.has(item.originalIndex)) {
        duplicateCount++;
      } else {
        seenIndices.add(item.originalIndex);
      }
    });
  });

  const missingCount = Math.max(0, totalQuestions - seenIndices.size);
  const avgUtil = pages.length > 0 ? Math.round(totalUtil / pages.length) : 0;
  const avgBalance = pages.length > 0 ? Math.round(totalBalance / pages.length) : 0;

  const isPass = missingCount === 0 && duplicateCount === 0 && overflowCount === 0 && blankPagesCount === 0;

  return {
    isPass,
    totalPages: pages.length,
    totalQuestions,
    renderedQuestions: renderedCount,
    missingQuestions: missingCount,
    duplicateQuestions: duplicateCount,
    overflowCount,
    clippedCount: 0,
    blankPagesCount,
    averageUtilization: avgUtil,
    averageBalance: avgBalance,
    details
  };
}
