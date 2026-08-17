// Preset SVG Logos and Badges for Official Printable Exam Papers

export interface PresetLogo {
  id: string;
  name: string;
  category: string;
  svgDataUrl: string;
}

// 1. HP Police (हिमाचल प्रदेश पुलिस) Crest SVG
export const HP_POLICE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="hpGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE047"/>
      <stop offset="50%" stop-color="#EAB308"/>
      <stop offset="100%" stop-color="#CA8A04"/>
    </linearGradient>
    <linearGradient id="hpBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E3A8A"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <!-- Outer Shield -->
  <path d="M 100,10 C 145,10 185,30 185,75 C 185,135 140,175 100,195 C 60,175 15,135 15,75 C 15,30 55,10 100,10 Z" fill="url(#hpBlue)" stroke="#EAB308" stroke-width="5"/>
  <!-- Inner Shield Border -->
  <path d="M 100,20 C 138,20 172,36 172,75 C 172,126 134,162 100,180 C 66,162 28,126 28,75 C 28,36 62,20 100,20 Z" fill="#0A1128" stroke="#FDE047" stroke-width="2"/>
  <!-- Central Sun / Star Radiance -->
  <circle cx="100" cy="80" r="42" fill="#1E40AF" stroke="#FBBF24" stroke-width="3"/>
  <!-- Sun Rays -->
  <g stroke="#FDE047" stroke-width="2" stroke-linecap="round">
    <line x1="100" y1="28" x2="100" y2="36"/>
    <line x1="100" y1="124" x2="100" y2="132"/>
    <line x1="48" y1="80" x2="56" y2="80"/>
    <line x1="144" y1="80" x2="152" y2="80"/>
    <line x1="63" y1="43" x2="69" y2="49"/>
    <line x1="131" y1="111" x2="137" y2="117"/>
    <line x1="63" y1="117" x2="69" y2="111"/>
    <line x1="131" y1="49" x2="137" y2="43"/>
  </g>
  <!-- Mountains Icon inside Crest -->
  <polygon points="70,92 100,56 130,92" fill="#E2E8F0" stroke="#94A3B8" stroke-width="1.5"/>
  <polygon points="100,56 115,74 100,68 85,74" fill="#3B82F6"/>
  <polygon points="56,92 80,68 104,92" fill="#CBD5E1"/>
  <polygon points="96,92 120,68 144,92" fill="#CBD5E1"/>
  <!-- Ashoka Wheel / Chakra Symbol -->
  <circle cx="100" cy="88" r="14" fill="#F8FAFC" stroke="#1E3A8A" stroke-width="2"/>
  <circle cx="100" cy="88" r="3" fill="#1E3A8A"/>
  <!-- Banner Ribbon at Bottom -->
  <path d="M 35,148 C 65,138 135,138 165,148 L 175,172 C 145,160 55,160 25,172 Z" fill="#EAB308" stroke="#78350F" stroke-width="2"/>
  <!-- Ribbon Text in Hindi: हिमाचल प्रदेश पुलिस -->
  <text x="100" y="159" font-family="'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif" font-size="10.5" font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="0.5">
    हिमाचल प्रदेश पुलिस
  </text>
  <text x="100" y="170" font-family="'Noto Sans Devanagari', 'Segoe UI', Arial, sans-serif" font-size="8.5" font-weight="800" fill="#1E3A8A" text-anchor="middle">
    HP POLICE
  </text>
</svg>`;

// 2. Gradeup Study Official Logo SVG
export const GRADEUP_STUDY_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="guGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#4F46E5"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="90" fill="url(#guGrad)" stroke="#F59E0B" stroke-width="6"/>
  <circle cx="100" cy="100" r="76" fill="#0F172A" stroke="#3B82F6" stroke-width="2"/>
  <!-- Open Book & Graduation Cap -->
  <path d="M 60,115 Q 100,100 140,115 L 140,145 Q 100,130 60,145 Z" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
  <line x1="100" y1="108" x2="100" y2="138" stroke="#2563EB" stroke-width="2"/>
  <!-- Graduation Cap -->
  <polygon points="100,55 145,72 100,88 55,72" fill="#F59E0B" stroke="#FDE68A" stroke-width="2"/>
  <polygon points="100,88 135,76 135,92 100,104 65,92 65,76" fill="#D97706"/>
  <!-- Tassel -->
  <line x1="140" y1="74" x2="146" y2="98" stroke="#FDE68A" stroke-width="2"/>
  <circle cx="146" cy="100" r="3" fill="#F59E0B"/>
  <text x="100" y="166" font-family="'Segoe UI', Arial, sans-serif" font-size="11" font-weight="900" fill="#FDE68A" text-anchor="middle" letter-spacing="1">
    GRADEUP STUDY
  </text>
</svg>`;

// 3. Indian State Police / Defence Emblem SVG
export const POLICE_SHIELD_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
  <defs>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#DC2626"/>
      <stop offset="50%" stop-color="#991B1B"/>
      <stop offset="100%" stop-color="#1E3A8A"/>
    </linearGradient>
  </defs>
  <!-- Shield -->
  <path d="M 100,15 Q 175,20 175,70 Q 175,145 100,185 Q 25,145 25,70 Q 25,20 100,15 Z" fill="url(#shieldGrad)" stroke="#F59E0B" stroke-width="5"/>
  <path d="M 100,26 Q 163,30 163,72 Q 163,136 100,172 Q 37,136 37,72 Q 37,30 100,26 Z" fill="#0A0F29" stroke="#FEF08A" stroke-width="2"/>
  <!-- 5-Point Gold Star -->
  <polygon points="100,45 112,78 147,78 119,98 130,131 100,111 70,131 81,98 53,78 88,78" fill="#F59E0B" stroke="#FEF08A" stroke-width="2"/>
  <!-- Ribbon -->
  <rect x="35" y="142" width="130" height="22" rx="4" fill="#FEF08A" stroke="#B45309" stroke-width="1.5"/>
  <text x="100" y="157" font-family="'Segoe UI', Arial, sans-serif" font-size="10" font-weight="900" fill="#78350F" text-anchor="middle" letter-spacing="0.5">
    OFFICIAL EXAM
  </text>
</svg>`;

// Helper to convert SVG text to Data URL
export function svgToDataUrl(svgString: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

export const PRESET_LOGOS: PresetLogo[] = [
  {
    id: 'hp_police',
    name: 'HP Police Emblem (हिमाचल प्रदेश पुलिस)',
    category: 'Police & Defence',
    svgDataUrl: svgToDataUrl(HP_POLICE_LOGO_SVG)
  },
  {
    id: 'gradeup_study',
    name: 'Gradeup Study Official Badge',
    category: 'Institute',
    svgDataUrl: svgToDataUrl(GRADEUP_STUDY_LOGO_SVG)
  },
  {
    id: 'police_shield',
    name: 'Official Police & Exam Shield',
    category: 'Official Badge',
    svgDataUrl: svgToDataUrl(POLICE_SHIELD_LOGO_SVG)
  }
];
