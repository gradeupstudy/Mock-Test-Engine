export type AiProvider = 'gemini' | 'openai' | 'groq' | 'openrouter' | 'ollama' | 'tavily' | 'deepl';

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  apiKeysList?: string[];
  model?: string;
  baseUrl?: string;
}

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  apiKeysList?: string[];
  tavilyApiKey?: string;
  deeplApiKey?: string;
  model?: string;
  baseUrl?: string;
  enableFallback?: boolean;
  fallbackProviders?: AiProviderConfig[];
}

export type QuestionStatus = 'Fresh' | 'Used' | 'Frequent' | 'Overused' | 'Retired';
export type DifficultyLevel = 'Easy' | 'Moderate' | 'Hard';

export interface Question {
  id?: number;
  subject: string;
  chapter: string;
  question: string;
  translation?: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  answer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  difficulty: DifficultyLevel;
  usageCount: number;
  lastUsedMockId?: number;
  lastUsedDate?: string;
  questionStatus: QuestionStatus;
  similarityGroupId?: number;
  chapterCoverageScore: number;
  aiAuditResult?: {
    isAnswerKeyCorrect: boolean;
    suggestedCorrectAnswer?: 'A' | 'B' | 'C' | 'D' | 'NONE';
    areAllOptionsWrong?: boolean;
    factualError?: string | null;
    analysisReason: string;
    confidenceScore?: number;
  };
  isInspectionIgnored?: boolean;
  ignoredFlags?: string[];
  createdDate: string;
  updatedDate: string;
}

export interface MockHistory {
  id?: number;
  mockId: number;
  testName: string;
  marks: number;
  duration: number;
  questionIds: number[];
  questions?: Question[];
  uniqueness: number;
  createdDate: string;
}

export interface PaperHeaderConfig {
  instituteName: string;
  examName: string;
  testName: string;
  logoText?: string;
  logoPos: 'top-left' | 'top-center' | 'top-right' | 'inline-left';
  logoSize: 'small' | 'medium' | 'large';
  headerStyle: 'double-border' | 'single-line' | 'thick-line' | 'boxed' | 'elegant' | 'modern' | 'badge-style' | 'patriotic' | 'clean' | 'official' | 'bordered-box' | 'banner';
  font: 'Times New Roman' | 'Arial' | 'Calibri' | 'Georgia' | 'Verdana';
  fontSize: number;
  showDate: boolean;
  showRollNo: boolean;
  showCandidateBox?: boolean;
  setCode?: string;
  watermark?: string;
  instructions: string;
  footer: string;
}

export interface PaperQuestionStyle {
  numberingStyle: 'Q1.' | '[1]' | '1.' | 'Question 1.';
  optionStyle: '(A)' | 'A.' | '①';
}

export interface PaperPageConfig {
  pageSize: 'A4' | 'Letter' | 'Legal';
  margin: 'normal' | 'compact' | 'spacious';
}

export interface Template {
  id?: number;
  name: string;
  isDefault: boolean;
  isLocked: boolean;
  styleId: string;
  header: PaperHeaderConfig;
  qStyle: PaperQuestionStyle;
  page: PaperPageConfig;
  logoDataUrl?: string;
}

export interface OfficialPaperStyle {
  id: string;
  name: string;
  category: string;
  badge: 'Most Popular' | 'Premium' | 'New' | 'Standard' | 'Official' | 'Elite' | 'Advanced' | 'Pro';
  primaryColor: string;
  headerStyle: PaperHeaderConfig['headerStyle'];
  font: PaperHeaderConfig['font'];
  numberingStyle: PaperQuestionStyle['numberingStyle'];
  optionStyle: PaperQuestionStyle['optionStyle'];
  description: string;
  instructions: string;
  watermark: string;
  setCode?: string;
}

export interface DeletedMcqItem {
  id: number;
  question: Question;
  deletedAt: string;
}

export interface AddedMcqItem {
  id: number;
  question: Question;
  addedAt: string;
}

export interface SectionConfig {
  id: string;
  subject: string;
  questionCount: number;
  chapterDistribution: Record<string, number>;
}

export interface ExamPreset {
  id?: number;
  presetName: string;
  examName: string;
  totalMarks: number;
  duration: number;
  sections: SectionConfig[];
  excludeLastN?: number;
  uniqueThreshold?: number;
  irtProfile?: string;
  createdDate?: string;
  updatedDate?: string;
}

export interface SocialMediaTask {
  id: string;
  platform: 'youtube' | 'telegram' | 'instagram' | 'whatsapp' | 'facebook' | 'other';
  title: string;
  url: string;
  isRequired: boolean;
}

export interface OnlineMockConfig {
  shareId: string;
  mockId?: number;
  testName: string;
  instituteName?: string;
  duration: number; // in minutes
  totalMarks: number;
  marksPerQuestion: number;
  negativeMarksPerQuestion: number;
  socialTasks: SocialMediaTask[];
  questions: Question[];
  createdDate: string;
  passPercentage?: number;
  instructions?: string;
  isActive: boolean;
  totalAttempts?: number;
}

export interface StudentAttemptRecord {
  id: string;
  shareId: string;
  testName?: string;
  studentName: string;
  mobileNo: string;
  state: string;
  district: string;
  socialsFollowed: boolean;
  score: number;
  totalMarks: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  timeTakenSeconds: number;
  submittedAt: string;
  answers: Record<number, 'A' | 'B' | 'C' | 'D'>;
  rank?: number;
}

export interface OnlineMockResultSummary {
  shareId: string;
  testName: string;
  totalAttempts: number;
  avgScore: number;
  highestScore: number;
  topRankers: StudentAttemptRecord[];
  allAttempts: StudentAttemptRecord[];
}

