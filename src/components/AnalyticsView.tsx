import React from 'react';
import { Question, MockHistory } from '../types';
import {
  BarChart3,
  PieChart as PieIcon,
  TrendingUp,
  Database,
  Sparkles,
  BookOpen,
  Award
} from 'lucide-react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title
);

interface AnalyticsViewProps {
  questions: Question[];
  mockHistory: MockHistory[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  questions,
  mockHistory
}) => {
  // Compute Difficulty Counts
  const easyCount = questions.filter(q => q.difficulty === 'Easy').length;
  const modCount = questions.filter(q => q.difficulty === 'Moderate').length;
  const hardCount = questions.filter(q => q.difficulty === 'Hard').length;

  const difficultyPieData = {
    labels: ['Easy', 'Moderate', 'Hard'],
    datasets: [
      {
        data: [easyCount, modCount, hardCount],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 1,
        borderColor: '#1e293b'
      }
    ]
  };

  // Compute Subject Counts
  const subjectCounts: Record<string, number> = {};
  questions.forEach(q => {
    if (q.subject) {
      subjectCounts[q.subject] = (subjectCounts[q.subject] || 0) + 1;
    }
  });

  const subLabels = Object.keys(subjectCounts);
  const subjectBarData = {
    labels: subLabels,
    datasets: [
      {
        label: 'Question Count',
        data: subLabels.map(s => subjectCounts[s]),
        backgroundColor: '#3b82f6',
        borderRadius: 6
      }
    ]
  };

  // Mock History Timeline
  const mockDates: Record<string, number> = {};
  mockHistory.forEach(m => {
    const d = new Date(m.createdDate).toLocaleDateString();
    mockDates[d] = (mockDates[d] || 0) + 1;
  });

  const lineLabels = Object.keys(mockDates).reverse();
  const lineData = {
    labels: lineLabels.length > 0 ? lineLabels : ['Today'],
    datasets: [
      {
        label: 'Mock Tests Created',
        data: lineLabels.length > 0 ? lineLabels.map(l => mockDates[l]) : [0],
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.2)',
        tension: 0.3,
        fill: true
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
    },
    scales: {
      x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#334155' } }
    }
  };

  // Stats calculation
  const totalQuestions = questions.length;
  const avgUsage = totalQuestions > 0
    ? (questions.reduce((acc, q) => acc + q.usageCount, 0) / totalQuestions).toFixed(1)
    : '0';

  const sortedSubs = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]);
  const mostUsedSubject = sortedSubs[0]?.[0] || 'N/A';
  const leastUsedSubject = sortedSubs[sortedSubs.length - 1]?.[0] || 'N/A';

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <span>Question Bank Analytics & AI Insights</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          In-depth distribution charts for subject coverage, Gemini AI difficulty taxonomy, and test generation velocity.
        </p>
      </div>

      {/* Top 4 Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Total Questions</span>
          <p className="text-2xl font-extrabold text-white mt-1">{totalQuestions}</p>
          <span className="text-[10px] text-slate-500">IndexedDB items</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Avg Usage / Question</span>
          <p className="text-2xl font-extrabold text-blue-400 mt-1">{avgUsage} times</p>
          <span className="text-[10px] text-slate-500">In generated mocks</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Top Subject</span>
          <p className="text-sm font-extrabold text-emerald-400 mt-2 truncate">{mostUsedSubject}</p>
          <span className="text-[10px] text-slate-500">Highest MCQ pool</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Smallest Pool</span>
          <p className="text-sm font-extrabold text-amber-400 mt-2 truncate">{leastUsedSubject}</p>
          <span className="text-[10px] text-slate-500">Needs bulk upload</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Difficulty Pie Chart */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>AI Difficulty Level Distribution</span>
          </h3>
          <div className="h-60 relative flex items-center justify-center">
            <Pie
              data={difficultyPieData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 11 } } }
                }
              }}
            />
          </div>
        </div>

        {/* Subject Bar Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span>Subject-wise Question Inventory</span>
          </h3>
          <div className="h-60 relative">
            <Bar data={subjectBarData} options={chartOptions} />
          </div>
        </div>

        {/* Mock Tests Timeline Line Chart */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Mock Test Generation Activity Over Time</span>
          </h3>
          <div className="h-56 relative">
            <Line data={lineData} options={chartOptions} />
          </div>
        </div>
      </div>
    </div>
  );
};
