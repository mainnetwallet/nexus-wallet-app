export const colors = {
  bg: '#050508',
  surface: '#0b0b12',
  raised: '#141420',
  border: '#23233a',
  text: '#f4f4f8',
  muted: '#8a8aa3',
  faint: '#5b5b73',
  primary: '#6366f1',
  primaryDim: '#4f46e5',
  secondary: '#8b5cf6',
  cyan: '#22d3ee',
  green: '#10b981',
  red: '#f43f5e',
  amber: '#f59e0b',
  overlay: 'rgba(0,0,0,0.62)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const font = {
  body: 15,
  small: 13,
  tiny: 11,
  title: 20,
  hero: 28,
  mono: 'monospace',
} as const;

export const layout = {
  navHeight: 62,
  sheetMaxHeight: '86%',
  drawerWidth: 310,
  maxContentWidth: 720,
} as const;
