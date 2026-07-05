// Shared flat config for the whole workspace. Each package's `lint` script
// runs `eslint src` from its own directory; this root config covers them all.
// Deliberately the un-type-checked recommended tier: fast, zero-setup in CI,
// and `tsc -b --noEmit` (the `typecheck` script) already covers type errors.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/dev-dist/**', '**/*.gen.ts'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // `_`-prefixed args are the conventional "intentionally unused" marker.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // zod-heavy code aliases inferred types constantly; `any` is still banned
      // but empty-object types and non-null assertions are pragmatic here.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
