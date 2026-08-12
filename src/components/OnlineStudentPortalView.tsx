import React, { useState, useEffect, useMemo } from 'react';
import {
  Youtube,
  Send,
  Instagram,
  MessageSquare,
  CheckCircle,
  Clock,
  User,
  Phone,
  MapPin,
  Award,
  Trophy,
  BarChart2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { OnlineMockConfig, SocialMediaTask, StudentAttemptRecord } from '../types';

interface OnlineStudentPortalViewProps {
  shareId: string;
  onExitPortal?: () => void;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir'
];

export const OnlineStudentPortalView: React.FC<OnlineStudentPortalViewProps> = ({ shareId, onExitPortal }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [mockData, setMockData] = useState<OnlineMockConfig | null>(null);

  // Flow Steps: 'SOCIAL_FOLLOW' | 'REGISTRATION' | 'TEST_RUNNING' | 'SUBMITTED_RESULT'
  const [currentStep, setCurrentStep] = useState<'SOCIAL_FOLLOW' | 'REGISTRATION' | 'TEST_RUNNING' | 'SUBMITTED_RESULT'>('SOCIAL_FOLLOW');

  // Social Media Following Verification State
  const [visitedSocials, setVisitedSocials] = useState<Record<string, boolean>>({});
  const [isSocialsConfirmed, setIsSocialsConfirmed] = useState<boolean>(false);

  // Student Form Details
  const [studentName, setStudentName] = useState<string>('');
  const [mobileNo, setMobileNo] = useState<string>('');
  const [state, setState] = useState<string>('Rajasthan');
  const [district, setDistrict] = useState<string>('');

  // Test Runtime State
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D'>>({});
  const [reviewMarked, setReviewMarked] = useState<Record<number, boolean>>({});
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(3600);
  const [isLanguageHindi, setIsLanguageHindi] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Result State
  const [submissionResult, setSubmissionResult] = useState<{
    attempt: StudentAttemptRecord;
    rank: number;
    totalAttempts: number;
    topRankers: StudentAttemptRecord[];
  } | null>(null);

  // Fetch Public Mock Test Details
  useEffect(() => {
    let isMounted = true;
    async function fetchMock() {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await fetch(`/api/online-mocks/${shareId}`);
        const resText = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(resText);
        } catch (_pErr) {
          throw new Error(resText ? resText.slice(0, 120) : `Server HTTP Error ${res.status}`);
        }

        if (!data.success || !data.onlineMock) {
          if (isMounted) setErrorMsg(data.error || 'Failed to load online mock test.');
          return;
        }

        if (isMounted) {
          setMockData(data.onlineMock);
          setTimeLeftSeconds((data.onlineMock.duration || 60) * 60);

          // If no social tasks required, skip to registration
          if (!data.onlineMock.socialTasks || data.onlineMock.socialTasks.length === 0) {
            setCurrentStep('REGISTRATION');
          }
        }
      } catch (err: any) {
        if (isMounted) setErrorMsg(err.message || 'Network error. Please check internet connection.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchMock();
    return () => { isMounted = false; };
  }, [shareId]);

  // Countdown Timer for Test Execution
  useEffect(() => {
    if (currentStep !== 'TEST_RUNNING' || timeLeftSeconds <= 0) return;

    const timer = setInterval(() => {
      setTimeLeftSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto submit when time runs out
          handleFinalSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentStep, timeLeftSeconds]);

  // Handle Social Link Click
  const handleOpenSocialLink = (taskId: string, url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setVisitedSocials(prev => ({ ...prev, [taskId]: true }));
  };

  // Check if all required socials visited
  const areAllRequiredSocialsVisited = useMemo(() => {
    if (!mockData || !mockData.socialTasks || mockData.socialTasks.length === 0) return true;
    return mockData.socialTasks.every(t => !t.isRequired || visitedSocials[t.id]);
  }, [mockData, visitedSocials]);

  // Start Test Action
  const handleStartTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !mobileNo.trim() || !district.trim()) {
      alert('Please fill all required student details (Name, Mobile, District).');
      return;
    }

    if (mobileNo.trim().length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }

    setCurrentStep('TEST_RUNNING');
  };

  // Answer Select Action
  const handleSelectOption = (option: 'A' | 'B' | 'C' | 'D') => {
    const qKey = mockData?.questions[currentQIndex]?.id || currentQIndex + 1;
    setUserAnswers(prev => ({
      ...prev,
      [qKey]: option
    }));
  };

  // Clear Option
  const handleClearResponse = () => {
    const qKey = mockData?.questions[currentQIndex]?.id || currentQIndex + 1;
    setUserAnswers(prev => {
      const next = { ...prev };
      delete next[qKey];
      return next;
    });
  };

  // Toggle Mark for Review
  const handleToggleReview = () => {
    setReviewMarked(prev => ({
      ...prev,
      [currentQIndex]: !prev[currentQIndex]
    }));
  };

  // Final Submit Handler
  const handleFinalSubmit = async (autoSubmit = false) => {
    if (!autoSubmit) {
      const totalQs = mockData?.questions.length || 0;
      const answeredCount = Object.keys(userAnswers).length;
      if (!confirm(`Are you sure you want to submit your Mock Test?\n\nAnswered: ${answeredCount} / ${totalQs} Questions.`)) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const totalDuration = (mockData?.duration || 60) * 60;
      const timeTaken = totalDuration - timeLeftSeconds;

      const payload = {
        studentName,
        mobileNo,
        state,
        district,
        socialsFollowed: isSocialsConfirmed,
        answers: userAnswers,
        timeTakenSeconds: timeTaken
      };

      const res = await fetch(`/api/online-mocks/${shareId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(resText);
      } catch (_pErr) {
        throw new Error(resText ? resText.slice(0, 150) : `Server HTTP Error ${res.status}`);
      }

      if (!res.ok || !data.success) {
        alert(`Submission Error: ${data.error || data.message || `Server Error (${res.status})`}`);
        return;
      }

      setSubmissionResult(data);
      setCurrentStep('SUBMITTED_RESULT');
    } catch (err: any) {
      alert(`Submission Failed: ${err.message || 'Please check connection and try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Time formatter
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold">Loading Online Mock Test...</h2>
        <p className="text-xs text-slate-400 mt-1">Connecting to Gradeup Study Portal</p>
      </div>
    );
  }

  if (errorMsg || !mockData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">Unable to Open Mock Test</h2>
          <p className="text-sm text-slate-400">{errorMsg || 'Mock Test not found.'}</p>
          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              Back to App
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0d24] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Banner Header */}
      <header className="bg-slate-950 border-b border-slate-800/80 sticky top-0 z-50 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-none">
                {mockData.instituteName || 'Gradeup Study'}
              </h1>
              <p className="text-[11px] text-indigo-400 font-medium">
                Online Student Mock Portal • {mockData.testName}
              </p>
            </div>
          </div>

          {currentStep === 'TEST_RUNNING' && (
            <div className="flex items-center space-x-3 bg-slate-900 border border-slate-700/80 px-3.5 py-1.5 rounded-xl">
              <Clock className={`w-4 h-4 ${timeLeftSeconds < 300 ? 'text-rose-400 animate-pulse' : 'text-indigo-400'}`} />
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Time Left</div>
                <div className={`text-sm font-mono font-bold ${timeLeftSeconds < 300 ? 'text-rose-400' : 'text-white'}`}>
                  {formatTime(timeLeftSeconds)}
                </div>
              </div>
            </div>
          )}

          {onExitPortal && (
            <button
              onClick={onExitPortal}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
            >
              Exit Portal
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* ================= STEP 1: SOCIAL MEDIA MANDATE ================= */}
        {currentStep === 'SOCIAL_FOLLOW' && (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center space-x-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-3 py-1 rounded-full font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Step 1: Follow Social Channels to Unlock</span>
              </span>
              <h2 className="text-2xl font-extrabold text-white">Join & Follow Official Channels</h2>
              <p className="text-xs text-slate-400">
                Please subscribe and follow our official channels below to proceed to the free online mock test.
              </p>
            </div>

            {/* Social Tasks List */}
            <div className="space-y-3">
              {mockData.socialTasks.map((task) => {
                const isVisited = visitedSocials[task.id];
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl transition-all"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        task.platform === 'youtube' ? 'bg-rose-600/20 text-rose-400' :
                        task.platform === 'telegram' ? 'bg-sky-500/20 text-sky-400' :
                        task.platform === 'instagram' ? 'bg-pink-600/20 text-pink-400' :
                        'bg-emerald-600/20 text-emerald-400'
                      }`}>
                        {task.platform === 'youtube' && <Youtube className="w-5 h-5" />}
                        {task.platform === 'telegram' && <Send className="w-5 h-5" />}
                        {task.platform === 'instagram' && <Instagram className="w-5 h-5" />}
                        {task.platform === 'whatsapp' && <MessageSquare className="w-5 h-5" />}
                        {task.platform === 'other' && <ExternalLink className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-100 truncate">{task.title}</h4>
                        <p className="text-[11px] text-slate-400 truncate">{task.url}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenSocialLink(task.id, task.url)}
                      className={`flex-shrink-0 ml-3 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                        isVisited
                          ? 'bg-emerald-900/50 border border-emerald-600 text-emerald-300'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
                      }`}
                    >
                      {isVisited ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Followed</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Visit & Follow</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Checkbox Confirmation */}
            <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSocialsConfirmed}
                  onChange={e => setIsSocialsConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="text-xs text-slate-300 leading-snug">
                  मैं पुष्टि करता/करती हूँ कि मैंने ऊपर दिए गए सभी आधिकारिक सोशल मीडिया चैनल्स को सब्सक्राइब/फॉलो कर लिया है।
                </span>
              </label>
            </div>

            <button
              type="button"
              disabled={!isSocialsConfirmed || !areAllRequiredSocialsVisited}
              onClick={() => setCurrentStep('REGISTRATION')}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center space-x-2"
            >
              <span>Continue to Registration</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ================= STEP 2: STUDENT REGISTRATION FORM ================= */}
        {currentStep === 'REGISTRATION' && (
          <div className="max-w-lg mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="inline-flex items-center space-x-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-3 py-1 rounded-full font-semibold">
                <User className="w-3.5 h-3.5" />
                <span>Step 2: Candidate Details</span>
              </span>
              <h2 className="text-2xl font-extrabold text-white">Fill Aspirant Details</h2>
              <p className="text-xs text-slate-400">
                Enter your details to generate live score & overall rank on the leaderboard.
              </p>
            </div>

            <form onSubmit={handleStartTest} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Full Name (विद्यार्थी का पूरा नाम) *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar Sharma"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Mobile Number (मोबाइल नंबर) *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={mobileNo}
                    onChange={e => setMobileNo(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile number"
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500 font-mono font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    State (राज्य) *
                  </label>
                  <select
                    value={state}
                    onChange={e => setState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl p-2.5 focus:outline-none focus:border-indigo-500 font-medium"
                  >
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    District (जिला) *
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={e => setDistrict(e.target.value)}
                      placeholder="e.g. Jaipur"
                      className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-indigo-500 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Test Summary Box */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300 font-semibold">
                  <span>Test Questions:</span>
                  <span className="text-white font-mono">{mockData.questions.length} MCQs</span>
                </div>
                <div className="flex justify-between text-slate-300 font-semibold">
                  <span>Total Time Limit:</span>
                  <span className="text-indigo-400 font-mono">{mockData.duration} Minutes</span>
                </div>
                <div className="flex justify-between text-slate-300 font-semibold">
                  <span>Total Marks:</span>
                  <span className="text-emerald-400 font-mono">{mockData.totalMarks} Marks</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center space-x-2"
              >
                <span>Start Mock Test Now</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ================= STEP 3: INTERACTIVE MOCK TEST RUNTIME ================= */}
        {currentStep === 'TEST_RUNNING' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Question Panel (8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {/* Question Header */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                    Q {currentQIndex + 1} of {mockData.questions.length}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-1 rounded-lg">
                    {mockData.questions[currentQIndex]?.subject || 'General'}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {mockData.questions[currentQIndex]?.translation && (
                    <button
                      type="button"
                      onClick={() => setIsLanguageHindi(!isLanguageHindi)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 px-2.5 py-1 rounded-lg font-medium transition-colors"
                    >
                      {isLanguageHindi ? 'Show English' : 'हिंदी में देखें'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleReview}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors border ${
                      reviewMarked[currentQIndex]
                        ? 'bg-purple-900/80 border-purple-600 text-purple-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {reviewMarked[currentQIndex] ? '★ Marked' : '☆ Mark for Review'}
                  </button>
                </div>
              </div>

              {/* Question Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
                <div className="text-base font-bold text-white leading-relaxed">
                  {isLanguageHindi && mockData.questions[currentQIndex]?.translation
                    ? mockData.questions[currentQIndex].translation
                    : mockData.questions[currentQIndex]?.question}
                </div>

                {/* Option Cards */}
                <div className="space-y-3">
                  {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                    const qObj = mockData.questions[currentQIndex];
                    const optText = qObj ? qObj[`option${optKey}` as keyof typeof qObj] : '';
                    const qKey = qObj?.id || currentQIndex + 1;
                    const isSelected = userAnswers[qKey] === optKey;

                    return (
                      <div
                        key={optKey}
                        onClick={() => handleSelectOption(optKey)}
                        className={`p-3.5 rounded-xl border text-sm font-medium cursor-pointer transition-all flex items-start space-x-3 ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                        }`}
                      >
                        <span className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {optKey}
                        </span>
                        <div className="mt-0.5 min-w-0 flex-1 leading-snug">
                          {String(optText)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={currentQIndex === 0}
                    onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 flex items-center space-x-1"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearResponse}
                    className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl border border-slate-800 flex items-center space-x-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Answer</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  {currentQIndex < mockData.questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentQIndex(prev => Math.min(mockData.questions.length - 1, prev + 1))}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-1"
                    >
                      <span>Save & Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleFinalSubmit(false)}
                      className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center space-x-1"
                    >
                      <span>Submit Test</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Question Palette (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Question Palette ({Object.keys(userAnswers).length} / {mockData.questions.length} Answered)
                </h3>

                {/* Status Legend */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-medium text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-600 inline-block" />
                    <span>Answered</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700 inline-block" />
                    <span>Unanswered</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-purple-600 inline-block" />
                    <span>Marked</span>
                  </div>
                </div>

                {/* Palette Grid */}
                <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {mockData.questions.map((q, idx) => {
                    const qKey = q.id || idx + 1;
                    const isAns = userAnswers[qKey] !== undefined;
                    const isMkd = reviewMarked[idx];
                    const isCurrent = idx === currentQIndex;

                    return (
                      <button
                        key={qKey}
                        type="button"
                        onClick={() => setCurrentQIndex(idx)}
                        className={`h-9 rounded-xl text-xs font-mono font-bold transition-all border flex items-center justify-center ${
                          isCurrent ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900' : ''
                        } ${
                          isMkd ? 'bg-purple-600 text-white border-purple-500' :
                          isAns ? 'bg-emerald-600 text-white border-emerald-500' :
                          'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleFinalSubmit(false)}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finish & Submit Test</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 4: LIVE SCORE, RANK & TOPPER LIST ================= */}
        {currentStep === 'SUBMITTED_RESULT' && submissionResult && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Top Score Banner */}
            <div className="bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-950 border border-indigo-800/80 rounded-2xl p-6 text-center space-y-4 shadow-2xl relative overflow-hidden">
              <div className="inline-flex items-center space-x-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>Mock Test Successfully Completed</span>
              </div>

              <h2 className="text-3xl font-extrabold text-white">{mockData.testName}</h2>
              <p className="text-xs text-indigo-300">
                Aspirant: <strong className="text-white">{studentName}</strong> • {district}, {state}
              </p>

              {/* Main Rank & Score Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 max-w-2xl mx-auto">
                <div className="p-4 bg-slate-900/90 border border-indigo-500/50 rounded-2xl text-center space-y-1 shadow-lg">
                  <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center justify-center space-x-1">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Overall Live Rank</span>
                  </div>
                  <div className="text-3xl font-black text-amber-400 font-mono">
                    #{submissionResult.rank}
                  </div>
                  <div className="text-[10px] text-slate-400">Out of {submissionResult.totalAttempts} Aspirants</div>
                </div>

                <div className="p-4 bg-slate-900/90 border border-emerald-500/50 rounded-2xl text-center space-y-1 shadow-lg">
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Your Score</div>
                  <div className="text-3xl font-black text-emerald-400 font-mono">
                    {submissionResult.attempt.score} <span className="text-xs text-slate-400 font-normal">/ {submissionResult.attempt.totalMarks}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">{submissionResult.attempt.percentage}% Percentage</div>
                </div>

                <div className="p-4 bg-slate-900/90 border border-purple-500/50 rounded-2xl text-center space-y-1 shadow-lg">
                  <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Accuracy</div>
                  <div className="text-3xl font-black text-purple-300 font-mono">
                    {submissionResult.attempt.correctCount + submissionResult.attempt.incorrectCount > 0
                      ? `${Math.round((submissionResult.attempt.correctCount / (submissionResult.attempt.correctCount + submissionResult.attempt.incorrectCount)) * 100)}%`
                      : '0%'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {submissionResult.attempt.correctCount} Correct • {submissionResult.attempt.incorrectCount} Wrong
                  </div>
                </div>
              </div>
            </div>

            {/* Toppers Leaderboard Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">Live Topper List & Leaderboard</h3>
                </div>
                <span className="text-xs text-indigo-400 font-mono font-medium">Top Rankers</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-2.5 rounded-l-lg">Rank</th>
                      <th className="p-2.5">Candidate Name</th>
                      <th className="p-2.5">District / State</th>
                      <th className="p-2.5">Score</th>
                      <th className="p-2.5 rounded-r-lg">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {submissionResult.topRankers.map((top, idx) => {
                      const isCurrentUser = top.studentName === studentName && top.score === submissionResult.attempt.score;
                      return (
                        <tr key={idx} className={isCurrentUser ? 'bg-indigo-950/80 font-bold text-white' : 'hover:bg-slate-800/40'}>
                          <td className="p-2.5 font-mono">
                            <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-[11px] ${
                              idx === 0 ? 'bg-amber-400 text-slate-950' :
                              idx === 1 ? 'bg-slate-300 text-slate-950' :
                              idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-300'
                            }`}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="p-2.5">{top.studentName} {isCurrentUser && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded ml-1">(You)</span>}</td>
                          <td className="p-2.5 text-slate-400">{top.district}, {top.state}</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-400">{top.score} / {top.totalMarks}</td>
                          <td className="p-2.5 font-mono text-indigo-300">{top.percentage}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed Question Review with Explanations */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-indigo-400" />
                <span>Question Solution Review</span>
              </h3>

              <div className="space-y-4">
                {mockData.questions.map((q, idx) => {
                  const qKey = q.id || idx + 1;
                  const userAns = submissionResult.attempt.answers[qKey] || submissionResult.attempt.answers[idx];
                  const isCorrect = userAns === q.answer;
                  const isUnattempted = !userAns;

                  return (
                    <div
                      key={qKey}
                      className={`p-4 rounded-xl border space-y-3 ${
                        isCorrect ? 'bg-emerald-950/20 border-emerald-800/60' :
                        isUnattempted ? 'bg-slate-950 border-slate-800' :
                        'bg-rose-950/20 border-rose-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-300">
                          Q {idx + 1}. {q.subject}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isCorrect ? 'bg-emerald-900/80 text-emerald-300' :
                          isUnattempted ? 'bg-slate-800 text-slate-400' :
                          'bg-rose-900/80 text-rose-300'
                        }`}>
                          {isCorrect ? 'Correct (+2)' : isUnattempted ? 'Unattempted (0)' : 'Incorrect (-0.5)'}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-slate-100">{q.question}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {(['A', 'B', 'C', 'D'] as const).map(optKey => {
                          const optText = q[`option${optKey}` as keyof typeof q];
                          const isRightKey = optKey === q.answer;
                          const isUserKey = optKey === userAns;

                          return (
                            <div
                              key={optKey}
                              className={`p-2 rounded-lg border flex items-center justify-between ${
                                isRightKey
                                  ? 'bg-emerald-900/50 border-emerald-600 text-emerald-200 font-bold'
                                  : isUserKey
                                  ? 'bg-rose-900/50 border-rose-600 text-rose-200 line-through'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              <span>({optKey}) {String(optText)}</span>
                              {isRightKey && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                              {isUserKey && !isRightKey && <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                            </div>
                          );
                        })}
                      </div>

                      {q.explanation && (
                        <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-indigo-300 space-y-0.5">
                          <strong className="text-slate-200 font-bold">Solution Explanation:</strong>
                          <p>{q.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
