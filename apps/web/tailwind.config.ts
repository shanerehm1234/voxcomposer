import type { Config } from 'tailwindcss';
import { PALETTE } from './src/styles/palette';

/**
 * The Vox Composer palette is the ONLY source of colour in the app. Components
 * reference these tokens (bg, purple, teal, …) — never raw hex. Colour values
 * come from src/styles/palette.ts, the shared source the canvas renderer also
 * uses, so DOM and canvas can never drift.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: PALETTE.bg,
        // Tailwind hyphenates nested shade keys (bg.2 -> "bg-bg-2"), but the
        // whole app was written assuming "bg-bg2"/"bg-bg3" (no hyphen) — so
        // bg2/bg3 must be top-level color keys, not shades nested under bg,
        // or every bg-bg2/bg-bg3 utility in the app silently does nothing
        // (exactly what made the Add Device modal's card fully transparent —
        // no fallback background behind it, unlike most other bg-bg2 users
        // which happened to have a parent bg-bg showing through).
        bg2: PALETTE.bg2,
        bg3: PALETTE.bg3,
        purple: {
          DEFAULT: PALETTE.purple,
          l: PALETTE.purpleL,
          d: PALETTE.purpleD,
        },
        teal: {
          DEFAULT: PALETTE.teal,
          l: PALETTE.tealL,
        },
        text: PALETTE.text,
        muted: PALETTE.muted,
        border: PALETTE.border,
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
