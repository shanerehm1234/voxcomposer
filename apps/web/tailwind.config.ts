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
        bg: {
          DEFAULT: PALETTE.bg,
          2: PALETTE.bg2,
          3: PALETTE.bg3,
        },
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
