import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Question } from '../types';

// Convert a File or Blob into a base64 Data URL
export const fileToDataUrl = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = err => reject(err);
    reader.readAsDataURL(file);
  });
};

// Compress or resize image if it's overly large (> 1200px width/height) to maintain smooth UI performance
export const optimizeImageDataUrl = (dataUrl: string, maxDim: number = 1000): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl.startsWith('data:image')) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(dataUrl);
        return;
      }
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

// High-quality SVG sample diagrams for demo/sample image questions
export const SAMPLE_TRIANGLE_DIAGRAM = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200">
  <rect width="320" height="200" fill="#f8fafc" rx="8" stroke="#cbd5e1" stroke-width="1.5"/>
  <polygon points="160,30 60,165 260,165" fill="#e0e7ff" stroke="#3730a3" stroke-width="3"/>
  <line x1="160" y1="30" x2="160" y2="165" stroke="#ef4444" stroke-width="2" stroke-dasharray="4"/>
  <rect x="160" y="150" width="14" height="14" fill="none" stroke="#ef4444" stroke-width="1.5"/>
  <text x="160" y="22" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1e1b4b" text-anchor="middle">A</text>
  <text x="45" y="175" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1e1b4b">B</text>
  <text x="268" y="175" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#1e1b4b">C</text>
  <text x="165" y="180" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#ef4444">D</text>
  <text x="95" y="95" font-family="Arial, sans-serif" font-size="12" fill="#4338ca">13 cm</text>
  <text x="215" y="95" font-family="Arial, sans-serif" font-size="12" fill="#4338ca">13 cm</text>
  <text x="160" y="105" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#b91c1c" text-anchor="middle">h = ?</text>
  <text x="160" y="195" font-family="Arial, sans-serif" font-size="12" fill="#334155" text-anchor="middle">BC = 10 cm</text>
</svg>`)}`;

export const SAMPLE_CIRCUIT_OPT_A = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80">
  <rect width="160" height="80" fill="#f8fafc" rx="6" stroke="#94a3b8" stroke-width="1"/>
  <line x1="20" y1="40" x2="55" y2="40" stroke="#0284c7" stroke-width="2"/>
  <rect x="55" y="30" width="50" height="20" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <line x1="105" y1="40" x2="140" y2="40" stroke="#0284c7" stroke-width="2"/>
  <text x="80" y="44" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#0369a1" text-anchor="middle">10 Ω</text>
</svg>`)}`;

export const SAMPLE_CIRCUIT_OPT_B = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80">
  <rect width="160" height="80" fill="#f8fafc" rx="6" stroke="#94a3b8" stroke-width="1"/>
  <line x1="20" y1="40" x2="45" y2="40" stroke="#0284c7" stroke-width="2"/>
  <rect x="45" y="24" width="30" height="15" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <rect x="85" y="24" width="30" height="15" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <line x1="75" y1="31" x2="85" y2="31" stroke="#0284c7" stroke-width="2"/>
  <line x1="115" y1="31" x2="140" y2="40" stroke="#0284c7" stroke-width="2"/>
  <text x="80" y="55" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#0369a1" text-anchor="middle">Series (20 Ω)</text>
</svg>`)}`;

export const SAMPLE_CIRCUIT_OPT_C = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80">
  <rect width="160" height="80" fill="#f8fafc" rx="6" stroke="#94a3b8" stroke-width="1"/>
  <line x1="20" y1="40" x2="40" y2="40" stroke="#0284c7" stroke-width="2"/>
  <line x1="40" y1="20" x2="40" y2="60" stroke="#0284c7" stroke-width="2"/>
  <line x1="40" y1="20" x2="55" y2="20" stroke="#0284c7" stroke-width="2"/>
  <rect x="55" y="12" width="50" height="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <line x1="105" y1="20" x2="120" y2="20" stroke="#0284c7" stroke-width="2"/>
  <line x1="40" y1="60" x2="55" y2="60" stroke="#0284c7" stroke-width="2"/>
  <rect x="55" y="52" width="50" height="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <line x1="105" y1="60" x2="120" y2="60" stroke="#0284c7" stroke-width="2"/>
  <line x1="120" y1="20" x2="120" y2="60" stroke="#0284c7" stroke-width="2"/>
  <line x1="120" y1="40" x2="140" y2="40" stroke="#0284c7" stroke-width="2"/>
  <text x="80" y="42" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="#0369a1" text-anchor="middle">Parallel (5 Ω)</text>
</svg>`)}`;

export const SAMPLE_CIRCUIT_OPT_D = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80" width="160" height="80">
  <rect width="160" height="80" fill="#f8fafc" rx="6" stroke="#94a3b8" stroke-width="1"/>
  <circle cx="80" cy="40" r="18" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
  <line x1="72" y1="32" x2="88" y2="48" stroke="#d97706" stroke-width="2"/>
  <line x1="88" y1="32" x2="72" y2="48" stroke="#d97706" stroke-width="2"/>
  <line x1="20" y1="40" x2="62" y2="40" stroke="#0284c7" stroke-width="2"/>
  <line x1="98" y1="40" x2="140" y2="40" stroke="#0284c7" stroke-width="2"/>
  <text x="80" y="70" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#92400e" text-anchor="middle">Open Circuit</text>
</svg>`)}`;

export const SAMPLE_EXPLANATION_DIAGRAM = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 180" width="340" height="180">
  <rect width="340" height="180" fill="#ecfdf5" rx="8" stroke="#a7f3d0" stroke-width="2"/>
  <text x="20" y="30" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#065f46">Step-by-step Solution Formula:</text>
  <text x="20" y="60" font-family="Courier New, monospace" font-size="12" fill="#047857">1. In isosceles triangle ABC, AD ⊥ BC.</text>
  <text x="20" y="85" font-family="Courier New, monospace" font-size="12" fill="#047857">2. Therefore, BD = DC = BC / 2 = 10 / 2 = 5 cm.</text>
  <text x="20" y="110" font-family="Courier New, monospace" font-size="12" fill="#047857">3. Using Pythagoras theorem in △ABD:</text>
  <text x="40" y="135" font-family="Courier New, monospace" font-size="13" font-weight="bold" fill="#0f766e">AD² = AB² - BD² = 13² - 5² = 169 - 25 = 144</text>
  <text x="40" y="160" font-family="Courier New, monospace" font-size="14" font-weight="bold" fill="#b91c1c">AD = √144 = 12 cm (Option B is correct)</text>
</svg>`)}`;

// Generate sample Image MCQs
export const getSampleImageMcqs = () => [
  {
    subject: 'Mathematics',
    chapter: 'Geometry & Triangles',
    question: 'In the given figure, △ABC is an isosceles triangle where AB = AC = 13 cm, and BC = 10 cm. Find the perpendicular height AD from vertex A to base BC.',
    questionImage: SAMPLE_TRIANGLE_DIAGRAM,
    optionA: '10 cm',
    optionAImage: '',
    optionB: '12 cm',
    optionBImage: '',
    optionC: '14 cm',
    optionCImage: '',
    optionD: '8 cm',
    optionDImage: '',
    answer: 'B' as const,
    explanation: 'Since △ABC is isosceles, the altitude AD bisects the base BC. Hence BD = 10/2 = 5 cm. In right △ABD, AD = √(13² - 5²) = √(169 - 25) = √144 = 12 cm.',
    explanationImage: SAMPLE_EXPLANATION_DIAGRAM,
    difficulty: 'Moderate' as const
  },
  {
    subject: 'Physics',
    chapter: 'Current Electricity & Circuits',
    question: 'Which of the following circuit configurations represents a parallel combination that gives an equivalent resistance of 5 Ω using two 10 Ω resistors?',
    questionImage: '',
    optionA: 'Single Resistor (10 Ω)',
    optionAImage: SAMPLE_CIRCUIT_OPT_A,
    optionB: 'Series Connection (20 Ω)',
    optionBImage: SAMPLE_CIRCUIT_OPT_B,
    optionC: 'Parallel Connection (5 Ω)',
    optionCImage: SAMPLE_CIRCUIT_OPT_C,
    optionD: 'Open Circuit Breakdown',
    optionDImage: SAMPLE_CIRCUIT_OPT_D,
    answer: 'C' as const,
    explanation: 'For two identical resistors of resistance R in parallel, the equivalent resistance R_eq = (R × R) / (R + R) = R / 2 = 10 / 2 = 5 Ω. Diagram C represents this parallel network.',
    explanationImage: SAMPLE_CIRCUIT_OPT_C,
    difficulty: 'Easy' as const
  }
];

// Intelligently auto-match multiple selected image files into MCQ objects by filename patterns
export interface AutoMatchedMcq {
  qNum: number;
  questionImage?: string;
  optionAImage?: string;
  optionBImage?: string;
  optionCImage?: string;
  optionDImage?: string;
  explanationImage?: string;
  questionText?: string;
  optionAText?: string;
  optionBText?: string;
  optionCText?: string;
  optionDText?: string;
  explanationText?: string;
  answer?: 'A' | 'B' | 'C' | 'D';
}

export const autoMatchImageFiles = async (files: File[]): Promise<AutoMatchedMcq[]> => {
  const mcqMap = new Map<number, AutoMatchedMcq>();

  for (const file of files) {
    const name = file.name;
    const lower = name.toLowerCase();
    const dataUrl = await fileToDataUrl(file);

    // Extract Question Number (e.g. "q1", "question1", "1_question", "1_q", "mcq_1", "1-a")
    let qNum = 1;
    const qNumMatch = lower.match(/(?:q|question|mcq|no|item)?[-_ ]*(\d+)/i);
    if (qNumMatch && qNumMatch[1]) {
      qNum = parseInt(qNumMatch[1], 10);
    }

    if (!mcqMap.has(qNum)) {
      mcqMap.set(qNum, { qNum });
    }
    const current = mcqMap.get(qNum)!;

    // Detect role from filename
    if (
      lower.includes('_a.') ||
      lower.includes('-a.') ||
      lower.includes('opta') ||
      lower.includes('opt_a') ||
      lower.includes('optiona') ||
      lower.includes('option_a') ||
      lower.includes('_1.') ||
      lower.includes('opt1')
    ) {
      current.optionAImage = dataUrl;
    } else if (
      lower.includes('_b.') ||
      lower.includes('-b.') ||
      lower.includes('optb') ||
      lower.includes('opt_b') ||
      lower.includes('optionb') ||
      lower.includes('option_b') ||
      lower.includes('_2.') ||
      lower.includes('opt2')
    ) {
      current.optionBImage = dataUrl;
    } else if (
      lower.includes('_c.') ||
      lower.includes('-c.') ||
      lower.includes('optc') ||
      lower.includes('opt_c') ||
      lower.includes('optionc') ||
      lower.includes('option_c') ||
      lower.includes('_3.') ||
      lower.includes('opt3')
    ) {
      current.optionCImage = dataUrl;
    } else if (
      lower.includes('_d.') ||
      lower.includes('-d.') ||
      lower.includes('optd') ||
      lower.includes('opt_d') ||
      lower.includes('optiond') ||
      lower.includes('option_d') ||
      lower.includes('_4.') ||
      lower.includes('opt4')
    ) {
      current.optionDImage = dataUrl;
    } else if (
      lower.includes('exp') ||
      lower.includes('sol') ||
      lower.includes('solution') ||
      lower.includes('explanation') ||
      lower.includes('ans_img')
    ) {
      current.explanationImage = dataUrl;
    } else {
      // Default to question diagram/statement image
      current.questionImage = dataUrl;
    }
  }

  return Array.from(mcqMap.values()).sort((a, b) => a.qNum - b.qNum);
};

// Parse a complete ZIP package with images + question spreadsheet/JSON
export const parseImageMcqZip = async (arrayBuffer: ArrayBuffer): Promise<{
  questions: any[];
  imagesCount: number;
  message: string;
}> => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const imagesMap = new Map<string, string>(); // normalized filename -> dataUrl
  let rawQuestions: any[] = [];

  const files = Object.keys(zip.files);

  // 1. Extract all images first into memory
  for (const path of files) {
    const entry = zip.files[path];
    if (entry.dir) continue;
    if (path.startsWith('__MACOSX') || path.endsWith('.DS_Store')) continue;

    const lowerPath = path.toLowerCase();
    const fileName = path.split('/').pop() || '';
    const cleanFileName = fileName.toLowerCase().trim();

    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(lowerPath)) {
      const mime = lowerPath.endsWith('.png')
        ? 'image/png'
        : lowerPath.endsWith('.svg')
        ? 'image/svg+xml'
        : lowerPath.endsWith('.webp')
        ? 'image/webp'
        : lowerPath.endsWith('.gif')
        ? 'image/gif'
        : 'image/jpeg';
      const base64 = await entry.async('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      imagesMap.set(cleanFileName, dataUrl);
      imagesMap.set(lowerPath, dataUrl);
    }
  }

  // 2. Extract questions from spreadsheet or JSON
  for (const path of files) {
    const entry = zip.files[path];
    if (entry.dir) continue;
    const lowerPath = path.toLowerCase();

    if (lowerPath.endsWith('.json')) {
      try {
        const text = await entry.async('text');
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          rawQuestions.push(...parsed);
        } else if (Array.isArray(parsed.questions)) {
          rawQuestions.push(...parsed.questions);
        } else if (Array.isArray(parsed.data)) {
          rawQuestions.push(...parsed.data);
        }
      } catch (e) {
        console.warn('Could not parse JSON in zip:', path, e);
      }
    } else if (lowerPath.endsWith('.xlsx') || lowerPath.endsWith('.xls') || lowerPath.endsWith('.csv')) {
      try {
        const ab = await entry.async('arraybuffer');
        const workbook = XLSX.read(ab, { type: 'array' });
        if (workbook.SheetNames.length > 0) {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (json.length > 0) {
            rawQuestions.push(...json);
          }
        }
      } catch (e) {
        console.warn('Could not parse sheet in zip:', path, e);
      }
    }
  }

  // Helper to resolve image reference (filename, path, or already base64)
  const resolveImage = (refVal: any): string => {
    if (!refVal || typeof refVal !== 'string') return '';
    const trimmed = refVal.trim();
    if (trimmed.startsWith('data:image') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    const cleanRef = trimmed.toLowerCase();
    const cleanBaseName = cleanRef.split('/').pop() || cleanRef;

    if (imagesMap.has(cleanRef)) return imagesMap.get(cleanRef)!;
    if (imagesMap.has(cleanBaseName)) return imagesMap.get(cleanBaseName)!;

    // Fuzzy check without extension
    const withoutExt = cleanBaseName.replace(/\.[a-z0-9]+$/i, '');
    for (const [key, val] of imagesMap.entries()) {
      if (key.includes(withoutExt)) {
        return val;
      }
    }
    return '';
  };

  // If questions sheet was found, link the images
  if (rawQuestions.length > 0) {
    const mappedQuestions = rawQuestions.map((q: any) => {
      const getVal = (keys: string[]) => {
        for (const k of Object.keys(q)) {
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (keys.some(t => cleanK === t)) return q[k];
        }
        return '';
      };

      const qImgRef = q.questionImage || q.question_image || q.qImage || getVal(['questionimage', 'questionimg', 'qimage', 'qimg', 'diagram']);
      const optAImgRef = q.optionAImage || q.option_a_image || q.optAImage || getVal(['optionaimage', 'optiona_image', 'optaimage', 'opt1image', 'aimage']);
      const optBImgRef = q.optionBImage || q.option_b_image || q.optBImage || getVal(['optionbimage', 'optionb_image', 'optbimage', 'opt2image', 'bimage']);
      const optCImgRef = q.optionCImage || q.option_c_image || q.optCImage || getVal(['optioncimage', 'optionc_image', 'optcimage', 'opt3image', 'cimage']);
      const optDImgRef = q.optionDImage || q.option_d_image || q.optDImage || getVal(['optiondimage', 'optiond_image', 'optdimage', 'opt4image', 'dimage']);
      const expImgRef = q.explanationImage || q.explanation_image || q.expImage || getVal(['explanationimage', 'expimage', 'solutionimage', 'expimg']);

      return {
        ...q,
        questionImage: resolveImage(qImgRef) || (typeof qImgRef === 'string' && qImgRef.startsWith('data:image') ? qImgRef : ''),
        optionAImage: resolveImage(optAImgRef) || (typeof optAImgRef === 'string' && optAImgRef.startsWith('data:image') ? optAImgRef : ''),
        optionBImage: resolveImage(optBImgRef) || (typeof optBImgRef === 'string' && optBImgRef.startsWith('data:image') ? optBImgRef : ''),
        optionCImage: resolveImage(optCImgRef) || (typeof optCImgRef === 'string' && optCImgRef.startsWith('data:image') ? optCImgRef : ''),
        optionDImage: resolveImage(optDImgRef) || (typeof optDImgRef === 'string' && optDImgRef.startsWith('data:image') ? optDImgRef : ''),
        explanationImage: resolveImage(expImgRef) || (typeof expImgRef === 'string' && expImgRef.startsWith('data:image') ? expImgRef : '')
      };
    });

    return {
      questions: mappedQuestions,
      imagesCount: imagesMap.size,
      message: `Parsed ${mappedQuestions.length} MCQs with ${imagesMap.size} linked images from ZIP archive.`
    };
  }

  // If no spreadsheet was present but images exist, auto-match by filename!
  if (imagesMap.size > 0) {
    const dummyFiles: any[] = [];
    for (const [key, dataUrl] of imagesMap.entries()) {
      if (!key.includes('/')) {
        dummyFiles.push({ name: key, dataUrl });
      }
    }
    const grouped = new Map<number, any>();
    dummyFiles.forEach(f => {
      const lower = f.name.toLowerCase();
      let qNum = 1;
      const match = lower.match(/(?:q|question|mcq)?[-_ ]*(\d+)/i);
      if (match && match[1]) qNum = parseInt(match[1], 10);
      if (!grouped.has(qNum)) {
        grouped.set(qNum, {
          subject: 'General Knowledge',
          chapter: 'Visual Questions',
          question: `Question ${qNum}`,
          optionA: 'Option A',
          optionB: 'Option B',
          optionC: 'Option C',
          optionD: 'Option D',
          answer: 'A',
          difficulty: 'Moderate'
        });
      }
      const qObj = grouped.get(qNum);
      if (lower.includes('opt_a') || lower.includes('_a.') || lower.includes('opta')) qObj.optionAImage = f.dataUrl;
      else if (lower.includes('opt_b') || lower.includes('_b.') || lower.includes('optb')) qObj.optionBImage = f.dataUrl;
      else if (lower.includes('opt_c') || lower.includes('_c.') || lower.includes('optc')) qObj.optionCImage = f.dataUrl;
      else if (lower.includes('opt_d') || lower.includes('_d.') || lower.includes('optd')) qObj.optionDImage = f.dataUrl;
      else if (lower.includes('exp') || lower.includes('sol')) qObj.explanationImage = f.dataUrl;
      else qObj.questionImage = f.dataUrl;
    });

    const questionsList = Array.from(grouped.values());
    return {
      questions: questionsList,
      imagesCount: imagesMap.size,
      message: `Extracted ${imagesMap.size} images from ZIP and auto-generated ${questionsList.length} Image MCQs.`
    };
  }

  return {
    questions: [],
    imagesCount: 0,
    message: 'No questions or images found inside ZIP archive.'
  };
};

// Generate and download a sample Image MCQ ZIP package for the user
export const downloadSampleImageMcqZip = async () => {
  const zip = new JSZip();

  // Excel template data with image filenames
  const excelData = [
    {
      'Subject': 'Mathematics',
      'Chapter': 'Geometry',
      'Question': 'Find the perpendicular height AD of the triangle in the diagram.',
      'Question_Image': 'q1_triangle.svg',
      'Option_A': '10 cm',
      'Option_A_Image': '',
      'Option_B': '12 cm',
      'Option_B_Image': '',
      'Option_C': '14 cm',
      'Option_C_Image': '',
      'Option_D': '8 cm',
      'Option_D_Image': '',
      'Answer': 'B',
      'Explanation': 'In right △ABD, AD = √(13² - 5²) = 12 cm.',
      'Explanation_Image': 'q1_solution.svg',
      'Difficulty': 'Moderate'
    },
    {
      'Subject': 'Physics',
      'Chapter': 'Electricity',
      'Question': 'Identify the circuit configuration with 5 Ω equivalent resistance.',
      'Question_Image': '',
      'Option_A': 'Single 10 Ω',
      'Option_A_Image': 'opt_a.svg',
      'Option_B': 'Series 20 Ω',
      'Option_B_Image': 'opt_b.svg',
      'Option_C': 'Parallel 5 Ω',
      'Option_C_Image': 'opt_c.svg',
      'Option_D': 'Open Circuit',
      'Option_D_Image': 'opt_d.svg',
      'Answer': 'C',
      'Explanation': 'Two 10 Ω resistors in parallel yield 5 Ω equivalent resistance.',
      'Explanation_Image': 'opt_c.svg',
      'Difficulty': 'Easy'
    }
  ];

  // Convert excelData to XLSX
  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ImageMCQs');
  const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  zip.file('image_mcqs_template.xlsx', xlsxBuffer);

  // Also include JSON version
  zip.file('image_mcqs_template.json', JSON.stringify(excelData, null, 2));

  // Add images folder
  const imgFolder = zip.folder('images') || zip;
  // Decode sample SVGs
  const decodeSvg = (dataUrl: string) => decodeURIComponent(dataUrl.replace('data:image/svg+xml;utf8,', ''));
  imgFolder.file('q1_triangle.svg', decodeSvg(SAMPLE_TRIANGLE_DIAGRAM));
  imgFolder.file('q1_solution.svg', decodeSvg(SAMPLE_EXPLANATION_DIAGRAM));
  imgFolder.file('opt_a.svg', decodeSvg(SAMPLE_CIRCUIT_OPT_A));
  imgFolder.file('opt_b.svg', decodeSvg(SAMPLE_CIRCUIT_OPT_B));
  imgFolder.file('opt_c.svg', decodeSvg(SAMPLE_CIRCUIT_OPT_C));
  imgFolder.file('opt_d.svg', decodeSvg(SAMPLE_CIRCUIT_OPT_D));

  // Add README Instructions
  const readme = `=== GRADEUP STUDY - IMAGE MCQS BULK UPLOAD INSTRUCTIONS ===

You can bulk upload questions that contain images in:
1. Question statement / diagram (Question_Image)
2. Options A, B, C, D (Option_A_Image, Option_B_Image, Option_C_Image, Option_D_Image)
3. Explanation / Solution diagram (Explanation_Image)

HOW TO USE THIS ZIP TEMPLATE:
1. Edit 'image_mcqs_template.xlsx' or 'image_mcqs_template.json' with your own questions.
2. In the Image columns, write the exact filename of the image (e.g. 'q1.png', 'optA.png').
3. Place all your image files inside the ZIP file (in root or inside an 'images/' folder).
4. Save the ZIP file.
5. In Gradeup Study Bulk Upload > Image MCQs tab or File Upload tab, drop your ZIP file!
All MCQs with their diagrams and option images will be parsed and loaded instantly!
`;
  zip.file('README_INSTRUCTIONS.txt', readme);

  // Generate ZIP blob and trigger download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Gradeup_Image_MCQs_Bulk_Template.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
