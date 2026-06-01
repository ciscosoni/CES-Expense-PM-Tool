import config from '@ces/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Mobile-local ESLint config. Extends the shared TS config and adds the two
 * things RN needs that the generic config can't assume:
 *   1. react-hooks rules (the app relies on them — see the exhaustive-deps
 *      suppressions in lib/use-async.ts and the tab screens).
 *   2. A CommonJS + Node-globals override for *.config.js (metro.config.js),
 *      which the shared "sourceType: module" config flags as undefined globals.
 */
export default [
  ...config,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['**/*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
