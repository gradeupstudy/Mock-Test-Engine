import React, { useState, useEffect } from 'react';
import {
  Share2,
  Globe,
  Plus,
  Trash2,
  Copy,
  Check,
  Trophy,
  Users,
  Download,
  BarChart2,
  ExternalLink,
  Youtube,
  Send,
  Instagram,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  Eye,
  Settings,
  HelpCircle
} from 'lucide-react';
import { MockHistory, OnlineMockConfig, SocialMediaTask, StudentAttemptRecord, Question } from '../types';
import { downloadMockHtmlFile } from '../lib/generateMockHtml';
import { encodeMockForUrl } from '../lib/mockEncoder';

const LOCAL_STORAGE_MOCKS_KEY = 'gradeup_published_mocks_v1';

const getStoredLocalMocks = (): OnlineMockConfig[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MOCKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveStoredLocalMocks = (list: OnlineMockConfig[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_MOCKS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Failed to save local mocks:', e);
  }
};

interface OnlineMocksAdminViewProps {
  mockHistory: MockHistory[];
  activeTestQuestions?: Question[];
  activeTestName?: string;
  onOpenStudentPortal?: (shareId: string) => void;
}

export const OnlineMocksAdminView: React.FC<OnlineMocksAdminViewProps> = ({
  mockHistory,
  activeTestQuestions = [],
  activeTestName = 'Model Test Paper',
  onOpenStudentPortal
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [publishedMocks, setPublishedMocks] = useState<any[]>([]);
  const [selectedMockShareId, setSelectedMockShareId] = useState<string>('');
  const [selectedMockResults, setSelectedMockResults] = useState<{
    summary: {
      shareId: string;
      testName: string;
      totalAttempts: number;
      avgScore: number;
      highestScore: number;
      topRankers: StudentAttemptRecord[];
      allAttempts: StudentAttemptRecord[];
    };
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'PUBLISHED_TESTS' | 'PUBLISH_NEW' | 'LIVE_RESULTS'>('PUBLISHED_TESTS');

  // Copy URL Feedback
  const [copiedShareId, setCopiedShareId] = useState<string>('');

  // Search & Filter in Live Results
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('ALL');

  // Form State for Publishing New Test
  const [selectedMockForPublish, setSelectedMockForPublish] = useState<string>('CURRENT'); // 'CURRENT' or mockHistory id
  const [customTestName, setCustomTestName] = useState<string>(activeTestName);
  const [instituteName, setInstituteName] = useState<string>('Gradeup Study');
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [marksPerQ, setMarksPerQ] = useState<number>(2);
  const [negativeMarksPerQ, setNegativeMarksPerQ] = useState<number>(0.5);

  // Social Media Tasks for the new published test
  const [socialTasks, setSocialTasks] = useState<SocialMediaTask[]>([
    {
      id: 'task_yt',
      platform: 'youtube',
      title: 'Subscribe to Gradeup Study YouTube Channel',
      url: 'https://youtube.com/@gradeupstudy',
      isRequired: true
    },
    {
      id: 'task_tg',
      platform: 'telegram',
      title: 'Join Gradeup Study Telegram Channel',
      url: 'https://t.me/gradeupstudy',
      isRequired: true
    },
    {
      id: 'task_ig',
      platform: 'instagram',
      title: 'Follow Gradeup Study Instagram',
      url: 'https://instagram.com/gradeupstudy',
      isRequired: false
    }
  ]);

  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishStatusMsg, setPublishStatusMsg] = useState<string>('');

  // Fetch all published tests from server and combine with local storage
  const fetchPublishedMocks = async () => {
    setLoading(true);
    let combinedMocks: any[] = [];
    const localList = getStoredLocalMocks();

    // Auto-sync local storage mocks to server
    for (const loc of localList) {
      try {
        await fetch('/api/online-mocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loc)
        });
      } catch (_e) {}
    }

    try {
      const res = await fetch('/api/online-mocks');
      const data = await res.json();
      if (data.success && Array.isArray(data.mocks)) {
        combinedMocks = data.mocks;
      }
    } catch (e) {
      console.warn('Failed to fetch online mocks list from server:', e);
    }

    // Merge local storage mocks if not already in server list
    localList.forEach(loc => {
      if (!combinedMocks.some(m => m.shareId === loc.shareId)) {
        combinedMocks.unshift({
          shareId: loc.shareId,
          testName: loc.testName,
          instituteName: loc.instituteName || 'Gradeup Study',
          questionCount: loc.questions ? loc.questions.length : 0,
          duration: loc.duration,
          socialTasksCount: loc.socialTasks ? loc.socialTasks.length : 0,
          totalAttempts: 0,
          avgScore: 0,
          createdDate: loc.createdDate,
          fullConfig: loc
        });
      }
    });

    setPublishedMocks(combinedMocks);
    if (combinedMocks.length > 0 && !selectedMockShareId) {
      setSelectedMockShareId(combinedMocks[0].shareId);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPublishedMocks();
  }, []);

  // Fetch results when selected mock changes or tab switches
  const fetchMockResults = async (shareId: string) => {
    if (!shareId) return;
    try {
      let serverAttempts: any[] = [];
      let summaryData: any = null;

      try {
        const res = await fetch(`/api/online-mocks/${shareId}/results`);
        const data = await res.json();
        if (data.success && data.summary) {
          summaryData = data.summary;
          serverAttempts = data.summary.allAttempts || [];
        }
      } catch (e) {
        console.warn('Server fetch for results warning:', e);
      }

      // Check local storage for attempts saved locally
      let localAttempts: any[] = [];
      try {
        const rawLoc = localStorage.getItem(`gradeup_online_attempts_${shareId}`);
        if (rawLoc) {
          localAttempts = JSON.parse(rawLoc);
        }
      } catch (_locE) {}

      // Combine server & local attempts, deduplicating by id
      const attemptMap = new Map<string, any>();
      serverAttempts.forEach(a => attemptMap.set(a.id || `${a.studentName}_${a.mobileNo}`, a));
      localAttempts.forEach(a => {
        const key = a.id || `${a.studentName}_${a.mobileNo}`;
        if (!attemptMap.has(key)) {
          attemptMap.set(key, a);
        }
      });

      const allAttempts = Array.from(attemptMap.values()).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (a.timeTakenSeconds || 0) - (b.timeTakenSeconds || 0);
      });

      const rankedAttempts = allAttempts.map((att, idx) => ({
        ...att,
        rank: idx + 1
      }));

      const totalAttempts = rankedAttempts.length;
      const avgScore = totalAttempts > 0
        ? Math.round((rankedAttempts.reduce((a, c) => a + (c.score || 0), 0) / totalAttempts) * 10) / 10
        : 0;
      const highestScore = totalAttempts > 0 ? rankedAttempts[0].score : 0;

      setSelectedMockResults({
        success: true,
        summary: {
          shareId,
          testName: summaryData?.testName || 'Online Mock Test',
          totalAttempts,
          avgScore,
          highestScore,
          topRankers: rankedAttempts.slice(0, 10),
          allAttempts: rankedAttempts
        }
      });
    } catch (e) {
      console.warn('Failed to fetch mock results:', e);
    }
  };

  useEffect(() => {
    if (selectedMockShareId) {
      fetchMockResults(selectedMockShareId);
    }

    let pollInterval: any = null;
    if (activeTab === 'LIVE_RESULTS' && selectedMockShareId) {
      pollInterval = setInterval(() => {
        fetchMockResults(selectedMockShareId);
      }, 4000); // Real-time live auto refresh every 4 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [selectedMockShareId, activeTab]);

  // Demo Student Generator for Testing Live Leaderboard
  const handleAddDemoStudentAttempt = async () => {
    if (!selectedMockShareId) {
      alert('Please publish a mock test first!');
      return;
    }
    const names = ['Rahul Sharma', 'Ananya Verma', 'Priya Singh', 'Vikram Patel', 'Amit Kumar', 'Neha Gupta', 'Saurabh Joshi'];
    const districts = ['Patna', 'Lucknow', 'Jaipur', 'Ranchi', 'Delhi', 'Bhopal', 'Indore'];
    const states = ['Bihar', 'Uttar Pradesh', 'Rajasthan', 'Jharkhand', 'Delhi', 'Madhya Pradesh', 'Madhya Pradesh'];
    const randomIdx = Math.floor(Math.random() * names.length);

    const demoPayload = {
      studentName: names[randomIdx],
      mobileNo: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      state: states[randomIdx],
      district: districts[randomIdx],
      socialsFollowed: true,
      score: Math.floor(30 + Math.random() * 65),
      totalMarks: 100,
      percentage: Math.floor(40 + Math.random() * 55),
      correctCount: Math.floor(15 + Math.random() * 30),
      incorrectCount: Math.floor(2 + Math.random() * 10),
      unattemptedCount: Math.floor(1 + Math.random() * 8),
      timeTakenSeconds: Math.floor(600 + Math.random() * 1800)
    };

    try {
      await fetch(`/api/online-mocks/${selectedMockShareId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoPayload)
      });
      await fetchMockResults(selectedMockShareId);
    } catch (e) {
      console.warn('Failed to add demo student attempt:', e);
    }
  };

  // Social Task Helpers
  const handleAddSocialTask = () => {
    setSocialTasks(prev => [
      ...prev,
      {
        id: `task_${Date.now()}`,
        platform: 'youtube',
        title: 'Subscribe to Official Channel',
        url: 'https://youtube.com',
        isRequired: true
      }
    ]);
  };

  const handleUpdateSocialTask = (id: string, field: keyof SocialMediaTask, value: any) => {
    setSocialTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleDeleteSocialTask = (id: string) => {
    setSocialTasks(prev => prev.filter(t => t.id !== id));
  };

  // Publish Test Action -> Generates Standalone Interactive HTML File + Local Sync
  const handlePublishOnlineMock = async (e: React.FormEvent) => {
    e.preventDefault();

    let questionsToPublish: Question[] = [];
    let nameToPublish = customTestName;

    if (selectedMockForPublish === 'CURRENT') {
      questionsToPublish = activeTestQuestions;
    } else {
      const foundMock = mockHistory.find(m => String(m.id || m.mockId) === selectedMockForPublish);
      if (foundMock && foundMock.questions) {
        questionsToPublish = foundMock.questions;
        if (!nameToPublish) nameToPublish = foundMock.testName;
      }
    }

    if (questionsToPublish.length === 0) {
      alert('Selected test has no questions to publish. Please generate or create a mock test first.');
      return;
    }

    setIsPublishing(true);
    setPublishStatusMsg('Generating standalone test HTML file & publishing mock test...');

    try {
      const parsedDuration = isNaN(Number(durationMinutes)) ? 60 : Number(durationMinutes);
      const parsedMarksPerQ = isNaN(Number(marksPerQ)) ? 2 : Number(marksPerQ);
      const parsedNegMarksPerQ = isNaN(Number(negativeMarksPerQ)) ? 0.5 : Number(negativeMarksPerQ);

      const shareId = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const fullConfig: OnlineMockConfig = {
        shareId,
        mockId: selectedMockForPublish !== 'CURRENT' ? Number(selectedMockForPublish) : undefined,
        testName: nameToPublish || 'Online Mock Test',
        instituteName: instituteName || 'Gradeup Study',
        duration: parsedDuration,
        totalMarks: questionsToPublish.length * parsedMarksPerQ,
        marksPerQuestion: parsedMarksPerQ,
        negativeMarksPerQuestion: parsedNegMarksPerQ,
        socialTasks: socialTasks || [],
        questions: questionsToPublish,
        createdDate: new Date().toISOString(),
        isActive: true
      };

      // 1. Download Standalone Interactive HTML file
      downloadMockHtmlFile(fullConfig);

      // 2. Save locally so it works even offline or serverless
      const existingLocal = getStoredLocalMocks();
      saveStoredLocalMocks([fullConfig, ...existingLocal]);

      // 3. Sync to API if backend server is available
      try {
        await fetch('/api/online-mocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullConfig)
        });
      } catch (_apiErr) {
        console.warn('API sync warning (using standalone HTML & local mode):', _apiErr);
      }

      setPublishStatusMsg(`Successfully generated HTML file & published mock test!`);
      await fetchPublishedMocks();
      setSelectedMockShareId(shareId);
      setActiveTab('PUBLISHED_TESTS');

      alert(`✅ Mock Test Published & HTML File Downloaded!\n\n1. Standalone HTML file "${fullConfig.testName}.html" has been downloaded to your device.\n2. You can share this HTML file directly with students on WhatsApp/Telegram!\n3. When students open this HTML file, they will first follow social channels, fill their details, and attempt the interactive test.`);
    } catch (err: any) {
      alert(`Publish Error: ${err.message || 'Failed to generate test file.'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  // Delete Published Test
  const handleDeletePublishedMock = async (shareId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete published test "${name}"? All student attempts will be removed.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/online-mocks/${shareId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchPublishedMocks();
        if (selectedMockShareId === shareId) {
          setSelectedMockShareId('');
          setSelectedMockResults(null);
        }
      }
    } catch (e) {
      alert('Failed to delete online test.');
    }
  };

  // Helper to generate public link with compact zlib payload
  const getPublicShareUrl = (shareId: string, fullConfig?: OnlineMockConfig) => {
    const origin = window.location.origin;
    let url = `${origin}/?publicMock=${shareId}`;

    let configToEncode = fullConfig;
    if (!configToEncode) {
      const localList = getStoredLocalMocks();
      configToEncode = localList.find(m => m.shareId === shareId);
    }

    if (configToEncode) {
      const encoded = encodeMockForUrl(configToEncode);
      if (encoded) {
        url += `&c=${encoded}`;
      }
    }

    return url;
  };

  // Copy Link Action
  const handleCopyShareLink = (shareId: string, fullConfig?: OnlineMockConfig) => {
    const url = getPublicShareUrl(shareId, fullConfig);
    navigator.clipboard.writeText(url);
    setCopiedShareId(shareId);
    setTimeout(() => setCopiedShareId(''), 2500);
  };

  // Export Results to CSV
  const handleExportCSV = () => {
    if (!selectedMockResults || !selectedMockResults.summary.allAttempts.length) {
      alert('No student attempt records available to export.');
      return;
    }

    const attempts = selectedMockResults.summary.allAttempts;
    let csv = 'Rank,Candidate Name,Mobile Number,State,District,Score,Total Marks,Percentage,Correct,Incorrect,Unattempted,Time Taken (Sec),Submitted Date\n';

    attempts.forEach(a => {
      csv += `${a.rank || ''},"${a.studentName}","${a.mobileNo}","${a.state}","${a.district}",${a.score},${a.totalMarks},${a.percentage}%,${a.correctCount},${a.incorrectCount},${a.unattemptedCount},${a.timeTakenSeconds},"${a.submittedAt}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedMockResults.summary.testName}_student_results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Attempts for Results View
  const filteredAttempts = (selectedMockResults?.summary.allAttempts || []).filter(att => {
    const matchesSearch = !searchQuery.trim() ||
      att.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      att.mobileNo.includes(searchQuery) ||
      att.district.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedStateFilter === 'ALL' || att.state === selectedStateFilter;
    return matchesSearch && matchesState;
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-slate-900 border border-indigo-700/60 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-indigo-600/30 border border-indigo-400/40 rounded-xl">
              <Globe className="w-5 h-5 text-indigo-300" />
            </span>
            <h2 className="text-xl font-bold tracking-tight">Online Shared Mock Test & Live Results</h2>
          </div>
          <p className="text-xs text-indigo-200 max-w-2xl leading-relaxed">
            Publish MCQ Mock Tests with mandatory social media channel links (YouTube, Telegram, Instagram). Students attempt via share link, register details, and view live rank & topper lists instantly.
          </p>
        </div>

        <button
          onClick={() => setActiveTab('PUBLISH_NEW')}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center justify-center space-x-1.5 flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Publish New Online Test</span>
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center space-x-2 border-b border-[#1f2863] pb-3">
        <button
          onClick={() => setActiveTab('PUBLISHED_TESTS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'PUBLISHED_TESTS'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-[#151c4d] text-slate-400 hover:text-white'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span>Published Tests ({publishedMocks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('LIVE_RESULTS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'LIVE_RESULTS'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-[#151c4d] text-slate-400 hover:text-white'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Live Results & Leaderboard</span>
        </button>

        <button
          onClick={() => setActiveTab('PUBLISH_NEW')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'PUBLISH_NEW'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-[#151c4d] text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>Create & Link Socials</span>
        </button>
      </div>

      {/* ================= TAB 1: PUBLISHED ONLINE TESTS LIST ================= */}
      {activeTab === 'PUBLISHED_TESTS' && (
        <div className="space-y-4">
          {publishedMocks.length === 0 ? (
            <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-8 text-center space-y-3">
              <Globe className="w-10 h-10 text-indigo-400 mx-auto" />
              <h3 className="text-base font-bold text-white">No Online Mock Tests Published Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Publish your first MCQ mock test with social media channel links (YouTube, Telegram, etc.) to share with aspirants.
              </p>
              <button
                onClick={() => setActiveTab('PUBLISH_NEW')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Publish First Online Mock Test</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publishedMocks.map((mock) => {
                const shareUrl = getPublicShareUrl(mock.shareId, mock.fullConfig);
                const isCopied = copiedShareId === mock.shareId;

                return (
                  <div
                    key={mock.shareId}
                    className="bg-[#121742] border border-[#1f2863] hover:border-indigo-500/50 rounded-2xl p-5 space-y-4 shadow-lg transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] bg-indigo-900/80 border border-indigo-700 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded">
                          ID: {mock.shareId}
                        </span>
                        <h3 className="text-base font-bold text-white mt-1">{mock.testName}</h3>
                        <p className="text-xs text-slate-400">{mock.instituteName || 'Gradeup Study'}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs bg-emerald-950 border border-emerald-700 text-emerald-400 px-2.5 py-1 rounded-lg font-mono font-bold block">
                          {mock.totalAttempts} Aspirants
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                          Avg: {mock.avgScore} Marks
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center p-2.5 bg-[#0e1233] rounded-xl border border-[#1b2259] text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Questions</div>
                        <div className="font-mono font-bold text-white">{mock.questionCount} MCQs</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Duration</div>
                        <div className="font-mono font-bold text-indigo-300">{mock.duration} Mins</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">Social Links</div>
                        <div className="font-mono font-bold text-purple-300">{mock.socialTasksCount} Linked</div>
                      </div>
                    </div>

                    {/* Share Link Box */}
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Shareable Student Link:</span>
                        <span className="text-emerald-400 font-mono">100% Portable Link</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          readOnly
                          value={shareUrl}
                          className="flex-1 bg-slate-900 border border-slate-700 text-indigo-300 text-[11px] font-mono rounded-lg px-2.5 py-1.5 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopyShareLink(mock.shareId, mock.fullConfig)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
                            isCopied === mock.shareId
                              ? 'bg-emerald-600 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          }`}
                        >
                          {isCopied === mock.shareId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied === mock.shareId ? 'Copied' : 'Copy Link'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => {
                            if (mock.fullConfig) {
                              downloadMockHtmlFile(mock.fullConfig);
                            } else {
                              fetch(`/api/online-mocks/${mock.shareId}`)
                                .then(res => res.json())
                                .then(data => {
                                  if (data.success && data.onlineMock) {
                                    downloadMockHtmlFile(data.onlineMock);
                                  } else {
                                    alert('Could not generate HTML file for this test.');
                                  }
                                })
                                .catch(() => alert('Failed to download test HTML file.'));
                            }
                          }}
                          className="px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white border border-emerald-500/60 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1 shadow-sm"
                          title="Download Standalone HTML File for WhatsApp / Telegram sharing"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download HTML File</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedMockShareId(mock.shareId);
                            setActiveTab('LIVE_RESULTS');
                          }}
                          className="px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center space-x-1"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          <span>View Results</span>
                        </button>

                        <button
                          onClick={() => {
                            if (onOpenStudentPortal) {
                              onOpenStudentPortal(mock.shareId);
                            } else {
                              window.open(shareUrl, '_blank');
                            }
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-colors flex items-center space-x-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Preview Portal</span>
                        </button>
                      </div>

                      <button
                        onClick={() => handleDeletePublishedMock(mock.shareId, mock.testName)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                        title="Delete Published Test"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: PUBLISH NEW TEST & LINK SOCIALS ================= */}
      {activeTab === 'PUBLISH_NEW' && (
        <form onSubmit={handlePublishOnlineMock} className="space-y-6 max-w-3xl">
          {/* Select Source Mock */}
          <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>1. Choose MCQ Test to Publish</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Select Mock Test Source:
                </label>
                <select
                  value={selectedMockForPublish}
                  onChange={e => setSelectedMockForPublish(e.target.value)}
                  className="w-full bg-[#0a0e2e] border border-[#232f7a] text-white text-xs rounded-xl p-2.5 font-medium"
                >
                  <option value="CURRENT">
                    ⭐ Currently Generated Active Test ({activeTestQuestions.length} MCQs) - "{activeTestName}"
                  </option>
                  {mockHistory.map((m) => (
                    <option key={m.id || m.mockId} value={String(m.id || m.mockId)}>
                      Saved History Test #{m.mockId}: {m.testName} ({m.questions?.length || 0} MCQs)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Public Test Name (टेस्ट का नाम)
                  </label>
                  <input
                    type="text"
                    required
                    value={customTestName}
                    onChange={e => setCustomTestName(e.target.value)}
                    className="w-full bg-[#0a0e2e] border border-[#232f7a] text-white text-xs rounded-xl p-2.5 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Institute / Coaching Name
                  </label>
                  <input
                    type="text"
                    required
                    value={instituteName}
                    onChange={e => setInstituteName(e.target.value)}
                    className="w-full bg-[#0a0e2e] border border-[#232f7a] text-white text-xs rounded-xl p-2.5 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={e => setDurationMinutes(Number(e.target.value))}
                    className="w-full bg-[#0a0e2e] border border-[#232f7a] text-white text-xs rounded-xl p-2 font-mono font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Marks per Question
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={marksPerQ}
                    onChange={e => setMarksPerQ(Number(e.target.value))}
                    className="w-full bg-[#0a0e2e] border border-[#232f7a] text-white text-xs rounded-xl p-2 font-mono font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Negative Marks
                  </label>
                  <input
                    type="number"
                    step={0.25}
                    value={negativeMarksPerQ}
                    onChange={e => setNegativeMarksPerQ(Number(e.target.value))}
                    className="w-full bg-[#0a0e2e] border border-[#232f7a] text-white text-xs rounded-xl p-2 font-mono font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Social Media Tasks Configuration */}
          <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Youtube className="w-4 h-4 text-rose-400" />
                <span>2. Link Social Media Platforms (Youtube, Telegram, Insta)</span>
              </h3>
              <button
                type="button"
                onClick={handleAddSocialTask}
                className="text-xs bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Social Task</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Students will be prompted to follow these social channels before filling their details and starting the test.
            </p>

            <div className="space-y-3">
              {socialTasks.map((task, idx) => (
                <div key={task.id} className="p-3.5 bg-[#0a0e2e] border border-[#1f2863] rounded-xl space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    <div className="sm:col-span-3">
                      <select
                        value={task.platform}
                        onChange={e => handleUpdateSocialTask(task.id, 'platform', e.target.value)}
                        className="w-full bg-[#121742] border border-[#26327d] text-white text-xs rounded-lg p-2 font-bold"
                      >
                        <option value="youtube">YouTube</option>
                        <option value="telegram">Telegram</option>
                        <option value="instagram">Instagram</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="other">Other Link</option>
                      </select>
                    </div>

                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={task.title}
                        onChange={e => handleUpdateSocialTask(task.id, 'title', e.target.value)}
                        placeholder="Task Title (e.g. Subscribe to YouTube)"
                        className="w-full bg-[#121742] border border-[#26327d] text-white text-xs rounded-lg p-2 font-medium"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <input
                        type="url"
                        value={task.url}
                        onChange={e => handleUpdateSocialTask(task.id, 'url', e.target.value)}
                        placeholder="https://..."
                        className="w-full bg-[#121742] border border-[#26327d] text-indigo-300 text-xs rounded-lg p-2 font-mono"
                      />
                    </div>

                    <div className="sm:col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteSocialTask(task.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isPublishing}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-xl text-sm font-bold shadow-xl transition-all flex items-center justify-center space-x-2"
          >
            {isPublishing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Globe className="w-4 h-4" />
            )}
            <span>{isPublishing ? publishStatusMsg : 'Publish Test & Generate Shareable Link'}</span>
          </button>
        </form>
      )}

      {/* ================= TAB 3: LIVE RESULTS & TOPPER LIST ================= */}
      {activeTab === 'LIVE_RESULTS' && (
        <div className="space-y-6">
          {/* Select Test Picker */}
          <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <BarChart2 className="w-5 h-5 text-indigo-400" />
              <label className="text-xs font-bold text-slate-200">Select Published Online Test:</label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedMockShareId}
                onChange={e => setSelectedMockShareId(e.target.value)}
                className="bg-[#0a0e2e] border border-[#26327d] text-white text-xs rounded-xl px-3 py-2 font-medium"
              >
                {publishedMocks.map(m => (
                  <option key={m.shareId} value={m.shareId}>
                    {m.testName} ({m.totalAttempts} Aspirants)
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddDemoStudentAttempt}
                className="px-3 py-2 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/80 rounded-xl text-xs font-bold transition-all flex items-center space-x-1"
                title="Add sample student attempt to test Leaderboard"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Demo Result</span>
              </button>

              <button
                type="button"
                onClick={() => fetchMockResults(selectedMockShareId)}
                className="p-2 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700 rounded-xl transition-colors"
                title="Refresh Results"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedMockResults && selectedMockResults.summary ? (
            <div className="space-y-6">
              {/* Summary Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-4 text-center space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase">Total Aspirants</div>
                  <div className="text-2xl font-black text-white font-mono">{selectedMockResults.summary.totalAttempts}</div>
                </div>

                <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-4 text-center space-y-1">
                  <div className="text-[11px] font-bold text-amber-400 uppercase">Highest Score</div>
                  <div className="text-2xl font-black text-amber-400 font-mono">{selectedMockResults.summary.highestScore}</div>
                </div>

                <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-4 text-center space-y-1">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase">Average Score</div>
                  <div className="text-2xl font-black text-indigo-300 font-mono">{selectedMockResults.summary.avgScore}</div>
                </div>

                <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-4 text-center space-y-1 flex flex-col items-center justify-center">
                  <button
                    onClick={handleExportCSV}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1.5 shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export Excel CSV</span>
                  </button>
                </div>
              </div>

              {/* Topper List / Leaderboard */}
              <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white">Topper List (Top 10 Rankers)</h3>
                  </div>
                  <span className="text-xs text-indigo-300 font-mono">Live Rank Stream</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedMockResults.summary.topRankers.map((top, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border flex items-center justify-between ${
                        idx === 0 ? 'bg-amber-950/40 border-amber-500/80 text-amber-100' :
                        idx === 1 ? 'bg-slate-900 border-slate-700 text-slate-100' :
                        idx === 2 ? 'bg-amber-950/20 border-amber-700/60 text-slate-200' :
                        'bg-[#0a0e2e] border-[#1f2863] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`w-8 h-8 rounded-full font-mono font-bold text-xs flex items-center justify-center ${
                          idx === 0 ? 'bg-amber-400 text-slate-950 shadow-md' :
                          idx === 1 ? 'bg-slate-300 text-slate-950' :
                          idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'
                        }`}>
                          #{idx + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-bold text-white">{top.studentName}</h4>
                          <p className="text-[11px] text-slate-400">{top.district}, {top.state}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-emerald-400">{top.score} Marks</div>
                        <div className="text-[10px] text-indigo-300 font-mono">{top.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* All Student Submissions Data Table */}
              <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <span>All Student Submissions ({filteredAttempts.length})</span>
                  </h3>

                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search Name / Mobile / District..."
                        className="bg-[#0a0e2e] border border-[#26327d] text-white text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-[#090c29] text-slate-400 uppercase text-[10px] font-bold">
                      <tr>
                        <th className="p-3 rounded-l-lg">Rank</th>
                        <th className="p-3">Candidate Name</th>
                        <th className="p-3">Mobile No</th>
                        <th className="p-3">District & State</th>
                        <th className="p-3">Score</th>
                        <th className="p-3">Percentage</th>
                        <th className="p-3 rounded-r-lg">Submitted Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2863] font-medium">
                      {filteredAttempts.map((att) => (
                        <tr key={att.id} className="hover:bg-[#182057] transition-colors">
                          <td className="p-3 font-mono font-bold text-amber-400">#{att.rank}</td>
                          <td className="p-3 font-bold text-white">{att.studentName}</td>
                          <td className="p-3 font-mono text-indigo-300">{att.mobileNo}</td>
                          <td className="p-3 text-slate-400">{att.district}, {att.state}</td>
                          <td className="p-3 font-mono font-bold text-emerald-400">{att.score} / {att.totalMarks}</td>
                          <td className="p-3 font-mono text-purple-300">{att.percentage}%</td>
                          <td className="p-3 text-[11px] text-slate-400 font-mono">
                            {new Date(att.submittedAt).toLocaleDateString()} {new Date(att.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#121742] border border-[#1f2863] rounded-2xl p-8 text-center space-y-2">
              <Trophy className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-400">Select a published test above to view live student results.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
