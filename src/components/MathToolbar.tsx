import React, { useState } from 'react';
import { Superscript, Subscript, Calculator, ChevronDown, ChevronUp, Sparkles, Check } from 'lucide-react';
import { toSuperscript, toSubscript } from '../lib/mathUtils';

interface MathToolbarProps {
  value: string;
  onChange: (newValue: string) => void;
  targetInputRef?: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  compact?: boolean;
}

export const MathToolbar: React.FC<MathToolbarProps> = ({
  value,
  onChange,
  targetInputRef,
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(!compact);
  const [formattedFeedback, setFormattedFeedback] = useState<boolean>(false);

  const insertSymbol = (symbol: string) => {
    if (targetInputRef && targetInputRef.current) {
      const input = targetInputRef.current;
      const start = input.selectionStart || value.length;
      const end = input.selectionEnd || value.length;

      const newValue = value.substring(0, start) + symbol + value.substring(end);
      onChange(newValue);

      // Restore focus and position cursor after inserted symbol
      setTimeout(() => {
        input.focus();
        const newPos = start + symbol.length;
        input.setSelectionRange(newPos, newPos);
      }, 50);
    } else {
      onChange(value + symbol);
    }
  };

  // Automatically convert caret powers (e.g., 2^7 -> 2⁷ or $2^7$) in current value
  const convertCaretsToSuperscripts = (mode: 'unicode' | 'katex') => {
    let updated = value;
    if (mode === 'unicode') {
      // 2^7 -> 2⁷, 2^(n+1) -> 2ⁿ⁺¹
      updated = updated.replace(/\^([0-9a-zA-K\+\-\=\(\)]+)/g, (match, p1) => {
        const clean = p1.startsWith('(') && p1.endsWith(')') ? p1.slice(1, -1) : p1;
        return toSuperscript(clean);
      });
      // x_2 -> x₂
      updated = updated.replace(/\_([0-9a-zA-K\+\-\=\(\)]+)/g, (match, p1) => {
        const clean = p1.startsWith('(') && p1.endsWith(')') ? p1.slice(1, -1) : p1;
        return toSubscript(clean);
      });
    } else if (mode === 'katex') {
      // Wrap numbers/variables with caret in $...$ e.g., 2^7 -> $2^7$
      updated = updated.replace(/(?<!\$)([a-zA-Z0-9\)\}\]]+)\^([a-zA-Z0-9\+\-\*\/\=\(\)]+)(?!\$)/g, '$$$1^{$2}$$');
    }

    onChange(updated);
    setFormattedFeedback(true);
    setTimeout(() => setFormattedFeedback(false), 2000);
  };

  const symbolGroups = [
    {
      label: 'Powers & Exponents',
      items: [
        { label: 'x²', value: '²', title: 'Square' },
        { label: 'x³', value: '³', title: 'Cube' },
        { label: 'x⁴', value: '⁴', title: 'Power 4' },
        { label: 'x⁵', value: '⁵', title: 'Power 5' },
        { label: 'x⁶', value: '⁶', title: 'Power 6' },
        { label: 'x⁷', value: '⁷', title: 'Power 7' },
        { label: 'x⁸', value: '⁸', title: 'Power 8' },
        { label: 'x⁹', value: '⁹', title: 'Power 9' },
        { label: 'x⁰', value: '⁰', title: 'Power 0' },
        { label: 'xⁿ', value: 'ⁿ', title: 'Power n' },
        { label: 'x⁺', value: '⁺', title: 'Plus power' },
        { label: 'x⁻', value: '⁻', title: 'Minus power' },
        { label: 'a^b', value: '^', title: 'Caret power symbol' },
      ]
    },
    {
      label: 'Subscripts',
      items: [
        { label: 'x₀', value: '₀', title: 'Subscript 0' },
        { label: 'x₁', value: '₁', title: 'Subscript 1' },
        { label: 'x₂', value: '₂', title: 'Subscript 2' },
        { label: 'x₃', value: '₃', title: 'Subscript 3' },
        { label: 'x₄', value: '₄', title: 'Subscript 4' },
        { label: 'xₙ', value: 'ₙ', title: 'Subscript n' },
        { label: 'xₓ', value: 'ₓ', title: 'Subscript x' },
      ]
    },
    {
      label: 'Operators & Symbols',
      items: [
        { label: '×', value: ' × ', title: 'Multiply' },
        { label: '÷', value: ' ÷ ', title: 'Divide' },
        { label: '±', value: ' ± ', title: 'Plus-minus' },
        { label: '√', value: '√', title: 'Square root' },
        { label: '∛', value: '∛', title: 'Cube root' },
        { label: '≠', value: ' ≠ ', title: 'Not equal' },
        { label: '≈', value: ' ≈ ', title: 'Approximately equal' },
        { label: '≤', value: ' ≤ ', title: 'Less or equal' },
        { label: '≥', value: ' ≥ ', title: 'Greater or equal' },
        { label: '∞', value: '∞', title: 'Infinity' },
        { label: '°', value: '°', title: 'Degree' },
        { label: 'π', value: 'π', title: 'Pi' },
        { label: 'θ', value: 'θ', title: 'Theta' },
        { label: 'α', value: 'α', title: 'Alpha' },
        { label: 'β', value: 'β', title: 'Beta' },
        { label: 'Δ', value: 'Δ', title: 'Delta' },
        { label: '½', value: '½', title: 'Half fraction' },
        { label: '⅓', value: '⅓', title: 'One third' },
        { label: '⅔', value: '⅔', title: 'Two thirds' },
        { label: '¼', value: '¼', title: 'Quarter' },
        { label: '¾', value: '¾', title: 'Three quarters' },
        { label: '∑', value: '∑', title: 'Summation' },
        { label: '∫', value: '∫', title: 'Integral' },
        { label: '∠', value: '∠', title: 'Angle' },
        { label: '⊥', value: '⊥', title: 'Perpendicular' },
      ]
    }
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2 my-1.5 space-y-2 text-xs">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center space-x-1.5 text-purple-300 font-semibold text-[11px] hover:text-purple-200 transition-colors"
        >
          <Calculator className="w-3.5 h-3.5 text-purple-400" />
          <span>Mathematical Symbols & Powers Toolbar</span>
          {isOpen ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
        </button>

        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => convertCaretsToSuperscripts('unicode')}
            className="px-2 py-0.5 bg-purple-950 hover:bg-purple-900 border border-purple-700/60 text-purple-200 rounded text-[10px] font-medium transition-colors flex items-center space-x-1"
            title="Automatically converts 2^7 to 2⁷ and 2^6 to 2⁶ in text"
          >
            {formattedFeedback ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300">Converted!</span>
              </>
            ) : (
              <>
                <Superscript className="w-3 h-3 text-purple-400" />
                <span>Format Power (2^7 → 2⁷)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => convertCaretsToSuperscripts('katex')}
            className="px-2 py-0.5 bg-blue-950 hover:bg-blue-900 border border-blue-700/60 text-blue-200 rounded text-[10px] font-medium transition-colors flex items-center space-x-1"
            title="Convert to KaTeX LaTeX math ($2^7$)"
          >
            <Sparkles className="w-3 h-3 text-blue-400" />
            <span>KaTeX ($2^7$)</span>
          </button>
        </div>
      </div>

      {/* Expanded Symbol Picker Grid */}
      {isOpen && (
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          {symbolGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              <span className="text-[10px] text-slate-400 font-medium block">{group.label}:</span>
              <div className="flex flex-wrap gap-1">
                {group.items.map((item, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => insertSymbol(item.value)}
                    title={item.title}
                    className="px-2 py-1 bg-slate-950 hover:bg-purple-900/60 border border-slate-800 hover:border-purple-500/50 text-slate-200 hover:text-white rounded text-xs font-mono transition-colors min-w-[26px] text-center"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MathToolbar;
