/**
 * AA metallic platinum — shared style tokens for seal path-word (and any
 * Cyre surface that needs the same metal). Keep hex/rgb in lockstep with
 * guardian-scan/lib/guardian/aa-platinum.ts.
 *
 * Vertical sheen: bright silver → #E5E4E2 → darker steel.
 */

export const AA_PLATINUM = {
  mid: '#E5E4E2',
  peak: '#FFFFFF',
  hi: '#F7F8FA',
  lo: '#7A808A',
  steel: '#5A6068',
  borderPeak: '#FFFFFF',
  borderHi: '#F2F3F5',
  borderLo: '#A8AEB8',
  tileBg: '#0C0D0F',
  wordmark: 'platinum',
  rgb: {
    peak: [255, 255, 255],
    hi: [247, 248, 250],
    mid: [229, 228, 226],
    lo: [122, 128, 138],
    steel: [90, 96, 104],
    borderHi: [242, 243, 245],
    borderLo: [168, 174, 184]
  }
};
