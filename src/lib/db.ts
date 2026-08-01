import { Question, MockHistory, Template, OfficialPaperStyle, ExamPreset } from '../types';
import { INITIAL_QUESTIONS } from './sampleQuestions';

const DB_NAME = 'GradeupStudyDB';
const DB_VERSION = 2;

export const OFFICIAL_PAPER_STYLES: OfficialPaperStyle[] = [
  {
    id: 'ssc-cgl',
    name: 'SSC CGL / CHSL Official Standard',
    category: 'Staff Selection Commission',
    badge: 'Most Popular',
    primaryColor: '#1e3a8a',
    headerStyle: 'double-border',
    font: 'Times New Roman',
    numberingStyle: 'Q1.',
    optionStyle: '(A)',
    description: 'Classic double-bordered header with Candidate Roll Number grid, OMR instructions, and bilingual alignment.',
    instructions: '1. All questions are compulsory and carry equal marks.\n2. There is 0.50 negative marking for each incorrect response.\n3. Do not open the test booklet until instructed by the invigilator.',
    watermark: 'SSC MOCK TEST',
    setCode: 'SET A'
  },
  {
    id: 'upsc-civil',
    name: 'UPSC Civil Services / IAS Mains & Prelims',
    category: 'Union Public Service Commission',
    badge: 'Official',
    primaryColor: '#0f172a',
    headerStyle: 'thick-line',
    font: 'Georgia',
    numberingStyle: 'Q1.',
    optionStyle: '(A)',
    description: 'Formal serif typography with rubric guidelines, question paper code box, and strict negative marking notes.',
    instructions: '1. Immediately check that this test booklet does not have any unprinted or torn pages.\n2. You must enter your Roll Number in the box provided above.\n3. Penalty for wrong answers: 0.33 marks per incorrect attempt.',
    watermark: 'UPSC CIVIL SERVICES',
    setCode: 'BOOKLET SERIES A'
  },
  {
    id: 'nta-jee',
    name: 'NTA JEE Main & NEET Official Standard',
    category: 'National Testing Agency',
    badge: 'Elite',
    primaryColor: '#0284c7',
    headerStyle: 'badge-style',
    font: 'Verdana',
    numberingStyle: '[1]',
    optionStyle: '(A)',
    description: 'Sans-serif entrance test simulation with numerical & MCQ sections, formula space header, and [1] numbering.',
    instructions: '1. Test paper contains Section A (MCQs) and Section B (Numerical values).\n2. Correct answer gives +4 marks; incorrect response deducts -1 mark.\n3. Use HB Pencil or Black Ballpoint Pen for OMR marking.',
    watermark: 'NTA ALL INDIA MOCK TEST',
    setCode: 'CODE 01'
  },
  {
    id: 'rrb-ntpc',
    name: 'RRB NTPC & Group D Railway Exam',
    category: 'Railway Recruitment Board',
    badge: 'Standard',
    primaryColor: '#047857',
    headerStyle: 'boxed',
    font: 'Arial',
    numberingStyle: '1.',
    optionStyle: 'A.',
    description: 'High-density grid layout with candidate instructions box, section badges, and clear option alignment.',
    instructions: '1. Total duration is 90 minutes for 100 questions.\n2. 1/3rd mark penalty for each wrong answer.\n3. Electronic devices and calculators are strictly prohibited in the exam hall.',
    watermark: 'INDIAN RAILWAYS RECRUITMENT',
    setCode: 'RAILWAY MOCK 01'
  },
  {
    id: 'ibps-po',
    name: 'IBPS PO & SBI Bank Officer Format',
    category: 'Banking & Financial Services',
    badge: 'Premium',
    primaryColor: '#4338ca',
    headerStyle: 'modern',
    font: 'Calibri',
    numberingStyle: 'Q1.',
    optionStyle: '(A)',
    description: 'Modern clean layout with timer badges, sectional demarcation, cut-off instructions, and crisp option styling.',
    instructions: '1. Sectional time limits apply strictly as per bank examination standards.\n2. Each correct answer carries 1 mark. Penalty for wrong answer is 0.25 marks.\n3. Read data interpretation tables carefully.',
    watermark: 'IBPS BANKING MOCK',
    setCode: 'PAPER SET 1'
  },
  {
    id: 'cbse-board',
    name: 'CBSE Class 10/12 Board Exam Pattern',
    category: 'School Education Board',
    badge: 'Official',
    primaryColor: '#b91c1c',
    headerStyle: 'double-border',
    font: 'Times New Roman',
    numberingStyle: 'Question 1.',
    optionStyle: '(A)',
    description: 'Board exam paper format with subject code box, maximum marks, series set, and official general guidelines.',
    instructions: '1. 15 minutes reading time allotted prior to writing.\n2. The question paper is divided into Sections A, B, C, and D.\n3. All questions are compulsory.',
    watermark: 'CBSE BOARD MOCK PAPER',
    setCode: 'SET NO. 4'
  },
  {
    id: 'uppsc-pcs',
    name: 'State PCS (UPPSC / BPSC / MPPSC) Prelims',
    category: 'State Public Service Commission',
    badge: 'Advanced',
    primaryColor: '#9a3412',
    headerStyle: 'patriotic',
    font: 'Times New Roman',
    numberingStyle: 'Q1.',
    optionStyle: '①',
    description: 'Traditional state public service exam format with Series Set (A/B/C/D), bilingual headings, and circled option numbers.',
    instructions: '1. State Public Service Commission General Studies Paper I.\n2. Bilingual Question paper (English & Hindi).\n3. Fill candidate details neatly in OMR response sheet.',
    watermark: 'STATE PUBLIC SERVICE COMMISSION',
    setCode: 'SERIES B'
  },
  {
    id: 'upsc-cds',
    name: 'CDS & NDA Defense Services Exam',
    category: 'Armed Forces Recruitment',
    badge: 'Official',
    primaryColor: '#365314',
    headerStyle: 'thick-line',
    font: 'Georgia',
    numberingStyle: '1.',
    optionStyle: '(A)',
    description: 'Military academy standard layout with strict instructions, negative marking rules, and invigilator signature area.',
    instructions: '1. Test Booklet Series "A". Check for any printing defects before starting.\n2. Penalty for wrong answers: 0.33 marks per incorrect attempt.\n3. Write Roll Number strictly as printed on Admit Card.',
    watermark: 'ARMED FORCES RECRUITMENT',
    setCode: 'BOOKLET A'
  },
  {
    id: 'ctet-teaching',
    name: 'CTET & State Teacher Eligibility (TET)',
    category: 'Teaching & Education Exams',
    badge: 'New',
    primaryColor: '#7c3aed',
    headerStyle: 'clean',
    font: 'Arial',
    numberingStyle: 'Q1.',
    optionStyle: '(A)',
    description: 'Pedagogy & subject paper format with clear section dividers, option bubbles, and candidate details line.',
    instructions: '1. Pedagogy, Child Development & Subject Competency Paper.\n2. No negative marking for wrong answers.\n3. Choose one correct option out of four choices.',
    watermark: 'CTET TEACHER MOCK TEST',
    setCode: 'CODE T-1'
  },
  {
    id: 'gate-exam',
    name: 'GATE & IIT Graduate Aptitude Test',
    category: 'Engineering & Post Graduate',
    badge: 'Pro',
    primaryColor: '#0f766e',
    headerStyle: 'boxed',
    font: 'Calibri',
    numberingStyle: '[1]',
    optionStyle: 'A.',
    description: 'Standard Graduate Aptitude Test format with MCQ/NAT section breakdown, scientific notation, and clear option labels.',
    instructions: '1. Questions carry either 1 mark or 2 marks.\n2. 1-mark MCQs deduct 1/3 mark; 2-mark MCQs deduct 2/3 mark for incorrect attempts.\n3. Numerical Answer Type (NAT) questions carry no negative marking.',
    watermark: 'GATE GRADUATE TEST',
    setCode: 'PAPER CODE EC'
  },
  {
    id: 'coaching-pro',
    name: 'Coaching Institute Ultra Premium Series',
    category: 'Institute Test Series',
    badge: 'Pro',
    primaryColor: '#2563eb',
    headerStyle: 'banner',
    font: 'Arial',
    numberingStyle: 'Q1.',
    optionStyle: '(A)',
    description: 'High-impact branded header with logo container, contact hotline space, watermarked canvas, and rank predictor styling.',
    instructions: '1. All India Rank Predictor Mock Test Series.\n2. Marking Scheme: +4 for Correct Response, -1 for Incorrect Response.\n3. Detailed explanations available on Student Portal immediately after test completion.',
    watermark: 'GRADEUP STUDY ACADEMY',
    setCode: 'ALL INDIA MOCK 01'
  },
  {
    id: 'academic-term',
    name: 'School & College Academic Term Exam',
    category: 'Academic Institutions',
    badge: 'Standard',
    primaryColor: '#475569',
    headerStyle: 'single-line',
    font: 'Times New Roman',
    numberingStyle: '1.',
    optionStyle: '(A)',
    description: 'Clean academic terminal exam paper with Date/Grade/Parent signature fields and concise header.',
    instructions: '1. Terminal Examination - Write answers legibly.\n2. Maximum Marks: 80 | Time Allowed: 3 Hours.\n3. Figures to the right indicate full marks.',
    watermark: 'ACADEMIC TERMINAL EXAM',
    setCode: 'TERM I'
  },
  {
    id: 'olympiad-sof',
    name: 'Science & Math Olympiad (SOF / NTSE)',
    category: 'Olympiads & Scholarships',
    badge: 'Elite',
    primaryColor: '#d97706',
    headerStyle: 'bordered-box',
    font: 'Verdana',
    numberingStyle: 'Q1.',
    optionStyle: '①',
    description: 'National talent search paper styling with Achievers section markers, circled options, and high-contrast header.',
    instructions: '1. Section 1: Logical Reasoning | Section 2: Mathematical Reasoning | Section 3: Achievers Section.\n2. Achievers Section questions carry 3 marks each.\n3. No negative marking.',
    watermark: 'NATIONAL OLYMPIAD MOCK',
    setCode: 'SET 1'
  },
  {
    id: 'police-constable',
    name: 'Police Constable & SI Recruitment Test',
    category: 'Uniformed Services',
    badge: 'New',
    primaryColor: '#1e293b',
    headerStyle: 'patriotic',
    font: 'Times New Roman',
    numberingStyle: 'Q1.',
    optionStyle: '(A)',
    description: 'State police recruitment format with bilingual support, candidate Roll No grid, and OMR shading guide.',
    instructions: '1. State Police Sub-Inspector / Constable Recruitment Examination.\n2. Candidates must shade circles completely on OMR Response Sheet.\n3. Maintain complete silence in the examination hall.',
    watermark: 'POLICE RECRUITMENT BOARD',
    setCode: 'SET C'
  },
  {
    id: 'university-degree',
    name: 'University End-Semester Degree Exam',
    category: 'Higher Education',
    badge: 'Standard',
    primaryColor: '#111827',
    headerStyle: 'thick-line',
    font: 'Georgia',
    numberingStyle: 'Question 1.',
    optionStyle: 'A.',
    description: 'Traditional university degree paper format with course code, semester title, and structured section sub-headings.',
    instructions: '1. University End-Semester Examination.\n2. Part A contains compulsory Multiple Choice Questions.\n3. Answer all questions in order.',
    watermark: 'UNIVERSITY END SEMESTER',
    setCode: 'COURSE CODE 101'
  },
  {
    id: 'express-quiz',
    name: 'Daily Express Classroom Quiz / Speed Test',
    category: 'Quick Assessment',
    badge: 'New',
    primaryColor: '#059669',
    headerStyle: 'clean',
    font: 'Calibri',
    numberingStyle: '1.',
    optionStyle: '(A)',
    description: 'Space-saving compact header layout designed for daily 10-20 question speed quizzes and direct single-page print.',
    instructions: '1. Quick 15-minute diagnostic speed quiz.\n2. Mark answers directly on paper.\n3. Total Questions: 20 | Total Marks: 20.',
    watermark: 'DAILY QUIZ TEST',
    setCode: 'QUIZ #01'
  }
];

export const DEFAULT_TEMPLATE: Template = {
  id: 1,
  name: 'Gradeup Study Default Template',
  isDefault: true,
  isLocked: false,
  styleId: 'ssc-cgl',
  header: {
    instituteName: 'GRADEUP STUDY ACADEMY',
    examName: 'ALL INDIA COMPETITIVE MOCK TEST 2026',
    testName: 'General Intelligence & Aptitude Series - Model Paper 01',
    logoText: 'GRADEUP STUDY',
    logoPos: 'top-left',
    logoSize: 'medium',
    headerStyle: 'double-border',
    font: 'Times New Roman',
    fontSize: 11,
    showDate: true,
    showRollNo: true,
    watermark: 'GRADEUP STUDY MOCK TEST',
    instructions: '1. All questions are compulsory and carry equal marks.\n2. There is 0.25 negative marking for each wrong answer.\n3. Read each question carefully before selecting your answer.',
    footer: 'Gradeup Study - Quality Preparation for Competitive Exams'
  },
  qStyle: {
    numberingStyle: 'Q1.',
    optionStyle: '(A)'
  },
  page: {
    pageSize: 'A4',
    margin: 'normal'
  }
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('questions')) {
        const qStore = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
        qStore.createIndex('subject', 'subject', { unique: false });
        qStore.createIndex('chapter', 'chapter', { unique: false });
        qStore.createIndex('difficulty', 'difficulty', { unique: false });
        qStore.createIndex('questionStatus', 'questionStatus', { unique: false });
      }

      if (!db.objectStoreNames.contains('mockHistory')) {
        const mStore = db.createObjectStore('mockHistory', { keyPath: 'id', autoIncrement: true });
        mStore.createIndex('mockId', 'mockId', { unique: true });
      }

      if (!db.objectStoreNames.contains('templates')) {
        db.createObjectStore('templates', { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains('examPresets')) {
        db.createObjectStore('examPresets', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export const DEFAULT_EXAM_PRESETS: Omit<ExamPreset, 'id'>[] = [
  {
    presetName: 'HP Home Guard Blueprint',
    examName: 'HP Home Guard Exam',
    totalMarks: 50,
    duration: 60,
    sections: [
      { id: 'sec_hg_1', subject: 'General Knowledge', questionCount: 20, chapterDistribution: {} },
      { id: 'sec_hg_2', subject: 'Hindi Language', questionCount: 15, chapterDistribution: {} },
      { id: 'sec_hg_3', subject: 'English Language', questionCount: 15, chapterDistribution: {} }
    ],
    excludeLastN: 3,
    uniqueThreshold: 85,
    irtProfile: 'balanced'
  },
  {
    presetName: 'SSC CGL Tier-1 Blueprint',
    examName: 'SSC CGL Examination',
    totalMarks: 200,
    duration: 60,
    sections: [
      { id: 'sec_cgl_1', subject: 'General Intelligence & Reasoning', questionCount: 25, chapterDistribution: {} },
      { id: 'sec_cgl_2', subject: 'General Awareness', questionCount: 25, chapterDistribution: {} },
      { id: 'sec_cgl_3', subject: 'Quantitative Aptitude', questionCount: 25, chapterDistribution: {} },
      { id: 'sec_cgl_4', subject: 'English Comprehension', questionCount: 25, chapterDistribution: {} }
    ],
    excludeLastN: 3,
    uniqueThreshold: 90,
    irtProfile: 'balanced'
  },
  {
    presetName: 'HP Police Constable Blueprint',
    examName: 'HP Police Constable Exam',
    totalMarks: 80,
    duration: 60,
    sections: [
      { id: 'sec_pc_1', subject: 'General Knowledge', questionCount: 25, chapterDistribution: {} },
      { id: 'sec_pc_2', subject: 'Mathematics & Reasoning', questionCount: 20, chapterDistribution: {} },
      { id: 'sec_pc_3', subject: 'Hindi Language', questionCount: 15, chapterDistribution: {} },
      { id: 'sec_pc_4', subject: 'English Language', questionCount: 15, chapterDistribution: {} },
      { id: 'sec_pc_5', subject: 'General Science', questionCount: 5, chapterDistribution: {} }
    ],
    excludeLastN: 3,
    uniqueThreshold: 85,
    irtProfile: 'balanced'
  }
];

// Ensure database is initialized
export async function initDatabase(): Promise<void> {
  const db = await openDatabase();

  // One-time cleanup of pre-stored sample questions as requested by user
  const hasCleanedPrestored = localStorage.getItem('gradeup_prestored_cleaned_v2');
  if (!hasCleanedPrestored) {
    try {
      const txClear = db.transaction('questions', 'readwrite');
      const storeClear = txClear.objectStore('questions');
      storeClear.clear();
      localStorage.setItem('gradeup_prestored_cleaned_v2', 'true');
    } catch (e) {
      console.warn('Could not auto-clear pre-stored questions:', e);
    }
  }

  // Check templates count
  const txT = db.transaction('templates', 'readonly');
  const storeT = txT.objectStore('templates');
  const tCountReq = storeT.count();

  tCountReq.onsuccess = () => {
    if (tCountReq.result === 0) {
      const txAddT = db.transaction('templates', 'readwrite');
      const storeAddT = txAddT.objectStore('templates');
      storeAddT.add(DEFAULT_TEMPLATE);
    }
  };

  // Check examPresets count
  const txP = db.transaction('examPresets', 'readonly');
  const storeP = txP.objectStore('examPresets');
  const pCountReq = storeP.count();

  pCountReq.onsuccess = () => {
    if (pCountReq.result === 0) {
      const txAddP = db.transaction('examPresets', 'readwrite');
      const storeAddP = txAddP.objectStore('examPresets');
      DEFAULT_EXAM_PRESETS.forEach(p => {
        storeAddP.add({
          ...p,
          createdDate: new Date().toISOString(),
          updatedDate: new Date().toISOString()
        });
      });
    }
  };
}

// Questions API
export async function getAllQuestions(): Promise<Question[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readonly');
    const store = tx.objectStore('questions');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function addQuestion(q: Omit<Question, 'id'>): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    const request = store.add(q);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addQuestionsBatch(questions: Omit<Question, 'id'>[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    questions.forEach(q => store.add(q));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateQuestion(q: Question): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    const request = store.put(q);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function updateQuestionsBatch(questions: Question[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    questions.forEach(q => store.put(q));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteQuestion(id: number): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteQuestionsBatch(ids: number[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    ids.forEach(id => store.delete(id));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllQuestions(questions: Question[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    store.clear();
    questions.forEach(q => {
      if (q.id !== undefined && q.id !== null) {
        store.put(q);
      } else {
        const { id, ...qData } = q;
        store.add(qData);
      }
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllQuestions(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('questions', 'readwrite');
    const store = tx.objectStore('questions');
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Mock History API
export async function getAllMocks(): Promise<MockHistory[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mockHistory', 'readonly');
    const store = tx.objectStore('mockHistory');
    const request = store.getAll();

    request.onsuccess = () => resolve((request.result || []).sort((a, b) => b.mockId - a.mockId));
    request.onerror = () => reject(request.error);
  });
}

export async function addMock(mock: Omit<MockHistory, 'id'>): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mockHistory', 'readwrite');
    const store = tx.objectStore('mockHistory');
    const request = store.add(mock);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function addMocksBatch(mocks: MockHistory[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mockHistory', 'readwrite');
    const store = tx.objectStore('mockHistory');
    mocks.forEach(m => {
      const { id, ...mData } = m;
      store.put(mData);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllMocks(mocks: MockHistory[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mockHistory', 'readwrite');
    const store = tx.objectStore('mockHistory');
    store.clear();
    mocks.forEach(m => {
      const { id, ...mData } = m;
      store.put(mData);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteMock(id?: number, mockId?: number): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mockHistory', 'readwrite');
    const store = tx.objectStore('mockHistory');

    if (id !== undefined) {
      store.delete(id);
    }
    if (mockId !== undefined) {
      const index = store.index('mockId');
      const req = index.getKey(mockId);
      req.onsuccess = () => {
        if (req.result !== undefined) {
          store.delete(req.result);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Templates API
export async function getAllTemplates(): Promise<Template[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readonly');
    const store = tx.objectStore('templates');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTemplate(template: Template): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readwrite');
    const store = tx.objectStore('templates');
    const request = store.put(template);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readwrite');
    const store = tx.objectStore('templates');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Exam Presets / Blueprints API
export async function getAllExamPresets(): Promise<ExamPreset[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('examPresets', 'readwrite');
    const store = tx.objectStore('examPresets');
    const request = store.getAll();

    request.onsuccess = async () => {
      let result: ExamPreset[] = request.result || [];
      
      // If store is empty, seed defaults
      if (result.length === 0) {
        for (const p of DEFAULT_EXAM_PRESETS) {
          const toAdd = {
            ...p,
            createdDate: new Date().toISOString(),
            updatedDate: new Date().toISOString()
          };
          const addReq = store.add(toAdd);
          await new Promise(r => { addReq.onsuccess = r; addReq.onerror = r; });
        }
        // Refetch after seeding
        const refetchReq = store.getAll();
        refetchReq.onsuccess = () => resolve(refetchReq.result || []);
        refetchReq.onerror = () => resolve(DEFAULT_EXAM_PRESETS.map((p, i) => ({ ...p, id: i + 1 })));
        return;
      }

      // Ensure every preset has valid sections array
      const repaired = result.map(p => {
        if (!p.sections || !Array.isArray(p.sections) || p.sections.length === 0) {
          // Fallback sections based on preset name or exam name
          const matchDefault = DEFAULT_EXAM_PRESETS.find(d => d.presetName === p.presetName || d.examName === p.examName);
          return {
            ...p,
            sections: matchDefault?.sections || [
              { id: 'sec_gen_1', subject: 'General Knowledge', questionCount: 20, chapterDistribution: {} },
              { id: 'sec_gen_2', subject: 'Mathematics & Reasoning', questionCount: 15, chapterDistribution: {} }
            ]
          };
        }
        return p;
      });

      resolve(repaired);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveExamPreset(preset: ExamPreset): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('examPresets', 'readwrite');
    const store = tx.objectStore('examPresets');
    
    const toSave = {
      ...preset,
      updatedDate: new Date().toISOString(),
      createdDate: preset.createdDate || new Date().toISOString()
    };

    let request: IDBRequest;
    if (toSave.id !== undefined && toSave.id !== null) {
      request = store.put(toSave);
    } else {
      const { id, ...dataWithoutId } = toSave;
      request = store.add(dataWithoutId);
    }

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteExamPreset(id: number): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('examPresets', 'readwrite');
    const store = tx.objectStore('examPresets');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
