import React, { useState, useMemo } from 'react';
import { Question } from '../types';
import { findDuplicateGroups, getDuplicateStats, DuplicateGroup, DuplicateMatchMode } from '../lib/duplicateUtils';
import {
  CopyCheck,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  SlidersHorizontal
} from 'lucide-react';

interface DuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  onDeleteBatch: (ids: number[]) => Promise<void>;
  onDeleteQuestion: (id: number) => Promise<void>;
}

export const DuplicateModal: React.FC<DuplicateModalProps> = ({
  isOpen,
  onClose,
  questions,
  onDeleteBatch,
  onDeleteQuestion
}) => {
  const [matchMode, setMatchMode] = useState<DuplicateMatchMode>('strict');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIdsToDelete, setSelectedIdsToDelete] = useState<Set<number>>(new Set());
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Calculate duplicate stats based on selected match mode
  const stats = useMemo(() => {
    return getDuplicateStats(questions, matchMode);
  }, [questions, matchMode]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return stats.groups;
    const q = searchQuery.trim().toLowerCase();
    return stats.groups.filter(g =>
      g.sampleQuestionText.toLowerCase().includes(q) ||
      g.subject.toLowerCase().includes(q) ||
      g.chapter.toLowerCase().includes(q)
    );
  }, [stats.groups, searchQuery]);

  if (!isOpen) return null;

  const toggleGroupExpand = (key: string) => {
    const next = new Set(expandedGroupKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroupKeys(next);
  };

  const toggleSelectQuestion = (id: number) => {
    const next = new Set(selectedIdsToDelete);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIdsToDelete(next);
  };

  const handleAutoCleanAll = async () => {
    if (stats.redundantQuestionIds.length === 0) return;

    if (
      confirm(
        `Are you sure you want to auto-clean ALL ${stats.redundantMcqCount} redundant duplicate MCQs?\n\nThis will keep 1 original copy for each question and safely delete the remaining copies.`
      )
    ) {
      setIsDeleting(true);
      setActionNotice(`Auto-cleaning ${stats.redundantMcqCount} duplicate MCQs...`);
      try {
        await onDeleteBatch(stats.redundantQuestionIds);
        setActionNotice(`Successfully deleted ${stats.redundantQuestionIds.length} duplicate MCQs!`);
        setSelectedIdsToDelete(new Set());
      } catch (err: any) {
        setActionNotice(`Error deleting duplicates: ${err.message}`);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleCleanSingleGroup = async (group: DuplicateGroup) => {
    const redundantInGroup = group.questions
      .filter(q => q.id !== group.primaryQuestionId && q.id !== undefined)
      .map(q => q.id!);

    if (redundantInGroup.length === 0) return;

    setIsDeleting(true);
    setActionNotice(`Cleaning ${redundantInGroup.length} duplicate copy(ies) for this question...`);
    try {
      await onDeleteBatch(redundantInGroup);
      setActionNotice(`Cleaned group successfully!`);
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIdsToDelete.size === 0) return;

    if (confirm(`Delete ${selectedIdsToDelete.size} selected duplicate questions?`)) {
      setIsDeleting(true);
      setActionNotice(`Deleting ${selectedIdsToDelete.size} selected questions...`);
      try {
        await onDeleteBatch(Array.from(selectedIdsToDelete));
        setActionNotice(`Successfully deleted ${selectedIdsToDelete.size} selected MCQs!`);
        setSelectedIdsToDelete(new Set());
      } catch (err: any) {
        setActionNotice(`Error: ${err.message}`);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleDeleteSingleCopy = async (id: number) => {
    setIsDeleting(true);
    try {
      await onDeleteQuestion(id);
      setActionNotice(`Question ID #${id} deleted.`);
    } catch (err: any) {
      setActionNotice(`Error: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <CopyCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Duplicate MCQs Manager</span>
                {stats.redundantMcqCount > 0 ? (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-extrabold px-2 py-0.5 rounded-full">
                    {stats.redundantMcqCount} Redundant
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-extrabold px-2 py-0.5 rounded-full flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>0 Duplicates</span>
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Detect duplicate questions, compare options, and clean up redundant MCQs across your question bank.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action / Notice Banner */}
        {actionNotice && (
          <div className="px-5 py-2.5 bg-blue-900/30 border-b border-blue-500/30 text-blue-200 text-xs flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-blue-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Summary Stat Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-[11px] text-slate-400 font-medium">Duplicate Question Sets</div>
              <div className="text-xl font-bold text-amber-400 mt-1">{stats.duplicateGroupCount} Sets</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Questions with identical text</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-[11px] text-slate-400 font-medium">Redundant MCQs</div>
              <div className="text-xl font-bold text-rose-400 mt-1">{stats.redundantMcqCount} Copies</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Can be safely removed</div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
              <div className="text-[11px] text-slate-400 font-medium">Total Bank Size</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{questions.length} Total</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Unique after cleanup: {questions.length - stats.redundantMcqCount}</div>
            </div>
          </div>

          {/* Prominent Auto-Clean Banner if duplicates exist */}
          {stats.redundantMcqCount > 0 ? (
            <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-rose-950/30 border border-amber-500/30 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>1-Click Auto Clean Recommended</span>
                </div>
                <p className="text-xs text-slate-300">
                  Keep 1 original copy for each question set and safely purge all {stats.redundantMcqCount} redundant duplicates in one click.
                </p>
              </div>

              <button
                onClick={handleAutoCleanAll}
                disabled={isDeleting}
                className="flex-shrink-0 flex items-center space-x-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md border border-amber-400/30 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Auto-Clean All ({stats.redundantMcqCount} MCQs)</span>
              </button>
            </div>
          ) : (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-4 rounded-xl flex items-center space-x-3 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold">No Duplicate MCQs Found!</p>
                <p className="text-[11px] text-emerald-400/80">
                  All {questions.length} questions in your bank are 100% unique.
                </p>
              </div>
            </div>
          )}

          {/* Matching Mode Criteria Selector */}
          <div className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" />
              <span>Matching Parameter:</span>
            </div>

            <div className="flex items-center space-x-2 bg-slate-900 p-1 rounded-lg border border-slate-800 w-full sm:w-auto">
              <button
                onClick={() => setMatchMode('strict')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  matchMode === 'strict'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Strict (Question + Options A, B, C, D)
              </button>
              <button
                onClick={() => setMatchMode('questionOnly')}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  matchMode === 'questionOnly'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Question Text Only
              </button>
            </div>
          </div>

          {/* Search Box */}
          {stats.duplicateGroupCount > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter duplicates by question text, subject, or chapter..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* Duplicate Groups List */}
          {filteredGroups.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Duplicate Sets ({filteredGroups.length})</span>
                <span className="text-[10px] text-slate-500">Expand to inspect and pick specific copies</span>
              </div>

              {filteredGroups.map(group => {
                const isExpanded = expandedGroupKeys.has(group.key);
                const redundantCopies = group.questions.filter(q => q.id !== group.primaryQuestionId);

                return (
                  <div
                    key={group.key}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
                  >
                    {/* Group Header */}
                    <div className="p-3.5 bg-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0 cursor-pointer" onClick={() => toggleGroupExpand(group.key)}>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className={`border text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center space-x-1 ${
                            group.questions.length >= 4
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            <span>Repeated {group.questions.length}x</span>
                            <span className="opacity-80">({group.questions.length - 1} Extra Copies)</span>
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">
                            {group.subject} • {group.chapter}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-white line-clamp-2">
                          {group.sampleQuestionText}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <button
                          onClick={() => handleCleanSingleGroup(group)}
                          disabled={isDeleting}
                          className="bg-rose-900/40 hover:bg-rose-800/60 border border-rose-500/40 text-rose-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1"
                          title="Keep original and delete duplicate copies"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Purge Extras ({redundantCopies.length})</span>
                        </button>

                        <button
                          onClick={() => toggleGroupExpand(group.key)}
                          className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Group Items (Expanded) */}
                    {isExpanded && (
                      <div className="p-3 bg-slate-950 border-t border-slate-800/80 space-y-2.5">
                        {group.questions.map((q, idx) => {
                          const isPrimary = q.id === group.primaryQuestionId;
                          const isSelected = q.id !== undefined && selectedIdsToDelete.has(q.id);

                          return (
                            <div
                              key={q.id !== undefined ? `q-id-${q.id}` : `q-idx-${idx}`}
                              className={`p-3 rounded-lg border text-xs transition-all ${
                                isPrimary
                                  ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-200'
                                  : isSelected
                                  ? 'bg-rose-950/30 border-rose-500/50 text-slate-200'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  {!isPrimary && (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => q.id !== undefined && toggleSelectQuestion(q.id)}
                                      className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0"
                                    />
                                  )}

                                  <span className="font-mono text-[10px] text-slate-500">ID: #{q.id}</span>

                                  {isPrimary ? (
                                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded flex items-center space-x-1">
                                      <Check className="w-3 h-3" />
                                      <span>Original (Keep)</span>
                                    </span>
                                  ) : (
                                    <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold px-2 py-0.5 rounded">
                                      Duplicate Copy
                                    </span>
                                  )}

                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                    Ans: {q.answer}
                                  </span>
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                    Difficulty: {q.difficulty}
                                  </span>
                                </div>

                                {!isPrimary && q.id !== undefined && (
                                  <button
                                    onClick={() => handleDeleteSingleCopy(q.id!)}
                                    disabled={isDeleting}
                                    className="text-slate-500 hover:text-rose-400 p-1 hover:bg-slate-800 rounded transition-colors"
                                    title="Delete this copy"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-950/40 p-2 rounded border border-slate-800/60 mb-1.5">
                                <div><strong className="text-slate-500">A:</strong> {q.optionA}</div>
                                <div><strong className="text-slate-500">B:</strong> {q.optionB}</div>
                                <div><strong className="text-slate-500">C:</strong> {q.optionC}</div>
                                <div><strong className="text-slate-500">D:</strong> {q.optionD}</div>
                              </div>

                              {q.explanation && (
                                <p className="text-[11px] text-slate-400 italic">
                                  <span className="font-semibold text-slate-500">Exp:</span> {q.explanation}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {selectedIdsToDelete.size > 0 && (
              <span className="text-amber-400 font-bold">{selectedIdsToDelete.size} copies selected for deletion</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {selectedIdsToDelete.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected ({selectedIdsToDelete.size})</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-2 rounded-xl text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
