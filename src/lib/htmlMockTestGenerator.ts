import { Question, HtmlMockTestConfig } from '../types';
import { formatMathSymbols } from './mathUtils';
import { GRADEUP_STUDY_LOGO_SVG, svgToDataUrl } from './paperLogos';

export const DEFAULT_GRADEUP_LOGO_DATA_URL = svgToDataUrl(GRADEUP_STUDY_LOGO_SVG);

export const DEFAULT_HTML_TEST_CONFIG: HtmlMockTestConfig = {
  testName: 'Online CBT Mock Test',
  duration: 60,
  positiveMarks: 1,
  negativeMarks: 0.25,
  youtubeChannelName: 'Gradeup Study',
  youtubeChannelUrl: 'https://www.youtube.com/@GradeupStudy?sub_confirmation=1',
  enableYoutubeGate: true,
  instituteName: 'Gradeup Study',
  instructions: 'Attempt all questions within the given time. Each correct answer carries marks as specified. Negative marking applies for wrong answers.',
  logoUrl: DEFAULT_GRADEUP_LOGO_DATA_URL,
  youtubeSolutionUrl: '',
  youtubeSolutionTitle: ''
};

export function extractYoutubeVideoId(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

export function getStoredHtmlMockTestConfig(): HtmlMockTestConfig {
  try {
    const raw = localStorage.getItem('gradeup_html_test_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.instituteName === 'Gradeup Study Library' || !parsed.instituteName) {
        parsed.instituteName = 'Gradeup Study';
      }
      if (parsed.logoUrl === undefined) {
        parsed.logoUrl = DEFAULT_GRADEUP_LOGO_DATA_URL;
      }
      if (parsed.youtubeSolutionUrl === undefined) {
        parsed.youtubeSolutionUrl = '';
      }
      return { ...DEFAULT_HTML_TEST_CONFIG, ...parsed, instituteName: parsed.instituteName };
    }
  } catch (e) {
    console.warn('Failed to load stored html test config:', e);
  }
  return DEFAULT_HTML_TEST_CONFIG;
}

export function saveStoredHtmlMockTestConfig(config: Partial<HtmlMockTestConfig>) {
  try {
    const current = getStoredHtmlMockTestConfig();
    const updated = { ...current, ...config };
    if (updated.instituteName === 'Gradeup Study Library') {
      updated.instituteName = 'Gradeup Study';
    }
    localStorage.setItem('gradeup_html_test_config', JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save html test config:', e);
  }
}

/**
 * Generates a self-contained, standalone, responsive interactive HTML Mock Test file.
 * The file runs completely offline in any web or mobile browser.
 * Includes:
 * 1. Mandatory YouTube Channel Subscribe Gate (configurable on/off).
 * 2. Real-time CBT Exam interface with live countdown timer and question palette.
 * 3. Comprehensive professional exam result platform with scorecard, statistics,
 *    question explanations, PDF download, and WhatsApp/social sharing.
 */
export function generateInteractiveHtmlMockTest(
  questions: Question[],
  config: Partial<HtmlMockTestConfig>
): string {
  const resolvedInstituteName = (config.instituteName && config.instituteName !== 'Gradeup Study Library')
    ? config.instituteName
    : 'Gradeup Study';

  const resolvedLogoUrl = config.logoUrl !== undefined ? config.logoUrl : DEFAULT_GRADEUP_LOGO_DATA_URL;

  const mergedConfig: HtmlMockTestConfig = {
    ...DEFAULT_HTML_TEST_CONFIG,
    ...config,
    instituteName: resolvedInstituteName,
    logoUrl: resolvedLogoUrl,
    youtubeSolutionUrl: config.youtubeSolutionUrl || '',
    youtubeSolutionTitle: config.youtubeSolutionTitle || '',
    totalMarks: config.totalMarks || questions.length * (config.positiveMarks || 1)
  };

  const videoSolutionId = mergedConfig.youtubeSolutionUrl ? extractYoutubeVideoId(mergedConfig.youtubeSolutionUrl) : null;
  const videoSolutionUrl = mergedConfig.youtubeSolutionUrl ? mergedConfig.youtubeSolutionUrl.trim() : '';
  const videoSolutionTitle = mergedConfig.youtubeSolutionTitle?.trim() || `${mergedConfig.testName} - Complete Video Solution`;

  // Sanitize and format questions with math symbols
  const formattedQuestions = questions.map((q, idx) => ({
    id: q.id || idx + 1,
    subject: (q.subject || 'General Knowledge').trim(),
    chapter: (q.chapter || 'General').trim(),
    question: formatMathSymbols(q.question || ''),
    translation: q.translation ? formatMathSymbols(q.translation) : '',
    optionA: formatMathSymbols(q.optionA || ''),
    optionB: formatMathSymbols(q.optionB || ''),
    optionC: formatMathSymbols(q.optionC || ''),
    optionD: formatMathSymbols(q.optionD || ''),
    answer: q.answer || 'A',
    explanation: q.explanation ? formatMathSymbols(q.explanation) : '',
    difficulty: q.difficulty || 'Moderate'
  }));

  const safeJsonData = JSON.stringify({
    config: mergedConfig,
    questions: formattedQuestions
  }).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${escapeHtml(mergedConfig.testName)} - Interactive CBT Mock Test</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --primary-light: #eff6ff;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --success: #16a34a;
      --success-light: #dcfce7;
      --danger: #dc2626;
      --danger-light: #fee2e2;
      --warning: #d97706;
      --warning-light: #fef3c7;
      --purple: #7c3aed;
      --purple-light: #ede9fe;
      --yt-red: #ff0000;
      --yt-dark: #cc0000;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: 'Plus Jakarta Sans', 'Noto Sans Devanagari', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Utilites */
    .hidden { display: none !important; }
    .flex { display: flex; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .flex-wrap { flex-wrap: wrap; }
    .gap-1 { gap: 0.25rem; }
    .gap-2 { gap: 0.5rem; }
    .gap-3 { gap: 0.75rem; }
    .gap-4 { gap: 1rem; }

    /* Top Navigation Bar */
    header.exam-header {
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      padding: 0.75rem 1.25rem;
      position: sticky;
      top: 0;
      z-index: 40;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .header-inner {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .brand-title {
      font-size: 1.05rem;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .brand-logo-img {
      height: 34px;
      max-width: 48px;
      width: auto;
      object-fit: contain;
      border-radius: 6px;
      flex-shrink: 0;
      display: inline-block;
      vertical-align: middle;
      background: #ffffff;
    }
    .brand-badge {
      background: #eff6ff;
      color: #2563eb;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      border: 1px solid #bfdbfe;
    }
    .candidate-chip {
      background: #f1f5f9;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      border: 1px solid var(--border);
    }
    .timer-badge {
      background: #0f172a;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.95rem;
      padding: 0.35rem 0.85rem;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      letter-spacing: 0.05em;
    }
    .timer-warning {
      background: #7f1d1d !important;
      color: #fecaca !important;
      animation: pulseTimer 1s infinite alternate;
    }
    @keyframes pulseTimer {
      from { transform: scale(1); }
      to { transform: scale(1.04); }
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.6rem 1.2rem;
      border-radius: 0.65rem;
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.18s ease;
      text-decoration: none;
      white-space: nowrap;
    }
    .btn-primary {
      background: var(--primary);
      color: #ffffff;
    }
    .btn-primary:hover {
      background: var(--primary-dark);
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    }
    .btn-success {
      background: var(--success);
      color: #ffffff;
    }
    .btn-success:hover {
      background: #15803d;
      box-shadow: 0 4px 12px rgba(22, 163, 74, 0.25);
    }
    .btn-danger {
      background: var(--danger);
      color: #ffffff;
    }
    .btn-danger:hover {
      background: #b91c1c;
    }
    .btn-outline {
      background: #ffffff;
      border-color: var(--border);
      color: #334155;
    }
    .btn-outline:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .btn-purple {
      background: var(--purple-light);
      color: var(--purple);
      border-color: #ddd6fe;
    }
    .btn-purple:hover {
      background: #ddd6fe;
    }
    .btn-yt {
      background: #ff0000;
      color: #ffffff;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(255, 0, 0, 0.3);
    }
    .btn-yt:hover {
      background: #cc0000;
      transform: translateY(-1px);
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none !important;
      box-shadow: none !important;
    }

    /* Screen Container */
    .screen-container {
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 1.25rem;
      flex: 1;
    }

    /* ==========================================================================
       SCREEN 1: WELCOME & YOUTUBE GATE
       ========================================================================== */
    .welcome-card {
      max-width: 780px;
      margin: 1.5rem auto;
      background: #ffffff;
      border-radius: 1.25rem;
      border: 1px solid var(--border);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
      overflow: hidden;
    }
    .welcome-header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: #ffffff;
      padding: 2rem 1.75rem;
      text-align: center;
      position: relative;
    }
    .welcome-header h1 {
      font-size: 1.65rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }
    .welcome-header p {
      color: #94a3b8;
      font-size: 0.9rem;
    }
    .test-meta-pills {
      display: flex;
      justify-content: center;
      gap: 0.75rem;
      margin-top: 1.25rem;
      flex-wrap: wrap;
    }
    .meta-pill {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
      padding: 0.4rem 0.9rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    /* YouTube Gate Box */
    .yt-gate-card {
      margin: 1.5rem;
      background: #fff5f5;
      border: 2px dashed #fca5a5;
      border-radius: 1rem;
      padding: 1.5rem;
      text-align: center;
      position: relative;
    }
    .yt-gate-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: #ef4444;
      color: #ffffff;
      font-size: 0.7rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      margin-bottom: 0.75rem;
    }
    .yt-gate-title {
      font-size: 1.2rem;
      font-weight: 800;
      color: #991b1b;
      margin-bottom: 0.4rem;
    }
    .yt-gate-desc {
      font-size: 0.85rem;
      color: #7f1d1d;
      margin-bottom: 1.25rem;
      max-width: 540px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.5;
    }
    .gate-unlocked-banner {
      background: #f0fdf4;
      border: 2px solid #86efac;
      color: #166534;
      padding: 0.9rem;
      border-radius: 0.75rem;
      font-weight: 700;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    /* Candidate Form */
    .candidate-box {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    .form-group {
      margin-bottom: 1rem;
    }
    .form-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      color: #334155;
      margin-bottom: 0.35rem;
    }
    .form-input {
      width: 100%;
      padding: 0.65rem 0.9rem;
      font-family: inherit;
      font-size: 0.9rem;
      border: 1px solid var(--border);
      border-radius: 0.65rem;
      background: #f8fafc;
      color: #0f172a;
      outline: none;
      transition: all 0.2s;
    }
    .form-input:focus {
      border-color: var(--primary);
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    /* Instructions Box */
    .instructions-box {
      padding: 1.5rem;
      background: #fafafa;
    }
    .instructions-box h3 {
      font-size: 0.9rem;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .instructions-list {
      list-style-type: decimal;
      padding-left: 1.25rem;
      font-size: 0.8rem;
      color: #475569;
      space-y: 0.4rem;
    }
    .instructions-list li {
      margin-bottom: 0.4rem;
    }

    /* ==========================================================================
       SCREEN 2: ACTIVE CBT EXAM INTERFACE
       ========================================================================== */
    .cbt-layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 960px) {
      .cbt-layout {
        grid-template-columns: 1fr;
      }
    }

    /* Subject Tabs */
    .subject-tabs-bar {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding-bottom: 0.5rem;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
    }
    .subject-tab {
      padding: 0.4rem 0.85rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid var(--border);
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .subject-tab.active {
      background: var(--primary);
      color: #ffffff;
      border-color: var(--primary);
    }

    /* Question Main Card */
    .question-card {
      background: #ffffff;
      border-radius: 1rem;
      border: 1px solid var(--border);
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      min-height: 520px;
    }
    .question-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 0.9rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.25rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .q-number-badge {
      background: #0f172a;
      color: #ffffff;
      font-weight: 800;
      font-size: 0.85rem;
      padding: 0.25rem 0.75rem;
      border-radius: 0.5rem;
    }
    .marks-badge {
      font-size: 0.75rem;
      font-weight: 700;
      color: #15803d;
      background: #dcfce7;
      border: 1px solid #bbf7d0;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
    }
    .neg-marks-badge {
      font-size: 0.75rem;
      font-weight: 700;
      color: #b91c1c;
      background: #fee2e2;
      border: 1px solid #fecaca;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
    }

    .question-body {
      flex: 1;
      font-size: 1.05rem;
      font-weight: 600;
      color: #0f172a;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .bilingual-translation {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px dashed var(--border);
      color: #2563eb;
      font-size: 0.95rem;
      font-weight: 500;
    }

    /* Options Radio Cards */
    .options-grid {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .option-card {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      border: 1.5px solid var(--border);
      background: #f8fafc;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .option-card:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
    }
    .option-card.selected {
      background: #eff6ff;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }
    .option-letter {
      width: 1.85rem;
      height: 1.85rem;
      border-radius: 50%;
      background: #ffffff;
      border: 1.5px solid #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.8rem;
      color: #475569;
      flex-shrink: 0;
      transition: all 0.15s;
    }
    .option-card.selected .option-letter {
      background: var(--primary);
      border-color: var(--primary);
      color: #ffffff;
    }
    .option-text {
      font-size: 0.95rem;
      font-weight: 600;
      color: #1e293b;
      flex: 1;
    }

    /* Question Action Bar */
    .question-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    /* Palette Sidebar */
    .palette-card {
      background: #ffffff;
      border-radius: 1rem;
      border: 1px solid var(--border);
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
      padding: 1.25rem;
      position: sticky;
      top: 5rem;
    }
    .palette-header {
      font-size: 0.9rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .legend-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #475569;
    }
    .legend-dot {
      width: 0.9rem;
      height: 0.9rem;
      border-radius: 0.25rem;
      flex-shrink: 0;
    }
    .dot-answered { background: var(--success); }
    .dot-unanswered { background: #ef4444; }
    .dot-review { background: var(--purple); }
    .dot-notvisited { background: #e2e8f0; border: 1px solid #cbd5e1; }

    .palette-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 0.4rem;
      max-height: 320px;
      overflow-y: auto;
      padding: 0.25rem;
      margin-bottom: 1rem;
    }
    .palette-btn {
      aspect-ratio: 1;
      border-radius: 0.5rem;
      font-size: 0.75rem;
      font-weight: 800;
      border: 1.5px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    }
    .palette-btn.current {
      outline: 2px solid #0f172a;
      outline-offset: 2px;
    }
    .palette-btn.status-answered {
      background: var(--success);
      color: #ffffff;
    }
    .palette-btn.status-unanswered {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fca5a5;
    }
    .palette-btn.status-review {
      background: var(--purple);
      color: #ffffff;
    }
    .palette-btn.status-notvisited {
      background: #f8fafc;
      color: #64748b;
      border-color: var(--border);
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(4px);
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .modal-card {
      background: #ffffff;
      border-radius: 1.25rem;
      max-width: 500px;
      width: 100%;
      padding: 1.75rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      border: 1px solid var(--border);
      animation: modalPop 0.2s ease-out;
    }
    @keyframes modalPop {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    /* ==========================================================================
       SCREEN 3: PROFESSIONAL RESULT & SCORECARD PLATFORM
       ========================================================================== */
    .result-hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #ffffff;
      border-radius: 1.5rem;
      padding: 2.25rem 2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
      position: relative;
      overflow: hidden;
    }
    .result-hero-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2rem;
      flex-wrap: wrap;
    }
    .hero-info h2 {
      font-size: 1.75rem;
      font-weight: 800;
      margin-bottom: 0.35rem;
    }
    .hero-info p {
      color: #94a3b8;
      font-size: 0.9rem;
    }
    .candidate-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255, 255, 255, 0.1);
      padding: 0.3rem 0.8rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
      color: #38bdf8;
      margin-top: 0.75rem;
    }

    .score-circle-card {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(12px);
      padding: 1.5rem 2rem;
      border-radius: 1.25rem;
      text-align: center;
      min-width: 220px;
    }
    .score-big {
      font-size: 2.75rem;
      font-weight: 900;
      color: #38bdf8;
      line-height: 1;
      font-family: 'JetBrains Mono', monospace;
    }
    .score-total {
      font-size: 1.2rem;
      color: #94a3b8;
      font-weight: 600;
    }
    .accuracy-badge {
      margin-top: 0.5rem;
      display: inline-block;
      background: #16a34a;
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 0.2rem 0.7rem;
      border-radius: 9999px;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .stat-card {
      background: #ffffff;
      border-radius: 1rem;
      border: 1px solid var(--border);
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      text-align: center;
    }
    .stat-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }
    .stat-value {
      font-size: 1.65rem;
      font-weight: 800;
      color: #0f172a;
    }
    .stat-value.green { color: var(--success); }
    .stat-value.red { color: var(--danger); }
    .stat-value.blue { color: var(--primary); }

    /* Result Action Bar */
    .result-actions-bar {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1rem 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    /* YouTube Complete Video Solution Card on Result Screen */
    .video-solution-card {
      background: linear-gradient(135deg, #090d16 0%, #172033 100%);
      border: 2px solid #dc2626;
      border-radius: 1.15rem;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(220, 38, 38, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      position: relative;
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: all 0.25s ease;
      cursor: pointer;
    }
    @media (min-width: 640px) {
      .video-solution-card {
        flex-direction: row;
        align-items: center;
      }
    }
    .video-solution-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 16px 32px -4px rgba(220, 38, 38, 0.35), 0 10px 15px -6px rgba(0, 0, 0, 0.25);
      border-color: #ef4444;
    }
    .video-thumb-container {
      position: relative;
      width: 100%;
      max-width: 270px;
      aspect-ratio: 16 / 9;
      border-radius: 0.75rem;
      overflow: hidden;
      background: #000000;
      flex-shrink: 0;
      border: 1.5px solid rgba(255, 255, 255, 0.15);
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    @media (max-width: 639px) {
      .video-thumb-container {
        max-width: 100%;
      }
    }
    .video-thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .video-solution-card:hover .video-thumb-img {
      transform: scale(1.05);
    }
    .video-play-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
    }
    .video-solution-card:hover .video-play-overlay {
      background: rgba(0, 0, 0, 0.15);
    }
    .video-play-btn {
      width: 52px;
      height: 52px;
      border-radius: 9999px;
      background: #dc2626;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(220, 38, 38, 0.7);
      transition: transform 0.2s ease, background 0.2s ease;
    }
    .video-solution-card:hover .video-play-btn {
      transform: scale(1.12);
      background: #ef4444;
    }
    .video-solution-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0.45rem;
    }
    .video-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(220, 38, 38, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fca5a5;
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      width: fit-content;
    }
    .video-solution-title {
      color: #ffffff;
      font-size: 1.18rem;
      font-weight: 800;
      line-height: 1.35;
      margin: 0;
    }
    .video-solution-desc {
      color: #cbd5e1;
      font-size: 0.83rem;
      line-height: 1.5;
      margin: 0;
    }
    .video-action-cta {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #dc2626;
      color: #ffffff;
      font-weight: 800;
      font-size: 0.86rem;
      padding: 0.6rem 1.25rem;
      border-radius: 0.6rem;
      width: fit-content;
      margin-top: 0.35rem;
      transition: all 0.2s ease;
      box-shadow: 0 3px 10px rgba(220, 38, 38, 0.4);
    }
    .video-solution-card:hover .video-action-cta {
      background: #ef4444;
      transform: translateX(2px);
    }

    /* Review Solutions */
    .review-section {
      background: #ffffff;
      border-radius: 1rem;
      border: 1px solid var(--border);
      padding: 1.5rem;
      box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    }
    .review-filter-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
      overflow-x: auto;
    }
    .review-filter-btn {
      padding: 0.45rem 1rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
      background: #f1f5f9;
      color: #475569;
      border: 1px solid var(--border);
      cursor: pointer;
      transition: all 0.15s;
    }
    .review-filter-btn.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .review-item-card {
      border: 1px solid var(--border);
      border-radius: 0.85rem;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      background: #ffffff;
    }
    .review-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .status-badge {
      font-size: 0.75rem;
      font-weight: 800;
      padding: 0.2rem 0.65rem;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }
    .status-correct {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .status-incorrect {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .status-unattempted {
      background: #f1f5f9;
      color: #64748b;
      border: 1px solid #e2e8f0;
    }

    .review-option {
      padding: 0.65rem 0.9rem;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      margin-bottom: 0.4rem;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .review-option.is-correct {
      background: #f0fdf4;
      border-color: #86efac;
      color: #166534;
      font-weight: 700;
    }
    .review-option.is-user-wrong {
      background: #fef2f2;
      border-color: #fca5a5;
      color: #991b1b;
      font-weight: 700;
    }

    .explanation-box {
      margin-top: 0.9rem;
      padding: 1rem;
      background: #f0fdfa;
      border-left: 4px solid #0d9488;
      border-radius: 0 0.65rem 0.65rem 0;
      font-size: 0.88rem;
      color: #134e4a;
    }
    .explanation-title {
      font-weight: 800;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: #0f766e;
    }

    /* Share Modal Specifics */
    .share-options-grid {
      display: grid;
      gap: 0.75rem;
      margin: 1.25rem 0;
    }
    .share-btn-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-radius: 0.75rem;
      border: 1px solid var(--border);
      background: #f8fafc;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.9rem;
      transition: all 0.15s;
      text-decoration: none;
      color: inherit;
    }
    .share-btn-item:hover {
      background: #f1f5f9;
      transform: translateY(-1px);
    }

    /* Gradeup Study Official Scorecard & PDF Header */
    .pdf-gradeup-header {
      background: #ffffff;
      border: 1.5px solid var(--border);
      border-radius: 1rem;
      padding: 1rem 1.25rem;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .pdf-header-brand {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .pdf-logo-box {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 2px;
      overflow: hidden;
    }
    .pdf-logo-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 6px;
    }
    .pdf-institute-name {
      font-size: 1.35rem;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }
    .pdf-institute-tagline {
      font-size: 0.8rem;
      font-weight: 600;
      color: #64748b;
      margin-top: 0.15rem;
    }
    .pdf-header-badges {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .pdf-badge-verified {
      font-size: 0.75rem;
      font-weight: 700;
      color: #15803d;
      background: #dcfce7;
      border: 1px solid #bbf7d0;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .pdf-badge-yt {
      font-size: 0.75rem;
      font-weight: 700;
      color: #b91c1c;
      background: #fee2e2;
      border: 1px solid #fecaca;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* Print Watermark (Hidden on screen) */
    .print-watermark {
      display: none;
    }

    .pdf-print-footer {
      display: none;
    }

    /* Print Styles */
    @media print {
      @page {
        margin: 8mm 10mm 12mm 10mm;
        size: A4 portrait;
      }

      body {
        background: #ffffff !important;
        color: #0f172a !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Fixed Single Centered Gradeup Study Watermark on EVERY printed page */
      .print-watermark {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        z-index: 99999 !important;
        pointer-events: none !important;
        user-select: none !important;
        overflow: hidden !important;
      }

      .print-watermark .watermark-item {
        font-family: 'Plus Jakarta Sans', Arial, sans-serif !important;
        font-size: 3.5rem !important;
        font-weight: 900 !important;
        letter-spacing: 0.08em !important;
        color: rgba(15, 23, 42, 0.07) !important;
        text-transform: uppercase !important;
        white-space: nowrap !important;
        transform: rotate(-28deg) !important;
        transform-origin: center center !important;
        text-align: center !important;
        line-height: 1 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Official Gradeup Study Header in Print/PDF */
      .pdf-gradeup-header {
        display: flex !important;
        align-items: center;
        justify-content: space-between;
        background: #f8fafc !important;
        border: 2px solid #0f172a !important;
        border-radius: 8px !important;
        padding: 0.85rem 1.25rem !important;
        margin-bottom: 1rem !important;
        page-break-inside: avoid;
        box-shadow: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .pdf-logo-box {
        width: 48px !important;
        height: 48px !important;
        background: #ffffff !important;
        border: 1.5px solid #0f172a !important;
        border-radius: 6px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 2px !important;
        overflow: hidden !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .pdf-logo-box img,
      .pdf-logo-img {
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .pdf-institute-name {
        font-size: 1.6rem !important;
        font-weight: 900 !important;
        color: #0f172a !important;
        letter-spacing: 0.05em !important;
        line-height: 1.1;
      }

      .pdf-institute-tagline {
        color: #334155 !important;
        font-size: 0.78rem !important;
        font-weight: 600 !important;
      }

      .pdf-badge-verified {
        color: #15803d !important;
        background: #dcfce7 !important;
        border: 1px solid #86efac !important;
        font-weight: 800 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .pdf-badge-yt {
        color: #b91c1c !important;
        background: #fee2e2 !important;
        border: 1px solid #fca5a5 !important;
        font-weight: 800 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      /* Official PDF Print Footer */
      .pdf-print-footer {
        display: flex !important;
        justify-content: space-between;
        align-items: center;
        border-top: 1.5px solid #0f172a !important;
        padding-top: 8px !important;
        margin-top: 1.5rem !important;
        font-size: 0.75rem !important;
        color: #475569 !important;
        page-break-inside: avoid;
      }

      /* Hide interactive buttons & exam elements */
      header.exam-header,
      .result-actions-bar,
      .review-filter-tabs,
      .video-solution-card,
      .btn,
      .modal-backdrop,
      #screen-welcome,
      #screen-exam {
        display: none !important;
      }

      #screen-result {
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
      }

      .result-hero {
        background: #ffffff !important;
        color: #0f172a !important;
        border: 1.5px solid #0f172a !important;
        box-shadow: none !important;
        padding: 1rem 1.25rem !important;
        margin-bottom: 1rem !important;
        page-break-inside: avoid;
      }

      .score-big {
        color: #0f172a !important;
      }

      .score-circle-card {
        background: #f8fafc !important;
        border: 1.5px solid #cbd5e1 !important;
        color: #0f172a !important;
      }

      .candidate-tag {
        color: #0f172a !important;
        border: 1px solid #cbd5e1 !important;
        background: #f1f5f9 !important;
      }

      .stats-grid {
        margin-bottom: 1rem !important;
        page-break-inside: avoid;
      }

      .stat-card {
        border: 1px solid #94a3b8 !important;
        background: #ffffff !important;
        box-shadow: none !important;
        page-break-inside: avoid;
      }

      .review-section {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
      }

      .review-item-card {
        page-break-inside: avoid !important;
        border: 1px solid #cbd5e1 !important;
        margin-bottom: 1rem !important;
        background: #ffffff !important;
      }

      .explanation-box {
        background: #f0fdfa !important;
        border-left: 3px solid #0d9488 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>

  <!-- Fixed Single Gradeup Study Watermark for Print & PDF -->
  <div class="print-watermark" aria-hidden="true">
    <div class="watermark-item">GRADEUP STUDY</div>
  </div>

  <!-- Top App Navigation Bar -->
  <header class="exam-header">
    <div class="header-inner">
      <div class="brand-title">
        ${mergedConfig.logoUrl ? `
          <img src="${mergedConfig.logoUrl}" alt="Gradeup Study Logo" class="brand-logo-img" />
        ` : `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
            <path d="M6 6h10"/>
            <path d="M6 10h10"/>
          </svg>
        `}
        <span id="nav-brand-text">Gradeup Study</span>
        <span class="brand-badge">Online CBT</span>
      </div>

      <div class="flex items-center gap-3">
        <!-- Candidate badge on exam / result screen -->
        <div id="nav-candidate-chip" class="candidate-chip hidden">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>
          </svg>
          <span id="nav-candidate-name">Candidate</span>
        </div>

        <!-- Live Countdown Timer (Exam screen only) -->
        <div id="nav-timer" class="timer-badge hidden">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span id="timer-display">00:00</span>
        </div>

        <!-- Submit Button in Header -->
        <button id="nav-submit-btn" class="btn btn-success hidden" onclick="confirmSubmitTest()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Submit Test</span>
        </button>
      </div>
    </div>
  </header>

  <!-- =========================================================================
       SCREEN 1: WELCOME & YOUTUBE GATE SCREEN
       ========================================================================= -->
  <main id="screen-welcome" class="screen-container">
    <div class="welcome-card">
      <div class="welcome-header">
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.85rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
          ${mergedConfig.logoUrl ? `
            <img src="${mergedConfig.logoUrl}" alt="Gradeup Study Logo" style="height: 48px; max-width: 60px; object-fit: contain; border-radius: 8px; flex-shrink: 0;" />
          ` : ''}
          <div style="text-align: left;">
            <h1 id="welcome-test-title" style="margin-bottom: 0.15rem; font-size: 1.5rem;">${escapeHtml(mergedConfig.testName)}</h1>
            <p style="margin-bottom: 0; font-size: 0.85rem; color: #64748b;">${escapeHtml(mergedConfig.instituteName || 'Gradeup Study')} • Official Computer-Based Mock Test</p>
          </div>
        </div>
        
        <div class="test-meta-pills">
          <div class="meta-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>${mergedConfig.duration} Minutes</span>
          </div>
          <div class="meta-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${formattedQuestions.length} Questions</span>
          </div>
          <div class="meta-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
            <span>Total Marks: ${mergedConfig.totalMarks}</span>
          </div>
          <div class="meta-pill">
            <span>+${mergedConfig.positiveMarks} / -${mergedConfig.negativeMarks} Marks</span>
          </div>
        </div>
      </div>

      <!-- YouTube Channel Subscribe Gate (if enabled) -->
      ${mergedConfig.enableYoutubeGate ? `
      <div id="yt-gate-box" class="yt-gate-card">
        <div class="yt-gate-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span>Mandatory Gate</span>
        </div>
        <h3 class="yt-gate-title">Subscribe to Our YouTube Channel to Unlock Mock Test</h3>
        <p class="yt-gate-desc">
          इस फ्री मॉक टेस्ट को अनलॉक करने के लिए कृपया हमारे ऑफिशियल यूट्यूब चैनल <strong>${escapeHtml(mergedConfig.youtubeChannelName)}</strong> को सब्सक्राइब करें।
        </p>

        <div id="yt-actions-container" class="flex justify-center gap-3 flex-wrap">
          <a href="${escapeHtml(mergedConfig.youtubeChannelUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-yt" onclick="handleYoutubeSubscribeClick()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
            <span>Subscribe on YouTube</span>
          </a>
        </div>

        <div id="yt-unlocked-msg" class="gate-unlocked-banner hidden" style="margin-top: 1rem;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>YouTube Channel Verified! Mock Test Unlocked.</span>
        </div>
      </div>
      ` : ''}

      <!-- Candidate Information Input -->
      <div class="candidate-box">
        <div class="form-group">
          <label class="form-label">Enter Candidate Name (उम्मीदवार का नाम) *</label>
          <input type="text" id="input-candidate-name" class="form-input" placeholder="e.g. Rahul Sharma" required>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Roll Number / Mobile Number (वैकल्पिक)</label>
          <input type="text" id="input-candidate-roll" class="form-input" placeholder="e.g. 2026-MOCK-081">
        </div>
      </div>

      <!-- Test Instructions -->
      <div class="instructions-box">
        <h3>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Important Instructions:</span>
        </h3>
        <ul class="instructions-list">
          <li>This mock test consists of <strong>${formattedQuestions.length} Multiple Choice Questions (MCQs)</strong>.</li>
          <li>Total allotted time is <strong>${mergedConfig.duration} minutes</strong>. When the countdown timer hits 00:00, your test will submit automatically.</li>
          <li>Each correct answer gives <strong>+${mergedConfig.positiveMarks} marks</strong>; negative penalty of <strong>-${mergedConfig.negativeMarks} marks</strong> applies for each wrong answer.</li>
          <li>You can mark questions for review and jump to any question using the question palette on the right.</li>
          <li>After submitting, your comprehensive scorecard with performance metrics, detailed solutions, and PDF download will be generated.</li>
        </ul>

        <div style="margin-top: 1.5rem; text-align: center;">
          <button id="btn-start-test" class="btn btn-primary" style="padding: 0.85rem 2.5rem; font-size: 1rem;" onclick="startMockTest()">
            <span>Start Mock Test Now</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <div id="gate-warning-msg" class="text-xs" style="color: #dc2626; font-weight: 700; margin-top: 0.5rem; display: none;">
            ⚠️ Please click 'Subscribe on YouTube' to unlock the test before starting.
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- =========================================================================
       SCREEN 2: ACTIVE CBT EXAM SCREEN
       ========================================================================= -->
  <main id="screen-exam" class="screen-container hidden">
    <!-- Subject Filter Tabs -->
    <div id="subject-tabs-container" class="subject-tabs-bar">
      <!-- Injected by JavaScript -->
    </div>

    <div class="cbt-layout">
      <!-- Main Question Canvas -->
      <div class="question-card">
        <div class="question-header">
          <div class="flex items-center gap-2">
            <span id="display-q-number" class="q-number-badge">Q. 1 / ${formattedQuestions.length}</span>
            <span id="display-q-subject" class="brand-badge">Subject</span>
          </div>

          <div class="flex items-center gap-2">
            <span class="marks-badge">+${mergedConfig.positiveMarks} Mark</span>
            ${mergedConfig.negativeMarks > 0 ? `<span class="neg-marks-badge">-${mergedConfig.negativeMarks} Neg</span>` : ''}
          </div>
        </div>

        <div class="question-body">
          <div id="display-q-text">Loading question text...</div>
          <div id="display-q-translation" class="bilingual-translation hidden"></div>
        </div>

        <!-- Options A, B, C, D -->
        <div class="options-grid">
          <div id="opt-A" class="option-card" onclick="selectOption('A')">
            <div class="option-letter">A</div>
            <div id="text-opt-A" class="option-text">Option A</div>
          </div>
          <div id="opt-B" class="option-card" onclick="selectOption('B')">
            <div class="option-letter">B</div>
            <div id="text-opt-B" class="option-text">Option B</div>
          </div>
          <div id="opt-C" class="option-card" onclick="selectOption('C')">
            <div class="option-letter">C</div>
            <div id="text-opt-C" class="option-text">Option C</div>
          </div>
          <div id="opt-D" class="option-card" onclick="selectOption('D')">
            <div class="option-letter">D</div>
            <div id="text-opt-D" class="option-text">Option D</div>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="question-footer">
          <div class="flex items-center gap-2">
            <button id="btn-prev-q" class="btn btn-outline" onclick="goToPreviousQuestion()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span>Previous</span>
            </button>
            <button class="btn btn-outline" onclick="clearCurrentResponse()">
              <span>Clear Response</span>
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button id="btn-mark-review" class="btn btn-purple" onclick="toggleMarkForReview()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
              <span>Mark for Review & Next</span>
            </button>
            <button id="btn-save-next" class="btn btn-primary" onclick="saveAndNextQuestion()">
              <span>Save & Next</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Question Palette Sidebar -->
      <aside class="palette-card">
        <div class="palette-header">
          <span>Question Palette</span>
          <span id="palette-answered-count" class="brand-badge">0 / ${formattedQuestions.length}</span>
        </div>

        <div class="legend-grid">
          <div class="legend-item"><div class="legend-dot dot-answered"></div><span>Answered</span></div>
          <div class="legend-item"><div class="legend-dot dot-unanswered"></div><span>Not Answered</span></div>
          <div class="legend-item"><div class="legend-dot dot-review"></div><span>Review</span></div>
          <div class="legend-item"><div class="legend-dot dot-notvisited"></div><span>Not Visited</span></div>
        </div>

        <div id="palette-grid-buttons" class="palette-grid">
          <!-- Injected by JavaScript -->
        </div>

        <button class="btn btn-success" style="width: 100%; margin-top: 0.5rem;" onclick="confirmSubmitTest()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Final Submit Test</span>
        </button>
      </aside>
    </div>
  </main>

  <!-- Submit Confirmation Modal -->
  <div id="modal-submit" class="modal-backdrop hidden">
    <div class="modal-card">
      <h3 style="font-size: 1.25rem; font-weight: 800; color: #0f172a; margin-bottom: 0.5rem;">
        Are you ready to submit your test?
      </h3>
      <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 1.25rem;">
        Once submitted, your final score and detailed question analysis will be calculated immediately.
      </p>

      <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: 0.75rem; padding: 1rem; margin-bottom: 1.5rem;">
        <div class="flex justify-between items-center" style="margin-bottom: 0.4rem; font-size: 0.85rem;">
          <span style="color: #475569;">Total Questions:</span>
          <strong style="color: #0f172a;">${formattedQuestions.length}</strong>
        </div>
        <div class="flex justify-between items-center" style="margin-bottom: 0.4rem; font-size: 0.85rem;">
          <span style="color: #16a34a; font-weight: 600;">Answered:</span>
          <strong id="modal-stat-answered" style="color: #16a34a;">0</strong>
        </div>
        <div class="flex justify-between items-center" style="margin-bottom: 0.4rem; font-size: 0.85rem;">
          <span style="color: #dc2626; font-weight: 600;">Not Answered:</span>
          <strong id="modal-stat-unanswered" style="color: #dc2626;">0</strong>
        </div>
        <div class="flex justify-between items-center" style="font-size: 0.85rem;">
          <span style="color: #7c3aed; font-weight: 600;">Marked for Review:</span>
          <strong id="modal-stat-review" style="color: #7c3aed;">0</strong>
        </div>
      </div>

      <div class="flex justify-between gap-3">
        <button class="btn btn-outline" style="flex: 1;" onclick="closeSubmitModal()">Resume Test</button>
        <button class="btn btn-success" style="flex: 1;" onclick="executeFinalSubmit()">Yes, Submit</button>
      </div>
    </div>
  </div>

  <!-- =========================================================================
       SCREEN 3: PROFESSIONAL EXAM RESULT & SCORECARD PLATFORM
       ========================================================================= -->
  <main id="screen-result" class="screen-container hidden">
    <!-- Official Gradeup Study Header Banner (Screen View + PDF Print Header) -->
    <div class="pdf-gradeup-header">
      <div class="pdf-header-brand">
        <div class="pdf-logo-box">
          ${mergedConfig.logoUrl ? `
            <img src="${mergedConfig.logoUrl}" alt="Gradeup Study Logo" class="pdf-logo-img" />
          ` : `
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
              <path d="M6 6h10"/>
              <path d="M6 10h10"/>
            </svg>
          `}
        </div>
        <div>
          <h1 class="pdf-institute-name">GRADEUP STUDY</h1>
          <p class="pdf-institute-tagline">Official Computer Based Test (CBT) • Performance Evaluation Report</p>
        </div>
      </div>
      <div class="pdf-header-badges">
        <span class="pdf-badge-verified">✓ Official Scorecard</span>
        <span class="pdf-badge-yt">YouTube: @GradeupStudy</span>
      </div>
    </div>

    <!-- Hero Scorecard Card -->
    <div class="result-hero">
      <div class="result-hero-inner">
        <div class="hero-info">
          <h2 id="result-test-title">${escapeHtml(mergedConfig.testName)}</h2>
          <p id="result-meta-line">Gradeup Study • CBT Performance Evaluation Report</p>
          <div class="candidate-tag">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
            <span id="result-candidate-name">Candidate Name</span>
          </div>
        </div>

        <div class="score-circle-card">
          <div class="stat-label" style="color: #94a3b8;">Final Score</div>
          <div class="score-big" id="result-score-marks">0</div>
          <div class="score-total" id="result-score-total">/ ${mergedConfig.totalMarks} Marks</div>
          <div class="accuracy-badge" id="result-accuracy-badge">Accuracy: 0%</div>
        </div>
      </div>
    </div>

    <!-- Statistics Overview Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Attempted</div>
        <div id="stat-attempted" class="stat-value blue">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Correct Answers</div>
        <div id="stat-correct" class="stat-value green">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Incorrect Answers</div>
        <div id="stat-incorrect" class="stat-value red">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unattempted</div>
        <div id="stat-unattempted" class="stat-value">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Time Taken</div>
        <div id="stat-time-taken" class="stat-value" style="font-size: 1.25rem;">00:00</div>
      </div>
    </div>

    <!-- Action Toolbar (PDF Download, Share, Re-attempt) -->
    <div class="result-actions-bar">
      <div class="flex items-center gap-2">
        <button class="btn btn-primary" onclick="downloadResultPdf()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download Result PDF</span>
        </button>

        <button class="btn btn-success" onclick="openShareModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span>Share Result & Mock Test</span>
        </button>
      </div>

      <button class="btn btn-outline" onclick="reattemptTest()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        <span>Re-attempt Test</span>
      </button>
    </div>

    ${videoSolutionUrl ? `
    <!-- Complete Mock Test Video Solution Card -->
    <a href="${escapeHtml(videoSolutionUrl)}" target="_blank" rel="noopener noreferrer" class="video-solution-card" title="Click to watch complete video solution on YouTube">
      <div class="video-thumb-container">
        <img 
          src="${videoSolutionId ? `https://img.youtube.com/vi/${videoSolutionId}/hqdefault.jpg` : 'https://img.youtube.com/vi/default/hqdefault.jpg'}" 
          alt="YouTube Video Solution Thumbnail" 
          class="video-thumb-img"
          loading="lazy"
          onerror="this.src='https://img.youtube.com/vi/${videoSolutionId || ''}/mqdefault.jpg'"
        />
        <div class="video-play-overlay">
          <div class="video-play-btn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
          </div>
        </div>
      </div>

      <div class="video-solution-content">
        <div class="video-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          <span>Complete Video Solution • संपूर्ण वीडियो हल</span>
        </div>
        <h3 class="video-solution-title">${escapeHtml(videoSolutionTitle)}</h3>
        <p class="video-solution-desc">
          इस मॉक टेस्ट के सभी प्रश्नों का विस्तृत वीडियो हल, शॉर्टकट ट्रिक्स व संपूर्ण व्याख्या YouTube पर देखें।
        </p>
        <div>
          <span class="video-action-cta">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
            <span>Watch Solution on YouTube</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </span>
        </div>
      </div>
    </a>
    ` : ''}

    <!-- Question-by-Question Solutions Review -->
    <div class="review-section">
      <div class="flex items-center justify-between" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0f172a;">
          Detailed Question Solutions & Explanations
        </h3>
        <span class="brand-badge">Full Answer Key</span>
      </div>

      <!-- Filter Buttons -->
      <div class="review-filter-tabs">
        <button id="filter-all" class="review-filter-btn active" onclick="setReviewFilter('ALL')">All Questions (${formattedQuestions.length})</button>
        <button id="filter-correct" class="review-filter-btn" onclick="setReviewFilter('CORRECT')">Correct (0)</button>
        <button id="filter-incorrect" class="review-filter-btn" onclick="setReviewFilter('INCORRECT')">Incorrect (0)</button>
        <button id="filter-unattempted" class="review-filter-btn" onclick="setReviewFilter('UNATTEMPTED')">Unattempted (0)</button>
      </div>

      <!-- Review Questions List -->
      <div id="review-questions-list">
        <!-- Injected by JavaScript -->
      </div>
    </div>

    <!-- Official Gradeup Study PDF Print Footer -->
    <div class="pdf-print-footer">
      <div>
        <strong>GRADEUP STUDY</strong> • Examination Cell & Official Mock Test Series
      </div>
      <div>
        Report Generated: <span id="pdf-gen-date"></span> | YouTube: @GradeupStudy
      </div>
    </div>
  </main>

  <!-- Share Result Modal -->
  <div id="modal-share" class="modal-backdrop hidden">
    <div class="modal-card">
      <div class="flex items-center justify-between" style="margin-bottom: 0.75rem;">
        <h3 style="font-size: 1.25rem; font-weight: 800; color: #0f172a;">Share Your Result</h3>
        <button class="btn btn-outline" style="padding: 0.3rem 0.6rem;" onclick="closeShareModal()">✕</button>
      </div>
      <p style="font-size: 0.85rem; color: #64748b;">
        अपने स्कोरकार्ड और इस मॉक टेस्ट की HTML फाइल को दोस्तों के साथ WhatsApp या सोशल मीडिया पर शेयर करें:
      </p>

      <div class="share-options-grid">
        <button class="share-btn-item" onclick="shareOnWhatsApp()" style="color: #15803d; border-color: #86efac; background: #f0fdf4;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
          <span>Share Score & Test on WhatsApp</span>
        </button>

        <button class="share-btn-item" onclick="shareOnTelegram()" style="color: #0284c7; border-color: #7dd3fc; background: #f0f9ff;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.458c.538-.196 1.006.128.832.941z"/></svg>
          <span>Share on Telegram</span>
        </button>

        <button class="share-btn-item" onclick="copyScoreSummary()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          <span id="copy-summary-text">Copy Scorecard Summary Text</span>
        </button>

        <button class="share-btn-item" onclick="downloadCurrentMockTestHtml()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download This Mock Test HTML to Share</span>
        </button>
      </div>

      <div style="text-align: center;">
        <button class="btn btn-outline" style="width: 100%;" onclick="closeShareModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Embedded Test Data JSON -->
  <script id="mock-test-data" type="application/json">
    ${safeJsonData}
  </script>

  <!-- Interactive CBT Exam Engine -->
  <script>
    // State Variables
    let testData = {};
    let questions = [];
    let config = {};
    let candidate = { name: '', roll: '' };
    let userAnswers = {}; // { qIndex: 'A' | 'B' | 'C' | 'D' }
    let markedForReview = new Set();
    let visitedQuestions = new Set();
    let currentQIndex = 0;
    let currentSubject = 'ALL';
    let timeRemaining = 0;
    let timerInterval = null;
    let testStartTime = null;
    let testEndTime = null;
    let isGateVerified = false;
    let reviewFilter = 'ALL';

    // Initialize Application
    window.addEventListener('DOMContentLoaded', () => {
      try {
        const rawJson = document.getElementById('mock-test-data').textContent;
        testData = JSON.parse(rawJson);
        questions = testData.questions || [];
        config = testData.config || {};
        timeRemaining = (config.duration || 60) * 60;

        // Check if YouTube gate is already verified in this browser
        const storedGate = localStorage.getItem('yt_gate_unlocked_' + (config.testName || 'default'));
        if (storedGate === 'true' || !config.enableYoutubeGate) {
          isGateVerified = true;
          const unlockedBanner = document.getElementById('yt-unlocked-msg');
          if (unlockedBanner) unlockedBanner.classList.remove('hidden');
          const actionsContainer = document.getElementById('yt-actions-container');
          if (actionsContainer) actionsContainer.classList.add('hidden');
        }

        // Restore candidate name if previously entered
        const storedName = localStorage.getItem('gradeup_last_candidate_name');
        if (storedName) {
          const inputEl = document.getElementById('input-candidate-name');
          if (inputEl) inputEl.value = storedName;
        }
      } catch (err) {
        console.error('Initialization error:', err);
        alert('Failed to load mock test questions.');
      }
    });

    // YouTube Gate Handlers
    function handleYoutubeSubscribeClick() {
      // Mark as subscribed after click
      setTimeout(() => {
        isGateVerified = true;
        localStorage.setItem('yt_gate_unlocked_' + (config.testName || 'default'), 'true');
        const unlockedBanner = document.getElementById('yt-unlocked-msg');
        if (unlockedBanner) unlockedBanner.classList.remove('hidden');
        const warning = document.getElementById('gate-warning-msg');
        if (warning) warning.style.display = 'none';
      }, 1500);
    }

    function verifySubscriptionManually() {
      isGateVerified = true;
      localStorage.setItem('yt_gate_unlocked_' + (config.testName || 'default'), 'true');
      const unlockedBanner = document.getElementById('yt-unlocked-msg');
      if (unlockedBanner) unlockedBanner.classList.remove('hidden');
      const warning = document.getElementById('gate-warning-msg');
      if (warning) warning.style.display = 'none';
      alert('Thank you for subscribing to ' + (config.youtubeChannelName || 'Gradeup Study') + '! Mock test is now unlocked.');
    }

    // Start Test
    function startMockTest() {
      if (config.enableYoutubeGate && !isGateVerified) {
        const warning = document.getElementById('gate-warning-msg');
        if (warning) warning.style.display = 'block';
        alert('Please subscribe to our YouTube channel first to unlock and start the mock test!');
        return;
      }

      const nameInput = document.getElementById('input-candidate-name');
      const candidateName = (nameInput ? nameInput.value.trim() : '') || 'Student';
      const rollInput = document.getElementById('input-candidate-roll');
      const candidateRoll = rollInput ? rollInput.value.trim() : '';

      candidate = { name: candidateName, roll: candidateRoll };
      localStorage.setItem('gradeup_last_candidate_name', candidateName);

      // Setup Navbar
      document.getElementById('nav-candidate-name').textContent = candidate.name;
      document.getElementById('nav-candidate-chip').classList.remove('hidden');
      document.getElementById('nav-timer').classList.remove('hidden');
      document.getElementById('nav-submit-btn').classList.remove('hidden');

      // Switch Screens
      document.getElementById('screen-welcome').classList.add('hidden');
      document.getElementById('screen-exam').classList.remove('hidden');

      // Setup Subjects Tabs & Palette
      setupSubjectTabs();
      setupQuestionPalette();

      // Start Countdown Timer
      testStartTime = Date.now();
      startTimer();

      // Load First Question
      loadQuestion(0);
    }

    // Timer
    function startTimer() {
      updateTimerDisplay();
      timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();

        if (timeRemaining <= 300) { // 5 minutes warning
          document.getElementById('nav-timer').classList.add('timer-warning');
        }

        if (timeRemaining <= 0) {
          clearInterval(timerInterval);
          alert("Time's up! Your mock test will be submitted automatically.");
          executeFinalSubmit();
        }
      }, 1000);
    }

    function updateTimerDisplay() {
      const minutes = Math.floor(timeRemaining / 60);
      const seconds = timeRemaining % 60;
      const str = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
      document.getElementById('timer-display').textContent = str;
    }

    // Subjects Tabs
    function setupSubjectTabs() {
      const subjects = ['ALL', ...Array.from(new Set(questions.map(q => q.subject))).filter(Boolean)];
      const container = document.getElementById('subject-tabs-container');
      container.innerHTML = '';

      subjects.forEach(sub => {
        const btn = document.createElement('button');
        btn.className = 'subject-tab' + (sub === 'ALL' ? ' active' : '');
        btn.textContent = sub === 'ALL' ? 'All Questions (' + questions.length + ')' : sub;
        btn.onclick = () => {
          document.querySelectorAll('.subject-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentSubject = sub;
          // Jump to first question belonging to this subject
          if (sub !== 'ALL') {
            const firstIdx = questions.findIndex(q => q.subject === sub);
            if (firstIdx !== -1) loadQuestion(firstIdx);
          }
        };
        container.appendChild(btn);
      });
    }

    // Question Palette
    function setupQuestionPalette() {
      const grid = document.getElementById('palette-grid-buttons');
      grid.innerHTML = '';

      questions.forEach((q, idx) => {
        const btn = document.createElement('button');
        btn.id = 'palette-btn-' + idx;
        btn.className = 'palette-btn status-notvisited';
        btn.textContent = idx + 1;
        btn.onclick = () => loadQuestion(idx);
        grid.appendChild(btn);
      });
      updatePaletteCounters();
    }

    function updatePaletteCounters() {
      const answeredCount = Object.keys(userAnswers).length;
      document.getElementById('palette-answered-count').textContent = answeredCount + ' / ' + questions.length;

      questions.forEach((_, idx) => {
        const btn = document.getElementById('palette-btn-' + idx);
        if (!btn) return;

        btn.className = 'palette-btn';
        if (idx === currentQIndex) btn.classList.add('current');

        if (userAnswers[idx] !== undefined) {
          btn.classList.add('status-answered');
        } else if (markedForReview.has(idx)) {
          btn.classList.add('status-review');
        } else if (visitedQuestions.has(idx)) {
          btn.classList.add('status-unanswered');
        } else {
          btn.classList.add('status-notvisited');
        }
      });
    }

    // Load Question View
    function loadQuestion(idx) {
      if (idx < 0 || idx >= questions.length) return;
      currentQIndex = idx;
      visitedQuestions.add(idx);

      const q = questions[idx];
      document.getElementById('display-q-number').textContent = 'Q. ' + (idx + 1) + ' / ' + questions.length;
      document.getElementById('display-q-subject').textContent = q.subject || 'General';
      document.getElementById('display-q-text').textContent = q.question;

      const transEl = document.getElementById('display-q-translation');
      if (q.translation && q.translation.trim() && q.translation.trim() !== q.question.trim()) {
        transEl.textContent = q.translation;
        transEl.classList.remove('hidden');
      } else {
        transEl.classList.add('hidden');
      }

      // Options
      document.getElementById('text-opt-A').textContent = q.optionA;
      document.getElementById('text-opt-B').textContent = q.optionB;
      document.getElementById('text-opt-C').textContent = q.optionC;
      document.getElementById('text-opt-D').textContent = q.optionD;

      // Reset selection styles
      ['A', 'B', 'C', 'D'].forEach(opt => {
        const el = document.getElementById('opt-' + opt);
        if (userAnswers[idx] === opt) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });

      // Prev Button disabled on Q1
      document.getElementById('btn-prev-q').disabled = idx === 0;

      // Update Review Button text
      const reviewBtn = document.getElementById('btn-mark-review');
      if (markedForReview.has(idx)) {
        reviewBtn.classList.remove('btn-purple');
        reviewBtn.classList.add('btn-primary');
        reviewBtn.innerHTML = '<span>Unmark Review</span>';
      } else {
        reviewBtn.classList.remove('btn-primary');
        reviewBtn.classList.add('btn-purple');
        reviewBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg><span>Mark for Review & Next</span>';
      }

      updatePaletteCounters();
    }

    // Option Selection
    function selectOption(opt) {
      userAnswers[currentQIndex] = opt;
      loadQuestion(currentQIndex);
    }

    function clearCurrentResponse() {
      delete userAnswers[currentQIndex];
      loadQuestion(currentQIndex);
    }

    function toggleMarkForReview() {
      if (markedForReview.has(currentQIndex)) {
        markedForReview.delete(currentQIndex);
      } else {
        markedForReview.add(currentQIndex);
      }
      saveAndNextQuestion();
    }

    function saveAndNextQuestion() {
      if (currentQIndex < questions.length - 1) {
        loadQuestion(currentQIndex + 1);
      } else {
        confirmSubmitTest();
      }
    }

    function goToPreviousQuestion() {
      if (currentQIndex > 0) {
        loadQuestion(currentQIndex - 1);
      }
    }

    // Submit Modal
    function confirmSubmitTest() {
      const answeredCount = Object.keys(userAnswers).length;
      const unansweredCount = questions.length - answeredCount;
      const reviewCount = markedForReview.size;

      document.getElementById('modal-stat-answered').textContent = answeredCount;
      document.getElementById('modal-stat-unanswered').textContent = unansweredCount;
      document.getElementById('modal-stat-review').textContent = reviewCount;

      document.getElementById('modal-submit').classList.remove('hidden');
    }

    function closeSubmitModal() {
      document.getElementById('modal-submit').classList.add('hidden');
    }

    // Final Submit & Scoring Engine
    function executeFinalSubmit() {
      closeSubmitModal();
      clearInterval(timerInterval);
      testEndTime = Date.now();

      // Switch screens
      document.getElementById('screen-exam').classList.add('hidden');
      document.getElementById('nav-timer').classList.add('hidden');
      document.getElementById('nav-submit-btn').classList.add('hidden');
      document.getElementById('screen-result').classList.remove('hidden');

      // Calculate Scores
      const pos = config.positiveMarks || 1;
      const neg = config.negativeMarks || 0;
      let correct = 0;
      let incorrect = 0;

      questions.forEach((q, idx) => {
        const chosen = userAnswers[idx];
        if (chosen) {
          if (chosen.toUpperCase() === q.answer.toUpperCase()) {
            correct++;
          } else {
            incorrect++;
          }
        }
      });

      const attempted = correct + incorrect;
      const unattempted = questions.length - attempted;
      const marksScored = Math.max(0, (correct * pos) - (incorrect * neg));
      const accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : 0;
      const timeSpentSec = Math.floor((testEndTime - testStartTime) / 1000);
      const timeMin = Math.floor(timeSpentSec / 60);
      const timeSec = timeSpentSec % 60;
      const timeStr = timeMin + 'm ' + timeSec + 's';

      // Fill Scorecard Hero
      document.getElementById('result-candidate-name').textContent = candidate.name;
      document.getElementById('result-score-marks').textContent = Number(marksScored.toFixed(2));
      document.getElementById('result-accuracy-badge').textContent = 'Accuracy: ' + accuracy + '%';

      // Fill Stats
      document.getElementById('stat-attempted').textContent = attempted;
      document.getElementById('stat-correct').textContent = correct;
      document.getElementById('stat-incorrect').textContent = incorrect;
      document.getElementById('stat-unattempted').textContent = unattempted;
      document.getElementById('stat-time-taken').textContent = timeStr;

      // Update Filter Counts
      document.getElementById('filter-correct').textContent = 'Correct (' + correct + ')';
      document.getElementById('filter-incorrect').textContent = 'Incorrect (' + incorrect + ')';
      document.getElementById('filter-unattempted').textContent = 'Unattempted (' + unattempted + ')';

      // Update Report Generation Date
      try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const dateEl = document.getElementById('pdf-gen-date');
        if (dateEl) dateEl.textContent = dateStr;
      } catch (e) {}

      // Render Question Reviews
      renderReviewQuestions();
    }

    // Review Solutions Renderer
    function renderReviewQuestions() {
      const listEl = document.getElementById('review-questions-list');
      listEl.innerHTML = '';

      questions.forEach((q, idx) => {
        const userChoice = userAnswers[idx];
        const isCorrect = userChoice && userChoice.toUpperCase() === q.answer.toUpperCase();
        const isIncorrect = userChoice && !isCorrect;
        const isUnattempted = !userChoice;

        // Apply filter
        if (reviewFilter === 'CORRECT' && !isCorrect) return;
        if (reviewFilter === 'INCORRECT' && !isIncorrect) return;
        if (reviewFilter === 'UNATTEMPTED' && !isUnattempted) return;

        const card = document.createElement('div');
        card.className = 'review-item-card';

        let badgeHtml = '';
        if (isCorrect) {
          badgeHtml = '<span class="status-badge status-correct">✓ Correct (+'+ (config.positiveMarks || 1) +')</span>';
        } else if (isIncorrect) {
          badgeHtml = '<span class="status-badge status-incorrect">✗ Incorrect (-'+ (config.negativeMarks || 0) +')</span>';
        } else {
          badgeHtml = '<span class="status-badge status-unattempted">○ Unattempted</span>';
        }

        let optionsHtml = '';
        ['A', 'B', 'C', 'D'].forEach(optLetter => {
          const optText = q['option' + optLetter];
          const isThisCorrect = optLetter.toUpperCase() === q.answer.toUpperCase();
          const isThisUserChoice = userChoice && userChoice.toUpperCase() === optLetter.toUpperCase();

          let optClass = 'review-option';
          let tagHtml = '';

          if (isThisCorrect) {
            optClass += ' is-correct';
            tagHtml = '<span style="font-size: 0.75rem; color: #15803d; font-weight: 800;">✓ Correct Answer</span>';
          } else if (isThisUserChoice) {
            optClass += ' is-user-wrong';
            tagHtml = '<span style="font-size: 0.75rem; color: #b91c1c; font-weight: 800;">✗ Your Answer</span>';
          }

          optionsHtml += '<div class="' + optClass + '"><div><strong>(' + optLetter + ')</strong> ' + escapeHtml(optText) + '</div>' + tagHtml + '</div>';
        });

        let explanationHtml = '';
        if (q.explanation && q.explanation.trim()) {
          explanationHtml = '<div class="explanation-box">' +
            '<div class="explanation-title">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
              '<span>Detailed Solution / Explanation:</span>' +
            '</div>' +
            '<div>' + escapeHtml(q.explanation) + '</div>' +
          '</div>';
        }

        card.innerHTML = 
          '<div class="review-item-header">' +
            '<div class="flex items-center gap-2">' +
              '<span class="q-number-badge">Question ' + (idx + 1) + '</span>' +
              '<span class="brand-badge">' + escapeHtml(q.subject || 'General') + '</span>' +
            '</div>' +
            badgeHtml +
          '</div>' +
          '<div style="font-size: 1rem; font-weight: 600; color: #0f172a; margin-bottom: 1rem;">' +
            escapeHtml(q.question) +
            (q.translation ? '<div class="bilingual-translation">' + escapeHtml(q.translation) + '</div>' : '') +
          '</div>' +
          '<div>' + optionsHtml + '</div>' +
          explanationHtml;

        listEl.appendChild(card);
      });
    }

    function setReviewFilter(filter) {
      reviewFilter = filter;
      document.querySelectorAll('.review-filter-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.getElementById('filter-' + filter.toLowerCase());
      if (activeBtn) activeBtn.classList.add('active');
      renderReviewQuestions();
    }

    // PDF Download via Print Engine
    function downloadResultPdf() {
      try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const dateEl = document.getElementById('pdf-gen-date');
        if (dateEl) dateEl.textContent = dateStr;
      } catch (e) {}
      window.print();
    }

    // Share Modal
    function openShareModal() {
      document.getElementById('modal-share').classList.remove('hidden');
    }

    function closeShareModal() {
      document.getElementById('modal-share').classList.add('hidden');
    }

    function getFormattedScoreSummary() {
      const pos = config.positiveMarks || 1;
      const neg = config.negativeMarks || 0;
      let correct = 0;
      let incorrect = 0;
      questions.forEach((q, idx) => {
        if (userAnswers[idx]) {
          if (userAnswers[idx].toUpperCase() === q.answer.toUpperCase()) correct++;
          else incorrect++;
        }
      });
      const marksScored = Math.max(0, (correct * pos) - (incorrect * neg)).toFixed(2);
      const attempted = correct + incorrect;
      const accuracy = attempted > 0 ? ((correct / attempted) * 100).toFixed(1) : 0;

      return "🎯 " + (config.testName || 'Online Mock Test') + " Result\\n" +
        "👤 Candidate: " + candidate.name + "\\n" +
        "🏆 Marks: " + marksScored + " / " + (config.totalMarks || questions.length) + "\\n" +
        "📊 Accuracy: " + accuracy + "%\\n" +
        "✅ Correct: " + correct + " | ❌ Incorrect: " + incorrect + "\\n\\n" +
        "Attempt this mock test and challenge my score!";
    }

    function shareOnWhatsApp() {
      const text = encodeURIComponent(getFormattedScoreSummary());
      window.open('https://api.whatsapp.com/send?text=' + text, '_blank');
    }

    function shareOnTelegram() {
      const text = encodeURIComponent(getFormattedScoreSummary());
      window.open('https://t.me/share/url?url=&text=' + text, '_blank');
    }

    function copyScoreSummary() {
      const text = getFormattedScoreSummary();
      navigator.clipboard.writeText(text).then(() => {
        const label = document.getElementById('copy-summary-text');
        label.textContent = '✓ Copied to Clipboard!';
        setTimeout(() => {
          label.textContent = 'Copy Scorecard Summary Text';
        }, 2500);
      }).catch(() => {
        alert('Could not copy automatically. Here is your summary:\\n\\n' + text);
      });
    }

    function downloadCurrentMockTestHtml() {
      const filename = (config.testName || 'Mock_Test').replace(/[^a-zA-Z0-9_-]/g, '_') + '.html';
      const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function reattemptTest() {
      if (confirm('Are you sure you want to re-attempt this mock test? Your previous responses will be cleared.')) {
        userAnswers = {};
        markedForReview.clear();
        visitedQuestions.clear();
        currentQIndex = 0;
        timeRemaining = (config.duration || 60) * 60;

        document.getElementById('screen-result').classList.add('hidden');
        document.getElementById('screen-exam').classList.remove('hidden');
        document.getElementById('nav-timer').classList.remove('hidden');
        document.getElementById('nav-submit-btn').classList.remove('hidden');

        testStartTime = Date.now();
        startTimer();
        setupQuestionPalette();
        loadQuestion(0);
      }
    }

    function escapeHtml(text) {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
