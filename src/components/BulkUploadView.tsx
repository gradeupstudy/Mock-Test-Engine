import React, { useState, useMemo } from 'react';
import { Question, AiConfig } from '../types';
import { callAiExplain, callAiGenerate, callAiClassify, callAiTranslateDualLanguage, callAiParseMcqText, getStoredAiConfig } from '../lib/aiClient';
import { sanitizeBilingualQuestionAndTranslation } from '../lib/exportUtils';
import { formatMathSymbols } from '../lib/mathUtils';
import { analyzeParsedDuplicates } from '../lib/duplicateUtils';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Trash2,
  RefreshCw,
  Download,
  ClipboardList,
  Plus,
  Edit3,
  Bot,
  Filter,
  Check,
  Zap,
  Languages,
  ArrowRight,
  CopyCheck,
  AlertTriangle,
  Layers,
  BookOpen,
  Loader2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

interface BulkUploadViewProps {
  onImportSuccess: (importedCount: number) => void;
  existingQuestions?: Question[];
  aiConfig?: AiConfig;
  geminiApiKey?: string;
}

interface ParsedRow {
  idTemp: number;
  subject: string;
  chapter: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: string;
  explanation?: string;
  difficulty: 'Easy' | 'Moderate' | 'Hard';
  isValid: boolean;
  validationErrors: string[];
}

export const BulkUploadView: React.FC<BulkUploadViewProps> = ({
  onImportSuccess,
  existingQuestions = [],
  aiConfig,
  geminiApiKey
}) => {
  // Tab State
  const [activeTab, setActiveTab] = useState<'file' | 'paste' | 'generator' | 'templates'>('file');

  // Parsed Questions List
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // Filter State for Parsed Table
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'invalid' | 'duplicates'>('all');

  // Pre-Import Duplicate MCQs Analysis
  const duplicateAnalysis = useMemo(() => {
    return analyzeParsedDuplicates(parsedRows, existingQuestions, 'strict');
  }, [parsedRows, existingQuestions]);

  // 1-Click Clean File Internal Duplicates (keeps 1 copy)
  const handleCleanInternalDuplicates = () => {
    if (duplicateAnalysis.internalDuplicateIds.size === 0) return;
    setParsedRows(prev => prev.filter(r => !duplicateAnalysis.internalDuplicateIds.has(r.idTemp)));
    setAiStatusMessage(`Cleaned ${duplicateAnalysis.internalDuplicateCount} duplicate MCQ copies from file (kept 1 original copy per question).`);
    setTimeout(() => setAiStatusMessage(null), 4000);
  };

  // 1-Click Clean Questions Already in Question Bank
  const handleCleanBankDuplicates = () => {
    if (duplicateAnalysis.bankDuplicateIds.size === 0) return;
    setParsedRows(prev => prev.filter(r => !duplicateAnalysis.bankDuplicateIds.has(r.idTemp)));
    setAiStatusMessage(`Excluded ${duplicateAnalysis.bankDuplicateCount} MCQs that are already present in your Question Bank.`);
    setTimeout(() => setAiStatusMessage(null), 4000);
  };

  // 1-Click Keep Only 100% Unique Fresh MCQs
  const handleCleanAllDuplicates = () => {
    setParsedRows(prev => prev.filter(r => 
      !duplicateAnalysis.internalDuplicateIds.has(r.idTemp) && 
      !duplicateAnalysis.bankDuplicateIds.has(r.idTemp)
    ));
    setAiStatusMessage(`Purged all duplicate MCQs! Now only 100% unique fresh MCQs remain.`);
    setTimeout(() => setAiStatusMessage(null), 4000);
  };

  // AI Classification, Explanation & Generation States
  const [isAiClassifying, setIsAiClassifying] = useState(false);
  const [isAiExplaining, setIsAiExplaining] = useState(false);
  const [isAiTranslating, setIsAiTranslating] = useState(false);
  const [isAiParsingText, setIsAiParsingText] = useState(false);
  const [autoExplainOnImport, setAutoExplainOnImport] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [processingSeconds, setProcessingSeconds] = useState<number>(0);

  const isAnyAiProcessing = isAiParsingText || isAiGenerating || isAiClassifying || isAiExplaining || isAiTranslating;

  React.useEffect(() => {
    let timer: any;
    if (isAnyAiProcessing) {
      setProcessingSeconds(0);
      timer = setInterval(() => {
        setProcessingSeconds(prev => +(prev + 0.1).toFixed(1));
      }, 100);
    } else {
      setProcessingSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isAnyAiProcessing]);

  // Paste Mode State (Subject & Chapter Manual Target Selection)
  const [pasteSubject, setPasteSubject] = useState<string>('');
  const [pasteChapter, setPasteChapter] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>(
    `Q1. Which gas is most abundant in the Earth's atmosphere?
A. Oxygen
B. Nitrogen
C. Carbon Dioxide
D. Hydrogen
Ans: B
Exp: Nitrogen makes up approximately 78% of the Earth's atmosphere by volume.

Q2. What is the value of 15% of 400?
A. 45
B. 50
C. 60
D. 75
Ans: C
Exp: 15% of 400 = (15 / 100) * 400 = 60.`
  );

  // Extract Pre-added Unique Subjects from Question Bank
  const existingSubjects = useMemo(() => {
    const map = new Map<string, string>();
    (existingQuestions || []).forEach(q => {
      if (q.subject && q.subject.trim()) {
        const trimmed = q.subject.trim();
        const lower = trimmed.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, trimmed);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [existingQuestions]);

  // Extract Pre-added Unique Chapters (filtered by pasteSubject if set)
  const existingChapters = useMemo(() => {
    const map = new Map<string, string>();
    const pasteSubLower = pasteSubject.trim().toLowerCase();
    (existingQuestions || []).forEach(q => {
      const qSubLower = (q.subject || '').trim().toLowerCase();
      const matchesSub = !pasteSubLower || qSubLower === pasteSubLower;
      if (matchesSub && q.chapter && q.chapter.trim()) {
        const trimmed = q.chapter.trim();
        const lower = trimmed.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, trimmed);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [existingQuestions, pasteSubject]);

  // AI Generator Mode State
  const [genSubject, setGenSubject] = useState('Quantitative Aptitude');
  const [genChapter, setGenChapter] = useState('Percentage & Ratio');
  const [genCount, setGenCount] = useState<number>(10);
  const [genDifficulty, setGenDifficulty] = useState<'Easy' | 'Moderate' | 'Hard' | 'Mixed'>('Mixed');

  // Bulk Field Apply Modal / Bar
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkChapter, setBulkChapter] = useState('');

  // Row Inline Edit ID
  const [editingRowId, setEditingRowId] = useState<number | null>(null);

  // Validation function
  const validateRow = (row: Partial<ParsedRow>): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    if (!row.question || row.question.trim().length < 5) errors.push('Question text missing or too short');
    if (!row.optionA?.trim()) errors.push('Option A missing');
    if (!row.optionB?.trim()) errors.push('Option B missing');
    if (!row.optionC?.trim()) errors.push('Option C missing');
    if (!row.optionD?.trim()) errors.push('Option D missing');

    const ans = (row.answer || '').trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(ans)) errors.push('Answer must be A, B, C, or D');

    return { isValid: errors.length === 0, errors };
  };

  const processRawObjects = (
    rawObjects: any[],
    sourceName?: string,
    overrideSubject?: string,
    overrideChapter?: string
  ) => {
    if (sourceName) setFileName(sourceName);

    const baseBatchId = Date.now() + Math.floor(Math.random() * 100000);

    const processed: ParsedRow[] = rawObjects.map((obj, idx) => {
      const rowIdTemp = baseBatchId + idx;
      const findVal = (targets: string[]) => {
        // 1. Exact match on cleaned key
        for (const k of Object.keys(obj)) {
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (targets.some(t => cleanK === t)) {
            return String(obj[k] !== undefined && obj[k] !== null ? obj[k] : '').trim();
          }
        }
        // 2. Substring/prefix match for targets with length > 2
        for (const k of Object.keys(obj)) {
          const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (targets.some(t => t.length > 2 && (cleanK === t || cleanK.startsWith(t) || cleanK.includes(t)))) {
            return String(obj[k] !== undefined && obj[k] !== null ? obj[k] : '').trim();
          }
        }
        return '';
      };

      const extractedSub = findVal(['subject', 'category', 'topic', 'sub']);
      const extractedChap = findVal(['chaptername', 'chapter_name', 'chapter', 'unit', 'subtopic', 'chap']);

      const subject = (overrideSubject && overrideSubject.trim())
        ? overrideSubject.trim()
        : (extractedSub || 'General Knowledge');

      const chapter = (overrideChapter && overrideChapter.trim())
        ? overrideChapter.trim()
        : (extractedChap || 'General');
      const question = findVal(['question', 'stem', 'qtext', 'q_text', 'questiontext', 'q']);
      const optionA = findVal(['optiona', 'option_a', 'opta', 'opt1', 'option1', 'a']);
      const optionB = findVal(['optionb', 'option_b', 'optb', 'opt2', 'option2', 'b']);
      const optionC = findVal(['optionc', 'option_c', 'optc', 'opt3', 'option3', 'c']);
      const optionD = findVal(['optiond', 'option_d', 'optd', 'opt4', 'option4', 'd']);
      const explanation = findVal(['explanation', 'exp', 'solution', 'rationale', 'expl']);

      let answer = findVal(['answer', 'ans', 'correct', 'correctans', 'correctanswer', 'answerkey']).toUpperCase().trim();
      answer = answer.replace(/^OPTION\s*/i, '').replace(/[\(\)\[\]]/g, '').trim();
      const numToChar: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'क': 'A', 'ख': 'B', 'ग': 'C', 'घ': 'D' };
      if (numToChar[answer]) answer = numToChar[answer];
      if (answer.length > 1) answer = answer.charAt(0);

      const rawDiff = findVal(['difficulty', 'diff', 'level']);
      let difficulty: 'Easy' | 'Moderate' | 'Hard' = 'Moderate';
      if (rawDiff.toLowerCase().includes('easy')) difficulty = 'Easy';
      if (rawDiff.toLowerCase().includes('hard')) difficulty = 'Hard';

      const rowData: Partial<ParsedRow> = {
        idTemp: rowIdTemp,
        subject,
        chapter,
        question,
        optionA,
        optionB,
        optionC,
        optionD,
        answer,
        explanation,
        difficulty
      };

      const val = validateRow(rowData);

      return {
        idTemp: rowIdTemp,
        subject,
        chapter,
        question,
        optionA,
        optionB,
        optionC,
        optionD,
        answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A',
        explanation,
        difficulty,
        isValid: val.isValid,
        validationErrors: val.errors
      };
    });

    setParsedRows(prev => (prev.length > 0 ? [...prev, ...processed] : processed));
  };

  // Process File Object
  const processFile = async (file: File) => {
    if (!file) return;

    setIsParsing(true);
    setAiStatusMessage(null);

    const fileExt = file.name.split('.').pop()?.toLowerCase();

    try {
      if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          alert('The uploaded file contains no sheets.');
          return;
        }
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
        if (jsonRows.length === 0) {
          alert('No data rows found in the sheet.');
          return;
        }
        processRawObjects(jsonRows, file.name);
      } else if (fileExt === 'docx' || fileExt === 'doc') {
        const arrayBuffer = await file.arrayBuffer();
        let text = '';
        try {
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value || '';
        } catch (e) {
          // Mammoth failed (e.g. .doc HTML or binary file)
        }

        if (!text.trim()) {
          text = await file.text();
        }

        if (text.trim()) {
          parseTextBlocks(text, file.name);
        } else {
          alert('Could not extract text from document. Please ensure it is not empty.');
        }
      } else if (fileExt === 'txt' || fileExt === 'json' || fileExt === 'tsv') {
        const text = await file.text();
        parseTextBlocks(text, file.name);
      } else {
        try {
          const text = await file.text();
          parseTextBlocks(text, file.name);
        } catch (err) {
          alert(`Unsupported file format: .${fileExt}`);
        }
      }
    } catch (err: any) {
      console.error('File reading error:', err);
      alert(`Error reading file "${file.name}": ${err.message || 'Unknown error'}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Handle File Upload Input Change
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = ''; // Reset input value so same file can be uploaded again
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Smart Text Blocks Parser (for DOCX, TXT, Pasted Text, HTML Tables)
  const parseTextBlocks = (
    text: string, 
    sourceName: string = 'Pasted / Text Content',
    customSubject?: string,
    customChapter?: string
  ) => {
    const targetSub = customSubject || pasteSubject;
    const targetChap = customChapter || pasteChapter;

    // Check if text contains HTML table (e.g. from Word .doc template)
    if (text.includes('<table') || text.includes('<TABLE')) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const table = doc.querySelector('table');
        if (table) {
          const rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length > 1) {
            const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(cell => cell.textContent?.trim() || '');
            const dataRows: any[] = [];
            for (let i = 1; i < rows.length; i++) {
              const cells = Array.from(rows[i].querySelectorAll('td, th')).map(cell => cell.textContent?.trim() || '');
              if (cells.length > 0) {
                const rowObj: Record<string, string> = {};
                headerCells.forEach((h, idx) => {
                  if (h) rowObj[h] = cells[idx] || '';
                });
                if (Object.keys(rowObj).length > 0) {
                  dataRows.push(rowObj);
                }
              }
            }
            if (dataRows.length > 0) {
              processRawObjects(dataRows, sourceName, targetSub, targetChap);
              return;
            }
          }
        }
      } catch (err) {
        console.error('HTML table parse error:', err);
      }
    }

    // Check if it's JSON
    if (text.trim().startsWith('[') && text.trim().endsWith(']')) {
      try {
        const jsonArr = JSON.parse(text);
        if (Array.isArray(jsonArr)) {
          processRawObjects(jsonArr, sourceName, targetSub, targetChap);
          return;
        }
      } catch (e) {
        // Not valid JSON, continue to text parsing
      }
    }

    const parsedQs: any[] = [];
    const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // 1. Check for tabular data (tab-separated, pipe-separated, or comma-separated with header)
    if (rawLines.length > 1) {
      const headerLine = rawLines[0];
      const delim = headerLine.includes('\t') ? '\t' : headerLine.includes('|') ? '|' : headerLine.includes(',') ? ',' : null;

      if (delim) {
        const headers = headerLine.split(delim).map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        const hasQuestionCol = headers.some(h => h.includes('question') || h.includes('qtext') || h.includes('stem'));

        if (hasQuestionCol) {
          const findIndex = (keys: string[]) => {
            let idx = headers.findIndex(h => keys.some(k => h === k));
            if (idx !== -1) return idx;
            return headers.findIndex(h => keys.some(k => k.length > 2 && (h.startsWith(k) || h.includes(k))));
          };

          const subIdx = findIndex(['subject', 'category', 'topic']);
          const chapIdx = findIndex(['chaptername', 'chapter_name', 'chapter', 'unit', 'subtopic']);
          const qIdx = findIndex(['question', 'stem', 'qtext']);
          const opAIdx = findIndex(['optiona', 'option_a', 'opta', 'opt1', 'a']);
          const opBIdx = findIndex(['optionb', 'option_b', 'optb', 'opt2', 'b']);
          const opCIdx = findIndex(['optionc', 'option_c', 'optc', 'opt3', 'c']);
          const opDIdx = findIndex(['optiond', 'option_d', 'optd', 'opt4', 'd']);
          const ansIdx = findIndex(['answer', 'ans', 'correct']);
          const expIdx = findIndex(['explanation', 'exp', 'solution']);

          if (qIdx !== -1) {
            for (let i = 1; i < rawLines.length; i++) {
              const rowParts = rawLines[i].split(delim).map(s => s.trim());
              if (rowParts.length >= 3 && rowParts[qIdx]) {
                parsedQs.push({
                  subject: subIdx !== -1 ? rowParts[subIdx] || 'General' : 'General',
                  chapter: chapIdx !== -1 ? rowParts[chapIdx] || 'General' : 'General',
                  question: rowParts[qIdx],
                  optionA: opAIdx !== -1 ? rowParts[opAIdx] || '' : rowParts[qIdx + 1] || '',
                  optionB: opBIdx !== -1 ? rowParts[opBIdx] || '' : rowParts[qIdx + 2] || '',
                  optionC: opCIdx !== -1 ? rowParts[opCIdx] || '' : rowParts[qIdx + 3] || '',
                  optionD: opDIdx !== -1 ? rowParts[opDIdx] || '' : rowParts[qIdx + 4] || '',
                  answer: ansIdx !== -1 ? rowParts[ansIdx] || 'A' : 'A',
                  explanation: expIdx !== -1 ? rowParts[expIdx] || '' : ''
                });
              }
            }
          }
        }
      }
    }

    if (parsedQs.length > 0) {
      processRawObjects(parsedQs, sourceName, targetSub, targetChap);
      return;
    }

    // 2. Advanced Multi-format Text Line & Block Parser
    // Pre-process: split inline option markers like "(A) 5/8 (B) 0.625 (C) √7 (D) 3" or "[A] 5/8 [B] 0.625"
    let cleanText = text.replace(/\r\n/g, '\n');
    // Split inline options like "(A)" / "(1)" / "(क)" or "[A]" / "[1]" or "Option A"
    cleanText = cleanText.replace(
      /(\s+)(?=\([a-d1-4क-घ]\)|\[[a-d1-4क-घ]\]|\bOption\s*[\(]?[a-d1-4क-घ][\)]?)/gi,
      '\n'
    );
    // Split inline options like "A) 5/8  B) 0.625  C) √7  D) 3" if separated by 2+ spaces or tab
    cleanText = cleanText.replace(
      /(\s{2,}|\t)(?=[a-d1-4क-घ][\.:\)-]\s+)/gi,
      '\n'
    );

    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

    let currentQ: any = null;
    let lastField: 'question' | 'optionA' | 'optionB' | 'optionC' | 'optionD' | 'explanation' | null = null;

    const finalizeQ = () => {
      if (currentQ && (currentQ.question || currentQ.optionA)) {
        parsedQs.push({ ...currentQ });
        currentQ = null;
        lastField = null;
      }
    };

    const getOptionInfo = (lineStr: string) => {
      const l = lineStr.trim();
      // Option A
      let m = l.match(/^(\(\s*a\s*\)|\[\s*a\s*\]|\boption\s*\(?\s*a\s*\)?|\ba\s*[\.:\)-]|\(1\)|\[1\]|1\s*[\.:\)-]|\(क\)|\[क\]|क\s*[\.:\)-])\s*(.*)/i);
      if (m) return { key: 'optionA' as const, val: m[2].trim() };

      // Option B
      m = l.match(/^(\(\s*b\s*\)|\[\s*b\s*\]|\boption\s*\(?\s*b\s*\)?|\bb\s*[\.:\)-]|\(2\)|\[2\]|2\s*[\.:\)-]|\(ख\)|\[ख\]|ख\s*[\.:\)-])\s*(.*)/i);
      if (m) return { key: 'optionB' as const, val: m[2].trim() };

      // Option C
      m = l.match(/^(\(\s*c\s*\)|\[\s*c\s*\]|\boption\s*\(?\s*c\s*\)?|\bc\s*[\.:\)-]|\(3\)|\[3\]|3\s*[\.:\)-]|\(ग\)|\[ग\]|ग\s*[\.:\)-])\s*(.*)/i);
      if (m) return { key: 'optionC' as const, val: m[2].trim() };

      // Option D
      m = l.match(/^(\(\s*d\s*\)|\[\s*d\s*\]|\boption\s*\(?\s*d\s*\)?|\bd\s*[\.:\)-]|\(4\)|\[4\]|4\s*[\.:\)-]|\(घ\)|\[घ\]|घ\s*[\.:\)-])\s*(.*)/i);
      if (m) return { key: 'optionD' as const, val: m[2].trim() };

      return null;
    };

    lines.forEach(line => {
      // 1. Check Answer FIRST (Ans:, Correct:, Answer:, उत्तर:, AnsKey:)
      const ansMatch = line.match(/^(Ans(wer)?|Correct(\s*Answer)?|उत्तर|AnsKey)[:.-]?\s*[\(\[]?\s*([a-d1-4क-घ])\s*[\)\]]?/i);
      if (ansMatch) {
        if (!currentQ) {
          currentQ = { subject: 'General Knowledge', chapter: 'General', question: '' };
        }
        const rawA = ansMatch[4].toUpperCase();
        const charMap: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', 'क': 'A', 'ख': 'B', 'ग': 'C', 'घ': 'D' };
        currentQ.answer = charMap[rawA] || rawA;
        return;
      }

      // 2. Check Explanation FIRST (Exp:, Explanation:, Solution:, Sol:, व्याख्या:, हल:)
      const expMatch = line.match(/^(Exp(lanation)?|Solution|Sol|व्याख्या|हल)[:.-]?\s*(.*)/i);
      if (expMatch) {
        if (!currentQ) {
          currentQ = { subject: 'General Knowledge', chapter: 'General', question: '' };
        }
        currentQ.explanation = expMatch[3].trim();
        lastField = 'explanation';
        return;
      }

      // 3. Check Subject FIRST (Subject:, Category:, Topic:, विषय:)
      const subMatch = line.match(/^(Subject|Category|Topic|विषय)[:.-]?\s*(.*)/i);
      if (subMatch) {
        if (!currentQ) currentQ = { subject: 'General Knowledge', chapter: 'General', question: '' };
        currentQ.subject = subMatch[2].trim() || 'General Knowledge';
        return;
      }

      // 4. Check Chapter FIRST (Chapter:, Chapter_Name:, Unit:, Subtopic:, अध्याय:)
      const chapMatch = line.match(/^(Chapter(_Name)?|Unit|Subtopic|अध्याय)[:.-]?\s*(.*)/i);
      if (chapMatch) {
        if (!currentQ) currentQ = { subject: 'General Knowledge', chapter: 'General', question: '' };
        currentQ.chapter = chapMatch[3].trim() || 'General';
        return;
      }

      // 5. Is Question Start? e.g. Q1., Q200., Question 1:, Prashn 1:, प्रश्न 1.
      const isExplicitQ = /^(Q\d*|Question\s*\d*|Prashn\s*\d*|प्रश्न\s*\d*)[\.\:-]?\s+/i.test(line);
      const isNumberQ = /^\d+[\.\:-]\s+/i.test(line) && (!currentQ || currentQ.optionA || currentQ.answer);

      if (isExplicitQ || isNumberQ) {
        finalizeQ();
        const stemText = line.replace(/^(Q\d*|Question\s*\d*|Prashn\s*\d*|प्रश्न\s*\d*|\d+)[\.\:-]?\s*/i, '').trim();
        currentQ = {
          subject: 'General Knowledge',
          chapter: 'General',
          question: stemText
        };
        lastField = 'question';
        return;
      }

      // 6. Check Option (A, B, C, D / 1, 2, 3, 4 / क, ख, ग, घ)
      const optInfo = getOptionInfo(line);
      if (optInfo) {
        if (!currentQ) {
          currentQ = { subject: 'General Knowledge', chapter: 'General', question: '' };
        }
        currentQ[optInfo.key] = optInfo.val;
        lastField = optInfo.key;
        return;
      }

      // 7. Unrecognized line: Append to current question stem or explanation
      if (currentQ) {
        if (!currentQ.optionA && lastField === 'question') {
          currentQ.question = currentQ.question ? `${currentQ.question}\n${line}` : line;
        } else if (lastField === 'explanation' && currentQ.explanation) {
          currentQ.explanation = `${currentQ.explanation}\n${line}`;
        } else if (!currentQ.question) {
          currentQ.question = line;
          lastField = 'question';
        }
      } else {
        currentQ = { subject: 'General Knowledge', chapter: 'General', question: line };
        lastField = 'question';
      }
    });

    finalizeQ();

    if (parsedQs.length === 0) {
      // Try CSV parser fallback
      const csvLines = text.split('\n').filter(l => l.includes(','));
      csvLines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 6) {
          parsedQs.push({
            question: parts[0],
            optionA: parts[1],
            optionB: parts[2],
            optionC: parts[3],
            optionD: parts[4],
            answer: parts[5],
            subject: parts[6] || 'General Knowledge',
            chapter: parts[7] || 'General',
            explanation: parts[8] || ''
          });
        }
      });
    }

    if (parsedQs.length > 0) {
      processRawObjects(parsedQs, sourceName, targetSub, targetChap);
    } else {
      alert('Could not auto-detect MCQs in the provided text. Please check the format guidelines.');
    }
  };

  const activeAiConfig = aiConfig || getStoredAiConfig();

  // Smart AI Auto-Parse Raw Text with Gemini
  const handleAiParseText = async () => {
    if (!pastedText || !pastedText.trim()) {
      alert('Please paste raw question text in the box first.');
      return;
    }

    setIsAiParsingText(true);
    setAiStatusMessage('AI is analyzing and auto-structuring your raw question text...');

    try {
      const parsedAiQs = await callAiParseMcqText(pastedText, activeAiConfig);
      if (Array.isArray(parsedAiQs) && parsedAiQs.length > 0) {
        processRawObjects(parsedAiQs, 'AI Text Auto-Parse', pasteSubject, pasteChapter);
        setAiStatusMessage(`AI successfully extracted and structured ${parsedAiQs.length} MCQs!`);
      } else {
        alert('AI could not detect MCQs in the pasted text. Trying standard text parser...');
        parseTextBlocks(pastedText, 'Pasted Text', pasteSubject, pasteChapter);
      }
    } catch (err: any) {
      alert(`AI Parse Notice: ${err.message}\nFalling back to standard rule parser.`);
      parseTextBlocks(pastedText, 'Pasted Text', pasteSubject, pasteChapter);
    } finally {
      setIsAiParsingText(false);
    }
  };

  // Generate MCQs with AI
  const handleAiGenerate = async () => {
    setIsAiGenerating(true);
    setAiStatusMessage('Generating MCQs with AI...');

    try {
      const generatedQs = await callAiGenerate(
        genSubject,
        genChapter,
        genCount,
        genDifficulty,
        activeAiConfig
      );

      if (Array.isArray(generatedQs) && generatedQs.length > 0) {
        processRawObjects(generatedQs, `AI Generated (${genSubject} - ${genChapter})`);
        setAiStatusMessage(`Successfully generated ${generatedQs.length} high-quality MCQs!`);
      } else {
        setAiStatusMessage('Failed to generate MCQs with AI.');
      }
    } catch (err: any) {
      setAiStatusMessage(`AI Generation notice: ${err.message}`);
    } finally {
      setIsAiGenerating(false);
    }
  };

  // AI Classify Difficulty
  const handleAiClassifyAll = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) return;

    setIsAiClassifying(true);
    setAiStatusMessage('Classifying questions with AI...');

    try {
      const classifications = await callAiClassify(
        validRows.map(r => ({
          id: r.idTemp,
          subject: r.subject,
          chapter: r.chapter,
          question: r.question,
          optionA: r.optionA,
          optionB: r.optionB,
          optionC: r.optionC,
          optionD: r.optionD,
          answer: r.answer as any
        })),
        activeAiConfig
      );

      if (Array.isArray(classifications) && classifications.length > 0) {
        const diffMap = new Map<number, 'Easy' | 'Moderate' | 'Hard'>();
        classifications.forEach((item) => {
          const rowId = item.id !== undefined ? item.id : validRows[item.index]?.idTemp;
          if (rowId !== undefined) {
            diffMap.set(rowId, item.difficulty);
          }
        });

        setParsedRows(prev =>
          prev.map(r => {
            if (diffMap.has(r.idTemp)) {
              return { ...r, difficulty: diffMap.get(r.idTemp)! };
            }
            return r;
          })
        );
        setAiStatusMessage('AI Difficulty Classification Complete!');
      } else {
        setAiStatusMessage('Classification finished.');
      }
    } catch (err: any) {
      setAiStatusMessage(`AI service info: ${err.message}`);
    } finally {
      setIsAiClassifying(false);
    }
  };

  // AI Generate Explanations for questions
  const handleAiGenerateExplanations = async (targetRows?: ParsedRow[]) => {
    const rowsToExplain = targetRows || parsedRows.filter(r => r.isValid);
    if (rowsToExplain.length === 0) return;

    setIsAiExplaining(true);
    setAiStatusMessage('Generating AI Explanations for MCQs...');

    try {
      const explanations = await callAiExplain(
        rowsToExplain.map(r => ({
          idTemp: r.idTemp,
          subject: r.subject,
          chapter: r.chapter,
          question: r.question,
          optionA: r.optionA,
          optionB: r.optionB,
          optionC: r.optionC,
          optionD: r.optionD,
          answer: r.answer as any,
          explanation: r.explanation
        })),
        activeAiConfig
      );

      if (Array.isArray(explanations) && explanations.length > 0) {
        const expMap = new Map<number, string>();
        explanations.forEach((item) => {
          if (item.explanation) {
            const rowId = item.idTemp !== undefined ? item.idTemp : rowsToExplain[item.index]?.idTemp;
            if (rowId !== undefined) {
              expMap.set(rowId, item.explanation);
            }
          }
        });

        setParsedRows(prev =>
          prev.map(r => {
            if (expMap.has(r.idTemp)) {
              return { ...r, explanation: expMap.get(r.idTemp)! };
            }
            return r;
          })
        );
        setAiStatusMessage('AI Explanations successfully generated for all MCQs!');
        return expMap;
      } else {
        setAiStatusMessage('Explanations process completed.');
      }
    } catch (err: any) {
      setAiStatusMessage(`AI service info: ${err.message}`);
    } finally {
      setIsAiExplaining(false);
    }
  };

  // AI Dual Language Translator
  const handleAiTranslateDualLanguageAll = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) return;

    setIsAiTranslating(true);
    setAiStatusMessage('Converting all uploaded MCQs to Dual Language (English & Hindi)...');

    try {
      const results = await callAiTranslateDualLanguage(
        validRows.map(r => ({
          id: r.idTemp,
          subject: r.subject,
          chapter: r.chapter,
          question: r.question,
          optionA: r.optionA,
          optionB: r.optionB,
          optionC: r.optionC,
          optionD: r.optionD,
          explanation: r.explanation
        })),
        activeAiConfig
      );

      if (Array.isArray(results) && results.length > 0) {
        const transMap = new Map<number, typeof results[0]>();
        results.forEach(item => {
          const rowId = item.id !== undefined ? item.id : validRows[item.index]?.idTemp;
          if (rowId !== undefined) {
            transMap.set(rowId, item);
          }
        });

        setParsedRows(prev =>
          prev.map(r => {
            if (transMap.has(r.idTemp)) {
              const item = transMap.get(r.idTemp)!;
              const sanitized = sanitizeBilingualQuestionAndTranslation(
                item.question || r.question,
                item.translation || r.translation
              );
              return {
                ...r,
                question: sanitized.question,
                translation: sanitized.translation,
                optionA: item.optionA || r.optionA,
                optionB: item.optionB || r.optionB,
                optionC: item.optionC || r.optionC,
                optionD: item.optionD || r.optionD,
                explanation: item.explanation || r.explanation
              };
            }
            return r;
          })
        );
        setAiStatusMessage('Dual Language Conversion (English + Hindi) Completed Successfully!');
      }
    } catch (err: any) {
      setAiStatusMessage(`Dual Language AI Error: ${err.message}`);
    } finally {
      setIsAiTranslating(false);
    }
  };
  const downloadExcelTemplate = () => {
    const templateData = [
      {
        Subject: 'English',
        Chapter_Name: 'Pronoun',
        Question: 'Which of the following is a pronoun',
        Option_A: 'He',
        Option_B: 'Run',
        Option_C: 'Fast',
        Option_D: 'Table',
        Answer: 'A',
        Explanation: '\'He\' is a personal pronoun used in place of a noun.'
      },
      {
        Subject: 'English',
        Chapter_Name: 'Pronoun',
        Question: 'Identify the pronoun She is my friend.',
        Option_A: 'Friend',
        Option_B: 'My',
        Option_C: 'She',
        Option_D: 'Is',
        Answer: 'C',
        Explanation: '\'She\' is the subject pronoun in this sentence.'
      },
      {
        Subject: 'English',
        Chapter_Name: 'Pronoun',
        Question: 'Which is a possessive pronoun',
        Option_A: 'Him',
        Option_B: 'His',
        Option_C: 'He',
        Option_D: 'They',
        Answer: 'B',
        Explanation: '\'His\' indicates ownership and functions as a possessive pronoun.'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MCQ_Template');
    XLSX.writeFile(workbook, 'Gradeup_MCQ_Upload_Template.xlsx');
  };

  const downloadCsvTemplate = () => {
    const csvContent =
      'Subject,Chapter_Name,Question,Option_A,Option_B,Option_C,Option_D,Answer,Explanation\n' +
      'English,Pronoun,Which of the following is a pronoun,He,Run,Fast,Table,A,"\'He\' is a personal pronoun."\n' +
      'English,Pronoun,Identify the pronoun She is my friend.,Friend,My,She,Is,C,"\'She\' is the subject pronoun."\n' +
      'English,Pronoun,Which is a possessive pronoun,Him,His,He,They,B,"\'His\' shows possession."\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Gradeup_MCQ_Upload_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadWordTemplate = () => {
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Gradeup MCQ Upload Word Template</title>
        <style>
          body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.5; }
          h2 { color: #0d1233; font-size: 16pt; margin-bottom: 4px; }
          p { color: #64748b; font-size: 10pt; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 10pt; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; vertical-align: top; }
          th { background-color: #0d1233; color: #ffffff; font-weight: bold; text-transform: uppercase; font-size: 9pt; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .answer { font-weight: bold; color: #2563eb; text-align: center; }
        </style>
      </head>
      <body>
        <h2>Gradeup Study Platform - MCQ Bulk Upload Template</h2>
        <p>Edit or add your questions in the table below. Save as Word Document (.docx / .doc) or copy and paste into the platform.</p>
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Chapter_Name</th>
              <th>Question</th>
              <th>Option_A</th>
              <th>Option_B</th>
              <th>Option_C</th>
              <th>Option_D</th>
              <th>Answer</th>
              <th>Explanation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>English</td>
              <td>Pronoun</td>
              <td>Which of the following is a pronoun</td>
              <td>He</td>
              <td>Run</td>
              <td>Fast</td>
              <td>Table</td>
              <td class="answer">A</td>
              <td>'He' is a personal pronoun.</td>
            </tr>
            <tr>
              <td>English</td>
              <td>Pronoun</td>
              <td>Identify the pronoun She is my friend.</td>
              <td>Friend</td>
              <td>My</td>
              <td>She</td>
              <td>Is</td>
              <td class="answer">C</td>
              <td>'She' is the subject pronoun.</td>
            </tr>
            <tr>
              <td>English</td>
              <td>Pronoun</td>
              <td>Which is a possessive pronoun</td>
              <td>Him</td>
              <td>His</td>
              <td>He</td>
              <td>They</td>
              <td class="answer">B</td>
              <td>'His' shows possession.</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], {
      type: 'application/msword'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Gradeup_MCQ_Upload_Template.doc');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Batch Field Updates
  const applyBulkSubjectChapter = () => {
    if (!bulkSubject && !bulkChapter) return;

    setParsedRows(prev =>
      prev.map(r => {
        const updated = {
          ...r,
          subject: bulkSubject.trim() ? bulkSubject.trim() : r.subject,
          chapter: bulkChapter.trim() ? bulkChapter.trim() : r.chapter
        };
        const val = validateRow(updated);
        return { ...updated, isValid: val.isValid, validationErrors: val.errors };
      })
    );
    setBulkSubject('');
    setBulkChapter('');
  };

  // Inline Row Field Edit
  const updateRowField = (idTemp: number, field: keyof ParsedRow, val: any) => {
    setParsedRows(prev =>
      prev.map(r => {
        if (r.idTemp === idTemp) {
          const updated = { ...r, [field]: val };
          const validation = validateRow(updated);
          return { ...updated, isValid: validation.isValid, validationErrors: validation.errors };
        }
        return r;
      })
    );
  };

  const deleteRow = (idTemp: number) => {
    setParsedRows(prev => prev.filter(r => r.idTemp !== idTemp));
  };

  // Final Import Action
  const handleImportValid = async () => {
    let rowsToImport = [...parsedRows];
    
    // Auto-clean duplicates option if duplicates exist in staging area
    if (duplicateAnalysis.totalRedundantCount > 0) {
      const confirmClean = window.confirm(
        `We detected ${duplicateAnalysis.totalRedundantCount} duplicate MCQs in your staging area:\n` +
        (duplicateAnalysis.internalDuplicateCount > 0 ? `• ${duplicateAnalysis.internalDuplicateCount} file repeat copies\n` : '') +
        (duplicateAnalysis.bankDuplicateCount > 0 ? `• ${duplicateAnalysis.bankDuplicateCount} already exist in Question Bank\n` : '') +
        `\nClick OK to auto-clean duplicates and import only 100% unique MCQs (Recommended).\nClick Cancel to import all parsed rows as-is.`
      );

      if (confirmClean) {
        rowsToImport = rowsToImport.filter(r => 
          !duplicateAnalysis.internalDuplicateIds.has(r.idTemp) && 
          !duplicateAnalysis.bankDuplicateIds.has(r.idTemp)
        );
        setParsedRows(rowsToImport);
      }
    }

    let validRows = rowsToImport.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('No valid questions to import.');
      return;
    }

    // Auto-generate AI explanations for any rows missing explanations (or if autoExplain is checked)
    const missingExplanations = validRows.filter(r => !r.explanation || r.explanation.trim() === '');
    if (autoExplainOnImport && missingExplanations.length > 0) {
      setIsAiExplaining(true);
      const expMap = new Map<number, string>();
      const chunkSize = 15; // 15 MCQs per chunk for fast, non-blocking AI calls

      for (let i = 0; i < missingExplanations.length; i += chunkSize) {
        const chunk = missingExplanations.slice(i, i + chunkSize);
        setAiStatusMessage(`Auto-generating AI explanations (${Math.min(i + chunkSize, missingExplanations.length)}/${missingExplanations.length})...`);
        
        try {
          const chunkExplanations = await callAiExplain(
            chunk.map(r => ({
              idTemp: r.idTemp,
              subject: r.subject,
              chapter: r.chapter,
              question: r.question,
              optionA: r.optionA,
              optionB: r.optionB,
              optionC: r.optionC,
              optionD: r.optionD,
              answer: r.answer as any,
              explanation: r.explanation
            })),
            activeAiConfig
          );

          if (Array.isArray(chunkExplanations) && chunkExplanations.length > 0) {
            chunkExplanations.forEach((item: any) => {
              if (item.explanation) {
                const rowId = item.idTemp !== undefined ? item.idTemp : chunk[item.index]?.idTemp;
                if (rowId !== undefined) {
                  expMap.set(rowId, item.explanation);
                }
              }
            });
          }
        } catch (err) {
          console.warn('AI explanation chunk skipped/timed out:', err);
        }
      }

      validRows = validRows.map(r => ({
        ...r,
        explanation: (r.explanation && r.explanation.trim() !== '')
          ? r.explanation
          : (expMap.get(r.idTemp) || `Option ${r.answer} is the correct answer for this question.`)
      }));
      setIsAiExplaining(false);
    }

    const questionsToSave: Omit<Question, 'id'>[] = validRows.map(r => ({
      subject: r.subject || 'General',
      chapter: r.chapter || 'General',
      question: r.question,
      optionA: r.optionA,
      optionB: r.optionB,
      optionC: r.optionC,
      optionD: r.optionD,
      answer: (['A', 'B', 'C', 'D'].includes(r.answer.toUpperCase()) ? r.answer.toUpperCase() : 'A') as 'A' | 'B' | 'C' | 'D',
      explanation: r.explanation || `Option ${r.answer} is the correct answer.`,
      difficulty: r.difficulty || 'Moderate',
      usageCount: 0,
      questionStatus: 'Fresh',
      chapterCoverageScore: 8,
      createdDate: new Date().toISOString(),
      updatedDate: new Date().toISOString()
    }));

    const { addQuestionsBatch } = await import('../lib/db');
    const { removeQuestionsFromDeletedLog } = await import('../lib/mcqLogUtils');
    removeQuestionsFromDeletedLog(questionsToSave as Question[]);
    await addQuestionsBatch(questionsToSave);

    onImportSuccess(questionsToSave.length);
    setParsedRows([]);
    setFileName(null);
  };

  // Filtered Rows
  const filteredRows = parsedRows.filter(r => {
    if (filterStatus === 'valid') return r.isValid;
    if (filterStatus === 'invalid') return !r.isValid;
    if (filterStatus === 'duplicates') {
      return duplicateAnalysis.internalDuplicateIds.has(r.idTemp) || duplicateAnalysis.bankDuplicateIds.has(r.idTemp);
    }
    return true;
  });

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <UploadCloud className="w-6 h-6 text-blue-400" />
            <span>Bulk Upload MCQs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Seamlessly import or generate bulk MCQs from Excel, Word DOCX, CSV, Text, or AI Generator.
          </p>
        </div>

        {parsedRows.length > 0 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setParsedRows([]);
                setFileName(null);
              }}
              className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Upload</span>
            </button>
            <button
              onClick={handleImportValid}
              disabled={validCount === 0}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-lg hover:shadow-emerald-500/20 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Import {validCount} MCQs to Bank</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Upload Method Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('file')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'file'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>File Upload (Excel / Word / CSV)</span>
        </button>

        <button
          onClick={() => setActiveTab('paste')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'paste'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Paste Raw Text / JSON</span>
        </button>

        <button
          onClick={() => setActiveTab('generator')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'generator'
              ? 'bg-purple-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>AI MCQ Generator</span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'templates'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Sample Templates</span>
        </button>
      </div>

      {/* Tab 1: File Upload */}
      {activeTab === 'file' && (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-700 bg-slate-900/60 rounded-2xl p-8 text-center hover:border-blue-500/60 transition-all shadow-sm"
        >
          <div className="max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <UploadCloud className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">Select or Drag & Drop Question File</h3>
              <p className="text-xs text-slate-400 mt-1">
                Supports Excel (.xlsx, .xls), Word (.docx, .doc), CSV, and TXT files.
              </p>
            </div>

            <label className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-6 py-3 rounded-xl cursor-pointer shadow-lg hover:shadow-blue-500/20 transition-all">
              <UploadCloud className="w-4 h-4" />
              <span>Browse Computer Files</span>
              <input
                type="file"
                accept=".xlsx,.xls,.docx,.doc,.csv,.txt,.tsv,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {isParsing && (
              <div className="flex items-center justify-center space-x-2 text-xs text-blue-400 pt-2 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Parsing file contents and mapping columns...</span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs mb-1">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Excel / CSV Headers</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  subject, chapter, question, optionA, optionB, optionC, optionD, answer
                </p>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs mb-1">
                  <FileText className="w-4 h-4" />
                  <span>Word DOCX Format</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">
                  Q1. Question text, A. Option A, B. Option B, C. Option C, D. Option D, Ans: A
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Paste Raw Text */}
      {activeTab === 'paste' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <ClipboardList className="w-4 h-4 text-blue-400" />
                <span>Paste Raw Question Text / JSON / CSV</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Paste question papers copied from Word, PDF, or TXT directly into the box below.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => parseTextBlocks(pastedText, 'Pasted Text', pasteSubject, pasteChapter)}
                disabled={isAiParsingText}
                className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-md transition-all"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Standard Parse</span>
              </button>

              <button
                onClick={handleAiParseText}
                disabled={isAiParsingText}
                className="flex items-center space-x-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-md transition-all"
              >
                <Sparkles className={`w-4 h-4 text-amber-300 ${isAiParsingText ? 'animate-spin' : ''}`} />
                <span>{isAiParsingText ? 'AI Structuring...' : '✨ AI Auto-Parse (Gemini)'}</span>
              </button>
            </div>
          </div>

          {/* AI Parsing Progress Indicator Card (Operations > 2s) */}
          {isAiParsingText && (
            <div className="p-4 bg-gradient-to-r from-purple-950/90 via-slate-900 to-indigo-950/90 border border-purple-600/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in shadow-xl">
              <div className="flex items-center space-x-3.5">
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <div className="absolute w-8 h-8 rounded-full bg-purple-500/30 animate-ping" />
                  <Loader2 className="w-5 h-5 text-purple-300 animate-spin relative z-10" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                      ✨ Gemini AI Auto-Parsing & Structuring
                    </span>
                    <span className="text-[11px] font-mono font-bold bg-purple-950 text-purple-200 px-2 py-0.5 rounded-md border border-purple-700/60 shadow-inner">
                      ⏱️ {processingSeconds.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Analyzing options, answers, explanations & attaching Subject/Chapter...
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-48 space-y-1 flex-shrink-0">
                <div className="flex justify-between text-[10px] text-purple-300 font-semibold">
                  <span>Structuring Text...</span>
                  <span className="font-mono">Live AI</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-purple-800/60 p-0.5">
                  <div className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-full animate-pulse w-full" />
                </div>
              </div>
            </div>
          )}

          {/* Subject & Chapter Manual Selection Box */}
          <div className="p-4 bg-slate-950/80 border border-blue-900/40 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-blue-300 flex items-center space-x-1.5">
                <BookOpen className="w-4 h-4 text-blue-400" />
                <span>Assign Subject & Chapter to Pasted MCQs (Subject & Chapter सेट करें)</span>
              </span>
              <span className="text-[10px] text-slate-400">
                Choose from pre-added list or type a new name
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Subject Input / Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Subject (विषय)</span>
                  {pasteSubject && (
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Selected: {pasteSubject}</span>
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="paste-subjects-datalist"
                    value={pasteSubject}
                    onChange={e => setPasteSubject(e.target.value)}
                    placeholder="Select or Type Subject (e.g. Hindi Grammar, Science)..."
                    className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 text-white text-xs rounded-xl px-3 py-2 pr-8 focus:outline-none placeholder:text-slate-500 font-medium transition-colors"
                  />
                  <datalist id="paste-subjects-datalist">
                    {existingSubjects.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  {pasteSubject && (
                    <button
                      type="button"
                      onClick={() => setPasteSubject('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                      title="Clear Subject"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Pre-Added Subject Quick Selector */}
                {existingSubjects.length > 0 && (
                  <div className="flex items-center space-x-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 flex-shrink-0">Pre-added:</span>
                    <select
                      value={existingSubjects.includes(pasteSubject) ? pasteSubject : ''}
                      onChange={e => {
                        if (e.target.value) setPasteSubject(e.target.value);
                      }}
                      className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] rounded-md px-2 py-0.5 focus:outline-none focus:border-blue-500 w-full"
                    >
                      <option value="">-- Select Pre-added Subject --</option>
                      {existingSubjects.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Chapter Input / Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                  <span>Chapter / Topic (अध्याय)</span>
                  {pasteChapter && (
                    <span className="text-[10px] text-indigo-400 font-medium flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Selected: {pasteChapter}</span>
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="paste-chapters-datalist"
                    value={pasteChapter}
                    onChange={e => setPasteChapter(e.target.value)}
                    placeholder="Select or Type Chapter (e.g. वर्तनी एवं शब्द शुद्धि)..."
                    className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 text-white text-xs rounded-xl px-3 py-2 pr-8 focus:outline-none placeholder:text-slate-500 font-medium transition-colors"
                  />
                  <datalist id="paste-chapters-datalist">
                    {existingChapters.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  {pasteChapter && (
                    <button
                      type="button"
                      onClick={() => setPasteChapter('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                      title="Clear Chapter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Pre-Added Chapter Quick Selector */}
                {existingChapters.length > 0 && (
                  <div className="flex items-center space-x-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 flex-shrink-0">Pre-added:</span>
                    <select
                      value={existingChapters.includes(pasteChapter) ? pasteChapter : ''}
                      onChange={e => {
                        if (e.target.value) setPasteChapter(e.target.value);
                      }}
                      className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] rounded-md px-2 py-0.5 focus:outline-none focus:border-indigo-500 w-full"
                    >
                      <option value="">-- Select Pre-added Chapter --</option>
                      {existingChapters.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {(pasteSubject || pasteChapter) && (
              <p className="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-2 rounded-lg flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span>
                  All pasted questions will be automatically tagged with 
                  {pasteSubject ? <strong> Subject: "{pasteSubject}"</strong> : ''}
                  {pasteSubject && pasteChapter ? ' and ' : ''}
                  {pasteChapter ? <strong> Chapter: "{pasteChapter}"</strong> : ''}.
                </span>
              </p>
            )}
          </div>

          <textarea
            rows={10}
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Paste raw question text here..."
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded-xl p-3 focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* Tab 3: AI MCQ Generator */}
      {activeTab === 'generator' && (
        <div className="bg-slate-900 border border-purple-900/50 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Bot className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-sm font-bold text-white">AI Bulk Question Generator</h3>
              <p className="text-xs text-slate-400">
                Generate tailored MCQ sets automatically using Gemini AI.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Subject</label>
              <input
                type="text"
                value={genSubject}
                onChange={e => setGenSubject(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Chapter / Topic</label>
              <input
                type="text"
                value={genChapter}
                onChange={e => setGenChapter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Number of MCQs</label>
              <input
                type="number"
                min={1}
                max={30}
                value={genCount}
                onChange={e => setGenCount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1 font-medium">Difficulty Level</label>
              <select
                value={genDifficulty}
                onChange={e => setGenDifficulty(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-2 focus:outline-none focus:border-purple-500"
              >
                <option value="Mixed">Mixed (Easy/Mod/Hard)</option>
                <option value="Easy">Easy</option>
                <option value="Moderate">Moderate</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleAiGenerate}
              disabled={isAiGenerating}
              className="flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all"
            >
              <Sparkles className={`w-4 h-4 ${isAiGenerating ? 'animate-spin' : ''}`} />
              <span>{isAiGenerating ? 'Generating MCQs...' : 'Generate MCQs Now'}</span>
            </button>
          </div>

          {/* AI Generation Progress Indicator Card (Operations > 2s) */}
          {isAiGenerating && (
            <div className="p-4 bg-gradient-to-r from-purple-950/90 via-slate-900 to-indigo-950/90 border border-purple-600/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in shadow-xl">
              <div className="flex items-center space-x-3.5">
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <div className="absolute w-8 h-8 rounded-full bg-purple-500/30 animate-ping" />
                  <Loader2 className="w-5 h-5 text-purple-300 animate-spin relative z-10" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                      ✨ Gemini AI Bulk Question Generation Engine
                    </span>
                    <span className="text-[11px] font-mono font-bold bg-purple-950 text-purple-200 px-2 py-0.5 rounded-md border border-purple-700/60 shadow-inner">
                      ⏱️ {processingSeconds.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Synthesizing {genCount} high-quality MCQs for {genSubject || 'General Subject'} ({genChapter || 'General Chapter'})...
                  </p>
                </div>
              </div>

              <div className="w-full sm:w-48 space-y-1 flex-shrink-0">
                <div className="flex justify-between text-[10px] text-purple-300 font-semibold">
                  <span>Synthesizing MCQs...</span>
                  <span className="font-mono">Live AI</span>
                </div>
                <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-purple-800/60 p-0.5">
                  <div className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 rounded-full animate-pulse w-full" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Sample Templates Download */}
      {activeTab === 'templates' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Download className="w-4 h-4 text-blue-400" />
              <span>Download Ready-To-Use Bulk Upload Templates</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Download pre-formatted templates in Excel, Word DOCX, or CSV formats to quickly organize and upload questions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Excel Template */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 flex flex-col justify-between hover:border-emerald-500/40 transition-colors">
              <div className="space-y-2">
                <div className="flex items-center space-x-2.5 text-emerald-400 font-semibold text-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span>Microsoft Excel (.xlsx)</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Excel workbook pre-formatted with columns for Subject, Chapter_Name, Question, Options, Answer, and Explanation.
                </p>
              </div>
              <button
                onClick={downloadExcelTemplate}
                className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Excel (.xlsx)</span>
              </button>
            </div>

            {/* Word Template */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 flex flex-col justify-between hover:border-indigo-500/40 transition-colors">
              <div className="space-y-2">
                <div className="flex items-center space-x-2.5 text-indigo-400 font-semibold text-xs">
                  <FileText className="w-5 h-5" />
                  <span>Microsoft Word (.doc / .docx)</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Formatted Word document containing a structured table layout ready for editing in Word and bulk uploading.
                </p>
              </div>
              <button
                onClick={downloadWordTemplate}
                className="w-full flex items-center justify-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Word (.doc)</span>
              </button>
            </div>

            {/* CSV Template */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 flex flex-col justify-between hover:border-blue-500/40 transition-colors">
              <div className="space-y-2">
                <div className="flex items-center space-x-2.5 text-blue-400 font-semibold text-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                  <span>CSV File (.csv)</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Lightweight Comma Separated Values template compatible with Google Sheets, Excel, and text editors.
                </p>
              </div>
              <button
                onClick={downloadCsvTemplate}
                className="w-full flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download CSV (.csv)</span>
              </button>
            </div>
          </div>

          {/* Sample Format Table Preview */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">
                Sample Format Structure Preview:
              </span>
              <span className="text-[11px] text-slate-400">
                Headers: Subject | Chapter_Name | Question | Option_A | Option_B | Option_C | Option_D | Answer | Explanation
              </span>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 font-bold">
                  <tr>
                    <th className="p-2.5">Subject</th>
                    <th className="p-2.5">Chapter_Name</th>
                    <th className="p-2.5">Question</th>
                    <th className="p-2.5">Option_A</th>
                    <th className="p-2.5">Option_B</th>
                    <th className="p-2.5">Option_C</th>
                    <th className="p-2.5">Option_D</th>
                    <th className="p-2.5 text-center">Answer</th>
                    <th className="p-2.5">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-[11px]">
                  <tr className="hover:bg-slate-900/50">
                    <td className="p-2.5 text-blue-300 font-medium">English</td>
                    <td className="p-2.5 text-slate-300">Pronoun</td>
                    <td className="p-2.5 text-white font-medium">Which of the following is a pronoun</td>
                    <td className="p-2.5 text-slate-300">He</td>
                    <td className="p-2.5 text-slate-300">Run</td>
                    <td className="p-2.5 text-slate-300">Fast</td>
                    <td className="p-2.5 text-slate-300">Table</td>
                    <td className="p-2.5 text-center font-bold text-emerald-400">A</td>
                    <td className="p-2.5 text-slate-400 italic">'He' is a personal pronoun.</td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="p-2.5 text-blue-300 font-medium">English</td>
                    <td className="p-2.5 text-slate-300">Pronoun</td>
                    <td className="p-2.5 text-white font-medium">Identify the pronoun She is my friend.</td>
                    <td className="p-2.5 text-slate-300">Friend</td>
                    <td className="p-2.5 text-slate-300">My</td>
                    <td className="p-2.5 text-slate-300">She</td>
                    <td className="p-2.5 text-slate-300">Is</td>
                    <td className="p-2.5 text-center font-bold text-emerald-400">C</td>
                    <td className="p-2.5 text-slate-400 italic">'She' is the subject pronoun.</td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="p-2.5 text-blue-300 font-medium">English</td>
                    <td className="p-2.5 text-slate-300">Pronoun</td>
                    <td className="p-2.5 text-white font-medium">Which is a possessive pronoun</td>
                    <td className="p-2.5 text-slate-300">Him</td>
                    <td className="p-2.5 text-slate-300">His</td>
                    <td className="p-2.5 text-slate-300">He</td>
                    <td className="p-2.5 text-slate-300">They</td>
                    <td className="p-2.5 text-center font-bold text-emerald-400">B</td>
                    <td className="p-2.5 text-slate-400 italic">'His' shows possession.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Parsed / Staged MCQs Table & Controls */}
      {parsedRows.length > 0 && (
        <div className="space-y-4">
          {/* Action Bar & Stats */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-xs flex-wrap gap-y-1">
              <span className="text-slate-400">
                Source: <strong className="text-white">{fileName || 'Active Session'}</strong>
              </span>
              <span className="bg-slate-800 text-slate-200 px-2.5 py-1 rounded-full border border-slate-700 font-medium">
                Total: <strong>{parsedRows.length}</strong>
              </span>
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2.5 py-1 rounded-full font-medium">
                Valid: <strong>{validCount}</strong>
              </span>
              {invalidCount > 0 && (
                <span className="bg-rose-950 text-rose-400 border border-rose-800/60 px-2.5 py-1 rounded-full font-medium">
                  Invalid: <strong>{invalidCount}</strong>
                </span>
              )}
              {duplicateAnalysis.totalRedundantCount > 0 && (
                <span className="bg-amber-950/90 text-amber-300 border border-amber-600/60 px-2.5 py-1 rounded-full font-bold flex items-center space-x-1 animate-pulse">
                  <CopyCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Duplicates: {duplicateAnalysis.totalRedundantCount}</span>
                </span>
              )}
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1">
              <span className="text-slate-400 flex items-center space-x-1">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter:</span>
              </span>
              <button
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  filterStatus === 'all'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All ({parsedRows.length})
              </button>
              <button
                onClick={() => setFilterStatus('valid')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  filterStatus === 'valid'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Valid ({validCount})
              </button>
              <button
                onClick={() => setFilterStatus('invalid')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  filterStatus === 'invalid'
                    ? 'bg-rose-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Invalid ({invalidCount})
              </button>
              {duplicateAnalysis.totalRedundantCount > 0 && (
                <button
                  onClick={() => setFilterStatus('duplicates')}
                  className={`px-2.5 py-1 rounded-lg transition-colors flex items-center space-x-1 ${
                    filterStatus === 'duplicates'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:text-white'
                  }`}
                >
                  <CopyCheck className="w-3.5 h-3.5" />
                  <span>Duplicates ({duplicateAnalysis.totalRedundantCount})</span>
                </button>
              )}
            </div>

            {/* AI Classification, Explanations & Batch tools */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleAiGenerateExplanations()}
                disabled={isAiExplaining || validCount === 0}
                className="flex items-center space-x-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md border border-emerald-400/30"
                title="1-Click AI Generate Explanations for all uploaded MCQs"
              >
                <Sparkles className={`w-4 h-4 text-amber-300 ${isAiExplaining ? 'animate-spin' : ''}`} />
                <span>
                  {isAiExplaining
                    ? 'Generating Explanations...'
                    : `1-Click AI Generate Explanations (${parsedRows.filter(r => r.isValid && (!r.explanation || !r.explanation.trim())).length} missing)`}
                </span>
              </button>

              <button
                onClick={handleAiTranslateDualLanguageAll}
                disabled={isAiTranslating || validCount === 0}
                className="flex items-center space-x-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md border border-blue-400/30"
                title="1-Click Convert all MCQs to Dual Language (English + Hindi)"
              >
                <Languages className={`w-4 h-4 text-sky-200 ${isAiTranslating ? 'animate-spin' : ''}`} />
                <span>
                  {isAiTranslating ? 'Translating...' : '1-Click Dual Language (EN + HI)'}
                </span>
              </button>

              <button
                onClick={handleAiClassifyAll}
                disabled={isAiClassifying || validCount === 0}
                className="flex items-center space-x-1.5 bg-purple-900/80 hover:bg-purple-800 border border-purple-500/40 text-purple-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm"
              >
                <Sparkles className={`w-3.5 h-3.5 text-purple-300 ${isAiClassifying ? 'animate-spin' : ''}`} />
                <span>{isAiClassifying ? 'Classifying...' : 'AI Classify Difficulty'}</span>
              </button>

              <label className="flex items-center space-x-2 text-xs text-slate-300 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoExplainOnImport}
                  onChange={e => setAutoExplainOnImport(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                />
                <span>Auto-generate AI Explanations on Import</span>
              </label>
            </div>
          </div>

          {/* Bulk Subject / Chapter Modifier Bar */}
          <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-slate-400 font-medium">Batch Apply Subject/Chapter to All Rows:</span>
            <div className="flex items-center space-x-2 flex-1 max-w-lg">
              <input
                type="text"
                placeholder="Bulk Subject (e.g. History)"
                value={bulkSubject}
                onChange={e => setBulkSubject(e.target.value)}
                className="w-1/2 bg-slate-950 border border-slate-700 text-white rounded-lg p-1.5 focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Bulk Chapter (e.g. Modern India)"
                value={bulkChapter}
                onChange={e => setBulkChapter(e.target.value)}
                className="w-1/2 bg-slate-950 border border-slate-700 text-white rounded-lg p-1.5 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={applyBulkSubjectChapter}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
              >
                Apply to All
              </button>
            </div>
          </div>

          {aiStatusMessage && (
            <div className="p-3 bg-purple-950/60 border border-purple-800/50 rounded-xl text-xs text-purple-200 flex items-center justify-between">
              <span>{aiStatusMessage}</span>
            </div>
          )}

          {/* Pre-Import Duplicate Detection Analysis Banner */}
          {duplicateAnalysis.totalRedundantCount > 0 && (
            <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-rose-950/80 border border-amber-500/50 rounded-2xl p-4 space-y-3 shadow-xl">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/40 flex-shrink-0 mt-0.5 shadow-sm">
                    <CopyCheck className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-amber-200">
                        Pre-Import Duplicate MCQs Detected!
                      </h4>
                      <span className="bg-amber-500/30 text-amber-200 text-xs px-2.5 py-0.5 rounded-full border border-amber-500/50 font-bold font-mono">
                        {duplicateAnalysis.totalRedundantCount} Duplicates Total
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      We analyzed your parsed MCQs before import to prevent duplicate records in your Question Bank.
                      {duplicateAnalysis.internalDuplicateCount > 0 && (
                        <span className="inline-block mr-3 text-amber-300 font-semibold">
                          • {duplicateAnalysis.internalDuplicateCount} File Repeat Copies (MCQs repeated 2+ times in file)
                        </span>
                      )}
                      {duplicateAnalysis.bankDuplicateCount > 0 && (
                        <span className="inline-block text-purple-300 font-semibold">
                          • {duplicateAnalysis.bankDuplicateCount} Question Bank Collisions (Already exist in DB)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 flex-shrink-0 w-full lg:w-auto">
                  {duplicateAnalysis.internalDuplicateCount > 0 && (
                    <button
                      onClick={handleCleanInternalDuplicates}
                      className="px-3.5 py-2 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/50 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5"
                      title="Keep 1 copy per question and remove extra repeats from file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clean File Repeats ({duplicateAnalysis.internalDuplicateCount})</span>
                    </button>
                  )}

                  {duplicateAnalysis.bankDuplicateCount > 0 && (
                    <button
                      onClick={handleCleanBankDuplicates}
                      className="px-3.5 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/50 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5"
                      title="Exclude questions that are already in your Question Bank"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Exclude Bank Matches ({duplicateAnalysis.bankDuplicateCount})</span>
                    </button>
                  )}

                  <button
                    onClick={handleCleanAllDuplicates}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                    <span>1-Click Keep 100% Unique MCQs</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MCQs Table */}
          <div className="border border-slate-800 rounded-2xl overflow-x-auto bg-slate-900 shadow-md">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3">Subject / Chapter</th>
                  <th className="px-3 py-3">Question Stem</th>
                  <th className="px-3 py-3">Options (A, B, C, D)</th>
                  <th className="px-3 py-3 text-center">Correct</th>
                  <th className="px-3 py-3 text-center">Difficulty</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRows.map(row => {
                  const isEditing = editingRowId === row.idTemp;
                  const isInternalDup = duplicateAnalysis.internalDuplicateIds.has(row.idTemp);
                  const isBankDup = duplicateAnalysis.bankDuplicateIds.has(row.idTemp);
                  const repeatCount = duplicateAnalysis.repeatCounts.get(row.idTemp) || 1;
                  const bankMatchCount = duplicateAnalysis.bankMatchCountMap.get(row.idTemp) || 0;

                  return (
                    <tr
                      key={row.idTemp}
                      className={`hover:bg-slate-800/50 transition-colors ${
                        isInternalDup || isBankDup ? 'bg-amber-950/20' : !row.isValid ? 'bg-rose-950/10' : ''
                      }`}
                    >
                      {/* Status */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center justify-center gap-1">
                          {row.isValid ? (
                            <span className="inline-flex items-center space-x-1 text-emerald-400 text-[10px] bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Valid</span>
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center space-x-1 text-rose-400 text-[10px] bg-rose-950 px-2 py-0.5 rounded-full border border-rose-800">
                                <AlertCircle className="w-3 h-3" />
                                <span>Invalid</span>
                              </span>
                              {row.validationErrors.map((err, i) => (
                                <span key={i} className="block text-[9px] text-rose-400 text-left">
                                  • {err}
                                </span>
                              ))}
                            </div>
                          )}

                          {isInternalDup && (
                            <span className="inline-flex items-center space-x-1 text-amber-300 text-[9px] bg-amber-950/90 px-2 py-0.5 rounded-full border border-amber-600/50 font-bold">
                              <CopyCheck className="w-3 h-3 text-amber-400" />
                              <span>File Repeat ({repeatCount}x)</span>
                            </span>
                          )}

                          {isBankDup && (
                            <span className="inline-flex items-center space-x-1 text-purple-300 text-[9px] bg-purple-950/90 px-2 py-0.5 rounded-full border border-purple-600/50 font-bold">
                              <Layers className="w-3 h-3 text-purple-400" />
                              <span>In Bank ({bankMatchCount}x)</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Subject / Chapter */}
                      <td className="px-3 py-3 max-w-[160px]">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={row.subject}
                              onChange={e => updateRowField(row.idTemp, 'subject', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 text-white p-1 rounded text-xs"
                            />
                            <input
                              type="text"
                              value={row.chapter}
                              onChange={e => updateRowField(row.idTemp, 'chapter', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700 text-white p-1 rounded text-xs"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-200">{row.subject}</div>
                            <div className="text-[10px] text-slate-400">{row.chapter}</div>
                          </div>
                        )}
                      </td>

                      {/* Question Text & Explanation */}
                      <td className="px-3 py-3 max-w-[320px]">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <div>
                              <label className="text-[9px] text-slate-400 font-semibold uppercase">Question:</label>
                              <textarea
                                rows={2}
                                value={row.question}
                                onChange={e => updateRowField(row.idTemp, 'question', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 text-white p-1 rounded text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-blue-400 font-semibold uppercase">Explanation:</label>
                              <textarea
                                rows={2}
                                value={row.explanation || ''}
                                onChange={e => updateRowField(row.idTemp, 'explanation', e.target.value)}
                                placeholder="AI generated or manual explanation..."
                                className="w-full bg-slate-950 border border-slate-700 text-blue-200 p-1 rounded text-xs"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="line-clamp-2 text-white font-medium">{formatMathSymbols(row.question)}</p>
                            {row.explanation ? (
                              <div className="bg-slate-950/80 border border-slate-800 rounded p-1.5 text-[10px] text-blue-300/90 flex items-start space-x-1">
                                <Sparkles className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                                <span className="line-clamp-2"><strong>Exp:</strong> {formatMathSymbols(row.explanation)}</span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-500 italic flex items-center space-x-1">
                                <Bot className="w-3 h-3 text-slate-600" />
                                <span>No explanation generated yet</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Options */}
                      <td className="px-3 py-3 max-w-[240px]">
                        {isEditing ? (
                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            <input
                              type="text"
                              value={row.optionA}
                              onChange={e => updateRowField(row.idTemp, 'optionA', e.target.value)}
                              placeholder="A"
                              className="bg-slate-950 border border-slate-700 text-white p-1 rounded"
                            />
                            <input
                              type="text"
                              value={row.optionB}
                              onChange={e => updateRowField(row.idTemp, 'optionB', e.target.value)}
                              placeholder="B"
                              className="bg-slate-950 border border-slate-700 text-white p-1 rounded"
                            />
                            <input
                              type="text"
                              value={row.optionC}
                              onChange={e => updateRowField(row.idTemp, 'optionC', e.target.value)}
                              placeholder="C"
                              className="bg-slate-950 border border-slate-700 text-white p-1 rounded"
                            />
                            <input
                              type="text"
                              value={row.optionD}
                              onChange={e => updateRowField(row.idTemp, 'optionD', e.target.value)}
                              placeholder="D"
                              className="bg-slate-950 border border-slate-700 text-white p-1 rounded"
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                            <span className="truncate">A: {formatMathSymbols(row.optionA)}</span>
                            <span className="truncate">B: {formatMathSymbols(row.optionB)}</span>
                            <span className="truncate">C: {formatMathSymbols(row.optionC)}</span>
                            <span className="truncate">D: {formatMathSymbols(row.optionD)}</span>
                          </div>
                        )}
                      </td>

                      {/* Correct Answer */}
                      <td className="px-3 py-3 text-center">
                        <select
                          value={row.answer}
                          onChange={e => updateRowField(row.idTemp, 'answer', e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-blue-300 font-bold text-center px-2 py-1 rounded focus:outline-none"
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </td>

                      {/* Difficulty */}
                      <td className="px-3 py-3 text-center">
                        <select
                          value={row.difficulty}
                          onChange={e => updateRowField(row.idTemp, 'difficulty', e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-slate-200 text-xs text-center px-1.5 py-1 rounded focus:outline-none"
                        >
                          <option value="Easy">Easy</option>
                          <option value="Moderate">Moderate</option>
                          <option value="Hard">Hard</option>
                        </select>
                      </td>

                      {/* Row Actions */}
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => setEditingRowId(isEditing ? null : row.idTemp)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isEditing
                                ? 'bg-emerald-900/80 text-emerald-300'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                            title={isEditing ? 'Done editing' : 'Edit row'}
                          >
                            {isEditing ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => deleteRow(row.idTemp)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Delete row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom Import Action Bar */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <Bot className="w-4 h-4 text-blue-400" />
              <span>
                {autoExplainOnImport
                  ? 'AI will auto-generate explanations for any questions missing explanations during import.'
                  : 'Importing questions with current explanations.'}
              </span>
            </div>

            <button
              onClick={handleImportValid}
              disabled={validCount === 0 || isAiExplaining}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-lg hover:shadow-emerald-500/20 transition-all"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>
                {isAiExplaining
                  ? 'Generating AI Explanations...'
                  : `Import ${validCount} MCQs to Question Bank`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Interactive Processing Overlay for Bulk Upload & AI Parsing */}
      {(isParsing || isAiClassifying || isAiExplaining || isAiTranslating || isAiParsingText || isAiGenerating) && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0e1230] border border-blue-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center space-y-4 max-w-sm w-full text-center animate-in fade-in zoom-in-95">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-blue-500/20 border-t-blue-500 border-r-indigo-500 animate-spin" />
              <Sparkles className="w-6 h-6 text-blue-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isParsing || isAiParsingText
                  ? 'Parsing File & Extracting Questions...'
                  : isAiExplaining
                  ? 'Generating AI Explanations...'
                  : isAiTranslating
                  ? 'Translating Questions to Hindi...'
                  : isAiClassifying
                  ? 'Classifying MCQ Difficulty Levels...'
                  : 'AI Generating MCQs with Gemini...'}
              </h3>
              <p className="text-xs text-blue-300 mt-1">
                Processing document content with AI intelligence. Please wait...
              </p>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-blue-500 animate-pulse rounded-full w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
