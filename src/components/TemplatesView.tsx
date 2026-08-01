import React, { useState, useMemo } from 'react';
import { Template, OfficialPaperStyle, PaperHeaderConfig, Question } from '../types';
import { OFFICIAL_PAPER_STYLES } from '../lib/db';
import { exportPdfTestPaper } from '../lib/exportUtils';
import { INITIAL_QUESTIONS } from '../lib/sampleQuestions';
import { formatMathSymbols } from '../lib/mathUtils';
import {
  Palette,
  CheckCircle2,
  Image as ImageIcon,
  Save,
  Check,
  RotateCcw,
  Sliders,
  Eye,
  Building,
  FileText,
  Printer,
  Download,
  Search,
  Sparkles,
  Layers,
  Award,
  Globe,
  Settings2,
  BookOpen,
  Plus,
  Trash2,
  BookmarkCheck,
  Star
} from 'lucide-react';

interface TemplatesViewProps {
  currentTemplate: Template;
  templates: Template[];
  onSaveTemplate: (t: Template) => Promise<void>;
  onSetDefaultTemplate: (t: Template) => void;
  onDeleteTemplate?: (id: number) => Promise<void>;
}

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  currentTemplate,
  templates,
  onSaveTemplate,
  onSetDefaultTemplate,
  onDeleteTemplate
}) => {
  const [activeTab, setActiveTab] = useState<'official' | 'customize' | 'saved'>('official');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [templateForm, setTemplateForm] = useState<Template>(currentTemplate);
  const [selectedStyleId, setSelectedStyleId] = useState<string>(currentTemplate.styleId || 'ssc-cgl');
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isPrintingSample, setIsPrintingSample] = useState<boolean>(false);

  // Sample questions with math symbols for preview and direct print test
  const sampleQuestions: Question[] = useMemo(() => {
    return INITIAL_QUESTIONS.slice(0, 5).map((q, idx) => ({
      ...q,
      id: idx + 1
    })) as Question[];
  }, []);

  const categories = [
    'All',
    'Staff Selection Commission',
    'Union Public Service Commission',
    'National Testing Agency',
    'Railway Recruitment Board',
    'Banking & Financial Services',
    'School Education Board',
    'Teaching & Education Exams',
    'Institute Test Series'
  ];

  const filteredStyles = useMemo(() => {
    return OFFICIAL_PAPER_STYLES.filter(style => {
      const matchesCategory = selectedCategory === 'All' || style.category === selectedCategory;
      const matchesSearch =
        style.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        style.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        style.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const handleApplyOfficialStyle = (style: OfficialPaperStyle) => {
    setSelectedStyleId(style.id);
    const updated: Template = {
      ...templateForm,
      styleId: style.id,
      name: `${style.name} Template`,
      header: {
        ...templateForm.header,
        headerStyle: style.headerStyle,
        font: style.font,
        instructions: style.instructions || templateForm.header.instructions,
        watermark: style.watermark || templateForm.header.watermark,
        setCode: style.setCode || templateForm.header.setCode
      },
      qStyle: {
        numberingStyle: style.numberingStyle || templateForm.qStyle.numberingStyle,
        optionStyle: style.optionStyle || templateForm.qStyle.optionStyle
      }
    };
    setTemplateForm(updated);
    onSetDefaultTemplate(updated);
    onSaveTemplate(updated);
    setSaveNotice(`Applied "${style.name}" as your active paper template & saved permanently!`);
    setTimeout(() => setSaveNotice(null), 3500);
  };

  const handleOpenCustomizeWithStyle = (style: OfficialPaperStyle) => {
    setSelectedStyleId(style.id);
    const updated: Template = {
      ...templateForm,
      styleId: style.id,
      name: `${style.name} Template`,
      header: {
        ...templateForm.header,
        headerStyle: style.headerStyle,
        font: style.font,
        instructions: style.instructions || templateForm.header.instructions,
        watermark: style.watermark || templateForm.header.watermark,
        setCode: style.setCode || templateForm.header.setCode
      },
      qStyle: {
        numberingStyle: style.numberingStyle || templateForm.qStyle.numberingStyle,
        optionStyle: style.optionStyle || templateForm.qStyle.optionStyle
      }
    };
    setTemplateForm(updated);
    setActiveTab('customize');
  };

  const handleDirectPrintSamplePdf = async (style?: OfficialPaperStyle) => {
    setIsPrintingSample(true);
    try {
      let targetTemplate = templateForm;
      if (style) {
        targetTemplate = {
          ...templateForm,
          styleId: style.id,
          name: style.name,
          header: {
            ...templateForm.header,
            headerStyle: style.headerStyle,
            font: style.font,
            instructions: style.instructions || templateForm.header.instructions,
            watermark: style.watermark || templateForm.header.watermark,
            setCode: style.setCode || templateForm.header.setCode
          },
          qStyle: {
            numberingStyle: style.numberingStyle || templateForm.qStyle.numberingStyle,
            optionStyle: style.optionStyle || templateForm.qStyle.optionStyle
          }
        };
      }

      exportPdfTestPaper(
        sampleQuestions,
        targetTemplate,
        targetTemplate.header.testName || 'Sample Direct Print Mock Test',
        100,
        60
      );
    } catch (err: any) {
      alert('Failed to generate printable PDF: ' + err.message);
    } finally {
      setIsPrintingSample(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setTemplateForm(prev => ({
        ...prev,
        logoDataUrl: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    await onSaveTemplate(templateForm);
    setSaveNotice(`Template details for "${templateForm.name}" permanently saved in database!`);
    setTimeout(() => setSaveNotice(null), 3500);
  };

  const handleSaveAsNew = async () => {
    const newName = prompt('Enter a title for this new template copy:', `${templateForm.name} (Custom)`);
    if (!newName || !newName.trim()) return;

    const { id, ...rest } = templateForm;
    const newTemplate: Template = {
      ...rest,
      name: newName.trim()
    };
    await onSaveTemplate(newTemplate);
    setTemplateForm(newTemplate);
    setSaveNotice(`New template "${newName.trim()}" saved permanently! You can edit or reuse it anytime.`);
    setTimeout(() => setSaveNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Palette className="w-5 h-5 text-blue-400" />
            <span>Official Exam Templates & Direct Print Formats</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Choose from 16+ real-world official exam formats or customize your own permanently. Edit Exam Names, fonts, watermarks, and header styles anytime!
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1.5 rounded-xl shrink-0">
          <button
            onClick={() => setActiveTab('official')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'official'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Official Formats (16)</span>
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'saved'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5 text-indigo-300" />
            <span>Saved Templates ({templates.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('customize')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
              activeTab === 'customize'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>Customize & Edit Details</span>
          </button>
        </div>
      </div>

      {saveNotice && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center space-x-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveNotice}</span>
        </div>
      )}


      {/* Tab 1: Official Styles Catalog */}
      {activeTab === 'official' && (
        <div className="space-y-5">
          {/* Search & Filter bar */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search template by exam name, body, or keyword (e.g. SSC, NTA, Board, Bank, UPSC)..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder-slate-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400 font-semibold whitespace-nowrap">Filter:</span>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-medium"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredStyles.map(style => {
              const isSelected = selectedStyleId === style.id;
              return (
                <div
                  key={style.id}
                  className={`group bg-slate-900 border rounded-2xl p-5 space-y-4 transition-all relative overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/20 bg-slate-850/80'
                      : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850/60'
                  }`}
                >
                  {/* Top Color Accent Line */}
                  <div
                    className="h-1.5 w-full absolute top-0 left-0"
                    style={{ backgroundColor: style.primaryColor }}
                  />

                  <div className="space-y-3 pt-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                          {style.category}
                        </span>
                        <h3 className="text-sm font-extrabold text-white mt-0.5 group-hover:text-blue-400 transition-colors">
                          {style.name}
                        </h3>
                      </div>

                      <span
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 border"
                        style={{
                          borderColor: `${style.primaryColor}60`,
                          color: '#e2e8f0',
                          backgroundColor: `${style.primaryColor}20`
                        }}
                      >
                        {style.badge}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300/90 leading-relaxed line-clamp-2">
                      {style.description}
                    </p>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                      <span className="bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded">
                        Font: {style.font}
                      </span>
                      <span className="bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded">
                        Header: {style.headerStyle}
                      </span>
                      <span className="bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded">
                        Format: {style.numberingStyle} {style.optionStyle}
                      </span>
                      {style.setCode && (
                        <span className="bg-slate-950 text-blue-300 border border-blue-900 px-2 py-0.5 rounded font-bold">
                          {style.setCode}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleDirectPrintSamplePdf(style)}
                      disabled={isPrintingSample}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-blue-500/30 hover:border-blue-400/50 font-bold py-1.5 px-2.5 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1"
                      title="Direct print or export a sample PDF in this exact format"
                    >
                      <Printer className="w-3.5 h-3.5 text-blue-400" />
                      <span>Print Sample PDF</span>
                    </button>

                    <button
                      onClick={() => handleApplyOfficialStyle(style)}
                      className={`font-bold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center space-x-1 ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </>
                      ) : (
                        <span>Apply</span>
                      )}
                    </button>

                    <button
                      onClick={() => handleOpenCustomizeWithStyle(style)}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 p-1.5 rounded-lg text-xs transition-colors border border-slate-700"
                      title="Customize layout & options"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Saved Templates Library */}
      {activeTab === 'saved' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <BookmarkCheck className="w-4 h-4 text-indigo-400" />
                <span>Saved Templates in Database ({templates.length})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                All templates saved in IndexedDB are stored permanently. You can edit exam names, set active defaults, or make new template copies anytime.
              </p>
            </div>

            <button
              onClick={() => {
                setTemplateForm(currentTemplate);
                setActiveTab('customize');
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-md shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Custom Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => {
              const isDefault = currentTemplate.id === t.id || currentTemplate.name === t.name;

              return (
                <div
                  key={t.id || t.name}
                  className={`bg-slate-900 border ${
                    isDefault ? 'border-indigo-500/80 ring-1 ring-indigo-500/50' : 'border-slate-800'
                  } rounded-2xl p-4 space-y-3 relative flex flex-col justify-between shadow-sm`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-bold text-white line-clamp-1">{t.name}</h4>
                      {isDefault && (
                        <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1 shrink-0">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          <span>Active Default</span>
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-300 space-y-1 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                      <div>
                        <strong className="text-slate-400">Exam Name:</strong>{' '}
                        <span className="text-amber-300 font-bold">{t.header.examName || 'Standard Exam'}</span>
                      </div>
                      <div>
                        <strong className="text-slate-400">Institute:</strong>{' '}
                        <span className="text-slate-200">{t.header.instituteName}</span>
                      </div>
                      <div>
                        <strong className="text-slate-400">Font & Style:</strong>{' '}
                        <span className="text-blue-300">{t.header.font} ({t.header.headerStyle})</span>
                      </div>
                      {t.header.watermark && (
                        <div>
                          <strong className="text-slate-400">Watermark:</strong>{' '}
                          <span className="text-slate-300 font-mono">{t.header.watermark}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                    <button
                      onClick={() => {
                        setTemplateForm(t);
                        setActiveTab('customize');
                      }}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs border border-slate-700 flex items-center justify-center space-x-1"
                    >
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      <span>Edit Details</span>
                    </button>

                    <button
                      onClick={() => {
                        onSetDefaultTemplate(t);
                        onSaveTemplate(t);
                        setSaveNotice(`Set "${t.name}" as active paper template!`);
                        setTimeout(() => setSaveNotice(null), 3000);
                      }}
                      className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-colors ${
                        isDefault
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      {isDefault ? 'Active' : 'Set Active'}
                    </button>

                    {onDeleteTemplate && t.id && (
                      <button
                        onClick={async () => {
                          if (confirm(`Delete saved template "${t.name}"?`)) {
                            await onDeleteTemplate(t.id!);
                            setSaveNotice(`Template deleted successfully.`);
                            setTimeout(() => setSaveNotice(null), 3000);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors border border-slate-800"
                        title="Delete Template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Customize & Direct Print Visualizer */}
      {activeTab === 'customize' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Form (6 cols) */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                <span>Custom Paper Header & Font Settings</span>
              </h3>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium px-3 py-1.5 rounded-lg text-xs transition-colors"
                  title="Save current details as a new template copy in IndexedDB"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-400" />
                  <span>Save As New</span>
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-1.5 rounded-lg text-xs shadow-md transition-colors"
                  title="Save changes to active template in IndexedDB permanently"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Template</span>
                </button>
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Template Name input */}
              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1 font-medium">Template Display Title (Saved in Database)</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g. Gradeup HP Home Guard Official Paper Format"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500 font-bold"
                />
              </div>

              {/* Preset Quick Loader */}
              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1 font-medium">Load Official Format Preset</label>
                <select
                  value={selectedStyleId}
                  onChange={e => {
                    const found = OFFICIAL_PAPER_STYLES.find(s => s.id === e.target.value);
                    if (found) handleOpenCustomizeWithStyle(found);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500 font-bold text-xs"
                >
                  {OFFICIAL_PAPER_STYLES.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1 font-medium">Institute / Organization Name</label>
                <input
                  type="text"
                  value={templateForm.header.instituteName}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, instituteName: e.target.value }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2.5 focus:outline-none focus:border-blue-500 font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Examination Name (Editable)</label>
                <input
                  type="text"
                  value={templateForm.header.examName}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, examName: e.target.value }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-amber-300 font-bold rounded-lg p-2 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. HP Home Guard Exam 2026"
                />
              </div>


              <div>
                <label className="text-slate-400 block mb-1 font-medium">Test Subtitle / Paper Name</label>
                <input
                  type="text"
                  value={templateForm.header.testName}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, testName: e.target.value }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Series / Set Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. SET A, BOOKLET 01"
                  value={templateForm.header.setCode || ''}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, setCode: e.target.value }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Logo Upload & Position */}
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Upload Institute Logo</label>
                <div className="flex items-center space-x-2">
                  <label className="flex-1 bg-slate-950 border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg p-2 cursor-pointer flex items-center justify-center space-x-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>{templateForm.logoDataUrl ? 'Change Logo Image' : 'Select PNG/JPG'}</span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Logo Position</label>
                <select
                  value={templateForm.header.logoPos}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, logoPos: e.target.value as any }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="top-left">Top Left</option>
                  <option value="top-center">Top Center</option>
                  <option value="top-right">Top Right</option>
                </select>
              </div>

              {/* Typography & Header Style */}
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Header Border Style</label>
                <select
                  value={templateForm.header.headerStyle}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, headerStyle: e.target.value as any }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-semibold"
                >
                  <option value="double-border">Double Border Line (Classic SSC)</option>
                  <option value="thick-line">Thick Header Line (UPSC Style)</option>
                  <option value="boxed">Boxed Frame (Railway/RRB Style)</option>
                  <option value="modern">Modern Clean Line (Banking/IBPS)</option>
                  <option value="badge-style">Badge Banner Top (NTA Style)</option>
                  <option value="patriotic">Patriotic Top Bar (State Service)</option>
                  <option value="banner">Coaching Institute Banner</option>
                  <option value="clean">Minimalist Clean Line</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Paper Typography Font</label>
                <select
                  value={templateForm.header.font}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, font: e.target.value as any }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-semibold"
                >
                  <option value="Times New Roman">Times New Roman (Standard Serif)</option>
                  <option value="Georgia">Georgia (Formal UPSC Serif)</option>
                  <option value="Arial">Arial (Clean Board/RRB Sans)</option>
                  <option value="Calibri">Calibri (Banking/GATE Style)</option>
                  <option value="Verdana">Verdana (Clear NTA Display)</option>
                </select>
              </div>

              {/* Numbering & Option Styles */}
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Question Numbering Format</label>
                <select
                  value={templateForm.qStyle.numberingStyle}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      qStyle: { ...templateForm.qStyle, numberingStyle: e.target.value as any }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="Q1.">Q.1 / Q.2 (Official Standard)</option>
                  <option value="1.">1. / 2. (Numeric)</option>
                  <option value="[1]">[1] / [2] (NTA Entrance Pattern)</option>
                  <option value="Question 1.">Question 1. (Full Text)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Option Lettering Style</label>
                <select
                  value={templateForm.qStyle.optionStyle}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      qStyle: { ...templateForm.qStyle, optionStyle: e.target.value as any }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                >
                  <option value="(A)">(A) (B) (C) (D) - Parenthesized</option>
                  <option value="A.">A. B. C. D. - Dot Lettered</option>
                  <option value="①">① ② ③ ④ - Circled Numbers</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1 font-medium">Watermark Text</label>
                <input
                  type="text"
                  value={templateForm.header.watermark || ''}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, watermark: e.target.value }
                    })
                  }
                  placeholder="e.g. GRADEUP STUDY MOCK TEST"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-slate-400 block mb-1 font-medium">General Instructions Text</label>
                <textarea
                  rows={3}
                  value={templateForm.header.instructions}
                  onChange={e =>
                    setTemplateForm({
                      ...templateForm,
                      header: { ...templateForm.header, instructions: e.target.value }
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-lg p-2 focus:outline-none focus:border-blue-500 font-sans text-xs"
                />
              </div>
            </div>
          </div>

          {/* Live Preview Card (6 cols) */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center space-x-2 text-white font-semibold text-xs">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span>Real-Time Printable A4 Sheet Visualizer</span>
                </div>

                <button
                  onClick={() => handleDirectPrintSamplePdf()}
                  disabled={isPrintingSample}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1 rounded-lg text-xs shadow-sm flex items-center space-x-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Direct Print Sample PDF</span>
                </button>
              </div>

              {/* Simulated Printable A4 Paper Canvas */}
              <div
                className="bg-white text-slate-900 p-6 rounded-xl shadow-2xl border border-slate-300 min-h-[520px] relative text-xs space-y-3 overflow-hidden select-none"
                style={{
                  fontFamily:
                    templateForm.header.font === 'Times New Roman'
                      ? 'Times New Roman, serif'
                      : templateForm.header.font === 'Georgia'
                      ? 'Georgia, serif'
                      : templateForm.header.font === 'Verdana'
                      ? 'Verdana, sans-serif'
                      : templateForm.header.font === 'Calibri'
                      ? 'Calibri, sans-serif'
                      : 'Arial, sans-serif'
                }}
              >
                {/* Watermark Overlay */}
                {templateForm.header.watermark && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] transform -rotate-45 font-extrabold text-3xl text-black uppercase tracking-widest text-center px-4">
                    {templateForm.header.watermark}
                  </div>
                )}

                {/* Set Code Badge Top Right */}
                {templateForm.header.setCode && (
                  <div className="absolute top-4 right-4 border-2 border-black font-extrabold text-[10px] px-2 py-0.5 uppercase bg-white shadow-sm">
                    {templateForm.header.setCode}
                  </div>
                )}

                {/* Paper Header Box */}
                <div
                  className={`text-center pb-2 space-y-1 relative ${
                    templateForm.header.headerStyle === 'double-border'
                      ? 'border-b-4 border-double border-black'
                      : templateForm.header.headerStyle === 'thick-line'
                      ? 'border-b-2 border-black'
                      : templateForm.header.headerStyle === 'boxed'
                      ? 'border border-black p-3 rounded-none'
                      : 'border-b border-black'
                  }`}
                >
                  {templateForm.logoDataUrl && (
                    <img
                      src={templateForm.logoDataUrl}
                      alt="Logo"
                      className={`w-9 h-9 object-contain ${
                        templateForm.header.logoPos === 'top-left'
                          ? 'absolute top-1 left-1'
                          : templateForm.header.logoPos === 'top-right'
                          ? 'absolute top-1 right-1'
                          : 'mx-auto mb-1'
                      }`}
                    />
                  )}

                  <h2 className="font-extrabold text-base uppercase tracking-tight text-slate-950">
                    {templateForm.header.instituteName || 'INSTITUTE NAME'}
                  </h2>
                  <h3 className="font-bold text-xs text-slate-800">
                    {templateForm.header.examName || 'EXAM TITLE'}
                  </h3>
                  <p className="italic text-[11px] text-slate-700">
                    {templateForm.header.testName || 'TEST SUBTITLE'}
                  </p>

                  <div className="text-[10px] pt-1.5 flex justify-between font-sans text-slate-700 border-t border-slate-300 mt-1">
                    <span>Time Allowed: 60 Mins | Max Marks: 100</span>
                    <span>Roll No: ________________</span>
                  </div>
                </div>

                {/* General Instructions Box */}
                {templateForm.header.instructions && (
                  <div className="bg-slate-50 border border-slate-300 p-2.5 rounded text-[9.5px] leading-relaxed font-sans space-y-0.5">
                    <strong className="text-black font-bold uppercase tracking-wider block text-[9px]">
                      General Instructions:
                    </strong>
                    <div className="text-slate-800 whitespace-pre-line leading-snug">
                      {templateForm.header.instructions}
                    </div>
                  </div>
                )}

                {/* Sample Question Rendering with Mathematical Symbols */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <p className="font-bold text-xs text-black">
                      {templateForm.qStyle.numberingStyle === 'Q1.'
                        ? 'Q.1'
                        : templateForm.qStyle.numberingStyle === '[1]'
                        ? '[1]'
                        : '1.'}{' '}
                      {formatMathSymbols('If x + 1/x = 5, then what is the value of x^3 + 1/x^3?')}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 text-[10.5px] pl-2 font-medium">
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(A)' : 'A.'} 110</div>
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(B)' : 'B.'} 125</div>
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(C)' : 'C.'} 140</div>
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(D)' : 'D.'} 115</div>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 border-t border-slate-200">
                    <p className="font-bold text-xs text-black">
                      {templateForm.qStyle.numberingStyle === 'Q1.'
                        ? 'Q.2'
                        : templateForm.qStyle.numberingStyle === '[1]'
                        ? '[2]'
                        : '2.'}{' '}
                      {formatMathSymbols('Calculate the value of sqrt(144) + cbrt(27) * 2^3.')}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 text-[10.5px] pl-2 font-medium">
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(A)' : 'A.'} 36</div>
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(B)' : 'B.'} 48</div>
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(C)' : 'C.'} 24</div>
                      <div>{templateForm.qStyle.optionStyle === '(A)' ? '(D)' : 'D.'} 60</div>
                    </div>
                  </div>
                </div>

                {/* Paper Footer Simulation */}
                <div className="absolute bottom-3 left-6 right-6 border-t border-slate-300 pt-1 flex justify-between text-[8.5px] text-slate-500 font-sans">
                  <span>{templateForm.header.footer?.replace(/\s*\|\s*Page\s*\d+/gi, '').trim() || 'Gradeup Study - Quality Preparation for Competitive Exams'}</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
