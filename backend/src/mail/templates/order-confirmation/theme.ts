/**
 * Email theme (AGENT.md §4). The five brand tokens, plus solid tints PRECOMPUTED by blending a
 * token over white/cream/charcoal, because Outlook and others ignore rgba() and opacity.
 * Every colour in the email comes from here; theme.spec.ts re-derives the tints.
 */
export const brand = {
  crimson: '#9F2D2D',
  gold: '#C5A059',
  charcoal: '#1E221E',
  cream: '#F4F2EE',
  white: '#FFFFFF',
} as const;

export const tints = {
  /** charcoal at 70% over white — secondary text (AA on white). */
  textMuted: '#626462',
  /** charcoal at 12% over white — hairline borders and dividers. */
  border: '#E4E4E4',
  /** gold at 25% over cream — inactive progress steps. */
  progressTrack: '#E8DEC9',
  /** cream at 75% over charcoal — footer text. */
  footerText: '#BFBEBA',
  /** cream at 55% over charcoal — footer small print (AA on charcoal). */
  footerSubtle: '#949490',
  /** charcoal at 5% over cream — the preview-text band above the header. */
  preheaderBand: '#E9E8E4',
} as const;

export const fonts = {
  heading: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  body: "'Plus Jakarta Sans', Arial, Helvetica, sans-serif",
} as const;

/** Every colour the template may use (checked by tests). */
export const ALLOWED_COLOURS: readonly string[] = [
  ...Object.values(brand),
  ...Object.values(tints),
];
