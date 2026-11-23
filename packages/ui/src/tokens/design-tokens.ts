/**
 * Centralized CSS Variable design tokens so theme colors, radii, typography,
 * and spacing update consistently across Desktop and Android UIs.
 */
export const YOURTUTOR_DESIGN_TOKENS = {
  colorBgPrimary: '--yt-bg-primary',
  colorBgSurface: '--yt-bg-surface',
  colorBgElevated: '--yt-bg-elevated',
  colorTextPrimary: '--yt-text-primary',
  colorTextSecondary: '--yt-text-secondary',
  colorAccent: '--yt-accent',
  colorMasteryWeak: '--yt-mastery-weak',
  colorMasteryConsolidating: '--yt-mastery-consolidating',
  colorMasteryMastered: '--yt-mastery-mastered',
  radiusCard: '--yt-radius-card',
  radiusControl: '--yt-radius-control',
  spacingUnit: '--yt-space-unit',
  fontSans: '--yt-font-sans',
  fontMono: '--yt-font-mono',
} as const;

export type YourTutorDesignTokenKey = keyof typeof YOURTUTOR_DESIGN_TOKENS;
