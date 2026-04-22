// Geoclaw language detection utilities.
// NEVER reverse RTL strings — terminals and browsers handle BiDi rendering.
// Our only job is: (1) tell callers what script/direction the text is, and
// (2) keep UTF-8 bytes untouched.

// Unicode ranges, tested with Array.prototype.some so a single-char match wins.
const RANGES = {
  hebrew:   /[֐-׿יִ-ﭏ]/,
  arabic:   /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/,
  cyrillic: /[Ѐ-ӿ]/,
  cjk:      /[一-鿿぀-ヿ가-힯]/,
  latin:    /[A-Za-z]/,
};

function hasHebrew(text) { return RANGES.hebrew.test(String(text || '')); }
function hasArabic(text) { return RANGES.arabic.test(String(text || '')); }

// "Dominant" script = which Unicode range has the most characters in the text.
// We only count letters (not punctuation / digits / whitespace) so short
// English words in a mostly-Hebrew sentence don't flip the result.
function dominantScript(text) {
  const s = String(text || '');
  const counts = { hebrew: 0, arabic: 0, cyrillic: 0, cjk: 0, latin: 0 };
  for (const ch of s) {
    for (const [name, re] of Object.entries(RANGES)) {
      if (re.test(ch)) { counts[name]++; break; }
    }
  }
  let best = 'latin', bestN = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestN) { best = k; bestN = v; }
  }
  return bestN === 0 ? 'unknown' : best;
}

function isRTL(text) {
  const s = dominantScript(text);
  return s === 'hebrew' || s === 'arabic';
}

// Best-effort language code for TTS / system prompts.
function detectLang(text) {
  switch (dominantScript(text)) {
    case 'hebrew':   return 'he';
    case 'arabic':   return 'ar';
    case 'cyrillic': return 'ru';
    case 'cjk':      return 'zh';  // coarse — could be ja/ko/zh, but fine for voice picking
    default:         return 'en';
  }
}

module.exports = { hasHebrew, hasArabic, dominantScript, isRTL, detectLang };
