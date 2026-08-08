// Comprehensive Math Symbol & Notation Formatter Utility

// Map of ASCII characters to Unicode Superscript equivalents
const SUPER_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  '/': 'ᐟ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ',
  'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ',
  'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ',
  'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ',
  'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ',
  'z': 'ᶻ', 'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ',
  'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ',
  'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ',
  'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ'
};

// Map of ASCII characters to Unicode Subscript equivalents
const SUB_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ'
};

export function toSuperscript(str: string): string {
  return str.split('').map(ch => SUPER_MAP[ch] || ch).join('');
}

export function toSubscript(str: string): string {
  return str.split('').map(ch => SUB_MAP[ch] || ch).join('');
}

/**
 * Transforms mathematical notation in plain text into formatted Unicode math symbols.
 * Handles:
 * - Powers/Exponents: x^2 -> x², x^3 -> x³, x^(2/3) -> x²ᐟ³, x^(-1) -> x⁻¹, x^{n+1} -> xⁿ⁺¹
 * - Roots: sqrt(x) -> √(x), cbrt(x) -> ∛(x), 4throot(x) -> ∜(x)
 * - Subscripts: x_1 -> x₁, H_2O -> H₂O, x_{i+1} -> xᵢ₊₁
 * - Operators: +- -> ±, -+ -> ∓, <= -> ≤, >= -> ≥, != -> ≠, ~= -> ≈
 * - Greek Letters: \alpha -> α, \beta -> β, \theta -> θ, \pi -> π, \Delta -> Δ, etc.
 * - Math symbols: \infty -> ∞, \degree or deg -> °, \angle -> ∠, \triangle -> △
 */
export function formatMathSymbols(text: string): string {
  if (!text || typeof text !== 'string') return text || '';

  let res = text;

  // 1. Convert LaTeX style math commands first
  res = res
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\le\b/g, '≤')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\ne\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\times\b/g, '×')
    .replace(/\\div\b/g, '÷')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\degree\b/g, '°')
    .replace(/\\deg\b/g, '°')
    .replace(/\\angle\b/g, '∠')
    .replace(/\\triangle\b/g, '△')
    .replace(/\\perp\b/g, '⊥')
    .replace(/\\parallel\b/g, '∥')
    .replace(/\\sum\b/g, '∑')
    .replace(/\\int\b/g, '∫')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\phi\b/g, 'φ')
    .replace(/\\in\b/g, '∈')
    .replace(/\\notin\b/g, '∉')
    .replace(/\\subset\b/g, '⊂')
    .replace(/\\cap\b/g, '∩')
    .replace(/\\cup\b/g, '∪');

  // 2. Convert standard operator shortcuts
  res = res
    .replace(/\+\/-/g, '±')
    .replace(/-\+\//g, '∓')
    .replace(/\+\-/g, '±')
    .replace(/-\+/g, '∓')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/~=/g, '≈');

  // 3. Roots: sqrt(x) -> √(x), cbrt(x) -> ∛(x), 4throot -> ∜
  res = res
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\cbrt\{([^}]+)\}/g, '∛($1)')
    .replace(/sqrt\s*\(([^)]+)\)/gi, '√($1)')
    .replace(/cbrt\s*\(([^)]+)\)/gi, '∛($1)')
    .replace(/fourthroot\s*\(([^)]+)\)/gi, '∜($1)')
    .replace(/sqrt\s+([a-zA-Z0-9]+)/gi, '√$1')
    .replace(/cbrt\s+([a-zA-Z0-9]+)/gi, '∛$1');

  // 4. Superscript powers: x^{expr} or x^(expr) or x^digits or x^var
  // Parenthesized or braced fractional powers like x^(2/3) -> x²ᐟ³
  res = res.replace(/\^\{([^}]+)\}/g, (_, exp) => toSuperscript(exp));
  res = res.replace(/\^\(([^)]+)\)/g, (_, exp) => toSuperscript(exp));

  // Caret followed by single or multi digit number, e.g., x^2, x^3, x^10, x^-1
  res = res.replace(/\^([+\-]?\d+(?:\/\d+)?)/g, (_, exp) => toSuperscript(exp));

  // Caret followed by single letter variable, e.g. x^n, y^m, a^b
  res = res.replace(/\^([a-zA-Z])/g, (_, exp) => toSuperscript(exp));

  // 5. Subscripts: x_{expr} or x_(expr) or x_digit
  res = res.replace(/_\{([^}]+)\}/g, (_, sub) => toSubscript(sub));
  res = res.replace(/_\(([^)]+)\)/g, (_, sub) => toSubscript(sub));
  res = res.replace(/_([0-9a-zA-Z]+)/g, (_, sub) => toSubscript(sub));

  // 6. Replace Hindi Purna Viram '।' or '॥' in math/numerical expressions with standard '.' to prevent '।' from being mistaken for digit 1
  if (/[\d\+\-\*\/=\(\)\^π√%]/.test(res) || /сеमी|मीटर|वर्ग|क्षेत्रफल|आयतन|अनुपात|cm²|m²/i.test(res)) {
    res = res.replace(/[।॥]/g, '.');
  }

  return res;
}

/**
 * Formats solution / explanation text into well-spaced step-by-step lines.
 * Ensures headers like "Given & Concept", "Step 1", "Final Answer", "English:", "हिंदी:"
 * always start on fresh lines with proper line breaks so they don't run together in a horizontal block.
 */
export function formatStepByStepExplanation(text: string): string {
  if (!text || typeof text !== 'string') return text || '';
  let str = text.trim();

  // 1. Ensure headings have newlines before them if glued together
  const headingRegex = /(\*\*?(?:Given|Step \d+|चरण \d+|Final Answer|अंतिम उत्तर|English|हिंदी|हिन्दी|Formula|Calculation|Solution|हल|व्याख्या|Concept|दिया गया)[^\*\n:]*:\*\*?|\b(?:Given & Concept|Given Data|Step \d+:[^\n]*|Final Answer:|English:|हिंदी:|हिन्दी:))/gi;

  str = str.replace(headingRegex, (match, offset) => {
    if (offset === 0) return match;
    return `\n\n${match}`;
  });

  // 2. Ensure "English:" and "हिंदी:" start on fresh separate lines
  str = str.replace(/([^\n])\s*(English:|हिंदी:|हिन्दी:)/gi, '$1\n\n$2');

  // 3. Ensure step working steps like "Step 1:", "Step 2:", "चरण 1:" start on fresh lines
  str = str.replace(/([^\n])\s*(\bStep \d+:|\bचरण \d+:)/gi, '$1\n\n$2');

  // 4. Collapse 3+ newlines into double newlines
  str = str.replace(/\n{3,}/g, '\n\n');

  return str.trim();
}
