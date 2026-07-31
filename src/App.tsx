import React, { useState, useEffect } from 'react';
import { Navbar, Sidebar, ActiveModule } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { BulkUploadView } from './components/BulkUploadView';
import { QuestionBankView } from './components/QuestionBankView';
import { MockCreatorView } from './components/MockCreatorView';
import { TestPreviewView } from './components/TestPreviewView';
import { TemplatesView } from './components/TemplatesView';
import { ExportView } from './components/ExportView';
import { AnalyticsView } from './components/AnalyticsView';
import { BackupView } from './components/BackupView';
import { GeminiModal } from './components/GeminiModal';
import { DuplicateModal } from './components/DuplicateModal';

import { Question, MockHistory, Template, AiConfig, DeletedMcqItem, AddedMcqItem } from './types';
import { getStoredAiConfig } from './lib/aiClient';
import { getStoredSupabaseConfig, syncAllMcqsWithSupabase, syncQuestionsToSupabase, deleteQuestionsFromSupabase } from './lib/supabaseClient';
import {
  getDeletedMcqsLog,
  addDeletedMcqsToLog,
  removeDeletedMcqFromLog,
  clearDeletedMcqsLog,
  getAddedMcqsLog,
  addAddedMcqsToLog,
  clearAddedMcqsLog
} from './lib/mcqLogUtils';
import {
  initDatabase,
  getAllQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  deleteQuestionsBatch,
  replaceAllQuestions,
  clearAllQuestions,
  getAllMocks,
  deleteMock,
  getAllTemplates,
  saveTemplate,
  DEFAULT_TEMPLATE
} from './lib/db';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveModule>('dashboard');
  const [isDbLoading, setIsDbLoading] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Core Data State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mockHistory, setMockHistory] = useState<MockHistory[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<Template>(DEFAULT_TEMPLATE);

  // MCQ Memory Logs (Added / Deleted)
  const [deletedMcqs, setDeletedMcqs] = useState<DeletedMcqItem[]>([]);
  const [addedMcqs, setAddedMcqs] = useState<AddedMcqItem[]>([]);

  const refreshMcqLogs = () => {
    setDeletedMcqs(getDeletedMcqsLog());
    setAddedMcqs(getAddedMcqsLog());
  };

  // Active Generated Test State
  const [activeTestQuestions, setActiveTestQuestions] = useState<Question[]>([]);
  const [activeTestName, setActiveTestName] = useState<string>('SSC CGL Model Question Paper 01');
  const [activeTestMarks, setActiveTestMarks] = useState<number>(100);
  const [activeTestDuration, setActiveTestDuration] = useState<number>(60);
  const [activeUniquenessScore, setActiveUniquenessScore] = useState<number>(100);

  // Gemini / AI Config State
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState<boolean>(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState<boolean>(false);
  const [aiConfig, setAiConfig] = useState<AiConfig>(getStoredAiConfig);

  // Initial Data Load
  const loadDatabaseData = async () => {
    setIsDbLoading(true);
    try {
      await initDatabase();
      const loadedQs = await getAllQuestions();
      const loadedMocks = await getAllMocks();
      const loadedTpls = await getAllTemplates();

      setQuestions(loadedQs);
      setMockHistory(loadedMocks);
      setTemplates(loadedTpls);
      refreshMcqLogs();

      if (loadedTpls.length > 0) {
        setCurrentTemplate(loadedTpls[0]);
      }

      // If active test paper is empty, load sample questions for quick test
      if (activeTestQuestions.length === 0 && loadedQs.length > 0) {
        setActiveTestQuestions(loadedQs.slice(0, 10));
      }

      // Automatically sync with Supabase on startup if configured
      triggerSupabaseAutoSync(loadedQs);
    } catch (err: any) {
      console.error('Database load error:', err);
    } finally {
      setIsDbLoading(false);
    }
  };

  useEffect(() => {
    loadDatabaseData();
  }, []);

  // Background Auto-Sync Helper with Supabase
  const triggerSupabaseAutoSync = async (currentLocalQs: Question[]) => {
    const cfg = getStoredSupabaseConfig();
    if (cfg.url && cfg.anonKey) {
      try {
        const res = await syncAllMcqsWithSupabase(currentLocalQs);
        if (res.success && res.allQuestions) {
          setQuestions(res.allQuestions);
          await replaceAllQuestions(res.allQuestions);
        }
      } catch (err) {
        console.warn('Background Supabase sync failed:', err);
      }
    }
  };

  // CRUD Handlers
  const handleAddQuestion = async (q: Omit<Question, 'id'>) => {
    const newId = await addQuestion(q);
    const newQObj: Question = { ...q, id: newId };
    addAddedMcqsToLog([newQObj]);
    refreshMcqLogs();
    setQuestions(prev => [newQObj, ...prev]);
    const updatedQs = await getAllQuestions();
    setQuestions(updatedQs);
    triggerSupabaseAutoSync(updatedQs);
  };

  const handleUpdateQuestion = async (q: Question) => {
    setQuestions(prev => prev.map(item => (item.id === q.id ? q : item)));
    await updateQuestion(q);
    await syncQuestionsToSupabase([q]).catch(() => {});
    const updatedQs = await getAllQuestions();
    setQuestions(updatedQs);
    triggerSupabaseAutoSync(updatedQs);
  };

  const handleDeleteQuestion = async (id: number) => {
    const toDelete = questions.find(item => item.id === id);
    if (toDelete) {
      addDeletedMcqsToLog([toDelete]);
      refreshMcqLogs();
    }
    setQuestions(prev => prev.filter(item => item.id !== id));
    await deleteQuestion(id);
    await deleteQuestionsFromSupabase([id]).catch(() => {});
    const updatedQs = await getAllQuestions();
    setQuestions(updatedQs);
  };

  const handleDeleteBatch = async (ids: number[]) => {
    const setIds = new Set(ids);
    const toDelete = questions.filter(item => item.id && setIds.has(item.id));
    if (toDelete.length > 0) {
      addDeletedMcqsToLog(toDelete);
      refreshMcqLogs();
    }
    setQuestions(prev => prev.filter(item => !setIds.has(item.id!)));
    await deleteQuestionsBatch(ids);
    await deleteQuestionsFromSupabase(ids).catch(() => {});
    const updatedQs = await getAllQuestions();
    setQuestions(updatedQs);
  };

  const handleClearAllQuestions = async () => {
    if (questions.length > 0) {
      addDeletedMcqsToLog(questions);
      refreshMcqLogs();
    }
    await clearAllQuestions();
    setQuestions([]);
  };

  const handleRestoreDeletedMcq = async (item: DeletedMcqItem) => {
    const { id, ...qWithoutId } = item.question;
    const restoredId = await addQuestion(qWithoutId);
    removeDeletedMcqFromLog(item.id);
    refreshMcqLogs();
    const updatedQs = await getAllQuestions();
    setQuestions(updatedQs);
    triggerSupabaseAutoSync(updatedQs);
  };

  const handleClearDeletedLog = () => {
    clearDeletedMcqsLog();
    refreshMcqLogs();
  };

  const handleUpdateBatch = async (updatedQs: Question[]) => {
    const map = new Map(updatedQs.map(q => [q.id, q]));
    setQuestions(prev => prev.map(item => (item.id && map.has(item.id) ? map.get(item.id)! : item)));
    for (const q of updatedQs) {
      await updateQuestion(q);
    }
    await syncQuestionsToSupabase(updatedQs).catch(() => {});
    const updatedLocal = await getAllQuestions();
    setQuestions(updatedLocal);
    triggerSupabaseAutoSync(updatedLocal);
  };

  const handleMockGenerated = (
    selectedQs: Question[],
    mockId: number,
    testName: string,
    marks: number,
    duration: number
  ) => {
    setActiveTestQuestions(selectedQs);
    setActiveTestName(testName);
    setActiveTestMarks(marks);
    setActiveTestDuration(duration);
    setActiveUniquenessScore(100);
    loadDatabaseData(); // Refresh history
  };

  const handleDeleteMock = async (mockToDelete: MockHistory) => {
    setMockHistory(prev => prev.filter(m => m.mockId !== mockToDelete.mockId && m.id !== mockToDelete.id));
    await deleteMock(mockToDelete.id, mockToDelete.mockId);
    const updatedMocks = await getAllMocks();
    setMockHistory(updatedMocks);
  };

  const handleSaveTemplate = async (t: Template) => {
    await saveTemplate(t);
    setCurrentTemplate(t);
    await loadDatabaseData();
  };

  if (isDbLoading) {
    return (
      <div className="min-h-screen bg-[#0d1233] text-white flex items-center justify-center p-4 font-sans">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Initializing Gradeup Study Platform...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1233] text-slate-100 flex flex-col font-sans selection:bg-blue-500/30">
      {/* Top Header */}
      <Navbar
        onOpenGeminiModal={() => setIsGeminiModalOpen(true)}
        geminiActive={Boolean(aiConfig.apiKey || aiConfig.provider === 'ollama')}
        totalQuestions={questions.length}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        aiConfig={aiConfig}
      />

      {/* Main Body: Sidebar + Active Module Content */}
      <div className="flex-1 flex flex-col md:flex-row max-w-[1600px] w-full mx-auto">
        {/* Left Sidebar Navigation */}
        <div className={`md:block ${isMobileMenuOpen ? 'block' : 'hidden'}`}>
          <Sidebar
            activeModule={activeTab}
            onSelectModule={mod => {
              setActiveTab(mod);
              setIsMobileMenuOpen(false);
            }}
            onOpenGeminiModal={() => setIsGeminiModalOpen(true)}
          />
        </div>

        {/* Right Active View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden min-w-0">
          {activeTab === 'dashboard' && (
            <DashboardView
              questions={questions}
              mockHistory={mockHistory}
              onNavigate={setActiveTab as any}
              onOpenDuplicateModal={() => setIsDuplicateModalOpen(true)}
            />
          )}

          {activeTab === 'upload' && (
            <BulkUploadView
              existingQuestions={questions}
              onImportSuccess={async count => {
                await loadDatabaseData();
                const latest = await getAllQuestions();
                triggerSupabaseAutoSync(latest);
                setActiveTab('bank');
              }}
              aiConfig={aiConfig}
            />
          )}

          {activeTab === 'bank' && (
            <QuestionBankView
              questions={questions}
              deletedMcqs={deletedMcqs}
              addedMcqs={addedMcqs}
              onAddQuestion={handleAddQuestion}
              onUpdateQuestion={handleUpdateQuestion}
              onDeleteQuestion={handleDeleteQuestion}
              onDeleteBatch={handleDeleteBatch}
              onUpdateBatch={handleUpdateBatch}
              onClearAll={handleClearAllQuestions}
              onRestoreDeletedMcq={handleRestoreDeletedMcq}
              onClearDeletedLog={handleClearDeletedLog}
              onOpenDuplicateModal={() => setIsDuplicateModalOpen(true)}
              aiConfig={aiConfig}
            />
          )}

          {activeTab === 'creator' && (
            <MockCreatorView
              questions={questions}
              mockHistory={mockHistory}
              onMockGenerated={handleMockGenerated}
              onNavigateToPreview={() => setActiveTab('preview')}
            />
          )}

          {activeTab === 'preview' && (
            <TestPreviewView
              testQuestions={activeTestQuestions}
              testName={activeTestName}
              totalMarks={activeTestMarks}
              duration={activeTestDuration}
              uniquenessScore={activeUniquenessScore}
              allBankQuestions={questions}
              onUpdateTestQuestions={async (qs) => {
                setActiveTestQuestions(qs);
                const questionsWithId = qs.filter(q => q.id !== undefined);
                if (questionsWithId.length > 0) {
                  await handleUpdateBatch(questionsWithId);
                }
              }}
              onNavigateToExport={() => setActiveTab('export')}
            />
          )}

          {activeTab === 'templates' && (
            <TemplatesView
              currentTemplate={currentTemplate}
              templates={templates}
              onSaveTemplate={handleSaveTemplate}
              onSetDefaultTemplate={t => setCurrentTemplate(t)}
            />
          )}

          {activeTab === 'export' && (
            <ExportView
              currentQuestions={activeTestQuestions}
              mockHistory={mockHistory}
              allQuestions={questions}
              template={currentTemplate}
              testName={activeTestName}
              totalMarks={activeTestMarks}
              duration={activeTestDuration}
              onDeleteMock={handleDeleteMock}
              onLoadMockFromHistory={(mock, mockQs) => {
                setActiveTestQuestions(mockQs);
                setActiveTestName(mock.testName);
                setActiveTestMarks(mock.marks || mockQs.length * 2);
                setActiveTestDuration(mock.duration || 60);
                setActiveUniquenessScore(mock.uniqueness || 100);
              }}
              onNavigateToTemplates={() => setActiveTab('templates')}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView questions={questions} mockHistory={mockHistory} />
          )}

          {activeTab === 'backup' && (
            <BackupView
              questions={questions}
              mockHistory={mockHistory}
              onDataRestored={loadDatabaseData}
              onClearAll={handleClearAllQuestions}
            />
          )}
        </main>
      </div>

      <GeminiModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        aiConfig={aiConfig}
        onSaveAiConfig={setAiConfig}
      />

      <DuplicateModal
        isOpen={isDuplicateModalOpen}
        onClose={() => setIsDuplicateModalOpen(false)}
        questions={questions}
        onDeleteBatch={handleDeleteBatch}
        onDeleteQuestion={handleDeleteQuestion}
      />
    </div>
  );
}

export default App;
