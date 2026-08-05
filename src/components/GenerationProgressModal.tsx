import React, { useState, useEffect } from 'react';
import { Sparkles, Cpu, Zap, RefreshCw, CheckCircle2, ShieldCheck, BarChart3, Lightbulb, ChevronRight, Search, Gauge, Layers, Brain } from 'lucide-react';
import { SectionConfig } from '../types';
import { IrtTargetProfile } from '../lib/iqse';

interface GenerationProgressModalProps {
  isOpen: boolean;
  testName: string;
  totalQuestions: number;
  sectionsCount: number;
  totalBankQuestions: number;
  uniqueThreshold: number;
  irtProfile: IrtTargetProfile;
  enableDUXQE: boolean;
}

const EDUCATIONAL_TIPS = [
  "💡 **Pro Tip**: Revision with spaced repetition improves recall speed by over 40% during competitive exams.",
  "⚡ **IQSE Engine**: Semantic Vector Deduplication uses n-gram Jaccard matching to guarantee no repetitive questions appear across test series.",
  "🎯 **IRT 3PL Model**: Item Response Theory automatically balances discrimination (a), difficulty (b), and pseudo-guessing (c) parameters.",
  "🧠 **DU-XQE AI**: Overused questions are dynamically mutated with fresh numerical values and context while preserving exact learning concepts.",
  "📚 **Chapter Weightage**: Multi-section exams perform best when chapter distribution is proportional to exam blueprint standards.",
  "⏱️ **Time Management**: Standard competitive exams allocate approximately 45-60 seconds per multiple-choice question.",
  "🌟 **Uniqueness Score**: High uniqueness prevents student answer memorization and builds true conceptual mastery."
];

export const GenerationProgressModal: React.FC<GenerationProgressModalProps> = ({
  isOpen,
  testName,
  totalQuestions,
  sectionsCount,
  totalBankQuestions,
  uniqueThreshold,
  irtProfile,
  enableDUXQE
}) => {
  const [progress, setProgress] = useState<number>(5);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [tipIndex, setTipIndex] = useState<number>(0);
  const [scannedCount, setScannedCount] = useState<number>(0);

  const steps = [
    {
      id: 'scan',
      title: 'Repository & Filter Scan',
      desc: `Analyzing ${totalBankQuestions} MCQs & checking past test history...`,
      icon: Search,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      id: 'sections',
      title: 'Section & Chapter Weightage',
      desc: `Balancing question quotas across ${sectionsCount} exam sections...`,
      icon: Layers,
      color: 'from-cyan-500 to-indigo-500'
    },
    {
      id: 'vector',
      title: 'Semantic Vector Deduplication',
      desc: 'Filtering near-duplicate questions using Jaccard n-gram vector matching...',
      icon: Cpu,
      color: 'from-indigo-500 to-purple-500'
    },
    {
      id: 'irt',
      title: 'IRT 3PL Profile Calibration',
      desc: `Applying ${irtProfile.replace('_', ' ').toUpperCase()} difficulty distribution curve...`,
      icon: Gauge,
      color: 'from-purple-500 to-pink-500'
    },
    {
      id: 'duxqe',
      title: enableDUXQE ? 'DU-XQE AI Mutation Engine' : 'Uniqueness Score Verification',
      desc: enableDUXQE ? 'Generating smart AI question variations for overused items...' : `Ensuring test uniqueness passes ${uniqueThreshold}% threshold...`,
      icon: Brain,
      color: 'from-pink-500 to-amber-500'
    },
    {
      id: 'finalize',
      title: 'Finalizing Mock Test Blueprint',
      desc: 'Packaging test questions, explanations, and section indices...',
      icon: Sparkles,
      color: 'from-amber-500 to-emerald-500'
    }
  ];

  // Animated progress timer simulation
  useEffect(() => {
    if (!isOpen) {
      setProgress(5);
      setCurrentStepIndex(0);
      setScannedCount(0);
      return;
    }

    // Step progression interval
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return 95;
        const next = prev + Math.floor(Math.random() * 8) + 3;
        const capped = Math.min(next, 95);
        
        // Update active step index based on progress
        const stepIdx = Math.min(
          Math.floor((capped / 100) * steps.length),
          steps.length - 1
        );
        setCurrentStepIndex(stepIdx);
        
        // Update scanned questions count
        setScannedCount(Math.min(
          Math.floor((capped / 100) * totalBankQuestions),
          totalBankQuestions
        ));

        return capped;
      });
    }, 280);

    return () => clearInterval(interval);
  }, [isOpen, totalBankQuestions, steps.length]);

  if (!isOpen) return null;

  const nextTip = () => {
    setTipIndex((prev) => (prev + 1) % EDUCATIONAL_TIPS.length);
  };

  const activeStep = steps[currentStepIndex] || steps[0];
  const StepIcon = activeStep.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/60 overflow-hidden">
        
        {/* Background Glowing Radar Effect */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        
        {/* Top Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="relative flex items-center justify-center">
              {/* Rotating glowing halo ring */}
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-600 animate-spin p-0.5 shadow-lg shadow-indigo-500/30">
                <div className="w-full h-full bg-slate-950 rounded-[14px]" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center text-blue-400">
                <Brain className="w-6 h-6 animate-pulse" />
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest bg-blue-900/60 text-blue-300 border border-blue-700/50 rounded-full">
                  IQSE AI Engine v3.0
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5 tracking-tight truncate max-w-sm">
                Generating: {testName}
              </h3>
            </div>
          </div>

          <div className="text-right">
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
              {progress}%
            </span>
            <span className="block text-[10px] font-semibold text-slate-400">Processing</span>
          </div>
        </div>

        {/* Animated Main Progress Bar */}
        <div className="relative w-full bg-slate-950/80 border border-slate-800 rounded-full h-3 p-0.5 mb-6 shadow-inner overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out relative shadow-md shadow-indigo-500/50"
            style={{ width: `${progress}%` }}
          >
            {/* Animated shine line on progress bar */}
            <div className="absolute top-0 right-0 bottom-0 w-8 bg-white/30 rounded-full blur-[2px] animate-pulse" />
          </div>
        </div>

        {/* Current Active Stage Display Card */}
        <div className="bg-slate-900/90 border border-indigo-500/20 rounded-2xl p-4 mb-6 relative overflow-hidden shadow-lg">
          <div className={`absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b ${activeStep.color}`} />
          
          <div className="flex items-start space-x-3">
            <div className={`p-2.5 rounded-xl bg-gradient-to-tr ${activeStep.color} text-white shadow-md shrink-0 mt-0.5`}>
              <StepIcon className="w-5 h-5 animate-bounce" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                  Stage {currentStepIndex + 1} of {steps.length}
                </span>
                <span className="text-[10px] font-medium text-emerald-400 flex items-center space-x-1 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                  <span>Active Step</span>
                </span>
              </div>

              <h4 className="text-sm font-bold text-white mt-0.5">
                {activeStep.title}
              </h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {activeStep.desc}
              </p>
            </div>
          </div>
        </div>

        {/* Multi-Step Pipeline Indicator Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
          {steps.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const IconComp = step.icon;

            return (
              <div
                key={step.id}
                className={`p-2 rounded-xl border transition-all text-left flex items-center space-x-2 ${
                  isDone
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : isCurrent
                    ? 'bg-indigo-950/60 border-indigo-500/50 text-white shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-500/30'
                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                }`}
              >
                <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                  isDone
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : isCurrent
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'bg-slate-800 text-slate-500'
                }`}>
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : idx + 1}
                </div>
                <span className="text-[11px] font-semibold truncate leading-tight">
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Live Metrics Ticker Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl">
          <div className="text-center">
            <span className="block text-[10px] text-slate-400 font-medium">MCQs Analyzed</span>
            <span className="text-sm sm:text-base font-extrabold text-blue-400">
              {scannedCount} <span className="text-[10px] text-slate-500 font-normal">/ {totalBankQuestions}</span>
            </span>
          </div>

          <div className="text-center border-x border-slate-800/80 px-2">
            <span className="block text-[10px] text-slate-400 font-medium">Test Sections</span>
            <span className="text-sm sm:text-base font-extrabold text-indigo-400">
              {sectionsCount} <span className="text-[10px] font-normal text-slate-400">({totalQuestions} Qs)</span>
            </span>
          </div>

          <div className="text-center">
            <span className="block text-[10px] text-slate-400 font-medium">Target Uniqueness</span>
            <span className="text-sm sm:text-base font-extrabold text-emerald-400">
              {uniqueThreshold}% <span className="text-[10px] text-emerald-500 font-normal">Min</span>
            </span>
          </div>
        </div>

        {/* Interactive Tip / Did You Know Carousel */}
        <div className="p-3.5 bg-indigo-950/30 border border-indigo-500/20 rounded-2xl flex items-center justify-between gap-3 text-xs text-indigo-200">
          <div className="flex items-start space-x-2.5 flex-1 min-w-0">
            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
            <p className="text-slate-300 text-[11px] leading-relaxed italic truncate sm:whitespace-normal">
              {EDUCATIONAL_TIPS[tipIndex]}
            </p>
          </div>

          <button
            onClick={nextTip}
            className="shrink-0 bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 font-semibold px-2.5 py-1 rounded-lg text-[10px] flex items-center space-x-1 transition-colors"
            title="Click for another exam tip"
          >
            <span>Next Tip</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

      </div>
    </div>
  );
};
