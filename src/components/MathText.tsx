import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { formatMathSymbols } from '../lib/mathUtils';

interface MathTextProps {
  text: string;
  className?: string;
  inline?: boolean;
}

/**
 * Formats mathematical expressions like 2^7, 2^6, x^2, sqrt(x), +- into formatted superscripts and math symbols
 */
export function formatMathString(raw: string): string {
  if (!raw) return '';
  
  // 1. First format standard math symbols and carets to unicode (e.g. 2^7 -> 2⁷, +- -> ±)
  let formatted = formatMathSymbols(raw);

  // 2. Wrap caret powers if any remaining e.g. ^(abc) into HTML superscripts
  formatted = formatted.replace(/\^([a-zA-Z0-9\+\-\*\/\=\.\,\_]+|\([^\)]+\))/g, (match, p1) => {
    const clean = p1.startsWith('(') && p1.endsWith(')') ? p1.slice(1, -1) : p1;
    return `<sup className="font-semibold text-purple-200 px-0.5">${clean}</sup>`;
  });

  return formatted;
}

export const MathText: React.FC<MathTextProps> = ({ text, className = '', inline = true }) => {
  if (!text) return null;

  // Render using KaTeX if explicit latex delimiters $...$ or $$...$$ or \(...\) or \[...\] or \frac / \sqrt exist
  const hasLaTeX = /(\$\$[\s\S]+?\$\$|\$[^\$]+?\$|\\\(.*?\\\)|\\\[.*?\\\]|\\frac|\\sqrt|\\sum|\\int)/.test(text);

  if (hasLaTeX) {
    try {
      // Split text by math delimiters
      const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^\$]+?\$|\\\(.*?\\\)|\\\[.*?\\\])/g);

      return (
        <span className={`math-rendered-container ${className}`}>
          {parts.map((part, index) => {
            if (!part) return null;
            let isBlock = false;
            let math = '';

            if (part.startsWith('$$') && part.endsWith('$$')) {
              isBlock = true;
              math = part.slice(2, -2);
            } else if (part.startsWith('\\[') && part.endsWith('\\]')) {
              isBlock = true;
              math = part.slice(2, -2);
            } else if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
              math = part.slice(1, -1);
            } else if (part.startsWith('\\(') && part.endsWith('\\)')) {
              math = part.slice(2, -2);
            }

            if (math) {
              try {
                const html = katex.renderToString(math.trim(), {
                  displayMode: isBlock || !inline,
                  throwOnError: false,
                });
                return (
                  <span
                    key={index}
                    className="inline-block px-0.5"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              } catch (e) {
                return <span key={index} className="text-amber-400">{part}</span>;
              }
            }

            // Normal text part inside LaTeX container
            return (
              <span
                key={index}
                dangerouslySetInnerHTML={{ __html: formatMathString(part) }}
              />
            );
          })}
        </span>
      );
    } catch (e) {
      // Fallback
    }
  }

  // Normal text with caret superscripts like 2^7, 2^6, H_2O, etc.
  const formattedHtml = formatMathString(text);

  return (
    <span
      className={`math-formatted-text ${className}`}
      dangerouslySetInnerHTML={{ __html: formattedHtml }}
    />
  );
};

export default MathText;
