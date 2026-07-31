import React from 'react';
import { Question, MockHistory } from '../types';
import { getDuplicateStats } from '../lib/duplicateUtils';
import {
  BookOpen,
  Database,
  Sparkles,
  CheckCircle2,
  PieChart as PieIcon,
  BarChart2,
  FileCheck,
  Upload,
  ArrowRight,
  TrendingUp,
  Layers,
  CopyCheck,
  AlertTriangle
} from 'lucide-react';
import { ActiveModule } from './Navbar';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface DashboardViewProps {
  questions: Question[];
  mockHistory: MockHistory[];
  onNavigate: (module: ActiveModule) => void;
  onOpenDuplicateModal?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  questions,
  mockHistory,
  onNavigate,
  onOpenDuplicateModal
}) => {
  // Compute Stats
  const subjects = Array.from(new Set(questions.map(q => q.subject))).filter(Boolean);
  const chapters = Array.from(new Set(questions.map(q => q.chapter))).filter(Boolean);
  const totalMcqs = questions.length;
  const mockCount = mockHistory.length;
  const freshCount = questions.filter(q => q.questionStatus === 'Fresh').length;
  const duplicateStats = getDuplicateStats(questions);

  const avgUniqueness = mockHistory.length > 0
    ? Math.round(mockHistory.reduce((acc, m) => acc + (m.uniqueness || 100), 0) / mockHistory.length)
    : 100;

  // Status Distribution Data for Pie Chart
  const statusCounts = {
    Fresh: questions.filter(q => q.questionStatus === 'Fresh').length,
    Used: questions.filter(q => q.questionStatus === 'Used').length,
    Frequent: questions.filter(q => q.questionStatus === 'Frequent').length,
    Overused: questions.filter(q => q.questionStatus === 'Overused').length,
    Retired: questions.filter(q => q.questionStatus === 'Retired').length
  };

  const pieData = {
    labels: ['Fresh', 'Used', 'Frequent', 'Overused', 'Retired'],
    datasets: [
      {
        data: [
          statusCounts.Fresh,
          statusCounts.Used,
          statusCounts.Frequent,
          statusCounts.Overused,
          statusCounts.Retired
        ],
        backgroundColor: [
          '#10b981', // Fresh (green)
          '#3b82f6', // Used (blue)
          '#f59e0b', // Frequent (yellow)
          '#ef4444', // Overused (red)
          '#8b5cf6'  // Retired (purple)
        ],
        borderWidth: 1,
        borderColor: '#1e293b'
      }
    ]
  };

  // Subject Counts Data for Bar Chart
  const subjectCounts: Record<string, number> = {};
  questions.forEach(q => {
    if (q.subject) {
      subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;
    }
  });

  const barLabels = Object.keys(subjectCounts).slice(0, 8);
  const barData = {
    labels: barLabels,
    datasets: [
      {
        label: 'MCQs',
        data: barLabels.map(lbl => subjectCounts[lbl]),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#334155' } }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#cbd5e1', font: { size: 11 }, boxWidth: 12 }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 rounded-2xl border border-blue-900/40 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md">
              Intelligent Question Bank
            </span>
            <span className="text-xs text-slate-400">• IQSE Algorithm Active</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight mt-1">Gradeup Study Overview</h2>
          <p className="text-sm text-slate-300 max-w-2xl mt-1">
            Manage your question bank, classify difficulty with Gemini AI, and generate high-uniqueness competitive mock tests with balanced chapter distribution.
          </p>
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          <button
            onClick={() => onNavigate('creator')}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md hover:shadow-blue-500/25"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Mock Test</span>
          </button>
          <button
            onClick={() => onNavigate('upload')}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2.5 rounded-xl font-medium text-xs transition-all"
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span>Bulk Upload</span>
          </button>

          {onOpenDuplicateModal && (
            <button
              onClick={onOpenDuplicateModal}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all border ${
                duplicateStats.redundantMcqCount > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <CopyCheck className={`w-4 h-4 ${duplicateStats.redundantMcqCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span>
                {duplicateStats.redundantMcqCount > 0
                  ? `${duplicateStats.redundantMcqCount} Duplicates`
                  : '0 Duplicates'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Duplicate Warning Banner (If Duplicates Exist) */}
      {duplicateStats.redundantMcqCount > 0 && onOpenDuplicateModal && (
        <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-rose-950/40 border border-amber-500/40 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-400 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-200 flex items-center space-x-2">
                <span>Duplicate MCQs Detected in Question Bank</span>
                <span className="bg-amber-500/30 text-amber-300 border border-amber-500/50 text-[10px] px-2 py-0.5 rounded font-extrabold">
                  {duplicateStats.redundantMcqCount} Redundant Copies
                </span>
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Found {duplicateStats.duplicateGroupCount} question sets with duplicate text. Clean them up to maintain exam quality and uniqueness score.
              </p>
            </div>
          </div>

          <button
            onClick={onOpenDuplicateModal}
            className="flex-shrink-0 flex items-center space-x-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md border border-amber-400/30"
          >
            <CopyCheck className="w-4 h-4" />
            <span>Fix / Delete Duplicates</span>
          </button>
        </div>
      )}

      {/* 6 Stat Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Subjects</span>
            <BookOpen className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{subjects.length}</p>
          <span className="text-[10px] text-slate-500">Categories</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Chapters</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{chapters.length}</p>
          <span className="text-[10px] text-slate-500">Topics covered</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total MCQs</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{totalMcqs}</p>
          <span className="text-[10px] text-slate-500">In IndexedDB</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Mock Tests</span>
            <FileCheck className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{mockCount}</p>
          <span className="text-[10px] text-slate-500">Generated</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Fresh Qs</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2">{freshCount}</p>
          <span className="text-[10px] text-slate-500">Never used</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Avg Uniqueness</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-cyan-400 mt-2">{avgUniqueness}%</p>
          <span className="text-[10px] text-slate-500">IQSE Metric</span>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Question Status Distribution (Pie) */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <PieIcon className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Question Status Distribution</h3>
            </div>
            <button
              onClick={() => onNavigate('bank')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
            >
              <span>View Bank</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-56 relative flex items-center justify-center">
            {totalMcqs > 0 ? (
              <Pie data={pieData} options={pieOptions} />
            ) : (
              <div className="text-slate-500 text-xs">No question data available</div>
            )}
          </div>
        </div>

        {/* Subject Breakdown (Bar) */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Subject-wise MCQ Breakdown</h3>
            </div>
            <button
              onClick={() => onNavigate('analytics')}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
            >
              <span>Analytics</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="h-56 relative">
            {barLabels.length > 0 ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <div className="text-slate-500 text-xs text-center pt-20">No subjects available</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Mock Tests List */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
            <FileCheck className="w-4 h-4 text-purple-400" />
            <span>Recent Mock Tests Generated</span>
          </h3>
          <button
            onClick={() => onNavigate('export')}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
          >
            <span>View All History</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {mockHistory.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">No mock tests generated yet.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Use the Mock Creator with chapter distribution to build your first exam paper.
            </p>
            <button
              onClick={() => onNavigate('creator')}
              className="mt-3 inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <span>Create First Mock</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
            {mockHistory.slice(0, 5).map((mock) => (
              <div
                key={mock.mockId}
                className="p-3.5 bg-slate-900/80 hover:bg-slate-800/80 flex items-center justify-between transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-white">{mock.testName}</span>
                    <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
                      ID: #{mock.mockId.toString().slice(-6)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] text-slate-400">
                    <span>{new Date(mock.createdDate).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{mock.questionIds?.length || 0} Questions</span>
                    <span>•</span>
                    <span>{mock.duration || 60} Mins</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Uniqueness</span>
                    <span className="text-xs font-bold text-emerald-400">{mock.uniqueness || 100}%</span>
                  </div>
                  <button
                    onClick={() => onNavigate('export')}
                    className="bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  >
                    Export Paper
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
