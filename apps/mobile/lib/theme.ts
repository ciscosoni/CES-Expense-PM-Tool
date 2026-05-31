/**
 * Dark "operations console" palette mirroring the web app (corporate blue
 * accent). Plain constants — RN has no CSS variables.
 */
export const theme = {
  bg: '#0A0B12',
  bgElevated: '#12131C',
  card: '#14161F',
  cardBorder: '#272A38',
  text: '#F5F7FA',
  textMuted: '#9AA0B4',
  textFaint: '#6B7180',
  primary: '#2E7CF6',
  primaryDim: 'rgba(46,124,246,0.15)',
  success: '#34D399',
  successDim: 'rgba(52,211,153,0.15)',
  warning: '#F5B544',
  warningDim: 'rgba(245,181,68,0.15)',
  danger: '#F2625C',
  dangerDim: 'rgba(242,98,92,0.15)',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const space = (n: number) => n * 4;
