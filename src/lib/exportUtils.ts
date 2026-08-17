import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  BorderStyle
} from 'docx';
import { Question, Template } from '../types';
import { formatMathSymbols } from './mathUtils';
export { formatMathSymbols };

// Cache for color sanitization canvas context
let _colorCanvas: HTMLCanvasElement | null = null;
let _colorCtx: CanvasRenderingContext2D | null = null;

function getColorContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_colorCtx) {
    try {
      _colorCanvas = document.createElement('canvas');
      _colorCanvas.width = 1;
      _colorCanvas.height = 1;
      _colorCtx = _colorCanvas.getContext('2d');
    } catch {
      _colorCtx = null;
    }
  }
  return _colorCtx;
}

/**
 * Converts modern color functions (oklch, color-mix, lab, lch) into standard RGB/HEX
 * so that html2canvas can parse styles without throwing "unsupported color function oklch".
 */
export function sanitizeColorToRgb(colorStr: string): string {
  if (!colorStr || typeof colorStr !== 'string') return '#000000';
  const trimmed = colorStr.trim();
  const ctx = getColorContext();
  if (!ctx) return '#000000';

  try {
    ctx.fillStyle = '#000000';
    ctx.fillStyle = trimmed;
    const resolved = ctx.fillStyle;
    if (resolved && !resolved.includes('oklch') && !resolved.includes('color-mix') && !resolved.includes('lab(') && !resolved.includes('lch(')) {
      return resolved;
    }
  } catch {
    // fallback below
  }

  // Fallback for oklch with opacity: extract alpha if present
  if (trimmed.includes('/')) {
    const alphaMatch = trimmed.match(/\/\s*([0-9.]+)/);
    const alpha = alphaMatch ? alphaMatch[1] : '0.5';
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return '#000000';
}

/**
 * Recursively scans and cleans CSS text of modern unsupported color functions
 */
export function sanitizeModernColorsInString(str: string): string {
  if (!str || (!str.includes('oklch') && !str.includes('color-mix') && !str.includes('lab(') && !str.includes('lch('))) {
    return str;
  }

  let result = str;
  let prev = '';
  let iterations = 0;

  while (result !== prev && iterations < 6) {
    prev = result;
    iterations++;
    // Matches oklch(...), lab(...), lch(...)
    result = result.replace(/(?:oklch|lab|lch)\([^()]+\)/gi, (match) => sanitizeColorToRgb(match));
    // Matches color-mix(...)
    result = result.replace(/color-mix\([^()]+\)/gi, (match) => sanitizeColorToRgb(match));
  }

  return result;
}

/**
 * Safe wrapper around html2canvas that sanitizes cloned DOM stylesheets and inline styles
 * to guarantee no oklch / color-mix color parsing crashes.
 */
export async function safeHtml2Canvas(
  element: HTMLElement,
  options: Parameters<typeof html2canvas>[1] = {}
): Promise<HTMLCanvasElement> {
  const userOnClone = options?.onclone;

  const safeOptions = {
    ...options,
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      // 1. Sanitize all <style> tags in the cloned document
      const styleTags = clonedDoc.querySelectorAll('style');
      styleTags.forEach((style) => {
        if (style.textContent && (
          style.textContent.includes('oklch') ||
          style.textContent.includes('color-mix') ||
          style.textContent.includes('lab(') ||
          style.textContent.includes('lch(')
        )) {
          try {
            style.textContent = sanitizeModernColorsInString(style.textContent);
          } catch (e) {
            console.warn('[safeHtml2Canvas] Style sanitization warning:', e);
          }
        }
      });

      // 2. Sanitize inline style attributes on all elements
      const allElements = clonedDoc.querySelectorAll('*');
      allElements.forEach((el) => {
        if (el instanceof HTMLElement) {
          const styleAttr = el.getAttribute('style');
          if (styleAttr && (
            styleAttr.includes('oklch') ||
            styleAttr.includes('color-mix') ||
            styleAttr.includes('lab(') ||
            styleAttr.includes('lch(')
          )) {
            try {
              el.setAttribute('style', sanitizeModernColorsInString(styleAttr));
            } catch {
              // ignore
            }
          }
        }
      });

      // 3. Run caller's custom onclone handler if specified
      if (userOnClone) {
        userOnClone(clonedDoc, clonedElement);
      }
    }
  };

  return html2canvas(element, safeOptions);
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function shouldDisplayTranslation(question?: string, translation?: string): boolean {
  if (!translation || !translation.trim()) return false;
  if (!question || !question.trim()) return true;

  const qClean = question.trim().toLowerCase().replace(/\s+/g, ' ');
  const tClean = translation.trim().toLowerCase().replace(/\s+/g, ' ');

  if (qClean === tClean) return false;

  const qNoParen = qClean.replace(/[()]/g, '');
  const tNoParen = tClean.replace(/[()]/g, '');

  if (qNoParen === tNoParen) return false;
  if (qNoParen.includes(tNoParen) && tNoParen.length > 8) return false;
  if (tNoParen.includes(qNoParen) && qNoParen.length > 8) return false;

  return true;
}

export function sanitizeBilingualQuestionAndTranslation(
  question?: string,
  translation?: string
): { question: string; translation: string } {
  let qText = (question || '').trim();
  let tText = (translation || '').trim();

  // Helper function to remove explicit prefix tags
  const stripPrefixes = (str: string): string => {
    return str
      .replace(/^(english|eng)\s*:\s*/gi, '')
      .replace(/^(hindi|hin|हिंदी|हिन्दी)\s*:\s*/gi, '')
      .replace(/^(प्रश्न)\s*:\s*/gi, '')
      .trim();
  };

  qText = stripPrefixes(qText);
  tText = stripPrefixes(tText);

  // Check if question contains explicit "English: ... \n Hindi: ..." or "English: ... \n हिंदी: ..."
  const explicitBilingualMatch = qText.match(/(?:english|eng)\s*:\s*([\s\S]+?)\n+(?:hindi|hin|हिंदी|हिन्दी)\s*:\s*([\s\S]+)/i) ||
    qText.match(/^(.*?)\n+(?:hindi|hin|हिंदी|हिन्दी)\s*:\s*([\s\S]+)/i);

  if (explicitBilingualMatch && explicitBilingualMatch[1] && explicitBilingualMatch[2]) {
    qText = stripPrefixes(explicitBilingualMatch[1].trim());
    const hPart = stripPrefixes(explicitBilingualMatch[2].trim());
    if (hPart) tText = hPart;
  }

  // Check if question contains Devanagari Hindi script (\u0900-\u097F)
  const hasHindiInQuestion = /[\u0900-\u097F]/.test(qText);

  if (hasHindiInQuestion) {
    // Check if question has parenthetical Hindi: "English Statement (Hindi Statement)"
    const parenHindiMatch = qText.match(/^(.*?)\s*\(\s*([\u0900-\u097F][\u0900-\u097F\s\d=,.:;?!\-+*%/|\'"’\`()\n]*)\s*\)\s*$/s);

    if (parenHindiMatch && parenHindiMatch[1] && parenHindiMatch[2]) {
      const engPart = parenHindiMatch[1].trim();
      const hindiPart = parenHindiMatch[2].trim();

      if (engPart.length > 0 && /[\u0900-\u097F]/.test(hindiPart)) {
        qText = stripPrefixes(engPart);
        tText = stripPrefixes(hindiPart);
      }
    } else {
      // Check multiline English and Hindi in question
      const lines = qText.split(/\n+/).map(l => stripPrefixes(l.trim())).filter(Boolean);
      if (lines.length >= 2) {
        const line1HasHindi = /[\u0900-\u097F]/.test(lines[0]);
        const line2HasHindi = /[\u0900-\u097F]/.test(lines[1]);

        if (!line1HasHindi && line2HasHindi) {
          qText = lines[0];
          let hPart = lines.slice(1).join('\n').trim();
          if (hPart.startsWith('(') && hPart.endsWith(')')) {
            hPart = hPart.slice(1, -1).trim();
          }
          tText = stripPrefixes(hPart);
        } else if (line1HasHindi && !line2HasHindi) {
          tText = stripPrefixes(lines[0]);
          qText = lines[1];
        }
      }
    }
  }

  // Swap if question is purely Hindi and translation is English
  const qHasHindi = /[\u0900-\u097F]/.test(qText);
  const qHasEng = /[a-zA-Z]/.test(qText);
  const tHasEng = /[a-zA-Z]/.test(tText);
  const tHasHindi = /[\u0900-\u097F]/.test(tText);

  if (qHasHindi && !qHasEng && tHasEng && !tHasHindi) {
    const temp = qText;
    qText = tText;
    tText = temp;
  }

  // Clean outer parentheses from translation if present
  if (tText.startsWith('(') && tText.endsWith(')')) {
    const inner = tText.slice(1, -1).trim();
    if (/[\u0900-\u097F]/.test(inner) || inner.length > 0) {
      tText = inner;
    }
  }

  // If translation is identical to question, clear translation
  if (tText && qText && tText.toLowerCase() === qText.toLowerCase()) {
    tText = '';
  }

  if (!shouldDisplayTranslation(qText, tText)) {
    if (qText.trim().toLowerCase() === tText.trim().toLowerCase()) {
      tText = '';
    }
  }

  return { question: qText, translation: tText };
}

export async function exportAppOnlineMockTestDocx(
  questions: Question[],
  testNameOverride?: string,
  positiveMarks: number = 1,
  negativeMarks: number = 0
) {
  if (questions.length === 0) return;

  const docChildren: (Paragraph | Table)[] = [];

  // Document Title Header
  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: (testNameOverride || 'APP ONLINE MOCK TEST').toUpperCase(),
          bold: true,
          size: 30, // 15pt
          color: '0F172A',
          font: { name: 'Arial', cs: 'Mangal' }
        })
      ],
      spacing: { before: 100, after: 240 },
      alignment: 'center' as any
    })
  );

  const convertAnswerToNumber = (ans: string): string => {
    const clean = (ans || '').trim().toUpperCase();
    if (clean === 'A' || clean === 'OPTION A' || clean === '1') return '1';
    if (clean === 'B' || clean === 'OPTION B' || clean === '2') return '2';
    if (clean === 'C' || clean === 'OPTION C' || clean === '3') return '3';
    if (clean === 'D' || clean === 'OPTION D' || clean === '4') return '4';
    return clean || '1';
  };

  questions.forEach((q, idx) => {
    // Question heading (e.g., Question 1, Question 2)
    docChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Question ${idx + 1}`,
            bold: true,
            size: 26, // 13pt
            color: '0082A6', // Cyan/blue accent
            font: { name: 'Arial', cs: 'Mangal' }
          })
        ],
        spacing: { before: 320, after: 100 }
      })
    );

    // Combine question text and translation if translation exists and isn't already included
    let questionFullText = formatMathSymbols((q.question || '').trim());
    if (q.translation && q.translation.trim() !== '') {
      const transClean = formatMathSymbols(q.translation.trim());
      if (!questionFullText.includes(transClean)) {
        questionFullText += ` ${transClean}`;
      }
    }

    const rowEntries: { label: string; value: string; isBold: boolean }[] = [
      { label: 'Question', value: questionFullText, isBold: true },
      { label: 'Type', value: 'multiple_choice', isBold: false },
      { label: 'Option', value: formatMathSymbols(q.optionA || ''), isBold: false },
      { label: 'Option', value: formatMathSymbols(q.optionB || ''), isBold: false },
      { label: 'Option', value: formatMathSymbols(q.optionC || ''), isBold: false },
      { label: 'Option', value: formatMathSymbols(q.optionD || ''), isBold: false },
      { label: 'Answer', value: convertAnswerToNumber(q.answer), isBold: true },
      {
        label: 'Solution',
        value: (q.explanation && q.explanation.trim() !== '')
          ? formatMathSymbols(q.explanation.trim())
          : `Option ${convertAnswerToNumber(q.answer)} (${q.answer}) is the correct answer.`,
        isBold: false
      },
      { label: 'Positive Marks', value: String(positiveMarks), isBold: false },
      { label: 'Negative Marks', value: String(negativeMarks), isBold: false }
    ];

    const tableRows = rowEntries.map(entry => {
      const lines = entry.value.split('\n');
      return new TableRow({
        children: [
          // Left Cell
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FAFC' },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: entry.label,
                    bold: entry.isBold,
                    size: 20, // 10pt
                    color: entry.isBold ? '0F172A' : '475569',
                    font: { name: 'Arial', cs: 'Mangal' }
                  })
                ]
              })
            ]
          }),
          // Right Cell (Support multiline paragraphs for Solution/Question)
          new TableCell({
            width: { size: 78, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: lines.map((line, lIdx) =>
              new Paragraph({
                children: [
                  new TextRun({
                    text: line,
                    bold: entry.label === 'Answer' || entry.label === 'Question',
                    size: 20, // 10pt
                    color: '0F172A',
                    font: { name: 'Arial', cs: 'Mangal' }
                  })
                ],
                spacing: { after: lIdx === lines.length - 1 ? 0 : 60 }
              })
            )
          })
        ]
      });
    });

    const questionTable = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        left: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        right: { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' }
      }
    });

    docChildren.push(questionTable);
  });

  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        children: docChildren
      }
    ]
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${(testNameOverride || 'App_Online_Mock_Test').replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportPdfTestPaper(
  questions: Question[],
  template: Template,
  testNameOverride?: string,
  totalMarksOverride?: number,
  durationOverride?: number
) {
  if (questions.length === 0) {
    alert('No questions loaded to export.');
    return;
  }

  // Create an off-screen container for rendering high-res HTML canvas with full Devanagari support
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // 210mm at 96 DPI
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif";
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.5';
  container.style.padding = template.page.margin === 'compact' ? '30px' : template.page.margin === 'spacious' ? '60px' : '45px';
  container.style.boxSizing = 'border-box';
  container.style.height = 'auto';
  container.style.overflow = 'visible';

  const h = template.header;
  const qStyle = template.qStyle;

  let logoHtml = '';
  if (template.logoDataUrl) {
    const logoW = h.logoSize === 'small' ? '50px' : h.logoSize === 'large' ? '90px' : '70px';
    logoHtml = `<img src="${template.logoDataUrl}" style="width:${logoW}; height:auto; margin-bottom:8px;" />`;
  }

  let watermarkHtml = '';
  if (h.watermark) {
    watermarkHtml = `
      <div style="position:absolute; top:40%; left:50%; transform:translate(-50%, -50%) rotate(-35deg); font-size:52px; font-weight:bold; color:rgba(200,200,200,0.12); pointer-events:none; white-space:nowrap; z-index:0; text-transform:uppercase;">
        ${escapeHtml(h.watermark)}
      </div>
    `;
  }

  let headerBorderCss = 'border-bottom: 2px solid #0f172a; padding-bottom: 12px;';
  if (h.headerStyle === 'double-border') {
    headerBorderCss = 'border-bottom: 4px double #0f172a; padding-bottom: 12px;';
  } else if (h.headerStyle === 'thick-line') {
    headerBorderCss = 'border-bottom: 4px solid #0f172a; padding-bottom: 12px;';
  } else if (h.headerStyle === 'boxed' || h.headerStyle === 'bordered-box') {
    headerBorderCss = 'border: 2px solid #0f172a; padding: 15px; border-radius: 8px;';
  }

  const setCodeHtml = h.setCode ? `
    <div style="position:absolute; top:0; right:0; border:1.5px solid #0f172a; padding:3px 8px; font-size:11px; font-weight:bold; border-radius:4px;">
      SET ${escapeHtml(h.setCode.toUpperCase())}
    </div>
  ` : '';

  const questionsHtml = questions.map((q, idx) => {
    const qNum = idx + 1;
    let numPrefix = `${qNum}.`;
    if (qStyle.numberingStyle === 'Q1.') numPrefix = `Q.${qNum}`;
    else if (qStyle.numberingStyle === '[1]') numPrefix = `[${qNum}]`;
    else if (qStyle.numberingStyle === 'Question 1.') numPrefix = `Question ${qNum}.`;

    const optLabel = (letter: string) => {
      if (qStyle.optionStyle === '(A)') return `(${letter})`;
      if (qStyle.optionStyle === '①') {
        const circles: Record<string, string> = { A: '①', B: '②', C: '③', D: '④' };
        return circles[letter] || letter;
      }
      return `${letter}.`;
    };

    const optA = `${optLabel('A')} ${escapeHtml(formatMathSymbols(q.optionA || ''))}`;
    const optB = `${optLabel('B')} ${escapeHtml(formatMathSymbols(q.optionB || ''))}`;
    const optC = `${optLabel('C')} ${escapeHtml(formatMathSymbols(q.optionC || ''))}`;
    const optD = `${optLabel('D')} ${escapeHtml(formatMathSymbols(q.optionD || ''))}`;

    const isShortOpts = optA.length < 35 && optB.length < 35 && optC.length < 35 && optD.length < 35;

    return `
      <div style="margin-bottom: 18px; page-break-inside: avoid; break-inside: avoid; position: relative; z-index: 1;">
        <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 4px;">
          <span style="color: #2563eb; margin-right: 4px;">${numPrefix}</span>
          ${escapeHtml(formatMathSymbols(q.question || ''))}
        </div>
        ${shouldDisplayTranslation(q.question, q.translation) ? `
          <div style="font-size: 14px; color: #334155; font-style: italic; font-weight: 500; margin-bottom: 6px; padding-left: 18px;">
            ${escapeHtml(formatMathSymbols(q.translation!))}
          </div>
        ` : ''}
        ${isShortOpts ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; padding-left: 18px; font-size: 13px; color: #1e293b;">
            <div>${optA}</div>
            <div>${optB}</div>
            <div>${optC}</div>
            <div>${optD}</div>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 18px; font-size: 13px; color: #1e293b;">
            <div>${optA}</div>
            <div>${optB}</div>
            <div>${optC}</div>
            <div>${optD}</div>
          </div>
        `}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
    </style>
    ${watermarkHtml}
    <div style="position: relative; z-index: 1;">
      <div style="text-align: center; margin-bottom: 15px; position: relative; ${headerBorderCss}">
        ${setCodeHtml}
        ${logoHtml}
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; text-transform: uppercase;">
          ${escapeHtml(h.instituteName)}
        </h1>
        <h2 style="margin: 4px 0; font-size: 16px; font-weight: 700; color: #2563eb;">
          ${escapeHtml(h.examName)}
        </h2>
        <h3 style="margin: 2px 0 8px 0; font-size: 14px; font-weight: 600; font-style: italic; color: #475569;">
          ${escapeHtml(testNameOverride || h.testName)}
        </h3>
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #334155; margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;">
          <div>Time Allowed: ${durationOverride || 60} Mins</div>
          <div>Max Marks: ${totalMarksOverride || questions.length * 2}</div>
          <div>${h.showRollNo ? 'Roll No: ____________' : ''} ${h.showDate ? `Date: ${new Date().toLocaleDateString()}` : ''}</div>
        </div>
      </div>

      ${h.instructions ? `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #334155;">
          <strong style="color: #0f172a;">General Instructions:</strong><br/>
          ${escapeHtml(h.instructions).replace(/\n/g, '<br/>')}
        </div>
      ` : ''}

      <div style="margin-top: 15px;">
        ${questionsHtml}
      </div>

      <div style="margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; color: #64748b; display: flex; justify-content: space-between;">
        <div>${escapeHtml(h.footer || 'Gradeup Study - Quality Preparation for Competitive Exams')}</div>
        <div>Page End</div>
      </div>
    </div>
  `;

  document.body.appendChild(container);
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const scrollHeight = Math.max(container.scrollHeight, container.offsetHeight);

    const canvas = await safeHtml2Canvas(container, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      height: scrollHeight,
      windowHeight: scrollHeight,
      scrollY: 0,
      logging: false
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    const pageCanvas = document.createElement('canvas');
    const ctx = pageCanvas.getContext('2d');
    const pxPageHeight = Math.floor((canvas.width * pageHeight) / imgWidth);

    while (heightLeft > 0) {
      pageCanvas.width = canvas.width;
      const currentChunkHeight = Math.min(pxPageHeight, canvas.height - position);
      pageCanvas.height = currentChunkHeight;

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, currentChunkHeight);
        ctx.drawImage(
          canvas,
          0,
          position,
          canvas.width,
          currentChunkHeight,
          0,
          0,
          canvas.width,
          currentChunkHeight
        );
      }

      const chunkImgData = pageCanvas.toDataURL('image/png');
      const chunkMmHeight = (currentChunkHeight * imgWidth) / canvas.width;

      if (position > 0) {
        pdf.addPage();
      }

      pdf.addImage(chunkImgData, 'PNG', 0, 0, imgWidth, chunkMmHeight, undefined, 'FAST');

      heightLeft -= pageHeight;
      position += pxPageHeight;
    }

    const fileName = `${(testNameOverride || 'Gradeup_Mock_Test').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('PDF Generation Error:', err);
    alert('Failed to render PDF: ' + err.message);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

export async function exportPdfAnswerKey(
  questions: Question[],
  testNameOverride?: string
) {
  if (questions.length === 0) {
    alert('No questions found.');
    return;
  }

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif";
  container.style.fontSize = '12px';
  container.style.lineHeight = '1.4';
  container.style.padding = '40px';
  container.style.boxSizing = 'border-box';
  container.style.height = 'auto';
  container.style.overflow = 'visible';

  const rowsHtml = questions.map((q, idx) => {
    const rawOptText =
      q.answer === 'A' ? q.optionA :
      q.answer === 'B' ? q.optionB :
      q.answer === 'C' ? q.optionC :
      q.answer === 'D' ? q.optionD : '';

    const correctOptText = formatMathSymbols(rawOptText || '');

    const explanationText = q.explanation && q.explanation.trim() !== ''
      ? formatMathSymbols(q.explanation.trim())
      : `Correct answer is Option ${q.answer}.${correctOptText ? ` (${correctOptText})` : ''}`;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
        <td style="padding: 10px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 50px;">
          Q.${idx + 1}
        </td>
        <td style="padding: 10px; vertical-align: top; width: 140px; color: #334155;">
          <div style="font-weight: 600; color: #0f172a;">${escapeHtml(q.subject || 'General')}</div>
          <div style="font-size: 11px; color: #64748b;">(${escapeHtml(q.chapter || 'General')})</div>
        </td>
        <td style="padding: 10px; vertical-align: top; width: 130px; font-weight: 700; color: #166534;">
          Option ${q.answer}
          ${correctOptText ? `<div style="font-size: 11px; font-weight: 500; color: #15803d; margin-top: 2px;">"${escapeHtml(correctOptText)}"</div>` : ''}
        </td>
        <td style="padding: 10px; vertical-align: top; color: #1e293b; line-height: 1.5;">
          ${escapeHtml(explanationText)}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
      * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: geometricPrecision; }
    </style>
    <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #1e3a8a; text-transform: uppercase;">
        GRADEUP STUDY - MOCK TEST ANSWER KEY & EXPLANATIONS
      </h1>
      <h2 style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; font-style: italic; color: #475569;">
        ${escapeHtml(testNameOverride || 'Official Answer Key & Detailed Solutions')}
      </h2>
    </div>

    <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #cbd5e1;">
      <thead>
        <tr style="background: #1e3a8a; color: #ffffff; font-weight: 700; font-size: 12px; text-align: left;">
          <th style="padding: 10px; text-align: center;">Q.No</th>
          <th style="padding: 10px;">Subject / Chapter</th>
          <th style="padding: 10px;">Correct Answer</th>
          <th style="padding: 10px;">Full Explanation & Solution</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  document.body.appendChild(container);
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const scrollHeight = Math.max(container.scrollHeight, container.offsetHeight);

    const canvas = await safeHtml2Canvas(container, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      height: scrollHeight,
      windowHeight: scrollHeight,
      scrollY: 0,
      logging: false
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    const pageCanvas = document.createElement('canvas');
    const ctx = pageCanvas.getContext('2d');
    const pxPageHeight = Math.floor((canvas.width * pageHeight) / imgWidth);

    while (heightLeft > 0) {
      pageCanvas.width = canvas.width;
      const currentChunkHeight = Math.min(pxPageHeight, canvas.height - position);
      pageCanvas.height = currentChunkHeight;

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, currentChunkHeight);
        ctx.drawImage(
          canvas,
          0,
          position,
          canvas.width,
          currentChunkHeight,
          0,
          0,
          canvas.width,
          currentChunkHeight
        );
      }

      const chunkImgData = pageCanvas.toDataURL('image/png');
      const chunkMmHeight = (currentChunkHeight * imgWidth) / canvas.width;

      if (position > 0) {
        pdf.addPage();
      }

      pdf.addImage(chunkImgData, 'PNG', 0, 0, imgWidth, chunkMmHeight, undefined, 'FAST');

      heightLeft -= pageHeight;
      position += pxPageHeight;
    }

    const fileName = `${(testNameOverride || 'Gradeup_Answer_Key').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('Answer Key PDF Generation Error:', err);
    alert('Failed to render Answer Key PDF: ' + err.message);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

export function printNativeAnswerKey(
  questions: Question[],
  testNameOverride?: string
) {
  if (questions.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocker prevented opening the print window. Please allow pop-ups for this app.');
    return;
  }

  const rowsHtml = questions.map((q, idx) => {
    const rawOptText =
      q.answer === 'A' ? q.optionA :
      q.answer === 'B' ? q.optionB :
      q.answer === 'C' ? q.optionC :
      q.answer === 'D' ? q.optionD : '';

    const correctOptText = formatMathSymbols(rawOptText || '');

    const explanationText = q.explanation && q.explanation.trim() !== ''
      ? formatMathSymbols(q.explanation.trim())
      : `Correct answer is Option ${q.answer}.${correctOptText ? ` (${correctOptText})` : ''}`;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
        <td style="padding: 10px; font-weight: 700; color: #1e293b; text-align: center; vertical-align: top; width: 50px;">
          Q.${idx + 1}
        </td>
        <td style="padding: 10px; vertical-align: top; width: 140px; color: #334155;">
          <div style="font-weight: 600; color: #0f172a;">${escapeHtml(q.subject || 'General')}</div>
          <div style="font-size: 11px; color: #64748b;">(${escapeHtml(q.chapter || 'General')})</div>
        </td>
        <td style="padding: 10px; vertical-align: top; width: 140px; font-weight: 700; color: #166534;">
          Option ${q.answer}
          ${correctOptText ? `<div style="font-size: 11px; font-weight: 500; color: #15803d; margin-top: 2px;">"${escapeHtml(correctOptText)}"</div>` : ''}
        </td>
        <td style="padding: 10px; vertical-align: top; color: #1e293b; line-height: 1.5;">
          ${escapeHtml(explanationText)}
        </td>
      </tr>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(testNameOverride || 'Gradeup_Mock_Test')}_Answer_Key</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
        @page {
          size: A4;
          margin: 15mm;
        }
        body {
          font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #0f172a;
          background: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: #ffffff;
          border: 1px solid #cbd5e1;
        }
        th, td {
          border: 1px solid #cbd5e1;
        }
        tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        @media print {
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#0f172a; color:#fff; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:999; font-family:sans-serif;">
        <span style="font-weight:bold; font-size:14px;">🔑 Print / Save as PDF Answer Key (${questions.length} Items)</span>
        <div>
          <button onclick="window.print()" style="background:#9333ea; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-right:8px;">
            🖨️ Print / Save as PDF
          </button>
          <button onclick="window.close()" style="background:#334155; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:13px;">
            ✕ Close
          </button>
        </div>
      </div>

      <div style="padding: 20px; max-width: 850px; margin: 0 auto; position: relative;">
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #1e3a8a; text-transform: uppercase;">
            GRADEUP STUDY - MOCK TEST ANSWER KEY & EXPLANATIONS
          </h1>
          <h2 style="margin: 4px 0 0 0; font-size: 14px; font-weight: 600; font-style: italic; color: #475569;">
            ${escapeHtml(testNameOverride || 'Official Answer Key & Detailed Solutions')}
          </h2>
        </div>

        <table>
          <thead>
            <tr style="background: #1e3a8a; color: #ffffff; font-weight: 700; font-size: 12px; text-align: left;">
              <th style="padding: 10px; text-align: center; width: 50px;">Q.No</th>
              <th style="padding: 10px; width: 140px;">Subject / Chapter</th>
              <th style="padding: 10px; width: 140px;">Correct Answer</th>
              <th style="padding: 10px;">Full Explanation & Solution</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <script>
        setTimeout(() => { window.print(); }, 800);
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

export function printNativeTestPaper(
  questions: Question[],
  template: Template,
  testNameOverride?: string,
  totalMarksOverride?: number,
  durationOverride?: number
) {
  if (questions.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocker prevented opening the print window. Please allow pop-ups for this app.');
    return;
  }

  const h = template.header;
  const qStyle = template.qStyle;

  let logoHtml = '';
  if (template.logoDataUrl) {
    const logoW = h.logoSize === 'small' ? '50px' : h.logoSize === 'large' ? '90px' : '70px';
    logoHtml = `<img src="${template.logoDataUrl}" style="width:${logoW}; height:auto; margin-bottom:8px;" />`;
  }

  const setCodeHtml = h.setCode ? `
    <div style="position:absolute; top:0; right:0; border:1.5px solid #0f172a; padding:3px 8px; font-size:11px; font-weight:bold; border-radius:4px;">
      SET ${escapeHtml(h.setCode.toUpperCase())}
    </div>
  ` : '';

  const questionsHtml = questions.map((q, idx) => {
    const qNum = idx + 1;
    let numPrefix = `${qNum}.`;
    if (qStyle.numberingStyle === 'Q1.') numPrefix = `Q.${qNum}`;
    else if (qStyle.numberingStyle === '[1]') numPrefix = `[${qNum}]`;

    const optLabel = (letter: string) => {
      if (qStyle.optionStyle === '(A)') return `(${letter})`;
      return `${letter}.`;
    };

    const optA = `${optLabel('A')} ${escapeHtml(formatMathSymbols(q.optionA || ''))}`;
    const optB = `${optLabel('B')} ${escapeHtml(formatMathSymbols(q.optionB || ''))}`;
    const optC = `${optLabel('C')} ${escapeHtml(formatMathSymbols(q.optionC || ''))}`;
    const optD = `${optLabel('D')} ${escapeHtml(formatMathSymbols(q.optionD || ''))}`;

    const isShortOpts = optA.length < 35 && optB.length < 35 && optC.length < 35 && optD.length < 35;

    return `
      <div style="margin-bottom: 16px; page-break-inside: avoid; break-inside: avoid;">
        <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 4px;">
          <span style="color: #2563eb; margin-right: 4px;">${numPrefix}</span>
          ${escapeHtml(formatMathSymbols(q.question || ''))}
        </div>
        ${shouldDisplayTranslation(q.question, q.translation) ? `
          <div style="font-size: 14px; color: #334155; font-style: italic; font-weight: 500; margin-bottom: 6px; padding-left: 18px;">
            ${escapeHtml(formatMathSymbols(q.translation!))}
          </div>
        ` : ''}
        ${isShortOpts ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; padding-left: 18px; font-size: 13px; color: #1e293b;">
            <div>${optA}</div>
            <div>${optB}</div>
            <div>${optC}</div>
            <div>${optD}</div>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 4px; padding-left: 18px; font-size: 13px; color: #1e293b;">
            <div>${optA}</div>
            <div>${optB}</div>
            <div>${optC}</div>
            <div>${optD}</div>
          </div>
        `}
      </div>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(testNameOverride || h.testName)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
        @page {
          size: A4;
          margin: 15mm;
        }
        body {
          font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #0f172a;
          background: #ffffff;
        }
        @media print {
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#0f172a; color:#fff; padding:12px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:999; font-family:sans-serif;">
        <span style="font-weight:bold; font-size:14px;">🖨️ Print / Save as PDF Preview (${questions.length} MCQs)</span>
        <div>
          <button onclick="window.print()" style="background:#2563eb; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:13px; margin-right:8px;">
            🖨️ Print / Save as PDF
          </button>
          <button onclick="window.close()" style="background:#334155; color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-size:13px;">
            ✕ Close
          </button>
        </div>
      </div>

      <div style="padding: 20px; max-width: 800px; margin: 0 auto; position: relative;">
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; position: relative;">
          ${setCodeHtml}
          ${logoHtml}
          <h1 style="margin:0; font-size:22px; font-weight:800;">${escapeHtml(h.instituteName)}</h1>
          <h2 style="margin:4px 0; font-size:16px; font-weight:700; color:#2563eb;">${escapeHtml(h.examName)}</h2>
          <h3 style="margin:2px 0; font-size:14px; font-style:italic; color:#475569;">${escapeHtml(testNameOverride || h.testName)}</h3>
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-top:8px; padding-top:6px; border-top:1px solid #e2e8f0;">
            <div>Time Allowed: ${durationOverride || 60} Mins</div>
            <div>Max Marks: ${totalMarksOverride || questions.length * 2}</div>
            <div>${h.showRollNo ? 'Roll No: ____________' : ''} ${h.showDate ? `Date: ${new Date().toLocaleDateString()}` : ''}</div>
          </div>
        </div>

        ${h.instructions ? `
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px; margin-bottom:20px; font-size:12px;">
            <strong>General Instructions:</strong><br/>
            ${escapeHtml(h.instructions).replace(/\n/g, '<br/>')}
          </div>
        ` : ''}

        ${questionsHtml}
      </div>

      <script>
        setTimeout(() => { window.print(); }, 800);
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

export function exportDocxTestPaper(
  questions: Question[],
  template: Template,
  testNameOverride?: string,
  totalMarksOverride?: number,
  durationOverride?: number
) {
  const h = template.header;
  const qStyle = template.qStyle;

  let htmlContent = `
  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(testNameOverride || h.testName)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
      body { font-family: 'Noto Sans Devanagari', '${h.font}', Arial, sans-serif; font-size: ${h.fontSize}pt; margin: 20px; line-height: 1.4; color: #0f172a; }
      .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
      .inst-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 10px; margin-bottom: 20px; font-size: 9pt; }
      .q-card { margin-bottom: 15px; page-break-inside: avoid; }
      .q-stem { font-weight: bold; margin-bottom: 4px; }
      .opt-grid { display: table; width: 100%; margin-top: 4px; }
      .opt-row { display: table-row; }
      .opt-cell { display: table-cell; width: 50%; padding: 2px 5px; }
    </style>
  </head>
  <body>
    <div class="header-box">
      <h2 style="margin:0;">${escapeHtml(h.instituteName)}</h2>
      <h3 style="margin:4px 0; color:#2563eb;">${escapeHtml(h.examName)}</h3>
      <p style="margin:2px 0; font-style:italic;">${escapeHtml(testNameOverride || h.testName)}</p>
      <p style="margin-top:8px; font-size:9pt;">
        <strong>Time Allowed:</strong> ${durationOverride || 60} Mins &nbsp;|&nbsp;
        <strong>Max Marks:</strong> ${totalMarksOverride || questions.length * 2} &nbsp;|&nbsp;
        <strong>Roll No:</strong> ____________
      </p>
    </div>

    ${h.instructions ? `
    <div class="inst-box">
      <strong>General Instructions:</strong><br>
      ${escapeHtml(h.instructions).replace(/\n/g, '<br>')}
    </div>` : ''}

    <div class="questions-list">
  `;

  questions.forEach((q, idx) => {
    const qNum = idx + 1;
    let numPrefix = `${qNum}.`;
    if (qStyle.numberingStyle === 'Q1.') numPrefix = `Q.${qNum}`;
    else if (qStyle.numberingStyle === '[1]') numPrefix = `[${qNum}]`;

    const optLabel = (letter: string) => {
      if (qStyle.optionStyle === '(A)') return `(${letter})`;
      return `${letter}.`;
    };

    htmlContent += `
      <div class="q-card">
        <div class="q-stem">${numPrefix} ${escapeHtml(formatMathSymbols(q.question))}</div>
        ${shouldDisplayTranslation(q.question, q.translation) ? `<div style="font-size:9pt; color:#475569; font-style:italic;">(${escapeHtml(formatMathSymbols(q.translation!))})</div>` : ''}
        <div class="opt-grid">
          <div class="opt-row">
            <div class="opt-cell">${optLabel('A')} ${escapeHtml(formatMathSymbols(q.optionA))}</div>
            <div class="opt-cell">${optLabel('B')} ${escapeHtml(formatMathSymbols(q.optionB))}</div>
          </div>
          <div class="opt-row">
            <div class="opt-cell">${optLabel('C')} ${escapeHtml(formatMathSymbols(q.optionC))}</div>
            <div class="opt-cell">${optLabel('D')} ${escapeHtml(formatMathSymbols(q.optionD))}</div>
          </div>
        </div>
      </div>
    `;
  });

  htmlContent += `
    </div>
  </body>
  </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], {
    type: 'application/msword'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(testNameOverride || 'Gradeup_Mock_Test').replace(/[^a-zA-Z0-9]/g, '_')}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportDocxAnswerKey(
  questions: Question[],
  template?: Template,
  testNameOverride?: string
) {
  const h = template?.header || {
    instituteName: 'Gradeup Study Library & Test Institute',
    examName: 'Competitive Examination Series',
    testName: testNameOverride || 'Model Mock Test Paper Answer Key & Solutions'
  };

  let htmlContent = `
  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(testNameOverride || h.testName)} - Answer Key & Solutions</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap');
      body { font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif; font-size: 10pt; margin: 20px; line-height: 1.5; color: #0f172a; }
      .header-box { text-align: center; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; margin-bottom: 20px; }
      .q-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      .q-table th { background-color: #f3e8ff; color: #581c87; border: 1px solid #d8b4fe; padding: 8px; text-align: left; font-size: 10pt; }
      .q-table td { border: 1px solid #e9d5ff; padding: 10px; vertical-align: top; font-size: 9.5pt; }
      .ans-badge { color: #15803d; font-weight: bold; }
      .explanation-text { background-color: #faf5ff; border-left: 3px solid #9333ea; padding: 6px 10px; margin-top: 4px; font-size: 9pt; color: #3b0764; }
    </style>
  </head>
  <body>
    <div class="header-box">
      <h2 style="margin:0; color:#581c87;">${escapeHtml(h.instituteName)}</h2>
      <h3 style="margin:4px 0; color:#7c3aed;">${escapeHtml(h.examName)}</h3>
      <h4 style="margin:2px 0; color:#4c1d95;">${escapeHtml(testNameOverride || h.testName)} - Official Answer Key & Explanations</h4>
      <p style="margin-top:6px; font-size:9pt; color:#6b21a8;">
        <strong>Total Questions:</strong> ${questions.length} MCQs &nbsp;|&nbsp;
        <strong>Generated Date:</strong> ${new Date().toLocaleDateString()}
      </p>
    </div>

    <table class="q-table">
      <thead>
        <tr>
          <th style="width: 45px; text-align: center;">Q.No</th>
          <th style="width: 130px;">Subject & Chapter</th>
          <th style="width: 140px;">Correct Answer</th>
          <th>Question & Detailed Explanation</th>
        </tr>
      </thead>
      <tbody>
  `;

  questions.forEach((q, idx) => {
    const rawOptText =
      q.answer === 'A' ? q.optionA :
      q.answer === 'B' ? q.optionB :
      q.answer === 'C' ? q.optionC :
      q.answer === 'D' ? q.optionD : '';

    const correctOptText = formatMathSymbols(rawOptText || '');

    const explanationText = q.explanation && q.explanation.trim() !== ''
      ? formatMathSymbols(q.explanation.trim())
      : `Correct option is Option ${q.answer}.${correctOptText ? ` (${correctOptText})` : ''}`;

    htmlContent += `
        <tr>
          <td style="text-align: center; font-weight: bold; color: #581c87;">Q.${idx + 1}</td>
          <td>
            <strong>${escapeHtml(q.subject || 'General')}</strong><br>
            <span style="color:#6b21a8; font-size:8.5pt;">(${escapeHtml(q.chapter || 'General')})</span>
          </td>
          <td class="ans-badge">
            Option ${q.answer}<br>
            ${correctOptText ? `<span style="font-size:8.5pt; font-weight:normal; color:#166534;">"${escapeHtml(correctOptText)}"</span>` : ''}
          </td>
          <td>
            <div style="font-weight:600; margin-bottom:4px; color:#1e1b4b;">${escapeHtml(formatMathSymbols(q.question))}</div>
            ${shouldDisplayTranslation(q.question, q.translation) ? `<div style="font-size:8.5pt; color:#475569; font-style:italic; margin-bottom:4px;">(${escapeHtml(formatMathSymbols(q.translation!))})</div>` : ''}
            <div class="explanation-text">
              <strong>Explanation:</strong> ${escapeHtml(explanationText)}
            </div>
          </td>
        </tr>
    `;
  });

  htmlContent += `
      </tbody>
    </table>
  </body>
  </html>
  `;

  const blob = new Blob(['\ufeff', htmlContent], {
    type: 'application/msword'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(testNameOverride || 'Gradeup_Answer_Key').replace(/[^a-zA-Z0-9]/g, '_')}_Answer_Key.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface BookletCustomConfig {
  testName: string;
  instituteName?: string;
  duration?: number;
  totalMarks?: number;
  instructions?: string;
  watermarkText?: string;
  watermarkOpacity?: number; // e.g. 0.08
  logoDataUrl?: string;
  showRollNo?: boolean;
  fontSize?: 'compact' | 'ultra-compact' | 'normal';
  columnsCount?: 1 | 2;
  showBoxBorder?: boolean;
  page1Capacity?: number;
  otherPageCapacity?: number;
  autoBalance?: boolean;
  footerText?: string;
  customPages?: PaperPageLayout[];
}

export interface PaperPageQuestion {
  question: Question;
  originalIndex: number;
  estimatedHeight: number;
  splitType?: 'full' | 'question_only' | 'options_only' | 'options_ab' | 'options_cd';
}

export interface PaperPageLayout {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  col1: PaperPageQuestion[];
  col2: PaperPageQuestion[];
  col1Height: number;
  col2Height: number;
  availableHeight?: number;
  utilization?: number;
  balanceScore?: number;
  unusedSpace?: number;
  hasOverflow?: boolean;
  warnings?: string[];
}

/**
 * Accurately estimates rendered height (in pixels) for a question in 2-column A4 format.
 * Accounts for question text length, translation presence, option lengths (2x2 vs 4 stacked), density, and split type.
 */
export function estimateQuestionRenderHeight(
  q: Question,
  density: 'compact' | 'ultra-compact' | 'normal' = 'compact',
  splitType?: 'full' | 'question_only' | 'options_only' | 'options_ab' | 'options_cd'
): number {
  const isUltra = density === 'ultra-compact';
  const isNormal = density === 'normal';

  const fontLineHeight = isUltra ? 14 : isNormal ? 17 : 15.5;
  const optLineHeight = isUltra ? 13 : isNormal ? 16 : 14.5;
  const qMargin = isUltra ? 6 : isNormal ? 10 : 8;

  const calcLines = (text: string, charsPerLine: number) => {
    if (!text) return 0;
    const parts = text.split(/\r?\n/);
    return parts.reduce((sum, p) => {
      const trimmed = p.trim();
      if (!trimmed) return sum + 0.5;
      return sum + Math.max(1, Math.ceil(trimmed.length / charsPerLine));
    }, 0);
  };

  // Question statement: Bold font in 360px column fits ~38 chars per line
  const qText = `Q. ${q.question || ''}`;
  const qLines = calcLines(qText, 38);
  let qH = qLines * fontLineHeight + 2;

  // Hindi Translation
  if (shouldDisplayTranslation(q.question, q.translation)) {
    const tText = q.translation || '';
    const tLines = calcLines(tText, 34);
    qH += tLines * (fontLineHeight * 0.95) + 3;
  }

  // Options layout (2x2 grid vs 4 stacked lines)
  const optA = `(A) ${q.optionA || ''}`;
  const optB = `(B) ${q.optionB || ''}`;
  const optC = `(C) ${q.optionC || ''}`;
  const optD = `(D) ${q.optionD || ''}`;
  const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24 &&
    !optA.includes('\n') && !optB.includes('\n') && !optC.includes('\n') && !optD.includes('\n');

  let optH = 0;
  if (isShort) {
    // 2 rows of options in 2x2 grid
    optH = 2 * optLineHeight + 4;
  } else {
    // 4 rows of stacked options
    const optALines = calcLines(optA, 38);
    const optBLines = calcLines(optB, 38);
    const optCLines = calcLines(optC, 38);
    const optDLines = calcLines(optD, 38);
    optH = (optALines + optBLines + optCLines + optDLines) * optLineHeight + 6;
  }

  if (splitType === 'question_only') {
    return Math.ceil(qH + qMargin / 2);
  }
  if (splitType === 'options_only') {
    return Math.ceil(optH + 16 + qMargin / 2);
  }
  if (splitType === 'options_ab') {
    return Math.ceil(qH + optH / 2 + qMargin / 2);
  }
  if (splitType === 'options_cd') {
    return Math.ceil(optH / 2 + 16 + qMargin / 2);
  }

  return Math.ceil(qH + optH + qMargin);
}

// -------------------------------------------------------------
// 0. EXPORT TO MICROSOFT WORD (.DOC / .DOCX COMPATIBLE)
// -------------------------------------------------------------

/**
 * Exports a formatted 2-Column Mock Test Question Paper to Microsoft Word (.doc / .docx)
 * Fully respects manual custom pagination (customPages) and reproduces the exact
 * 2-column layout, page-by-page, with header, instructions, boxed columns, and footers.
 */
export function exportWordBookletPaper(
  questions: Question[],
  config: BookletCustomConfig,
  includeAnswerKey: boolean = false
) {
  if (questions.length === 0) {
    alert('No questions loaded to export.');
    return;
  }

  const testTitle = config.testName || 'HP Police Constable Mock Test';
  const duration = config.duration || 60;
  const marks = config.totalMarks || (questions.length * (questions.length === 50 ? 1 : 2));
  const instructions = config.instructions ||
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator.`;
  const footerText = config.footerText || 'Gradeup Study Official Test Series';

  const fontPt = config.fontSize === 'ultra-compact' ? '8.5pt' : config.fontSize === 'normal' ? '10.5pt' : '9.5pt';
  const optFontPt = config.fontSize === 'ultra-compact' ? '8pt' : config.fontSize === 'normal' ? '9.5pt' : '8.8pt';
  const qSpacing = config.fontSize === 'ultra-compact' ? '3pt' : config.fontSize === 'normal' ? '6pt' : '4pt';

  const pages = config.customPages && config.customPages.length > 0
    ? config.customPages
    : paginateQuestionsFor2ColPaper(
        questions,
        config.fontSize || 'compact',
        config.page1Capacity,
        config.otherPageCapacity,
        config.autoBalance !== false
      );

  const renderWordQuestionsList = (items: PaperPageQuestion[]) => {
    return items.map(item => {
      const qNum = item.originalIndex + 1;
      const q = item.question;
      const splitType = item.splitType || 'full';
      const optA = `(A) ${formatMathSymbols(q.optionA || '')}`;
      const optB = `(B) ${formatMathSymbols(q.optionB || '')}`;
      const optC = `(C) ${formatMathSymbols(q.optionC || '')}`;
      const optD = `(D) ${formatMathSymbols(q.optionD || '')}`;
      const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

      const qHeaderHtml = `
        <div style="font-weight: bold; color: #000000; margin-bottom: 1pt;">
          <span>Q${qNum}. </span>${escapeHtml(formatMathSymbols(q.question || ''))}
        </div>
        ${shouldDisplayTranslation(q.question, q.translation) ? `
          <div style="color: #1e293b; font-size: ${fontPt}; margin-bottom: 2pt;">
            ${escapeHtml(formatMathSymbols(q.translation!))}
          </div>
        ` : ''}
      `;

      let optContent = '';
      if (splitType === 'question_only') {
        optContent = '';
      } else if (splitType === 'options_only') {
        optContent = `
          <div style="font-weight: bold; font-size: ${optFontPt}; margin-bottom: 1pt;">
            <span>Q${qNum}. (Options):</span>
          </div>
          ${isShort ? `
            <table style="width: 100%; border-collapse: collapse; font-size: ${optFontPt}; margin-top: 1pt; border: none;">
              <tr>
                <td style="width: 50%; padding: 1pt 4pt 1pt 0; vertical-align: top; border: none;">${escapeHtml(optA)}</td>
                <td style="width: 50%; padding: 1pt 0 1pt 4pt; vertical-align: top; border: none;">${escapeHtml(optB)}</td>
              </tr>
              <tr>
                <td style="width: 50%; padding: 1pt 4pt 1pt 0; vertical-align: top; border: none;">${escapeHtml(optC)}</td>
                <td style="width: 50%; padding: 1pt 0 1pt 4pt; vertical-align: top; border: none;">${escapeHtml(optD)}</td>
              </tr>
            </table>
          ` : `
            <div style="font-size: ${optFontPt}; margin-top: 1pt;">
              <div style="padding: 1pt 0;">${escapeHtml(optA)}</div>
              <div style="padding: 1pt 0;">${escapeHtml(optB)}</div>
              <div style="padding: 1pt 0;">${escapeHtml(optC)}</div>
              <div style="padding: 1pt 0;">${escapeHtml(optD)}</div>
            </div>
          `}
        `;
      } else if (splitType === 'options_ab') {
        optContent = `
          <div style="font-size: ${optFontPt}; margin-top: 1pt;">
            <div style="padding: 1pt 0;">${escapeHtml(optA)}</div>
            <div style="padding: 1pt 0;">${escapeHtml(optB)}</div>
          </div>
        `;
      } else if (splitType === 'options_cd') {
        optContent = `
          <div style="font-weight: bold; font-size: ${optFontPt}; margin-bottom: 1pt;">
            <span>Q${qNum}. (Contd):</span>
          </div>
          <div style="font-size: ${optFontPt}; margin-top: 1pt;">
            <div style="padding: 1pt 0;">${escapeHtml(optC)}</div>
            <div style="padding: 1pt 0;">${escapeHtml(optD)}</div>
          </div>
        `;
      } else {
        optContent = isShort ? `
          <table style="width: 100%; border-collapse: collapse; font-size: ${optFontPt}; margin-top: 1pt; border: none;">
            <tr>
              <td style="width: 50%; padding: 1pt 4pt 1pt 0; vertical-align: top; border: none;">${escapeHtml(optA)}</td>
              <td style="width: 50%; padding: 1pt 0 1pt 4pt; vertical-align: top; border: none;">${escapeHtml(optB)}</td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 1pt 4pt 1pt 0; vertical-align: top; border: none;">${escapeHtml(optC)}</td>
              <td style="width: 50%; padding: 1pt 0 1pt 4pt; vertical-align: top; border: none;">${escapeHtml(optD)}</td>
            </tr>
          </table>
        ` : `
          <div style="font-size: ${optFontPt}; margin-top: 1pt;">
            <div style="padding: 1pt 0;">${escapeHtml(optA)}</div>
            <div style="padding: 1pt 0;">${escapeHtml(optB)}</div>
            <div style="padding: 1pt 0;">${escapeHtml(optC)}</div>
            <div style="padding: 1pt 0;">${escapeHtml(optD)}</div>
          </div>
        `;
      }

      return `
        <div style="margin-bottom: ${qSpacing}; font-size: ${fontPt}; line-height: 1.32; mso-line-height-rule: exactly; page-break-inside: avoid;">
          ${(splitType !== 'options_only' && splitType !== 'options_cd') ? qHeaderHtml : ''}
          ${optContent}
        </div>
      `;
    }).join('');
  };

  const totalPagesCount = includeAnswerKey ? pages.length + 1 : pages.length;

  const pagesHtml = pages.map((page, idx) => {
    let headerHtml = '';
    if (page.isFirstPage) {
      headerHtml = `
        <div style="text-align: center; margin-bottom: 4pt;">
          <h1 style="margin: 0; font-size: 14pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(testTitle)}</h1>
          <div style="font-size: 8.5pt; font-weight: bold; margin-top: 2pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #000000;">
            <span>Time Allowed: ${duration} Mins</span> &nbsp;|&nbsp;
            <span>Max Marks: ${marks}</span>
            ${config.showRollNo !== false ? ` &nbsp;|&nbsp; <span>Roll No: ____________</span>` : ''}
          </div>
        </div>
        ${instructions ? `
          <div style="border: 1pt solid #64748b; padding: 3pt 6pt; margin-bottom: 4pt; font-size: 7.5pt; line-height: 1.25; background: #ffffff;">
            <strong>General Instructions:</strong><br/>
            ${escapeHtml(instructions).replace(/\n/g, '<br/>')}
          </div>
        ` : ''}
      `;
    } else {
      headerHtml = `
        <div style="margin-bottom: 4pt; padding-bottom: 2pt; border-bottom: 1.5pt solid #000000; font-size: 8.5pt; font-weight: bold;">
          <table style="width: 100%; border-collapse: collapse; border: none;">
            <tr>
              <td style="text-align: left; border: none; font-weight: bold;">${escapeHtml(testTitle)}</td>
              <td style="text-align: right; border: none; font-weight: bold; font-size: 7.5pt;">PAGE ${page.pageNumber} OF ${totalPagesCount}</td>
            </tr>
          </table>
        </div>
      `;
    }

    const isLastPaperPage = idx === pages.length - 1;
    const needPageBreak = !isLastPaperPage || includeAnswerKey;

    return `
      <div class="word-page" style="margin-bottom: 6pt;">
        ${headerHtml}
        <table style="width: 100%; border-collapse: collapse; border: 1.5pt solid #000000; margin-bottom: 3pt;">
          <tr>
            <td style="width: 50%; vertical-align: top; padding: 4pt 6pt; border-right: 1.5pt solid #000000; border-top: none; border-bottom: none; border-left: none;">
              ${renderWordQuestionsList(page.col1)}
            </td>
            <td style="width: 50%; vertical-align: top; padding: 4pt 6pt; border: none;">
              ${renderWordQuestionsList(page.col2)}
            </td>
          </tr>
        </table>
        <div style="border-top: 1pt solid #000000; padding-top: 2pt; font-size: 7.5pt; font-weight: bold;">
          <table style="width: 100%; border-collapse: collapse; border: none;">
            <tr>
              <td style="text-align: left; border: none;">${escapeHtml(footerText)}</td>
              <td style="text-align: right; border: none;">Page ${page.pageNumber} of ${totalPagesCount}</td>
            </tr>
          </table>
        </div>
      </div>
      ${needPageBreak ? '<br clear="all" style="page-break-before: always; mso-break-type: page-break;" />' : ''}
    `;
  }).join('');

  let answerKeyHtml = '';
  if (includeAnswerKey) {
    const cols = questions.length > 60 ? 4 : questions.length > 30 ? 2 : 1;
    const itemsPerCol = Math.ceil(questions.length / cols);
    const keyCols: string[] = [];

    for (let c = 0; c < cols; c++) {
      const slice = questions.slice(c * itemsPerCol, (c + 1) * itemsPerCol);
      const rows = slice.map((q, idx) => {
        const qNum = c * itemsPerCol + idx + 1;
        return `
          <tr style="border-bottom: 0.5pt solid #e2e8f0;">
            <td style="padding: 1.5pt 3pt; font-weight: bold; width: 30pt; text-align: right; border: none;">${qNum}.</td>
            <td style="padding: 1.5pt 3pt; font-weight: bold; color: #15803d; border: none;">Option ${q.answer || 'A'}</td>
          </tr>
        `;
      }).join('');

      keyCols.push(`
        <td style="vertical-align: top; padding: 0 8pt; width: ${100 / cols}%; border: none;">
          <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; border: none;">
            ${rows}
          </table>
        </td>
      `);
    }

    answerKeyHtml = `
      <div class="word-page" style="margin-top: 6pt;">
        <div style="text-align: center; border-bottom: 1.5pt solid #000000; padding-bottom: 4pt; margin-bottom: 8pt;">
          <h2 style="margin: 0; font-size: 13pt; font-weight: 800; text-transform: uppercase;">${escapeHtml(testTitle)} - OFFICIAL ANSWER KEY</h2>
          <p style="margin: 2pt 0 0 0; font-size: 8pt; color: #475569;">Total Questions: ${questions.length} MCQs | Max Marks: ${marks}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 6pt; border: 1pt solid #cbd5e1; padding: 6pt;">
          <tr>
            ${keyCols.join('')}
          </tr>
        </table>
        <div style="border-top: 1pt solid #000000; padding-top: 2pt; margin-top: 10pt; font-size: 7.5pt; font-weight: bold;">
          <table style="width: 100%; border-collapse: collapse; border: none;">
            <tr>
              <td style="text-align: left; border: none;">${escapeHtml(footerText)}</td>
              <td style="text-align: right; border: none;">Page ${totalPagesCount} of ${totalPagesCount} (Answer Key)</td>
            </tr>
          </table>
        </div>
      </div>
    `;
  }

  const htmlDoc = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(testTitle)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
        @page Section1 {
          size: 210mm 297mm;
          margin: 12mm 14mm 12mm 14mm;
          mso-header-margin: 8mm;
          mso-footer-margin: 8mm;
          mso-paper-source: 0;
        }
        div.Section1 {
          page: Section1;
        }
        body {
          font-family: 'Noto Sans Devanagari', 'Calibri', 'Segoe UI', Arial, sans-serif;
          font-size: ${fontPt};
          color: #000000;
          line-height: 1.32;
          margin: 0;
          padding: 0;
        }
      </style>
    </head>
    <body>
      <div class="Section1">
        ${pagesHtml}
        ${answerKeyHtml}
      </div>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', htmlDoc], {
    type: 'application/msword;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${testTitle.replace(/[^a-zA-Z0-9]/g, '_')}${includeAnswerKey ? '_with_Key' : ''}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Calculates optimal capacity recommendations for A4 paper based on actual question content height.
 */
export function getRecommendedPageCapacities(
  totalQuestions: number,
  density: 'compact' | 'ultra-compact' | 'normal' = 'compact'
): { p1Capacity: number; otherCapacity: number; estimatedPages: number } {
  // Page 1 has Logo + Exam Header + General Instructions Box (~180-210px vertical space)
  // Subsequent pages (Page 2, 3, 4...) have ONLY 1-line top header (~28px space)
  const maxP1 = density === 'ultra-compact' ? 22 : density === 'normal' ? 14 : 18;
  const maxOther = density === 'ultra-compact' ? 32 : density === 'normal' ? 22 : 28;

  if (totalQuestions <= 0) {
    return { p1Capacity: maxP1, otherCapacity: maxOther, estimatedPages: 0 };
  }

  if (totalQuestions <= maxP1) {
    return { p1Capacity: totalQuestions, otherCapacity: maxOther, estimatedPages: 1 };
  }

  // Calculate target page count
  // E.g., for 100 questions in compact: (100 - 18) / 28 = 82 / 28 = 2.92 -> 3 other pages -> 4 pages total!
  const remainingAfterP1 = totalQuestions - maxP1;
  const numOtherPages = Math.ceil(remainingAfterP1 / maxOther);
  const totalPages = 1 + numOtherPages;

  // Calculate evenly balanced capacities
  let targetP1 = Math.min(maxP1, Math.floor((totalQuestions / totalPages) * 0.75));
  if (targetP1 % 2 !== 0 && targetP1 + 1 <= maxP1) targetP1 += 1;
  if (targetP1 < 10 && totalQuestions >= 20) targetP1 = Math.min(maxP1, 14);

  const remaining = totalQuestions - targetP1;
  let targetOther = Math.ceil(remaining / numOtherPages);
  if (targetOther > maxOther) targetOther = maxOther;
  if (targetOther % 2 !== 0 && targetOther + 1 <= maxOther) targetOther += 1;

  return { p1Capacity: targetP1, otherCapacity: targetOther, estimatedPages: totalPages };
}

/**
 * Intelligent Column Height Balancer:
 * Splits a list of questions into Column 1 and Column 2 such that:
 * 1. Question numbers remain strictly sequential (Q1..Qk in Col 1, Qk+1..Qn in Col 2).
 * 2. The height difference |col1Height - col2Height| is strictly minimized so both columns
 *    finish at the exact same vertical baseline at the bottom of the A4 box!
 */
export function balancePageColumns(items: PaperPageQuestion[]): { col1: PaperPageQuestion[]; col2: PaperPageQuestion[] } {
  if (!items || items.length === 0) return { col1: [], col2: [] };
  if (items.length === 1) return { col1: [items[0]], col2: [] };

  const totalH = items.reduce((sum, it) => sum + it.estimatedHeight, 0);
  const n = items.length;

  let bestK = Math.ceil(n / 2);
  let minDiff = Infinity;

  let runningSum = 0;
  for (let k = 1; k < n; k++) {
    runningSum += items[k - 1].estimatedHeight;
    const col2H = totalH - runningSum;
    const diff = Math.abs(runningSum - col2H);

    if (diff < minDiff) {
      minDiff = diff;
      bestK = k;
    } else if (diff === minDiff) {
      if (Math.abs(k - n / 2) < Math.abs(bestK - n / 2)) {
        bestK = k;
      }
    }
  }

  return {
    col1: items.slice(0, bestK),
    col2: items.slice(bestK)
  };
}

/**
 * Precision Question-to-Page Layout Engine:
 * Height-aware pagination engine that guarantees zero A4 page overflow and eliminates
 * bottom blank spacing by evenly distributing MCQs across balanced target pages.
 */
export function paginateQuestionsFor2ColPaper(
  questions: Question[],
  density: 'compact' | 'ultra-compact' | 'normal' = 'compact',
  page1CapOverride?: number,
  otherCapOverride?: number,
  autoBalance: boolean = true
): PaperPageLayout[] {
  if (!questions || questions.length === 0) return [];

  const itemsWithHeight: PaperPageQuestion[] = questions.map((q, idx) => ({
    question: q,
    originalIndex: idx,
    estimatedHeight: estimateQuestionRenderHeight(q, density)
  }));

  const totalN = questions.length;
  // Maximum safe column height limits (in pixels at 96 DPI):
  // Page 1 available column height = 1123px - (padding 36px + header/instructions 190px + footer 20px) = ~800px
  // Other pages available column height = 1123px - (padding 36px + header 30px + footer 20px) = ~980px
  const MAX_P1_COL_HEIGHT = density === 'ultra-compact' ? 840 : density === 'normal' ? 760 : 800;
  const MAX_OTHER_COL_HEIGHT = density === 'ultra-compact' ? 1010 : density === 'normal' ? 940 : 980;

  const maxP1Count = density === 'ultra-compact' ? 24 : density === 'normal' ? 16 : 20;
  const maxOtherCount = density === 'ultra-compact' ? 32 : density === 'normal' ? 24 : 28;

  const pages: PaperPageLayout[] = [];
  let remainingItems = [...itemsWithHeight];
  let pageNum = 1;

  const hasManualCaps = !!(page1CapOverride && otherCapOverride && page1CapOverride > 0 && otherCapOverride > 0);

  if (hasManualCaps) {
    while (remainingItems.length > 0) {
      const isFirst = pageNum === 1;
      const targetCount = isFirst ? page1CapOverride! : otherCapOverride!;
      const maxColHeight = isFirst ? MAX_P1_COL_HEIGHT : MAX_OTHER_COL_HEIGHT;
      
      const takeCount = Math.min(remainingItems.length, targetCount);
      const pageItems = remainingItems.splice(0, takeCount);
      let { col1, col2 } = balancePageColumns(pageItems);

      // Strict height check: guarantee no column overflows the A4 printable area
      while (pageItems.length > 1) {
        const col1H = col1.reduce((sum, item) => sum + item.estimatedHeight, 0);
        const col2H = col2.reduce((sum, item) => sum + item.estimatedHeight, 0);
        if (col1H <= maxColHeight && col2H <= maxColHeight) {
          break;
        }
        const popped = pageItems.pop()!;
        remainingItems.unshift(popped);
        const balanced = balancePageColumns(pageItems);
        col1 = balanced.col1;
        col2 = balanced.col2;
      }

      pages.push({
        pageNumber: pageNum,
        totalPages: 1,
        isFirstPage: isFirst,
        col1,
        col2,
        col1Height: col1.reduce((sum, item) => sum + item.estimatedHeight, 0),
        col2Height: col2.reduce((sum, item) => sum + item.estimatedHeight, 0)
      });
      pageNum++;
    }
  } else if (autoBalance) {
    // SMART BALANCED PAGINATION (Even distribution without giant bottom empty gaps)
    const rec = getRecommendedPageCapacities(totalN, density);
    const targetPages = Math.max(1, rec.estimatedPages);

    // Compute fair base quota for every page
    const pageQuotas: number[] = [];
    if (targetPages === 1) {
      pageQuotas.push(totalN);
    } else {
      let p1 = Math.min(maxP1Count, rec.p1Capacity);
      if (p1 % 2 !== 0 && p1 + 1 <= maxP1Count) p1 += 1;
      pageQuotas.push(p1);

      const remainingForOthers = totalN - p1;
      const numOther = targetPages - 1;
      const baseOther = Math.floor(remainingForOthers / numOther);
      const extra = remainingForOthers % numOther;

      for (let p = 0; p < numOther; p++) {
        const count = baseOther + (p < extra ? 1 : 0);
        pageQuotas.push(count);
      }
    }

    for (let pIdx = 0; pIdx < pageQuotas.length; pIdx++) {
      if (remainingItems.length === 0) break;
      const isFirst = pIdx === 0;
      const maxColHeight = isFirst ? MAX_P1_COL_HEIGHT : MAX_OTHER_COL_HEIGHT;
      const quota = pageQuotas[pIdx];
      const takeCount = Math.min(remainingItems.length, quota);
      const pageItems = remainingItems.splice(0, takeCount);

      let { col1, col2 } = balancePageColumns(pageItems);

      // Only pop if column actually overflows the maximum safe printable height
      while (pageItems.length > 2) {
        const col1H = col1.reduce((sum, item) => sum + item.estimatedHeight, 0);
        const col2H = col2.reduce((sum, item) => sum + item.estimatedHeight, 0);
        if (col1H <= maxColHeight * 1.06 && col2H <= maxColHeight * 1.06) {
          break;
        }
        const popped = pageItems.pop()!;
        remainingItems.unshift(popped);
        const balanced = balancePageColumns(pageItems);
        col1 = balanced.col1;
        col2 = balanced.col2;
      }

      pages.push({
        pageNumber: pIdx + 1,
        totalPages: targetPages,
        isFirstPage: isFirst,
        col1,
        col2,
        col1Height: col1.reduce((sum, item) => sum + item.estimatedHeight, 0),
        col2Height: col2.reduce((sum, item) => sum + item.estimatedHeight, 0)
      });
    }

    while (remainingItems.length > 0) {
      const maxColHeight = MAX_OTHER_COL_HEIGHT;
      const takeCount = Math.min(remainingItems.length, maxOtherCount);
      const pageItems = remainingItems.splice(0, takeCount);
      let { col1, col2 } = balancePageColumns(pageItems);

      while (pageItems.length > 2) {
        const col1H = col1.reduce((sum, item) => sum + item.estimatedHeight, 0);
        const col2H = col2.reduce((sum, item) => sum + item.estimatedHeight, 0);
        if (col1H <= maxColHeight * 1.06 && col2H <= maxColHeight * 1.06) {
          break;
        }
        const popped = pageItems.pop()!;
        remainingItems.unshift(popped);
        const balanced = balancePageColumns(pageItems);
        col1 = balanced.col1;
        col2 = balanced.col2;
      }

      pages.push({
        pageNumber: pages.length + 1,
        totalPages: pages.length + 1,
        isFirstPage: false,
        col1,
        col2,
        col1Height: col1.reduce((sum, item) => sum + item.estimatedHeight, 0),
        col2Height: col2.reduce((sum, item) => sum + item.estimatedHeight, 0)
      });
    }
  } else {
    // Greedy packing by height limit
    while (remainingItems.length > 0) {
      const isFirst = pageNum === 1;
      const maxColHeight = isFirst ? MAX_P1_COL_HEIGHT : MAX_OTHER_COL_HEIGHT;
      const maxItemsForPage = isFirst ? maxP1Count : maxOtherCount;

      let currentH = 0;
      let count = 0;
      const currentBatch: PaperPageQuestion[] = [];

      for (let i = 0; i < remainingItems.length; i++) {
        if (count >= maxItemsForPage) break;
        const item = remainingItems[i];
        if (currentH + item.estimatedHeight <= maxColHeight * 2 || count === 0) {
          currentH += item.estimatedHeight;
          currentBatch.push(item);
          count++;
        } else {
          break;
        }
      }

      if (currentBatch.length === 0 && remainingItems.length > 0) {
        currentBatch.push(remainingItems[0]);
      }

      const pageItems = remainingItems.splice(0, currentBatch.length);
      let { col1, col2 } = balancePageColumns(pageItems);

      while (pageItems.length > 1) {
        const col1H = col1.reduce((sum, item) => sum + item.estimatedHeight, 0);
        const col2H = col2.reduce((sum, item) => sum + item.estimatedHeight, 0);
        if (col1H <= maxColHeight && col2H <= maxColHeight) {
          break;
        }
        const popped = pageItems.pop()!;
        remainingItems.unshift(popped);
        const balanced = balancePageColumns(pageItems);
        col1 = balanced.col1;
        col2 = balanced.col2;
      }

      pages.push({
        pageNumber: pageNum,
        totalPages: 1,
        isFirstPage: isFirst,
        col1,
        col2,
        col1Height: col1.reduce((sum, item) => sum + item.estimatedHeight, 0),
        col2Height: col2.reduce((sum, item) => sum + item.estimatedHeight, 0)
      });

      pageNum++;
    }
  }

  const finalTotalPages = Math.max(1, pages.length);
  pages.forEach(p => { p.totalPages = finalTotalPages; });
  return pages;
}

// -------------------------------------------------------------
// 0. SHARED 2-COLUMN PAPER RENDERING HELPERS (EXACT PREVIEW MATCH)
// -------------------------------------------------------------
export function render2ColPaperColumnItems(
  items: PaperPageQuestion[],
  density: 'compact' | 'normal' | 'ultra-compact' = 'compact'
): string {
  const fontPt = density === 'ultra-compact' ? '10px' : density === 'normal' ? '12px' : '11px';
  const optFontPt = density === 'ultra-compact' ? '9.5px' : density === 'normal' ? '11px' : '10px';
  const qSpacing = density === 'ultra-compact' ? '3px' : density === 'normal' ? '7px' : '5px';

  return items.map(item => {
    const qNum = item.originalIndex + 1;
    const q = item.question;
    const splitType = item.splitType || 'full';
    const optA = `(A) ${escapeHtml(formatMathSymbols(q.optionA || ''))}`;
    const optB = `(B) ${escapeHtml(formatMathSymbols(q.optionB || ''))}`;
    const optC = `(C) ${escapeHtml(formatMathSymbols(q.optionC || ''))}`;
    const optD = `(D) ${escapeHtml(formatMathSymbols(q.optionD || ''))}`;

    const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

    const showQuestionText = splitType === 'full' || splitType === 'question_only' || splitType === 'options_ab';

    const qHeaderHtml = showQuestionText ? `
      <div style="font-weight: 700; color: #000000; font-size: ${fontPt}; margin-bottom: 2px; line-height: 1.35;">
        <span>Q${qNum}. </span>${escapeHtml(formatMathSymbols(q.question || ''))}
      </div>
      ${shouldDisplayTranslation(q.question, q.translation) ? `
        <div style="color: #1e293b; font-style: normal; margin-bottom: 2px; font-size: ${optFontPt}; line-height: 1.3;">
          ${escapeHtml(formatMathSymbols(q.translation!))}
        </div>
      ` : ''}
    ` : '';

    let optContent = '';
    if (splitType === 'question_only') {
      optContent = '';
    } else if (splitType === 'options_only') {
      optContent = `
        <div style="font-weight: 700; color: #000000; font-size: ${optFontPt}; margin-bottom: 2px;">
          <span>Q${qNum}. (Options):</span>
        </div>
        ${isShort ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
            <div>${optA}</div>
            <div>${optB}</div>
            <div>${optC}</div>
            <div>${optD}</div>
          </div>
        ` : `
          <div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
            <div>${optA}</div>
            <div>${optB}</div>
            <div>${optC}</div>
            <div>${optD}</div>
          </div>
        `}
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
      optContent = isShort ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
          <div>${optA}</div>
          <div>${optB}</div>
          <div>${optC}</div>
          <div>${optD}</div>
        </div>
      ` : `
        <div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000; line-height: 1.3; padding-top: 1px;">
          <div>${optA}</div>
          <div>${optB}</div>
          <div>${optC}</div>
          <div>${optD}</div>
        </div>
      `;
    }

    return `
      <div style="padding: 1px 2px; margin-bottom: ${qSpacing}; font-size: ${fontPt}; line-height: 1.35; box-sizing: border-box; position: relative; z-index: 1; break-inside: avoid; page-break-inside: avoid;">
        ${qHeaderHtml}
        ${optContent}
      </div>
    `;
  }).join('');
}

export function render2ColPageHtml(
  page: PaperPageLayout,
  config: BookletCustomConfig,
  totalBookletPages?: number
): string {
  const testTitle = config.testName || 'HP Police Constable Mock Test - 01';
  const duration = config.duration || 60;
  const questionsCount = (config.customPages || []).reduce((acc, p) => acc + p.col1.length + p.col2.length, 0);
  const marks = config.totalMarks || (questionsCount > 0 ? (questionsCount === 50 ? 50 : questionsCount * 2) : 100);
  const watermark = config.watermarkText || '';
  const opacity = config.watermarkOpacity !== undefined ? config.watermarkOpacity : 0.08;
  const footerText = config.footerText || 'Gradeup Study Official Test Series';
  const density = config.fontSize || 'compact';
  const displayTotalPages = totalBookletPages || page.totalPages;

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align: center; margin-bottom: 4px;"><img src="${config.logoDataUrl}" style="height: 44px; width: auto; object-fit: contain;" /></div>`;
  }

  const watermarkHtml = watermark ? `
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 52px; font-weight: 800; color: rgba(180,180,180,${opacity}); pointer-events: none; white-space: nowrap; z-index: 0; text-transform: uppercase; font-family: sans-serif; letter-spacing: 2px;">
      ${escapeHtml(watermark)}
    </div>
  ` : '';

  const defaultInst = config.instructions ||
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`;

  let headerHtml = '';
  if (page.isFirstPage) {
    headerHtml = `
      <div>
        <div style="text-align: center; margin-bottom: 5px;">
          ${logoHtml}
          <h1 style="margin: 0; font-size: 16px; font-weight: 800; color: #000000; text-transform: uppercase; letter-spacing: 0.5px;">
            ${escapeHtml(testTitle)}
          </h1>
          <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 3px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: center; gap: 16px;">
            <span>Time Allowed: ${duration} Mins</span>
            <span>|</span>
            <span>Max Marks: ${marks}</span>
            ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
          </div>
        </div>

        ${defaultInst ? `
          <div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 4px 8px; margin-bottom: 5px; font-size: 9.5px; line-height: 1.3; color: #000000; background: #ffffff;">
            <strong style="display: block; margin-bottom: 1px;">General Instructions:</strong>
            ${escapeHtml(defaultInst).replace(/\\n/g, '<br/>')}
          </div>
        ` : ''}
      </div>
    `;
  } else {
    headerHtml = `
      <div style="margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #000000; min-height: 24px; box-sizing: border-box;">
        <span style="font-weight: 800; font-size: 11px; text-transform: uppercase;">${escapeHtml(testTitle)}</span>
        <span style="display: inline-block; font-size: 9.5px; font-weight: 800; background: #000000; color: #ffffff; padding: 2px 8px; border-radius: 3px; line-height: 1.2;">PAGE ${page.pageNumber} OF ${displayTotalPages}</span>
      </div>
    `;
  }

  return `
    <div class="print-page" data-paper-sheet="true" style="width: 794px; min-width: 794px; max-width: 794px; height: 1123px; min-height: 1123px; max-height: 1123px; background: #ffffff; color: #000000; box-sizing: border-box; padding: 20px 24px 16px 24px; position: relative; font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
      ${watermarkHtml}
      <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between; position: relative; z-index: 1; flex: 1; min-height: 0;">
        <div>
          ${headerHtml}
        </div>

        <div style="border: 1.5px solid #000000; display: grid; grid-template-columns: 1fr 1fr; background: transparent; flex: 1; min-height: 0; margin-top: 2px; margin-bottom: 4px;">
          <div style="padding: 6px 8px; border-right: 1.5px solid #000000; display: flex; flex-direction: column; justify-content: flex-start; box-sizing: border-box;">
            ${render2ColPaperColumnItems(page.col1, density)}
          </div>
          <div style="padding: 6px 8px; display: flex; flex-direction: column; justify-content: flex-start; box-sizing: border-box;">
            ${render2ColPaperColumnItems(page.col2, density)}
          </div>
        </div>

        <div style="border-top: 1px solid #000000; padding-top: 2px; display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #000000;">
          <span>${escapeHtml(footerText)}</span>
          <span>Page ${page.pageNumber} of ${displayTotalPages}</span>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 1. 2-COLUMN BOXED PAGE-SAVER QUESTION PAPER PDF EXPORT
// -------------------------------------------------------------
export async function exportCompact2ColPdfTestPaper(
  questions: Question[],
  config: BookletCustomConfig
) {
  if (questions.length === 0) {
    alert('No questions loaded to export.');
    return;
  }

  const testTitle = config.testName || 'HP Police Constable Mock Test - 01';

  const pages = config.customPages && config.customPages.length > 0
    ? config.customPages
    : paginateQuestionsFor2ColPaper(
        questions,
        config.fontSize || 'compact',
        config.page1Capacity,
        config.otherPageCapacity,
        config.autoBalance !== false
      );

  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgWidth = 210;
  const pageHeight = 297;

  // Check if live DOM preview sheets are rendered on screen (Exact WYSIWYG match)
  const liveSheets: HTMLElement[] = [];
  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const el = document.getElementById(`print-paper-sheet-${pIdx}`);
    if (el) liveSheets.push(el);
  }
  const hasAllLiveSheets = liveSheets.length === pages.length && pages.length > 0;

  // Inject temporary print styles to suppress interactive controls during capture
  let tempStyle: HTMLStyleElement | null = null;
  try {
    tempStyle = document.createElement('style');
    tempStyle.id = 'pdf-export-active-style';
    tempStyle.innerHTML = `
      [data-pdf-hide="true"], .group-hover\\:opacity-100 { display: none !important; opacity: 0 !important; visibility: hidden !important; }
      [data-paper-sheet="true"] { border: 1px solid #000000 !important; box-shadow: none !important; border-radius: 0 !important; }
    `;
    document.head.appendChild(tempStyle);

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      let captureEl: HTMLElement;
      let createdOffscreen = false;

      if (hasAllLiveSheets && liveSheets[pIdx]) {
        captureEl = liveSheets[pIdx];
      } else {
        createdOffscreen = true;
        captureEl = document.createElement('div');
        captureEl.style.position = 'absolute';
        captureEl.style.left = '-9999px';
        captureEl.style.top = '0';
        captureEl.style.width = '794px';
        captureEl.style.height = '1123px';
        captureEl.innerHTML = render2ColPageHtml(page, config, pages.length);
        document.body.appendChild(captureEl);
        await new Promise(resolve => setTimeout(resolve, 60));
      }

      const canvas = await safeHtml2Canvas(captureEl, {
        scale: 4, // 400 DPI Ultra HD crystal sharpness
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        logging: false
      });

      if (createdOffscreen && document.body.contains(captureEl)) {
        document.body.removeChild(captureEl);
      }

      if (pIdx > 0) {
        pdf.addPage();
      }

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, pageHeight, undefined, 'FAST');
    }

    const fileName = `${testTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Paper_Saver.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('2-Column PDF Generation Error:', err);
    alert('Failed to generate 2-Column PDF: ' + err.message);
  } finally {
    if (tempStyle && document.head.contains(tempStyle)) {
      document.head.removeChild(tempStyle);
    }
  }
}

// -------------------------------------------------------------
// 2. 1-PAGE ULTRA-COMPACT ANSWER KEY PDF EXPORT
// -------------------------------------------------------------
export async function exportCompact1PagePdfAnswerKey(
  questions: Question[],
  config: BookletCustomConfig
) {
  if (questions.length === 0) {
    alert('No questions loaded.');
    return;
  }

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#000000';
  container.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif";
  container.style.boxSizing = 'border-box';
  container.style.padding = '30px 40px';
  container.style.height = 'auto';
  container.style.overflow = 'visible';

  const testTitle = config.testName || 'HP Police Constable Mock Test - 01';
  const duration = config.duration || 60;
  const marks = config.totalMarks || (questions.length * (questions.length === 50 ? 1 : 2));
  const watermark = config.watermarkText || 'Gradeup Study';
  const opacity = config.watermarkOpacity !== undefined ? config.watermarkOpacity : 0.08;

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align: center; margin-bottom: 6px;"><img src="${config.logoDataUrl}" style="height: 60px; width: auto; object-fit: contain;" /></div>`;
  }

  const watermarkHtml = watermark ? `
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 56px; font-weight: 800; color: rgba(180,180,180,${opacity}); pointer-events:none; white-space:nowrap; z-index: 0; text-transform: uppercase; font-family: sans-serif; letter-spacing: 2px;">
      ${escapeHtml(watermark)}
    </div>
  ` : '';

  // Determine number of columns for answer grid based on total questions
  const cols = questions.length > 60 ? 4 : questions.length > 30 ? 2 : 1;
  const itemsPerCol = Math.ceil(questions.length / cols);

  const columnSlices: Question[][] = [];
  for (let c = 0; c < cols; c++) {
    columnSlices.push(questions.slice(c * itemsPerCol, (c + 1) * itemsPerCol));
  }

  const columnsHtml = columnSlices.map((colQs, cIdx) => {
    const startNum = cIdx * itemsPerCol;
    const rows = colQs.map((q, idx) => {
      const qNum = startNum + idx + 1;
      return `
        <div style="display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; line-height: 1.6; color: #000000;">
          <span style="min-width: 28px; text-align: right; color: #000000;">${qNum}.</span>
          <span style="font-weight: 700; color: #000000;">${q.answer || 'A'}</span>
        </div>
      `;
    }).join('');

    return `
      <div style="display: flex; flex-direction: column; gap: 1px;">
        ${rows}
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
    </style>
    ${watermarkHtml}
    <div style="position: relative; z-index: 1;">
      <!-- Header with Logo -->
      <div style="text-align: center; margin-bottom: 14px;">
        ${logoHtml}
        <h1 style="margin: 0; font-size: 18px; font-weight: 800; color: #000000; text-transform: uppercase;">
          ${escapeHtml(testTitle)}
        </h1>
        <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 4px; padding-bottom: 8px; border-bottom: 1.5px solid #000000; display: flex; justify-content: center; gap: 16px;">
          <span>Time Allowed: ${duration} Mins</span>
          <span>|</span>
          <span>Max Marks: ${marks}</span>
          ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
        </div>
      </div>

      <!-- Answer Key Box Header -->
      <div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 6px 12px; margin-bottom: 24px; text-align: center; background: #f8fafc;">
        <span style="font-size: 14px; font-weight: 800; color: #000000; letter-spacing: 0.5px;">Answer Key</span>
      </div>

      <!-- Multi-Column Compact Answer Grid -->
      <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 20px 40px; padding: 0 40px;">
        ${columnsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(container);
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    const canvas = await safeHtml2Canvas(container, {
      scale: 4, // Ultra-HD 400 DPI
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

    const fileName = `${testTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Answer_Key_1Page.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('Answer Key PDF Generation Error:', err);
    alert('Failed to generate Answer Key PDF: ' + err.message);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

// -------------------------------------------------------------
// 3. COMBINED QUESTION PAPER + 1-PAGE ANSWER KEY PDF EXPORT
// -------------------------------------------------------------
export async function exportCombinedBookletPdf(
  questions: Question[],
  config: BookletCustomConfig
) {
  if (questions.length === 0) {
    alert('No questions loaded to export.');
    return;
  }

  const testTitle = config.testName || 'HP Police Constable Mock Test - 01';
  const duration = config.duration || 60;
  const marks = config.totalMarks || (questions.length * (questions.length === 50 ? 1 : 2));
  const watermark = config.watermarkText || 'Gradeup Study';
  const opacity = config.watermarkOpacity !== undefined ? config.watermarkOpacity : 0.08;
  const footerText = config.footerText || 'Gradeup Study Official Test Series';

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align: center; margin-bottom: 4px;"><img src="${config.logoDataUrl}" style="height: 44px; width: auto; object-fit: contain;" /></div>`;
  }

  const watermarkHtml = watermark ? `
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 52px; font-weight: 800; color: rgba(180,180,180,${opacity}); pointer-events:none; white-space:nowrap; z-index: 0; text-transform: uppercase; font-family: sans-serif; letter-spacing: 2px;">
      ${escapeHtml(watermark)}
    </div>
  ` : '';

  const pages = config.customPages && config.customPages.length > 0
    ? config.customPages
    : paginateQuestionsFor2ColPaper(
        questions,
        config.fontSize || 'compact',
        config.page1Capacity,
        config.otherPageCapacity,
        config.autoBalance !== false
      );

  const totalBookletPages = pages.length + 1;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgWidth = 210;
  const pageHeight = 297;

  // Check if live DOM preview sheets are rendered on screen (Exact WYSIWYG match)
  const liveSheets: HTMLElement[] = [];
  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const el = document.getElementById(`print-paper-sheet-${pIdx}`);
    if (el) liveSheets.push(el);
  }
  const hasAllLiveSheets = liveSheets.length === pages.length && pages.length > 0;

  // Inject temporary print styles to suppress interactive controls during capture
  let tempStyle: HTMLStyleElement | null = null;
  try {
    tempStyle = document.createElement('style');
    tempStyle.id = 'pdf-export-combined-active-style';
    tempStyle.innerHTML = `
      [data-pdf-hide="true"], .group-hover\\:opacity-100 { display: none !important; opacity: 0 !important; visibility: hidden !important; }
      [data-paper-sheet="true"] { border: 1px solid #000000 !important; box-shadow: none !important; border-radius: 0 !important; }
    `;
    document.head.appendChild(tempStyle);

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    // 1. Render each Question Paper page
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      let captureEl: HTMLElement;
      let createdOffscreen = false;

      if (hasAllLiveSheets && liveSheets[pIdx]) {
        captureEl = liveSheets[pIdx];
      } else {
        createdOffscreen = true;
        captureEl = document.createElement('div');
        captureEl.style.position = 'absolute';
        captureEl.style.left = '-9999px';
        captureEl.style.top = '0';
        captureEl.style.width = '794px';
        captureEl.style.height = '1123px';
        captureEl.innerHTML = render2ColPageHtml(page, config, totalBookletPages);
        document.body.appendChild(captureEl);
        await new Promise(resolve => setTimeout(resolve, 60));
      }

      const canvas = await safeHtml2Canvas(captureEl, {
        scale: 4, // 400 DPI Ultra HD crystal sharpness
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        logging: false
      });

      if (createdOffscreen && document.body.contains(captureEl)) {
        document.body.removeChild(captureEl);
      }

      if (pIdx > 0) {
        pdf.addPage();
      }

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, pageHeight, undefined, 'FAST');
    }

    // 2. Render Answer Key Page
    const ansKeyContainer = document.createElement('div');
    ansKeyContainer.style.position = 'absolute';
    ansKeyContainer.style.left = '-9999px';
    ansKeyContainer.style.top = '0';
    ansKeyContainer.style.width = '794px';
    ansKeyContainer.style.height = '1123px';
    ansKeyContainer.style.backgroundColor = '#ffffff';
    ansKeyContainer.style.color = '#000000';
    ansKeyContainer.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif";
    ansKeyContainer.style.boxSizing = 'border-box';
    ansKeyContainer.style.padding = '30px 40px';
    ansKeyContainer.style.display = 'flex';
    ansKeyContainer.style.flexDirection = 'column';
    ansKeyContainer.style.justifyContent = 'space-between';

    const cols = questions.length > 60 ? 4 : questions.length > 30 ? 2 : 1;
    const itemsPerCol = Math.ceil(questions.length / cols);
    const columnSlices: Question[][] = [];
    for (let c = 0; c < cols; c++) {
      columnSlices.push(questions.slice(c * itemsPerCol, (c + 1) * itemsPerCol));
    }

    const columnsHtml = columnSlices.map((colQs, cIdx) => {
      const startNum = cIdx * itemsPerCol;
      const rows = colQs.map((q, idx) => {
        const qNum = startNum + idx + 1;
        return `
          <div style="display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; line-height: 1.6; color: #000000;">
            <span style="min-width: 28px; text-align: right; color: #000000;">${qNum}.</span>
            <span style="font-weight: 700; color: #000000;">${q.answer || 'A'}</span>
          </div>
        `;
      }).join('');

      return `<div style="display: flex; flex-direction: column; gap: 1px;">${rows}</div>`;
    }).join('');

    ansKeyContainer.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: geometricPrecision; }
      </style>
      ${watermarkHtml}
      <div style="position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
        <div>
          <div style="text-align: center; margin-bottom: 14px;">
            ${logoHtml}
            <h1 style="margin: 0; font-size: 18px; font-weight: 800; color: #000000; text-transform: uppercase;">
              ${escapeHtml(testTitle)}
            </h1>
            <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 4px; padding-bottom: 8px; border-bottom: 1.5px solid #000000; display: flex; justify-content: center; gap: 16px;">
              <span>Time Allowed: ${duration} Mins</span>
              <span>|</span>
              <span>Max Marks: ${marks}</span>
              ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
            </div>
          </div>

          <div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 6px 12px; margin-bottom: 24px; text-align: center; background: #f8fafc;">
            <span style="font-size: 14px; font-weight: 800; color: #000000; letter-spacing: 0.5px;">Answer Key</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 20px 40px; padding: 0 40px;">
            ${columnsHtml}
          </div>
        </div>

        <div style="border-top: 1px solid #000000; padding-top: 4px; display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: #000000;">
          <span>${escapeHtml(footerText)}</span>
          <span>Page ${totalBookletPages} of ${totalBookletPages} (Answer Key)</span>
        </div>
      </div>
    `;

    document.body.appendChild(ansKeyContainer);
    await new Promise(resolve => setTimeout(resolve, 100));

    const canvasAns = await safeHtml2Canvas(ansKeyContainer, {
      scale: 4, // Ultra-HD 400 DPI
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 794,
      height: 1123,
      windowWidth: 794,
      windowHeight: 1123,
      logging: false
    });

    if (document.body.contains(ansKeyContainer)) {
      document.body.removeChild(ansKeyContainer);
    }

    pdf.addPage();
    pdf.addImage(canvasAns.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, pageHeight, undefined, 'FAST');

    const fileName = `${testTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Complete_Booklet_with_Key.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('Combined Booklet PDF Generation Error:', err);
    alert('Failed to generate Combined Booklet: ' + err.message);
  } finally {
    if (tempStyle && document.head.contains(tempStyle)) {
      document.head.removeChild(tempStyle);
    }
  }
}

// -------------------------------------------------------------
// 4. NATIVE PRINT WINDOW FOR 2-COLUMN BOOKLET QUESTION PAPER
// -------------------------------------------------------------
export function printNativeCompact2ColPaper(
  questions: Question[],
  config: BookletCustomConfig
) {
  if (questions.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocker prevented opening the print window. Please allow pop-ups for this app.');
    return;
  }

  const testTitle = config.testName || 'HP Police Constable Mock Test - 01';
  const pages = config.customPages && config.customPages.length > 0
    ? config.customPages
    : paginateQuestionsFor2ColPaper(
        questions,
        config.fontSize || 'compact',
        config.page1Capacity,
        config.otherPageCapacity,
        config.autoBalance !== false
      );

  const totalQuestions = questions.length;
  const pagesHtml = pages.map(page => render2ColPageHtml(page, config, pages.length)).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(testTitle)} - 2-Column Booklet</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
        @page {
          size: A4 portrait;
          margin: 0;
        }
        * {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: geometricPrecision;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #0f172a;
          color: #000000;
          font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .no-print {
          background: #0f172a;
          color: #ffffff;
          padding: 10px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 9999;
          font-family: sans-serif;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .pages-container {
          padding: 24px 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
        }
        .print-page {
          width: 794px !important;
          min-width: 794px !important;
          max-width: 794px !important;
          height: 1123px !important;
          min-height: 1123px !important;
          max-height: 1123px !important;
          background: #ffffff !important;
          color: #000000 !important;
          box-sizing: border-box !important;
          padding: 20px 24px 16px 24px !important;
          position: relative !important;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          overflow: hidden !important;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        @media print {
          .no-print { display: none !important; }
          .pages-container {
            padding: 0 !important;
            gap: 0 !important;
            display: block !important;
          }
          html, body {
            background: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-page {
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 auto !important;
            padding: 5.3mm 6.35mm 4.23mm 6.35mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .print-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print">
        <span style="font-weight:bold; font-size:13px;">📄 2-Column Booklet Print Ready (${totalQuestions} MCQs | ${pages.length} Pages)</span>
        <div>
          <button onclick="window.print()" style="background:#2563eb; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-right:8px;">
            🖨️ Print Now (Ctrl+P)
          </button>
          <button onclick="window.close()" style="background:#475569; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">
            Close
          </button>
        </div>
      </div>
      <div class="pages-container">
        ${pagesHtml}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// -------------------------------------------------------------
// 5. NATIVE PRINT WINDOW FOR 1-PAGE ULTRA-COMPACT ANSWER KEY
// -------------------------------------------------------------
export function printNativeCompactAnswerKey(
  questions: Question[],
  config: BookletCustomConfig
) {
  if (questions.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Pop-up blocker prevented opening the print window. Please allow pop-ups for this app.');
    return;
  }

  const testTitle = config.testName || 'HP Police Constable Mock Test - 01';
  const duration = config.duration || 60;
  const marks = config.totalMarks || (questions.length * (questions.length === 50 ? 1 : 2));
  const watermark = config.watermarkText || 'Gradeup Study';

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align:center; margin-bottom:6px;"><img src="${config.logoDataUrl}" style="height:52px; width:auto; object-fit:contain;" /></div>`;
  }

  const cols = questions.length > 60 ? 4 : questions.length > 30 ? 2 : 1;
  const itemsPerCol = Math.ceil(questions.length / cols);
  const columnSlices: Question[][] = [];
  for (let c = 0; c < cols; c++) {
    columnSlices.push(questions.slice(c * itemsPerCol, (c + 1) * itemsPerCol));
  }

  const columnsHtml = columnSlices.map((colQs, cIdx) => {
    const startNum = cIdx * itemsPerCol;
    const rows = colQs.map((q, idx) => {
      const qNum = startNum + idx + 1;
      return `
        <div style="display: flex; align-items: baseline; gap: 8px; font-size: 10pt; font-weight: 600; line-height: 1.6;">
          <span style="min-width: 26px; text-align: right;">${qNum}.</span>
          <span style="font-weight: bold;">${q.answer || 'A'}</span>
        </div>
      `;
    }).join('');

    return `<div style="display: flex; flex-direction: column; gap: 1px;">${rows}</div>`;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(testTitle)} - 1-Page Answer Key</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        body {
          font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #000;
          background: #fff;
        }
        .watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-35deg);
          font-size: 60px;
          font-weight: 800;
          color: rgba(180, 180, 180, 0.08);
          pointer-events: none;
          white-space: nowrap;
          z-index: 0;
          text-transform: uppercase;
          font-family: sans-serif;
          letter-spacing: 2px;
        }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#0f172a; color:#fff; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:9999; font-family:sans-serif;">
        <span style="font-weight:bold; font-size:13px;">🔑 1-Page Ultra-Compact Answer Key (${questions.length} Questions)</span>
        <div>
          <button onclick="window.print()" style="background:#9333ea; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-right:8px;">
            🖨️ Print / Save as PDF
          </button>
          <button onclick="window.close()" style="background:#334155; color:#fff; border:none; padding:7px 12px; border-radius:6px; cursor:pointer; font-size:12px;">
            ✕ Close
          </button>
        </div>
      </div>

      <div class="watermark">${escapeHtml(watermark)}</div>

      <div style="position: relative; z-index: 1; max-width: 650px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 12px;">
          ${logoHtml}
          <h1 style="margin: 0; font-size: 15pt; font-weight: 800; text-transform: uppercase;">${escapeHtml(testTitle)}</h1>
          <div style="font-size: 8.5pt; font-weight: bold; margin-top: 3px; padding-bottom: 6px; border-bottom: 1.5px solid #000; display: flex; justify-content: center; gap: 14px;">
            <span>Time Allowed: ${duration} Mins</span>
            <span>|</span>
            <span>Max Marks: ${marks}</span>
            ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
          </div>
        </div>

        <div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 4px 10px; margin-bottom: 20px; text-align: center; background: #f8fafc;">
          <span style="font-size: 11pt; font-weight: 800; letter-spacing: 0.5px;">Answer Key</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 15px 30px; padding: 0 20px;">
          ${columnsHtml}
        </div>
      </div>

      <script>
        setTimeout(() => { window.print(); }, 700);
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

