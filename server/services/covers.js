/** Deterministic, dependency-free SVG book covers so every listing always renders an image. */
const PALETTES = [
  ['#1e3a8a', '#3b82f6'], ['#064e3b', '#10b981'], ['#7c2d12', '#f97316'],
  ['#4c1d95', '#a855f7'], ['#831843', '#ec4899'], ['#134e4a', '#14b8a6'],
  ['#1f2937', '#6b7280'], ['#713f12', '#eab308'], ['#7f1d1d', '#ef4444'],
  ['#0c4a6e', '#0ea5e9'], ['#3f6212', '#84cc16'], ['#581c87', '#c084fc'],
];

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const escapeXml = (s = '') =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

function wrap(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
  }
  return lines;
}

export function renderCoverSvg({ title = 'Untitled', author = '', seed = 0, width = 400, height = 600 } = {}) {
  const key = `${seed}:${title}:${author}`;
  const h = hash(key);
  const [from, to] = PALETTES[h % PALETTES.length];
  const angle = h % 2 ? 135 : 45;
  const titleLines = wrap(title, 16, 4);
  const authorLines = wrap(author, 22, 2);
  const titleSize = titleLines.length > 3 ? 34 : 40;
  const startY = height / 2 - (titleLines.length - 1) * (titleSize * 0.6) - 30;

  const titleTspans = titleLines
    .map((line, i) => `<tspan x="${width / 2}" y="${startY + i * titleSize * 1.2}">${escapeXml(line)}</tspan>`)
    .join('');
  const authorTspans = authorLines
    .map((line, i) => `<tspan x="${width / 2}" y="${height - 120 + i * 26}">${escapeXml(line)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)} by ${escapeXml(author)}">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle} 0.5 0.5)">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="1.4" fill="rgba(255,255,255,.14)"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" fill="url(#dots)"/>
  <rect x="26" y="26" width="${width - 52}" height="${height - 52}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" rx="6"/>
  <rect x="0" y="0" width="14" height="${height}" fill="rgba(0,0,0,.22)"/>
  <text text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700" fill="#ffffff">${titleTspans}</text>
  <line x1="${width / 2 - 50}" y1="${height - 160}" x2="${width / 2 + 50}" y2="${height - 160}" stroke="rgba(255,255,255,.6)" stroke-width="2"/>
  <text text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="rgba(255,255,255,.92)" letter-spacing="1">${authorTspans}</text>
  <text text-anchor="middle" x="${width / 2}" y="${height - 48}" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="rgba(255,255,255,.65)" letter-spacing="3">BIBLIOBAZAAR</text>
</svg>`;
}
