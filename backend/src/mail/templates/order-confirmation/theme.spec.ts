import { brand, tints } from './theme';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const blend = (fg: string, bg: string, alpha: number) =>
  '#' +
  rgb(fg)
    .map((c, i) => Math.round(alpha * c + (1 - alpha) * rgb(bg)[i]))
    .map((c) => c.toString(16).padStart(2, '0').toUpperCase())
    .join('');

describe('email theme tints are blends of the brand tokens (no invented hues)', () => {
  it.each([
    ['textMuted', brand.charcoal, brand.white, 0.7],
    ['border', brand.charcoal, brand.white, 0.12],
    ['progressTrack', brand.gold, brand.cream, 0.25],
    ['footerText', brand.cream, brand.charcoal, 0.75],
    ['footerSubtle', brand.cream, brand.charcoal, 0.55],
    ['preheaderBand', brand.charcoal, brand.cream, 0.05],
  ] as const)('%s', (name, fg, bg, alpha) => {
    expect(tints[name]).toBe(blend(fg, bg, alpha));
  });
});
