import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Copy,
  UploadCloud,
  FileArchive,
  Download,
  CheckCircle2,
  Sparkles,
  Info,
  Maximize2,
  X,
  Layers,
  ArrowRight,
  FolderArchive,
  Files
} from 'lucide-react';
import {
  fileToDataUrl,
  optimizeImageDataUrl,
  getSampleImageMcqs,
  parseImageMcqZip,
  downloadSampleImageMcqZip,
  autoMatchImageFiles
} from '../lib/imageMcqUtils';

export interface ImageMcqDraft {
  idTemp: number;
  subject: string;
  chapter: string;
  question: string;
  questionImage?: string;
  optionA: string;
  optionAImage?: string;
  optionB: string;
  optionBImage?: string;
  optionC: string;
  optionCImage?: string;
  optionD: string;
  optionDImage?: string;
  answer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
  explanationImage?: string;
  difficulty: 'Easy' | 'Moderate' | 'Hard';
}

interface ImageMcqBulkUploadSectionProps {
  onAddParsedRows: (rows: ImageMcqDraft[]) => void;
  existingSubjects?: string[];
  existingChapters?: string[];
}

export const ImageMcqBulkUploadSection: React.FC<ImageMcqBulkUploadSectionProps> = ({
  onAddParsedRows,
  existingSubjects = [],
  existingChapters = []
}) => {
  // Sub-tabs: 'interactive' | 'zip' | 'batch_images'
  const [activeSubMode, setActiveSubMode] = useState<'interactive' | 'zip' | 'batch_images'>('interactive');

  // Interactive Question Drafts
  const [drafts, setDrafts] = useState<ImageMcqDraft[]>([
    {
      idTemp: Date.now(),
      subject: 'Quantitative Aptitude',
      chapter: 'Geometry & Mensuration',
      question: '',
      questionImage: '',
      optionA: '',
      optionAImage: '',
      optionB: '',
      optionBImage: '',
      optionC: '',
      optionCImage: '',
      optionD: '',
      optionDImage: '',
      answer: 'A',
      explanation: '',
      explanationImage: '',
      difficulty: 'Moderate'
    }
  ]);

  // Bulk Field Apply
  const [bulkSubject, setBulkSubject] = useState('');
  const [bulkChapter, setBulkChapter] = useState('');
  const [bulkDifficulty, setBulkDifficulty] = useState<'Easy' | 'Moderate' | 'Hard'>('Moderate');

  // Full Screen Image Preview Modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>('');

  // Status / Loading
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [zipStatusMsg, setZipStatusMsg] = useState<string | null>(null);
  const [isMatchingBatch, setIsMatchingBatch] = useState(false);

  // Hidden File Inputs for Interactive Image Picking
  const activeInputRef = useRef<{ draftId: number; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger file picker for a specific field in a draft
  const triggerImagePick = (draftId: number, field: string) => {
    activeInputRef.current = { draftId, field };
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Handle picked image file
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeInputRef.current) return;

    try {
      const rawData = await fileToDataUrl(file);
      const optimized = await optimizeImageDataUrl(rawData);
      const { draftId, field } = activeInputRef.current;

      setDrafts(prev =>
        prev.map(d => {
          if (d.idTemp === draftId) {
            return { ...d, [field]: optimized };
          }
          return d;
        })
      );
    } catch (err) {
      console.error('Image load failed:', err);
    } finally {
      activeInputRef.current = null;
    }
  };

  // Remove image from draft
  const handleRemoveImage = (draftId: number, field: string) => {
    setDrafts(prev =>
      prev.map(d => {
        if (d.idTemp === draftId) {
          return { ...d, [field]: '' };
        }
        return d;
      })
    );
  };

  // Update text field in draft
  const handleUpdateDraft = (draftId: number, field: keyof ImageMcqDraft, value: any) => {
    setDrafts(prev =>
      prev.map(d => {
        if (d.idTemp === draftId) {
          return { ...d, [field]: value };
        }
        return d;
      })
    );
  };

  // Add new empty draft
  const handleAddNewDraft = () => {
    setDrafts(prev => [
      ...prev,
      {
        idTemp: Date.now() + Math.random(),
        subject: bulkSubject.trim() || 'General',
        chapter: bulkChapter.trim() || 'General',
        question: '',
        questionImage: '',
        optionA: '',
        optionAImage: '',
        optionB: '',
        optionBImage: '',
        optionC: '',
        optionCImage: '',
        optionD: '',
        optionDImage: '',
        answer: 'A',
        explanation: '',
        explanationImage: '',
        difficulty: bulkDifficulty
      }
    ]);
  };

  // Add 5 empty drafts
  const handleAddFiveDrafts = () => {
    const newItems: ImageMcqDraft[] = Array.from({ length: 5 }, (_, i) => ({
      idTemp: Date.now() + i + Math.random(),
      subject: bulkSubject.trim() || 'General',
      chapter: bulkChapter.trim() || 'General',
      question: '',
      questionImage: '',
      optionA: '',
      optionAImage: '',
      optionB: '',
      optionBImage: '',
      optionC: '',
      optionCImage: '',
      optionD: '',
      optionDImage: '',
      answer: 'A',
      explanation: '',
      explanationImage: '',
      difficulty: bulkDifficulty
    }));
    setDrafts(prev => [...prev, ...newItems]);
  };

  // Duplicate a draft
  const handleDuplicateDraft = (index: number) => {
    const target = drafts[index];
    if (!target) return;
    const clone: ImageMcqDraft = {
      ...target,
      idTemp: Date.now() + Math.random()
    };
    const next = [...drafts];
    next.splice(index + 1, 0, clone);
    setDrafts(next);
  };

  // Delete draft
  const handleDeleteDraft = (idTemp: number) => {
    if (drafts.length <= 1) {
      setDrafts([
        {
          idTemp: Date.now(),
          subject: bulkSubject.trim() || 'General',
          chapter: bulkChapter.trim() || 'General',
          question: '',
          questionImage: '',
          optionA: '',
          optionAImage: '',
          optionB: '',
          optionBImage: '',
          optionC: '',
          optionCImage: '',
          optionD: '',
          optionDImage: '',
          answer: 'A',
          explanation: '',
          explanationImage: '',
          difficulty: 'Moderate'
        }
      ]);
      return;
    }
    setDrafts(prev => prev.filter(d => d.idTemp !== idTemp));
  };

  // Load rich demo sample Image MCQs
  const handleLoadSampleImageMcqs = () => {
    const samples = getSampleImageMcqs();
    const formatted: ImageMcqDraft[] = samples.map((s, idx) => ({
      ...s,
      idTemp: Date.now() + idx + Math.random()
    }));
    setDrafts(formatted);
  };

  // Apply Subject & Chapter to all drafts
  const handleApplyBulkMeta = () => {
    if (!bulkSubject && !bulkChapter) return;
    setDrafts(prev =>
      prev.map(d => ({
        ...d,
        subject: bulkSubject.trim() ? bulkSubject.trim() : d.subject,
        chapter: bulkChapter.trim() ? bulkChapter.trim() : d.chapter,
        difficulty: bulkDifficulty || d.difficulty
      }))
    );
  };

  // Send interactive drafts to review & import table
  const handleSendDraftsToReview = () => {
    // Filter out completely empty items
    const validCandidates = drafts.filter(d => {
      const hasQ = d.question.trim().length > 0 || !!d.questionImage;
      const hasAnyOpt =
        d.optionA.trim().length > 0 ||
        d.optionB.trim().length > 0 ||
        !!d.optionAImage ||
        !!d.optionBImage;
      return hasQ || hasAnyOpt;
    });

    if (validCandidates.length === 0) {
      alert('Please fill in at least one question or add an image before importing.');
      return;
    }

    onAddParsedRows(validCandidates);
  };

  // Handle ZIP File Upload
  const handleZipFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingZip(true);
    setZipStatusMsg('Reading ZIP archive and extracting images...');

    try {
      const ab = await file.arrayBuffer();
      const result = await parseImageMcqZip(ab);

      if (result.questions.length === 0) {
        setZipStatusMsg('⚠️ No valid MCQs or images found in ZIP archive.');
        return;
      }

      const formatted: ImageMcqDraft[] = result.questions.map((q, idx) => ({
        idTemp: Date.now() + idx + Math.random(),
        subject: q.subject || bulkSubject.trim() || 'General',
        chapter: q.chapter || bulkChapter.trim() || 'General',
        question: q.question || '',
        questionImage: q.questionImage || '',
        optionA: q.optionA || q.option_a || 'Option A',
        optionAImage: q.optionAImage || '',
        optionB: q.optionB || q.option_b || 'Option B',
        optionBImage: q.optionBImage || '',
        optionC: q.optionC || q.option_c || 'Option C',
        optionCImage: q.optionCImage || '',
        optionD: q.optionD || q.option_d || 'Option D',
        optionDImage: q.optionDImage || '',
        answer: (['A', 'B', 'C', 'D'].includes(String(q.answer).toUpperCase())
          ? String(q.answer).toUpperCase()
          : 'A') as 'A' | 'B' | 'C' | 'D',
        explanation: q.explanation || '',
        explanationImage: q.explanationImage || '',
        difficulty: (['Easy', 'Moderate', 'Hard'].includes(q.difficulty)
          ? q.difficulty
          : 'Moderate') as 'Easy' | 'Moderate' | 'Hard'
      }));

      onAddParsedRows(formatted);
      setZipStatusMsg(`✅ Successfully imported ${formatted.length} Image MCQs from ZIP archive!`);
    } catch (err: any) {
      console.error('ZIP extraction failed:', err);
      setZipStatusMsg(`❌ Error extracting ZIP file: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProcessingZip(false);
      e.target.value = '';
    }
  };

  // Handle Multi-file image batch picker
  const handleBatchImagesDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsMatchingBatch(true);
    try {
      const fileList = Array.from(files) as File[];
      const matched = await autoMatchImageFiles(fileList);

      if (matched.length === 0) {
        alert('No image files could be processed.');
        return;
      }

      const newDrafts: ImageMcqDraft[] = matched.map((m, idx) => ({
        idTemp: Date.now() + idx + Math.random(),
        subject: bulkSubject.trim() || 'General',
        chapter: bulkChapter.trim() || 'General',
        question: m.questionText || `Question ${m.qNum}`,
        questionImage: m.questionImage || '',
        optionA: m.optionAText || 'Option A',
        optionAImage: m.optionAImage || '',
        optionB: m.optionBText || 'Option B',
        optionBImage: m.optionBImage || '',
        optionC: m.optionCText || 'Option C',
        optionCImage: m.optionCImage || '',
        optionD: m.optionDText || 'Option D',
        optionDImage: m.optionDImage || '',
        answer: m.answer || 'A',
        explanation: m.explanationText || '',
        explanationImage: m.explanationImage || '',
        difficulty: bulkDifficulty
      }));

      setDrafts(newDrafts);
      setActiveSubMode('interactive');
    } catch (err) {
      console.error('Batch matching failed:', err);
    } finally {
      setIsMatchingBatch(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Single Field Image Selection */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageFileChange}
        accept="image/png, image/jpeg, image/jpg, image/webp, image/gif, image/svg+xml"
        className="hidden"
      />

      {/* Sub-Mode Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setActiveSubMode('interactive')}
          className={`flex items-start space-x-3 p-4 rounded-xl border text-left transition-all ${
            activeSubMode === 'interactive'
              ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
          }`}
        >
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              activeSubMode === 'interactive' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">Visual MCQ Builder</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">
                RECOMMENDED
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Add diagrams/photos to Question, Options (A-D) & Explanation with live previews.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubMode('zip')}
          className={`flex items-start space-x-3 p-4 rounded-xl border text-left transition-all ${
            activeSubMode === 'zip'
              ? 'bg-purple-950/40 border-purple-500 shadow-md ring-1 ring-purple-500/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
          }`}
        >
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              activeSubMode === 'zip' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <FolderArchive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">ZIP Folder Upload</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                ZIP + IMAGES
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Upload a .zip package with Excel/JSON and all image files automatically matched.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubMode('batch_images')}
          className={`flex items-start space-x-3 p-4 rounded-xl border text-left transition-all ${
            activeSubMode === 'batch_images'
              ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
          }`}
        >
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              activeSubMode === 'batch_images' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            <Files className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white">Multi-Image Auto-Matcher</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                FAST DROP
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select 10-50 screenshot images at once. System pairs Q, Options & Solution by filename.
            </p>
          </div>
        </button>
      </div>

      {/* MODE 1: INTERACTIVE VISUAL BUILDER */}
      {activeSubMode === 'interactive' && (
        <div className="space-y-5">
          {/* Top Quick Action Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 font-semibold">Bulk Subject:</span>
                <input
                  type="text"
                  value={bulkSubject}
                  onChange={e => setBulkSubject(e.target.value)}
                  placeholder="e.g. Science / Math"
                  list="subjects-datalist"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 font-semibold">Bulk Chapter:</span>
                <input
                  type="text"
                  value={bulkChapter}
                  onChange={e => setBulkChapter(e.target.value)}
                  placeholder="e.g. Optics / Geometry"
                  list="chapters-datalist"
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-36"
                />
              </div>

              <button
                type="button"
                onClick={handleApplyBulkMeta}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                title="Apply entered Subject and Chapter to all questions below"
              >
                Apply to All
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleImageMcqs}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Load Sample Image MCQs</span>
              </button>

              <button
                type="button"
                onClick={handleAddNewDraft}
                className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+1 Question</span>
              </button>

              <button
                type="button"
                onClick={handleAddFiveDrafts}
                className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-700"
              >
                <span>+5 Cards</span>
              </button>
            </div>
          </div>

          {/* Datalists for autocompleting subjects and chapters */}
          <datalist id="subjects-datalist">
            {existingSubjects.map((s, idx) => (
              <option key={idx} value={s} />
            ))}
          </datalist>
          <datalist id="chapters-datalist">
            {existingChapters.map((c, idx) => (
              <option key={idx} value={c} />
            ))}
          </datalist>

          {/* Questions Drafts Cards List */}
          <div className="space-y-4">
            {drafts.map((draft, idx) => (
              <div
                key={draft.idTemp}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 hover:border-slate-700 transition-all shadow-sm"
              >
                {/* Card Header */}
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-800 gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-bold text-xs border border-blue-500/30">
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-bold text-white">MCQ #{idx + 1}</span>

                    <input
                      type="text"
                      value={draft.subject}
                      onChange={e => handleUpdateDraft(draft.idTemp, 'subject', e.target.value)}
                      placeholder="Subject"
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-0.5 w-32 focus:border-blue-500 focus:outline-none"
                    />

                    <input
                      type="text"
                      value={draft.chapter}
                      onChange={e => handleUpdateDraft(draft.idTemp, 'chapter', e.target.value)}
                      placeholder="Chapter"
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-0.5 w-36 focus:border-blue-500 focus:outline-none"
                    />

                    <select
                      value={draft.difficulty}
                      onChange={e => handleUpdateDraft(draft.idTemp, 'difficulty', e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded px-2 py-0.5 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => handleDuplicateDraft(idx)}
                      className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
                      title="Duplicate this question"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft.idTemp)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                      title="Remove this question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Question Section: Statement + Question Image */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                  <div className="lg:col-span-8 space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Question Statement (Optional if question is fully an image diagram):</span>
                    </label>
                    <textarea
                      rows={3}
                      value={draft.question}
                      onChange={e => handleUpdateDraft(draft.idTemp, 'question', e.target.value)}
                      placeholder="Enter question statement, numerical problem, or instructions for the image diagram..."
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
                    />
                  </div>

                  {/* Question Image Drop/Picker Box */}
                  <div className="lg:col-span-4 space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                      <span>Question Image / Diagram:</span>
                    </label>

                    {draft.questionImage ? (
                      <div className="relative group bg-slate-950 border border-blue-500/40 rounded-xl p-2 flex items-center justify-center min-h-[82px] overflow-hidden">
                        <img
                          src={draft.questionImage}
                          alt="Question Diagram"
                          className="max-h-24 max-w-full object-contain cursor-pointer rounded"
                          onClick={() => {
                            setPreviewImageUrl(draft.questionImage!);
                            setPreviewImageTitle(`MCQ #${idx + 1} - Question Image`);
                          }}
                        />
                        <div className="absolute top-1.5 right-1.5 flex items-center space-x-1 opacity-90 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewImageUrl(draft.questionImage!);
                              setPreviewImageTitle(`MCQ #${idx + 1} - Question Image`);
                            }}
                            className="p-1 bg-slate-900/90 text-blue-400 hover:text-white rounded shadow"
                            title="Zoom full size"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerImagePick(draft.idTemp, 'questionImage')}
                            className="p-1 bg-slate-900/90 text-amber-300 hover:text-white rounded shadow text-[10px] px-1 font-bold"
                            title="Change image"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(draft.idTemp, 'questionImage')}
                            className="p-1 bg-rose-900/90 text-rose-200 hover:text-white rounded shadow"
                            title="Remove image"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerImagePick(draft.idTemp, 'questionImage')}
                        className="w-full border-2 border-dashed border-slate-700 hover:border-blue-500/70 bg-slate-950/60 rounded-xl p-3 flex flex-col items-center justify-center text-center group transition-colors min-h-[82px]"
                      >
                        <ImageIcon className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                        <span className="text-xs text-slate-400 group-hover:text-slate-200 font-medium mt-1">
                          + Upload Question Image
                        </span>
                        <span className="text-[10px] text-slate-500">PNG, JPG, SVG, WEBP</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Options Grid (A, B, C, D) with Image upload for each option */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Options (A, B, C, D) — Select the radio button for the Correct Answer:
                    </span>
                    <span className="text-xs text-blue-400 font-semibold">
                      Correct Answer: Option {draft.answer}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(['A', 'B', 'C', 'D'] as const).map(optLetter => {
                      const textKey = `option${optLetter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
                      const imgKey = `option${optLetter}Image` as 'optionAImage' | 'optionBImage' | 'optionCImage' | 'optionDImage';
                      const isSelectedAnswer = draft.answer === optLetter;

                      return (
                        <div
                          key={optLetter}
                          className={`p-3 rounded-xl border transition-all ${
                            isSelectedAnswer
                              ? 'bg-blue-950/30 border-blue-500 ring-1 ring-blue-500/40'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <input
                                type="radio"
                                name={`answer-group-${draft.idTemp}`}
                                checked={isSelectedAnswer}
                                onChange={() => handleUpdateDraft(draft.idTemp, 'answer', optLetter)}
                                className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500"
                              />
                              <span
                                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                  isSelectedAnswer ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                Option {optLetter}
                              </span>
                            </label>

                            {isSelectedAnswer && (
                              <span className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Correct Answer</span>
                              </span>
                            )}
                          </div>

                          <div className="space-y-2">
                            <input
                              type="text"
                              value={draft[textKey]}
                              onChange={e => handleUpdateDraft(draft.idTemp, textKey, e.target.value)}
                              placeholder={`Option ${optLetter} text / label (optional if image)`}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />

                            {/* Option Image Box */}
                            {draft[imgKey] ? (
                              <div className="relative group bg-slate-900 border border-slate-700 rounded-lg p-1.5 flex items-center justify-center min-h-[50px]">
                                <img
                                  src={draft[imgKey]}
                                  alt={`Option ${optLetter}`}
                                  className="max-h-16 max-w-full object-contain cursor-pointer rounded"
                                  onClick={() => {
                                    setPreviewImageUrl(draft[imgKey]!);
                                    setPreviewImageTitle(`MCQ #${idx + 1} - Option ${optLetter} Image`);
                                  }}
                                />
                                <div className="absolute top-1 right-1 flex items-center space-x-1 opacity-90 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewImageUrl(draft[imgKey]!);
                                      setPreviewImageTitle(`MCQ #${idx + 1} - Option ${optLetter} Image`);
                                    }}
                                    className="p-0.5 bg-slate-950/90 text-blue-400 hover:text-white rounded"
                                    title="Zoom"
                                  >
                                    <Maximize2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => triggerImagePick(draft.idTemp, imgKey)}
                                    className="px-1 py-0.5 bg-slate-950/90 text-amber-300 hover:text-white rounded text-[9px] font-bold"
                                    title="Change"
                                  >
                                    Change
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveImage(draft.idTemp, imgKey)}
                                    className="p-0.5 bg-rose-950/90 text-rose-300 hover:text-white rounded"
                                    title="Remove"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => triggerImagePick(draft.idTemp, imgKey)}
                                className="w-full border border-dashed border-slate-800 hover:border-slate-700 bg-slate-900/40 rounded-lg py-1.5 px-2 flex items-center justify-center space-x-1.5 text-slate-400 hover:text-slate-200 transition-colors text-xs"
                              >
                                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                                <span>+ Add Option {optLetter} Image</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Explanation Section + Explanation Image */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start pt-2 border-t border-slate-800">
                  <div className="lg:col-span-8 space-y-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Solution / Explanation Text (Optional):
                    </label>
                    <textarea
                      rows={2}
                      value={draft.explanation || ''}
                      onChange={e => handleUpdateDraft(draft.idTemp, 'explanation', e.target.value)}
                      placeholder="Enter detailed step-by-step solution, theorem, or mathematical formula explanation..."
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 leading-relaxed font-sans"
                    />
                  </div>

                  <div className="lg:col-span-4 space-y-1">
                    <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                      <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                      <span>Explanation / Solution Image:</span>
                    </label>

                    {draft.explanationImage ? (
                      <div className="relative group bg-slate-950 border border-purple-500/40 rounded-xl p-2 flex items-center justify-center min-h-[66px] overflow-hidden">
                        <img
                          src={draft.explanationImage}
                          alt="Explanation Solution Diagram"
                          className="max-h-20 max-w-full object-contain cursor-pointer rounded"
                          onClick={() => {
                            setPreviewImageUrl(draft.explanationImage!);
                            setPreviewImageTitle(`MCQ #${idx + 1} - Explanation Solution Image`);
                          }}
                        />
                        <div className="absolute top-1 right-1 flex items-center space-x-1 opacity-90 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewImageUrl(draft.explanationImage!);
                              setPreviewImageTitle(`MCQ #${idx + 1} - Explanation Solution Image`);
                            }}
                            className="p-1 bg-slate-900/90 text-purple-300 hover:text-white rounded shadow"
                            title="Zoom full size"
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerImagePick(draft.idTemp, 'explanationImage')}
                            className="p-1 bg-slate-900/90 text-amber-300 hover:text-white rounded shadow text-[9px] px-1 font-bold"
                            title="Change image"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(draft.idTemp, 'explanationImage')}
                            className="p-1 bg-rose-900/90 text-rose-200 hover:text-white rounded shadow"
                            title="Remove image"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerImagePick(draft.idTemp, 'explanationImage')}
                        className="w-full border border-dashed border-slate-700 hover:border-purple-500/70 bg-slate-950/60 rounded-xl p-2.5 flex items-center justify-center space-x-1.5 text-slate-400 hover:text-slate-200 transition-colors text-xs min-h-[66px]"
                      >
                        <ImageIcon className="w-4 h-4 text-purple-400" />
                        <span>+ Add Solution Image</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Send to Review & Import Button */}
          <div className="flex flex-wrap items-center justify-between pt-4 border-t border-slate-800 gap-3">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleAddNewDraft}
                className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors border border-slate-700"
              >
                <Plus className="w-4 h-4" />
                <span>Add Another Question</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('Clear all draft question cards?')) {
                    setDrafts([
                      {
                        idTemp: Date.now(),
                        subject: bulkSubject.trim() || 'General',
                        chapter: bulkChapter.trim() || 'General',
                        question: '',
                        questionImage: '',
                        optionA: '',
                        optionAImage: '',
                        optionB: '',
                        optionBImage: '',
                        optionC: '',
                        optionCImage: '',
                        optionD: '',
                        optionDImage: '',
                        answer: 'A',
                        explanation: '',
                        explanationImage: '',
                        difficulty: 'Moderate'
                      }
                    ]);
                  }
                }}
                className="px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-xl text-xs font-semibold transition-colors"
              >
                Clear All
              </button>
            </div>

            <button
              type="button"
              onClick={handleSendDraftsToReview}
              className="flex items-center space-x-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg transition-all"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Send {drafts.length} Image MCQs to Review & Import</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: ZIP ARCHIVE UPLOAD WITH IMAGES */}
      {activeSubMode === 'zip' && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center mx-auto">
              <FolderArchive className="w-8 h-8" />
            </div>

            <div className="max-w-md mx-auto">
              <h3 className="text-base font-bold text-white">Upload ZIP Archive with Questions & Images</h3>
              <p className="text-xs text-slate-400 mt-1">
                Upload a .zip file containing an Excel/JSON questions list along with an <code className="text-purple-300 font-mono">images/</code> folder. The system matches image filenames to each question automatically.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <label className="flex items-center space-x-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer">
                <UploadCloud className="w-4 h-4" />
                <span>{isProcessingZip ? 'Processing ZIP...' : 'Select ZIP File (.zip)'}</span>
                <input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={handleZipFileUpload}
                  disabled={isProcessingZip}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={downloadSampleImageMcqZip}
                className="flex items-center space-x-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download Sample ZIP Package</span>
              </button>
            </div>

            {zipStatusMsg && (
              <div className="p-3 bg-purple-950/40 border border-purple-900/60 rounded-xl text-xs text-purple-200 max-w-lg mx-auto">
                {zipStatusMsg}
              </div>
            )}
          </div>

          {/* Instructions Box */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 space-y-2">
            <div className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-blue-400" />
              <span>How Image MCQ ZIP Upload works:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>
                <strong>Excel columns:</strong> <code className="text-blue-300">Question_Image</code>, <code className="text-blue-300">Option_A_Image</code>, <code className="text-blue-300">Option_B_Image</code>, <code className="text-blue-300">Option_C_Image</code>, <code className="text-blue-300">Option_D_Image</code>, <code className="text-blue-300">Explanation_Image</code>.
              </li>
              <li>
                In each cell, type the image filename (e.g. <code className="text-amber-300">q1.png</code>, <code className="text-amber-300">diagram_b.jpg</code>).
              </li>
              <li>
                Put all your images in the ZIP file and upload. All diagrams and options will be imported with zero formatting loss!
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* MODE 3: BATCH MULTI-IMAGE AUTO-MATCHER */}
      {activeSubMode === 'batch_images' && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
              <Files className="w-8 h-8" />
            </div>

            <div className="max-w-md mx-auto">
              <h3 className="text-base font-bold text-white">Batch Select Multiple Image Screenshots</h3>
              <p className="text-xs text-slate-400 mt-1">
                Select or drop multiple image files (e.g. <code className="text-emerald-300 font-mono">Q1_Question.png</code>, <code className="text-emerald-300 font-mono">Q1_A.png</code>, <code className="text-emerald-300 font-mono">Q1_B.png</code>, <code className="text-emerald-300 font-mono">Q1_Sol.png</code>).
                Our smart parser pairs them together into complete MCQs automatically!
              </p>
            </div>

            <div className="flex items-center justify-center pt-2">
              <label className="flex items-center space-x-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer">
                <UploadCloud className="w-4 h-4" />
                <span>{isMatchingBatch ? 'Analyzing & Pairing Images...' : 'Select All MCQ Images (Multiple)'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/png, image/jpeg, image/jpg, image/webp, image/gif, image/svg+xml"
                  onChange={handleBatchImagesDrop}
                  disabled={isMatchingBatch}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* High-Resolution Full Size Image Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <span className="text-sm font-bold text-white flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-blue-400" />
                <span>{previewImageTitle || 'Image Full View'}</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageUrl(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex items-center justify-center bg-slate-950 overflow-auto max-h-[calc(90vh-70px)]">
              <img
                src={previewImageUrl}
                alt="Full preview"
                className="max-h-[75vh] max-w-full object-contain rounded-lg shadow"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
