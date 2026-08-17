import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Document,
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

  const doc = new Document({
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
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const scrollHeight = Math.max(container.scrollHeight, container.offsetHeight);

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      height: scrollHeight,
      windowHeight: scrollHeight,
      scrollY: 0
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

      const chunkImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
      const chunkMmHeight = (currentChunkHeight * imgWidth) / canvas.width;

      if (position > 0) {
        pdf.addPage();
      }

      pdf.addImage(chunkImgData, 'JPEG', 0, 0, imgWidth, chunkMmHeight);

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
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const scrollHeight = Math.max(container.scrollHeight, container.offsetHeight);

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      height: scrollHeight,
      windowHeight: scrollHeight,
      scrollY: 0
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

      const chunkImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
      const chunkMmHeight = (currentChunkHeight * imgWidth) / canvas.width;

      if (position > 0) {
        pdf.addPage();
      }

      pdf.addImage(chunkImgData, 'JPEG', 0, 0, imgWidth, chunkMmHeight);

      heightLeft -= pageHeight;
      position += pxPageHeight;
    }

    const fileName = `${(testNameOverride || 'Gradeup_Test').replace(/[^a-zA-Z0-9]/g, '_')}_Answer_Key.pdf`;
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
}

export interface PaperPageQuestion {
  question: Question;
  originalIndex: number;
  estimatedHeight: number;
}

export interface PaperPageLayout {
  pageNumber: number;
  totalPages: number;
  isFirstPage: boolean;
  col1: PaperPageQuestion[];
  col2: PaperPageQuestion[];
  col1Height: number;
  col2Height: number;
}

/**
 * Accurately estimates rendered height (in pixels) for a question in 2-column A4 format.
 * Accounts for question text length, translation presence, option lengths (2x2 vs 4 stacked), and density.
 */
export function estimateQuestionRenderHeight(
  q: Question,
  density: 'compact' | 'ultra-compact' | 'normal' = 'compact'
): number {
  const isUltra = density === 'ultra-compact';
  const isNormal = density === 'normal';

  const fontLineHeight = isUltra ? 14 : isNormal ? 17 : 15.5;
  const optLineHeight = isUltra ? 13 : isNormal ? 16 : 14.5;
  const qMargin = isUltra ? 6 : isNormal ? 10 : 8;

  // In 2-column A4 layout with ~340px column width:
  // English text fits ~42-46 chars per line, Hindi fits ~36-40 chars per line
  const qText = q.question || '';
  const qLines = Math.max(1, Math.ceil(qText.length / 44));
  let height = qLines * fontLineHeight + 2;

  // Hindi Translation
  if (shouldDisplayTranslation(qText, q.translation)) {
    const tText = q.translation || '';
    const tLines = Math.max(1, Math.ceil(tText.length / 38));
    height += tLines * (fontLineHeight * 0.95) + 3;
  }

  // Options layout (2x2 grid vs 4 stacked lines)
  const optA = (q.optionA || '');
  const optB = (q.optionB || '');
  const optC = (q.optionC || '');
  const optD = (q.optionD || '');
  const isShort = optA.length < 22 && optB.length < 22 && optC.length < 22 && optD.length < 22;

  if (isShort) {
    // 2 rows of options
    height += 2 * optLineHeight + 4;
  } else {
    // 4 rows of options
    const optALines = Math.max(1, Math.ceil(optA.length / 42));
    const optBLines = Math.max(1, Math.ceil(optB.length / 42));
    const optCLines = Math.max(1, Math.ceil(optC.length / 42));
    const optDLines = Math.max(1, Math.ceil(optD.length / 42));
    height += (optALines + optBLines + optCLines + optDLines) * optLineHeight + 4;
  }

  height += qMargin;
  return Math.ceil(height);
}

// -------------------------------------------------------------
// 0. EXPORT TO MICROSOFT WORD (.DOC / .DOCX COMPATIBLE)
// -------------------------------------------------------------

/**
 * Exports a formatted 2-Column Mock Test Question Paper to Microsoft Word (.doc / .docx)
 * Fully compatible with Microsoft Word, Google Docs, LibreOffice, and WPS Office.
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

  const fontPt = config.fontSize === 'ultra-compact' ? '9pt' : config.fontSize === 'normal' ? '11pt' : '10pt';
  const optFontPt = config.fontSize === 'ultra-compact' ? '8.5pt' : config.fontSize === 'normal' ? '10pt' : '9pt';

  // Format questions into 2 columns for Word
  const half = Math.ceil(questions.length / 2);
  const leftColQuestions = questions.slice(0, half);
  const rightColQuestions = questions.slice(half);

  const renderQuestionsList = (qs: Question[], startIndex: number) => {
    return qs.map((q, idx) => {
      const qNum = startIndex + idx + 1;
      const optA = `(A) ${formatMathSymbols(q.optionA || '')}`;
      const optB = `(B) ${formatMathSymbols(q.optionB || '')}`;
      const optC = `(C) ${formatMathSymbols(q.optionC || '')}`;
      const optD = `(D) ${formatMathSymbols(q.optionD || '')}`;
      const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

      return `
        <div style="margin-bottom: 10pt; font-size: ${fontPt}; line-height: 1.35; page-break-inside: avoid;">
          <div style="font-weight: bold; color: #000000; margin-bottom: 2pt;">
            <span>Q${qNum}. </span>${escapeHtml(formatMathSymbols(q.question || ''))}
          </div>
          ${shouldDisplayTranslation(q.question, q.translation) ? `
            <div style="color: #334155; font-size: ${fontPt}; margin-bottom: 3pt;">
              ${escapeHtml(formatMathSymbols(q.translation!))}
            </div>
          ` : ''}
          ${isShort ? `
            <table style="width: 100%; border-collapse: collapse; font-size: ${optFontPt}; margin-top: 2pt;">
              <tr>
                <td style="width: 50%; padding: 1pt 4pt 1pt 0; vertical-align: top;">${escapeHtml(optA)}</td>
                <td style="width: 50%; padding: 1pt 0 1pt 4pt; vertical-align: top;">${escapeHtml(optB)}</td>
              </tr>
              <tr>
                <td style="width: 50%; padding: 1pt 4pt 1pt 0; vertical-align: top;">${escapeHtml(optC)}</td>
                <td style="width: 50%; padding: 1pt 0 1pt 4pt; vertical-align: top;">${escapeHtml(optD)}</td>
              </tr>
            </table>
          ` : `
            <div style="font-size: ${optFontPt}; margin-top: 2pt;">
              <div style="padding: 1pt 0;">${escapeHtml(optA)}</div>
              <div style="padding: 1pt 0;">${escapeHtml(optB)}</div>
              <div style="padding: 1pt 0;">${escapeHtml(optC)}</div>
              <div style="padding: 1pt 0;">${escapeHtml(optD)}</div>
            </div>
          `}
        </div>
      `;
    }).join('');
  };

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
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 2pt 4pt; font-weight: bold; width: 40px; text-align: right;">${qNum}.</td>
            <td style="padding: 2pt 4pt; font-weight: bold; color: #15803d;">Option ${q.answer || 'A'}</td>
          </tr>
        `;
      }).join('');

      keyCols.push(`
        <td style="vertical-align: top; padding: 0 10pt;">
          <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
            ${rows}
          </table>
        </td>
      `);
    }

    answerKeyHtml = `
      <div style="page-break-before: always; margin-top: 20pt;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6pt; margin-bottom: 12pt;">
          <h2 style="margin: 0; font-size: 14pt; text-transform: uppercase;">${escapeHtml(testTitle)} - OFFICIAL ANSWER KEY</h2>
          <p style="margin: 4pt 0 0 0; font-size: 9pt; color: #475569;">Total Questions: ${questions.length} MCQs | Max Marks: ${marks}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10pt;">
          <tr>
            ${keyCols.join('')}
          </tr>
        </table>
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
        @page {
          size: A4 portrait;
          margin: 1.5cm 1.5cm 1.5cm 1.5cm;
        }
        body {
          font-family: 'Noto Sans Devanagari', 'Calibri', 'Segoe UI', Arial, sans-serif;
          font-size: ${fontPt};
          color: #000000;
          line-height: 1.35;
          margin: 0;
          padding: 0;
        }
        .header-box {
          text-align: center;
          border-bottom: 2px solid #000000;
          padding-bottom: 6pt;
          margin-bottom: 10pt;
        }
        .instructions-box {
          border: 1px solid #94a3b8;
          background-color: #f8fafc;
          padding: 6pt 10pt;
          margin-bottom: 12pt;
          font-size: 8.5pt;
          line-height: 1.3;
        }
        .two-col-table {
          width: 100%;
          border-collapse: collapse;
          border: 1.5px solid #000000;
        }
        .two-col-table td {
          vertical-align: top;
          padding: 8pt;
          width: 50%;
        }
        .left-col-td {
          border-right: 1.5px solid #000000;
        }
      </style>
    </head>
    <body>
      <div class="header-box">
        <h1 style="margin: 0; font-size: 16pt; font-weight: 800; text-transform: uppercase;">${escapeHtml(testTitle)}</h1>
        <div style="font-size: 9.5pt; font-weight: bold; margin-top: 4pt;">
          <span>Time Allowed: ${duration} Mins</span> &nbsp;|&nbsp;
          <span>Max Marks: ${marks}</span>
          ${config.showRollNo !== false ? ` &nbsp;|&nbsp; <span>Roll No: ____________</span>` : ''}
        </div>
      </div>

      ${instructions ? `
        <div class="instructions-box">
          <strong style="display: block; margin-bottom: 2pt;">General Instructions:</strong>
          ${escapeHtml(instructions).replace(/\n/g, '<br/>')}
        </div>
      ` : ''}

      <table class="two-col-table">
        <tr>
          <td class="left-col-td">
            ${renderQuestionsList(leftColQuestions, 0)}
          </td>
          <td>
            ${renderQuestionsList(rightColQuestions, half)}
          </td>
        </tr>
      </table>

      ${answerKeyHtml}
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
  let maxP1 = density === 'ultra-compact' ? 26 : density === 'normal' ? 18 : 22;
  let maxOther = density === 'ultra-compact' ? 32 : density === 'normal' ? 22 : 28;

  if (totalQuestions <= 0) {
    return { p1Capacity: maxP1, otherCapacity: maxOther, estimatedPages: 0 };
  }

  if (totalQuestions <= maxP1) {
    return { p1Capacity: totalQuestions, otherCapacity: maxOther, estimatedPages: 1 };
  }

  const remainingAfterP1 = totalQuestions - maxP1;
  const numOtherPages = Math.ceil(remainingAfterP1 / maxOther);
  const totalPages = 1 + numOtherPages;

  if (totalPages === 2) {
    let p1 = Math.min(maxP1, Math.round(totalQuestions * 0.46));
    if (p1 % 2 !== 0 && p1 + 1 <= maxP1) {
      p1 += 1;
    }
    const other = totalQuestions - p1;
    return { p1Capacity: p1, otherCapacity: other, estimatedPages: 2 };
  }

  const p1Ratio = maxP1 / (maxP1 + (totalPages - 1) * maxOther);
  let p1 = Math.min(maxP1, Math.max(14, Math.round(totalQuestions * p1Ratio)));
  if (p1 % 2 !== 0 && p1 + 1 <= maxP1) p1 += 1;
  const otherPagesRemaining = totalQuestions - p1;
  const perOtherPage = Math.ceil(otherPagesRemaining / (totalPages - 1));
  return { p1Capacity: p1, otherCapacity: perOtherPage, estimatedPages: totalPages };
}

/**
 * Precision Question-to-Page Layout Engine:
 * Dynamically computes an even distribution of questions across discrete A4 pages.
 * Fills both columns evenly without overflowing or clipping questions at the bottom.
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
  const maxP1 = density === 'ultra-compact' ? 26 : density === 'normal' ? 18 : 22;
  const maxOther = density === 'ultra-compact' ? 32 : density === 'normal' ? 22 : 28;

  // Determine page counts array
  let pageQuestionCounts: number[] = [];

  if (page1CapOverride && page1CapOverride > 0 && otherCapOverride && otherCapOverride > 0) {
    let rem = totalN;
    let pNum = 1;
    while (rem > 0) {
      const cap = pNum === 1 ? page1CapOverride : otherCapOverride;
      const count = Math.min(cap, rem);
      pageQuestionCounts.push(count);
      rem -= count;
      pNum++;
    }
  } else {
    // Dynamic Auto-Balance Mode
    if (totalN <= maxP1) {
      pageQuestionCounts = [totalN];
    } else {
      const totalPages = 1 + Math.ceil((totalN - maxP1) / maxOther);
      if (totalPages === 2) {
        let p1Count = Math.min(maxP1, Math.floor(totalN * 0.46));
        if (p1Count % 2 !== 0 && p1Count + 1 <= maxP1) p1Count += 1;
        const p2Count = totalN - p1Count;
        pageQuestionCounts = [p1Count, p2Count];
      } else {
        const p1Ratio = maxP1 / (maxP1 + (totalPages - 1) * maxOther);
        let p1Count = Math.min(maxP1, Math.max(14, Math.round(totalN * p1Ratio)));
        if (p1Count % 2 !== 0 && p1Count + 1 <= maxP1) p1Count += 1;

        const remainingQs = totalN - p1Count;
        const numOther = totalPages - 1;
        const perOther = Math.floor(remainingQs / numOther);
        let extra = remainingQs % numOther;

        pageQuestionCounts = [p1Count];
        for (let i = 0; i < numOther; i++) {
          let count = perOther + (extra > 0 ? 1 : 0);
          if (extra > 0) extra--;
          pageQuestionCounts.push(count);
        }
      }
    }
  }

  const pages: PaperPageLayout[] = [];
  let currentIndex = 0;

  for (let pIdx = 0; pIdx < pageQuestionCounts.length; pIdx++) {
    const pageNum = pIdx + 1;
    const isFirst = pageNum === 1;
    const countForPage = pageQuestionCounts[pIdx];

    const pageSlice = itemsWithHeight.slice(currentIndex, currentIndex + countForPage);
    const col1Count = Math.ceil(countForPage / 2);
    const col1 = pageSlice.slice(0, col1Count);
    const col2 = pageSlice.slice(col1Count);

    pages.push({
      pageNumber: pageNum,
      totalPages: pageQuestionCounts.length,
      isFirstPage: isFirst,
      col1,
      col2,
      col1Height: col1.reduce((sum, item) => sum + item.estimatedHeight, 0),
      col2Height: col2.reduce((sum, item) => sum + item.estimatedHeight, 0)
    });

    currentIndex += countForPage;
  }

  // Safety fallback if any question remained
  if (currentIndex < itemsWithHeight.length) {
    const leftover = itemsWithHeight.slice(currentIndex);
    if (pages.length > 0) {
      const lastPage = pages[pages.length - 1];
      const half = Math.ceil(leftover.length / 2);
      lastPage.col1.push(...leftover.slice(0, half));
      lastPage.col2.push(...leftover.slice(half));
    }
  }

  const finalTotalPages = Math.max(1, pages.length);
  pages.forEach(p => { p.totalPages = finalTotalPages; });
  return pages;
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
  const duration = config.duration || 60;
  const marks = config.totalMarks || (questions.length * (questions.length === 50 ? 1 : 2));
  const watermark = config.watermarkText || 'Gradeup Study';
  const opacity = config.watermarkOpacity !== undefined ? config.watermarkOpacity : 0.08;
  const footerText = config.footerText || 'Gradeup Study Official Test Series';

  // Question styling based on density
  const fontPt = config.fontSize === 'ultra-compact' ? '11px' : config.fontSize === 'normal' ? '13px' : '12px';
  const optFontPt = config.fontSize === 'ultra-compact' ? '10px' : config.fontSize === 'normal' ? '12px' : '11px';
  const qSpacing = config.fontSize === 'ultra-compact' ? '8px' : config.fontSize === 'normal' ? '14px' : '10px';

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align: center; margin-bottom: 4px;"><img src="${config.logoDataUrl}" style="height: 48px; width: auto; object-fit: contain;" /></div>`;
  }

  const watermarkHtml = watermark ? `
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 52px; font-weight: 800; color: rgba(180,180,180,${opacity}); pointer-events:none; white-space:nowrap; z-index: 0; text-transform: uppercase; font-family: sans-serif; letter-spacing: 2px;">
      ${escapeHtml(watermark)}
    </div>
  ` : '';

  const defaultInst = config.instructions ||
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`;

  const renderColumnItems = (items: PaperPageQuestion[]) => {
    return items.map(item => {
      const qNum = item.originalIndex + 1;
      const q = item.question;
      const optA = `(A) ${escapeHtml(formatMathSymbols(q.optionA || ''))}`;
      const optB = `(B) ${escapeHtml(formatMathSymbols(q.optionB || ''))}`;
      const optC = `(C) ${escapeHtml(formatMathSymbols(q.optionC || ''))}`;
      const optD = `(D) ${escapeHtml(formatMathSymbols(q.optionD || ''))}`;

      const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

      return `
        <div style="margin-bottom: ${qSpacing}; font-size: ${fontPt}; line-height: 1.35; position: relative; z-index: 1;">
          <div style="font-weight: 700; color: #000000; margin-bottom: 2px;">
            <span>Q${qNum}. </span>${escapeHtml(formatMathSymbols(q.question || ''))}
          </div>
          ${shouldDisplayTranslation(q.question, q.translation) ? `
            <div style="color: #1e293b; font-style: normal; margin-bottom: 3px; font-size: ${fontPt};">
              ${escapeHtml(formatMathSymbols(q.translation!))}
            </div>
          ` : ''}
          ${isShort ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: ${optFontPt}; color: #000000;">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000;">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>
          `}
        </div>
      `;
    }).join('');
  };

  const pages = paginateQuestionsFor2ColPaper(
    questions,
    config.fontSize || 'compact',
    config.page1Capacity,
    config.otherPageCapacity,
    config.autoBalance !== false
  );

  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgWidth = 210;
  const pageHeight = 297;

  try {
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const pageDiv = document.createElement('div');
      pageDiv.style.position = 'absolute';
      pageDiv.style.left = '-9999px';
      pageDiv.style.top = '0';
      pageDiv.style.width = '794px'; // 210mm at 96 DPI
      pageDiv.style.minHeight = '1123px'; // 297mm at 96 DPI
      pageDiv.style.height = 'auto';
      pageDiv.style.backgroundColor = '#ffffff';
      pageDiv.style.color = '#000000';
      pageDiv.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif";
      pageDiv.style.boxSizing = 'border-box';
      pageDiv.style.padding = '24px 28px 20px 28px';
      pageDiv.style.display = 'flex';
      pageDiv.style.flexDirection = 'column';
      pageDiv.style.justifyContent = 'space-between';
      pageDiv.style.overflow = 'visible';

      let headerHtml = '';
      if (page.isFirstPage) {
        headerHtml = `
          <div>
            <!-- Top Exam Header -->
            <div style="text-align: center; margin-bottom: 8px;">
              ${logoHtml}
              <h1 style="margin: 0; font-size: 17px; font-weight: 800; color: #000000; text-transform: uppercase; letter-spacing: 0.5px;">
                ${escapeHtml(testTitle)}
              </h1>
              <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 4px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: center; gap: 16px;">
                <span>Time Allowed: ${duration} Mins</span>
                <span>|</span>
                <span>Max Marks: ${marks}</span>
                ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
              </div>
            </div>

            <!-- General Instructions Box -->
            ${defaultInst ? `
              <div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 5px 10px; margin-bottom: 8px; font-size: 9.5px; line-height: 1.35; color: #000000; background: #ffffff;">
                <strong style="display: block; margin-bottom: 1px;">General Instructions:</strong>
                ${escapeHtml(defaultInst).replace(/\n/g, '<br/>')}
              </div>
            ` : ''}
          </div>
        `;
      } else {
        headerHtml = `
          <div style="margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #000000;">
            <span>${escapeHtml(testTitle)}</span>
            <span style="font-size: 10px; background: #000; color: #fff; padding: 1px 6px; border-radius: 2px;">PAGE ${page.pageNumber} OF ${page.totalPages}</span>
          </div>
        `;
      }

      pageDiv.innerHTML = `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
        </style>
        ${watermarkHtml}
        <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between; position: relative; z-index: 1;">
          <!-- Top Section -->
          <div>
            ${headerHtml}
          </div>

          <!-- 2-Column Boxed Layout with Outer Border on all 4 sides and Center Line -->
          <div style="border: 1.5px solid #000000; display: grid; grid-template-columns: 1fr 1fr; background: transparent; flex: 1; min-height: 0; margin-bottom: 6px;">
            <!-- Left Column -->
            <div style="padding: 8px 10px 8px 8px; border-right: 1.5px solid #000000;">
              ${renderColumnItems(page.col1)}
            </div>
            <!-- Right Column -->
            <div style="padding: 8px 8px 8px 10px;">
              ${renderColumnItems(page.col2)}
            </div>
          </div>

          <!-- Page Bottom Footer with Page Number -->
          <div style="border-top: 1px solid #000000; padding-top: 3px; display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #000000;">
            <span>${escapeHtml(footerText)}</span>
            <span>Page ${page.pageNumber} of ${page.totalPages}</span>
          </div>
        </div>
      `;

      document.body.appendChild(pageDiv);
      await new Promise(resolve => setTimeout(resolve, 80));

      const actualHeight = Math.max(1123, pageDiv.scrollHeight);
      const canvas = await html2canvas(pageDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: actualHeight
      });

      if (document.body.contains(pageDiv)) {
        document.body.removeChild(pageDiv);
      }

      if (pIdx > 0) {
        pdf.addPage();
      }

      const renderedMmHeight = (canvas.height * imgWidth) / canvas.width;
      const printMmHeight = Math.min(pageHeight, renderedMmHeight);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, printMmHeight);
    }

    const fileName = `${testTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Paper_Saver.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('2-Column PDF Generation Error:', err);
    alert('Failed to generate 2-Column PDF: ' + err.message);
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

  // Determine number of columns for answer grid based on total questions (e.g. 2 columns for 50 Qs like sample PDF, or 4 columns for 100 Qs)
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

      <!-- Multi-Column Compact Answer Grid (Exactly like sample PDF) -->
      <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 20px 40px; padding: 0 40px;">
        ${columnsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(container);
  await new Promise(resolve => setTimeout(resolve, 120));

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff'
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);

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

  const fontPt = config.fontSize === 'ultra-compact' ? '11px' : config.fontSize === 'normal' ? '13px' : '12px';
  const optFontPt = config.fontSize === 'ultra-compact' ? '10px' : config.fontSize === 'normal' ? '12px' : '11px';
  const qSpacing = config.fontSize === 'ultra-compact' ? '8px' : config.fontSize === 'normal' ? '14px' : '10px';

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align: center; margin-bottom: 4px;"><img src="${config.logoDataUrl}" style="height: 48px; width: auto; object-fit: contain;" /></div>`;
  }

  const watermarkHtml = watermark ? `
    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); font-size: 52px; font-weight: 800; color: rgba(180,180,180,${opacity}); pointer-events:none; white-space:nowrap; z-index: 0; text-transform: uppercase; font-family: sans-serif; letter-spacing: 2px;">
      ${escapeHtml(watermark)}
    </div>
  ` : '';

  const defaultInst = config.instructions ||
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`;

  const renderColumnItems = (items: PaperPageQuestion[]) => {
    return items.map(item => {
      const qNum = item.originalIndex + 1;
      const q = item.question;
      const optA = `(A) ${escapeHtml(formatMathSymbols(q.optionA || ''))}`;
      const optB = `(B) ${escapeHtml(formatMathSymbols(q.optionB || ''))}`;
      const optC = `(C) ${escapeHtml(formatMathSymbols(q.optionC || ''))}`;
      const optD = `(D) ${escapeHtml(formatMathSymbols(q.optionD || ''))}`;

      const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

      return `
        <div style="margin-bottom: ${qSpacing}; font-size: ${fontPt}; line-height: 1.35; position: relative; z-index: 1;">
          <div style="font-weight: 700; color: #000000; margin-bottom: 2px;">
            <span>Q${qNum}. </span>${escapeHtml(formatMathSymbols(q.question || ''))}
          </div>
          ${shouldDisplayTranslation(q.question, q.translation) ? `
            <div style="color: #1e293b; font-style: normal; margin-bottom: 3px; font-size: ${fontPt};">
              ${escapeHtml(formatMathSymbols(q.translation!))}
            </div>
          ` : ''}
          ${isShort ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; font-size: ${optFontPt}; color: #000000;">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 2px; font-size: ${optFontPt}; color: #000000;">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>
          `}
        </div>
      `;
    }).join('');
  };

  const pages = paginateQuestionsFor2ColPaper(
    questions,
    config.fontSize || 'compact',
    config.page1Capacity,
    config.otherPageCapacity,
    config.autoBalance !== false
  );

  const pdf = new jsPDF('p', 'mm', 'a4');
  const imgWidth = 210;
  const pageHeight = 297;

  try {
    // 1. Render each Question Paper page
    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      const page = pages[pIdx];
      const pageDiv = document.createElement('div');
      pageDiv.style.position = 'absolute';
      pageDiv.style.left = '-9999px';
      pageDiv.style.top = '0';
      pageDiv.style.width = '794px';
      pageDiv.style.minHeight = '1123px';
      pageDiv.style.height = 'auto';
      pageDiv.style.backgroundColor = '#ffffff';
      pageDiv.style.color = '#000000';
      pageDiv.style.fontFamily = "'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif";
      pageDiv.style.boxSizing = 'border-box';
      pageDiv.style.padding = '24px 28px 20px 28px';
      pageDiv.style.display = 'flex';
      pageDiv.style.flexDirection = 'column';
      pageDiv.style.justifyContent = 'space-between';
      pageDiv.style.overflow = 'visible';

      let headerHtml = '';
      if (page.isFirstPage) {
        headerHtml = `
          <div>
            <div style="text-align: center; margin-bottom: 8px;">
              ${logoHtml}
              <h1 style="margin: 0; font-size: 17px; font-weight: 800; color: #000000; text-transform: uppercase; letter-spacing: 0.5px;">
                ${escapeHtml(testTitle)}
              </h1>
              <div style="font-size: 11px; font-weight: 700; color: #000000; margin-top: 4px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: center; gap: 16px;">
                <span>Time Allowed: ${duration} Mins</span>
                <span>|</span>
                <span>Max Marks: ${marks}</span>
                ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
              </div>
            </div>

            ${defaultInst ? `
              <div style="border: 1px solid #94a3b8; border-radius: 2px; padding: 5px 10px; margin-bottom: 8px; font-size: 9.5px; line-height: 1.35; color: #000000; background: #ffffff;">
                <strong style="display: block; margin-bottom: 1px;">General Instructions:</strong>
                ${escapeHtml(defaultInst).replace(/\n/g, '<br/>')}
              </div>
            ` : ''}
          </div>
        `;
      } else {
        headerHtml = `
          <div style="margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1.5px solid #000000; display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #000000;">
            <span>${escapeHtml(testTitle)}</span>
            <span style="font-size: 10px; background: #000; color: #fff; padding: 1px 6px; border-radius: 2px;">PAGE ${page.pageNumber} OF ${page.totalPages + 1}</span>
          </div>
        `;
      }

      pageDiv.innerHTML = `
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700;800&display=swap');
        </style>
        ${watermarkHtml}
        <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between; position: relative; z-index: 1;">
          <div>
            ${headerHtml}
          </div>

          <div style="border: 1.5px solid #000000; display: grid; grid-template-columns: 1fr 1fr; background: transparent; flex: 1; min-height: 0; margin-bottom: 6px;">
            <div style="padding: 8px 10px 8px 8px; border-right: 1.5px solid #000000;">
              ${renderColumnItems(page.col1)}
            </div>
            <div style="padding: 8px 8px 8px 10px;">
              ${renderColumnItems(page.col2)}
            </div>
          </div>

          <div style="border-top: 1px solid #000000; padding-top: 3px; display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; color: #000000;">
            <span>${escapeHtml(footerText)}</span>
            <span>Page ${page.pageNumber} of ${page.totalPages + 1}</span>
          </div>
        </div>
      `;

      document.body.appendChild(pageDiv);
      await new Promise(resolve => setTimeout(resolve, 80));

      const actualHeight = Math.max(1123, pageDiv.scrollHeight);
      const canvas = await html2canvas(pageDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: actualHeight
      });

      if (document.body.contains(pageDiv)) {
        document.body.removeChild(pageDiv);
      }

      if (pIdx > 0) {
        pdf.addPage();
      }

      const renderedMmHeight = (canvas.height * imgWidth) / canvas.width;
      const printMmHeight = Math.min(pageHeight, renderedMmHeight);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, printMmHeight);
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
          <span>Page ${pages.length + 1} of ${pages.length + 1} (Answer Key)</span>
        </div>
      </div>
    `;

    document.body.appendChild(ansKeyContainer);
    await new Promise(resolve => setTimeout(resolve, 80));

    const canvasAns = await html2canvas(ansKeyContainer, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 794,
      height: 1123
    });

    if (document.body.contains(ansKeyContainer)) {
      document.body.removeChild(ansKeyContainer);
    }

    pdf.addPage();
    pdf.addImage(canvasAns.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, pageHeight);

    const fileName = `${testTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Complete_Booklet_with_Key.pdf`;
    pdf.save(fileName);
  } catch (err: any) {
    console.error('Combined Booklet PDF Generation Error:', err);
    alert('Failed to generate Combined Booklet: ' + err.message);
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
  const duration = config.duration || 60;
  const marks = config.totalMarks || (questions.length * (questions.length === 50 ? 1 : 2));
  const watermark = config.watermarkText || 'Gradeup Study';
  const footerText = config.footerText || 'Gradeup Study Official Test Series';

  const fontPt = config.fontSize === 'ultra-compact' ? '8pt' : config.fontSize === 'normal' ? '9.5pt' : '8.5pt';
  const optFontPt = config.fontSize === 'ultra-compact' ? '7.5pt' : config.fontSize === 'normal' ? '9pt' : '8pt';
  const qSpacing = config.fontSize === 'ultra-compact' ? '6px' : config.fontSize === 'normal' ? '12px' : '8px';

  let logoHtml = '';
  if (config.logoDataUrl) {
    logoHtml = `<div style="text-align:center; margin-bottom:4px;"><img src="${config.logoDataUrl}" style="height:48px; width:auto; object-fit:contain;" /></div>`;
  }

  const defaultInst = config.instructions ||
`1. All questions are compulsory and carry equal marks.
2. There is No Negative Marking.
3. Do not open the test booklet until instructed by the invigilator (Gradeup Study).`;

  const renderQuestionsColumn = (items: PaperPageQuestion[]) => {
    return items.map(item => {
      const qNum = item.originalIndex + 1;
      const q = item.question;
      const optA = `(A) ${escapeHtml(formatMathSymbols(q.optionA || ''))}`;
      const optB = `(B) ${escapeHtml(formatMathSymbols(q.optionB || ''))}`;
      const optC = `(C) ${escapeHtml(formatMathSymbols(q.optionC || ''))}`;
      const optD = `(D) ${escapeHtml(formatMathSymbols(q.optionD || ''))}`;

      const isShort = optA.length < 24 && optB.length < 24 && optC.length < 24 && optD.length < 24;

      return `
        <div class="question-item" style="margin-bottom: ${qSpacing}; font-size: ${fontPt}; line-height: 1.35; page-break-inside: avoid; break-inside: avoid;">
          <div style="font-weight: bold; color: #000; margin-bottom: 2px;">
            <span>Q${qNum}. </span>${escapeHtml(formatMathSymbols(q.question || ''))}
          </div>
          ${shouldDisplayTranslation(q.question, q.translation) ? `
            <div style="color: #1e293b; margin-bottom: 2px; font-size: ${fontPt};">
              ${escapeHtml(formatMathSymbols(q.translation!))}
            </div>
          ` : ''}
          ${isShort ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; font-size: ${optFontPt};">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1px; font-size: ${optFontPt};">
              <div>${optA}</div>
              <div>${optB}</div>
              <div>${optC}</div>
              <div>${optD}</div>
            </div>
          `}
        </div>
      `;
    }).join('');
  };

  const pages = paginateQuestionsFor2ColPaper(
    questions,
    config.fontSize || 'compact',
    config.page1Capacity,
    config.otherPageCapacity,
    config.autoBalance !== false
  );

  const pagesHtml = pages.map(page => {
    let header = '';
    if (page.isFirstPage) {
      header = `
        <div style="text-align:center; margin-bottom:6px;">
          ${logoHtml}
          <h1 style="margin:0; font-size:15pt; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(testTitle)}</h1>
          <div style="font-size:8.5pt; font-weight:bold; margin-top:4px; padding-bottom:4px; border-bottom:1.5px solid #000; display:flex; justify-content:center; gap:16px;">
            <span>Time Allowed: ${duration} Mins</span>
            <span>|</span>
            <span>Max Marks: ${marks}</span>
            ${config.showRollNo !== false ? `<span>|</span><span>Roll No: ____________</span>` : ''}
          </div>
        </div>
        ${defaultInst ? `
          <div style="border:1px solid #64748b; padding:4px 8px; margin-bottom:6px; font-size:7.5pt; line-height:1.3; background:#fff;">
            <strong>General Instructions:</strong><br/>
            ${escapeHtml(defaultInst).replace(/\n/g, '<br/>')}
          </div>
        ` : ''}
      `;
    } else {
      header = `
        <div style="margin-bottom:6px; padding-bottom:4px; border-bottom:1.5px solid #000; display:flex; justify-content:space-between; align-items:center; font-size:8.5pt; font-weight:bold;">
          <span>${escapeHtml(testTitle)}</span>
          <span style="font-size:8pt; background:#000; color:#fff; padding:1px 6px; border-radius:2px;">PAGE ${page.pageNumber} OF ${page.totalPages}</span>
        </div>
      `;
    }

    return `
      <div class="print-page">
        <div class="watermark">${escapeHtml(watermark)}</div>
        <div class="page-inner">
          <div class="page-header">
            ${header}
          </div>
          <div class="boxed-grid">
            <div class="left-col">
              ${renderQuestionsColumn(page.col1)}
            </div>
            <div class="right-col">
              ${renderQuestionsColumn(page.col2)}
            </div>
          </div>
          <div class="page-footer">
            <span>${escapeHtml(footerText)}</span>
            <span>Page ${page.pageNumber} of ${page.totalPages}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

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
          margin: 6mm 8mm 6mm 8mm;
        }
        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif;
          margin: 0;
          padding: 0;
          color: #000;
          background: #e2e8f0;
        }
        .watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-35deg);
          font-size: 50px;
          font-weight: 800;
          color: rgba(180, 180, 180, 0.08);
          pointer-events: none;
          white-space: nowrap;
          z-index: 0;
          text-transform: uppercase;
          font-family: sans-serif;
          letter-spacing: 2px;
        }
        .print-page {
          background: #ffffff;
          width: 210mm;
          min-height: 278mm;
          margin: 15px auto;
          padding: 10mm 12mm 8mm 12mm;
          position: relative;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          page-break-after: always;
          break-after: page;
          page-break-inside: avoid;
          break-inside: avoid;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: visible;
        }
        .page-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          min-height: 100%;
          justify-content: space-between;
          flex: 1;
        }
        .boxed-grid {
          border: 1.5px solid #000;
          border-bottom: 1.5px solid #000;
          display: grid;
          grid-template-columns: 1fr 1fr;
          flex: 1;
          margin-bottom: 4px;
        }
        .left-col {
          padding: 6px 8px;
          border-right: 1.5px solid #000;
        }
        .right-col {
          padding: 6px 8px;
        }
        .page-footer {
          border-top: 1px solid #000;
          padding-top: 3px;
          display: flex;
          justify-content: space-between;
          font-size: 8pt;
          font-weight: bold;
          color: #000;
        }
        @media print {
          .no-print { display: none !important; }
          body {
            background: transparent;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-page {
            box-shadow: none;
            margin: 0;
            padding: 5mm 6mm 4mm 6mm;
            width: 100%;
            min-height: 275mm;
            height: auto;
            max-height: none;
            page-break-after: always;
            break-after: page;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background:#0f172a; color:#fff; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:9999; font-family:sans-serif;">
        <span style="font-weight:bold; font-size:13px;">📄 2-Column Booklet Print Ready (${questions.length} MCQs | ${pages.length} Pages)</span>
        <div>
          <button onclick="window.print()" style="background:#2563eb; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px; margin-right:8px;">
            🖨️ Print Now (Ctrl+P)
          </button>
          <button onclick="window.close()" style="background:#475569; color:#fff; border:none; padding:7px 14px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">
            Close
          </button>
        </div>
      </div>
      ${pagesHtml}
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

