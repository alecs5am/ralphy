// Preview sample text for the catalog (#565). English first; the Russian
// samples exercise Cyrillic glyph coverage in caption and font-pair previews.
//
// The Russian strings are written as Unicode escapes on purpose: the repo is
// English-only on disk (docs/developing-ralphy.md, `lint:no-cyrillic`), and
// escapes keep the Cyrillic gate empty while the rendered previews (gitignored,
// under .ralphy/catalog/) still show real Cyrillic text.

export type SampleLang = "en" | "ru";

export const CAPTION_SAMPLE: Record<SampleLang, string> = {
  en: "Most videos lose you in the very first second",
  ru: "\u0411\u043e\u043b\u044c\u0448\u0438\u043d\u0441\u0442\u0432\u043e \u0440\u043e\u043b\u0438\u043a\u043e\u0432 \u0442\u0435\u0440\u044f\u044e\u0442 \u0437\u0440\u0438\u0442\u0435\u043b\u044f \u0432 \u043f\u0435\u0440\u0432\u0443\u044e \u0436\u0435 \u0441\u0435\u043a\u0443\u043d\u0434\u0443",
};

export const FONT_PAIR_SAMPLE: Record<SampleLang, { headline: string; body: string; pangram: string }> = {
  en: {
    headline: "Make the first second count",
    body: "Captions that read at a glance, in any language.",
    pangram: "Sphinx of black quartz, judge my vow",
  },
  ru: {
    headline: "\u041f\u0435\u0440\u0432\u0430\u044f \u0441\u0435\u043a\u0443\u043d\u0434\u0430 \u0440\u0435\u0448\u0430\u0435\u0442 \u0432\u0441\u0451",
    body: "\u0421\u0443\u0431\u0442\u0438\u0442\u0440\u044b, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0447\u0438\u0442\u0430\u044e\u0442\u0441\u044f \u0441 \u043f\u0435\u0440\u0432\u043e\u0433\u043e \u0432\u0437\u0433\u043b\u044f\u0434\u0430.",
    pangram: "\u0421\u044a\u0435\u0448\u044c \u0436\u0435 \u0435\u0449\u0451 \u044d\u0442\u0438\u0445 \u043c\u044f\u0433\u043a\u0438\u0445 \u0444\u0440\u0430\u043d\u0446\u0443\u0437\u0441\u043a\u0438\u0445 \u0431\u0443\u043b\u043e\u043a, \u0434\u0430 \u0432\u044b\u043f\u0435\u0439 \u0447\u0430\u044e",
  },
};

export type CaptionWord = { text: string; start: number; end: number; lang: SampleLang };

/**
 * Deterministic word timings for a caption preview: English phrase first, then
 * the Russian one after a pause. Word length drives duration the way speech
 * does (about 0.18 s plus 35 ms per letter), so chunk windows look real.
 */
export function captionSampleWords(at: number): CaptionWord[] {
  const words: CaptionWord[] = [];
  let t = at;
  for (const lang of ["en", "ru"] as const) {
    for (const text of CAPTION_SAMPLE[lang].split(" ")) {
      const d = Math.round((0.18 + 0.035 * text.replace(/[^\p{L}\p{N}]/gu, "").length) * 1000) / 1000;
      words.push({ text, start: Math.round(t * 1000) / 1000, end: Math.round((t + d) * 1000) / 1000, lang });
      t += d + 0.04;
    }
    t += 0.6;
  }
  return words;
}
