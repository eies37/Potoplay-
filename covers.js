'use strict';

const PALETTE_BY_TYPE = {
  quiz: ['#6366f1', '#8b5cf6'],
  pendu: ['#0ea5e9', '#22d3ee'],
  draw: ['#ec4899', '#f472b6'],
  connect4: ['#ef4444', '#f97316'],
  morpion: ['#f59e0b', '#facc15'],
  ultimate: ['#8b5cf6', '#d946ef'],
  reflex: ['#10b981', '#34d399'],
  number: ['#f43f5e', '#fb7185'],
  rps: ['#14b8a6', '#2dd4bf'],
  snake: ['#16a34a', '#84cc16'],
  whack: ['#a16207', '#eab308'],
  memory: ['#3b82f6', '#60a5fa'],
  breakout: ['#ea580c', '#fb923c'],
  simon: ['#c026d3', '#e879f9'],
};

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function coverSVG(entry) {
  const [c1, c2] = PALETTE_BY_TYPE[entry.type] || ['#334155', '#0f172a'];
  const h = hash(entry.id);
  const emoji = entry.emoji || '🎮';
  const title = entry.title.length > 42 ? entry.title.slice(0, 40) + '…' : entry.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.8" cy="0.12" r="0.95">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="360" rx="28" fill="url(#g)"/>
  <rect width="640" height="360" rx="28" fill="url(#r)"/>
  <circle cx="${80 + (h % 120)}" cy="${270 + (h % 60)}" r="${60 + (h % 70)}" fill="#ffffff" opacity="0.08"/>
  <circle cx="${520 + (h % 80)}" cy="${60 + (h % 50)}" r="${40 + (h % 60)}" fill="#000000" opacity="0.10"/>
  <text x="320" y="208" font-size="128" text-anchor="middle">${emoji}</text>
  <text x="320" y="298" font-size="33" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif">${esc(title)}</text>
  <text x="320" y="334" font-size="17" text-anchor="middle" fill="#ffffff" opacity="0.75" font-family="system-ui, sans-serif">Salon Arcade · Potoplay</text>
</svg>`;
}

module.exports = { coverSVG };
