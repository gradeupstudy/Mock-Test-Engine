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

