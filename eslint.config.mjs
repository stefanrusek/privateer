// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Spec 08 §7 — strict, type-aware linting with mechanical enforcement of the
 * dependency-injection boundary (§6.1) and the bans on untestable constructs
 * (process.exit, Date.now, Math.random — §6.3, §7.2).
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.claude/**',
      '*.config.*',
      'cucumber.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      eqeqeq: ['error', 'always'],
      'no-fallthrough': 'error',
      curly: ['error', 'all'],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='process'][callee.property.name='exit']",
          message:
            'process.exit is forbidden outside main.ts — request exit via the Lifecycle boundary (Spec 08 §5.1).',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message:
            'Date.now() is forbidden — inject the Clock boundary (Spec 08 §6.3).',
        },
        {
          selector:
            "MemberExpression[object.name='Math'][property.name='random']",
          message:
            'Math.random() is forbidden — inject randomness via a boundary (Spec 08 §6.3).',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/adapters/*', '**/adapters/**'],
              message:
                'Boundary adapters may only be imported from main.ts or other adapters (Spec 08 §6.1).',
            },
          ],
          paths: [
            {
              name: '@kubernetes/client-node',
              message:
                'Import @kubernetes/client-node only inside src/adapters (Spec 08 §6.1).',
            },
            {
              name: '@huggingface/transformers',
              message:
                'Import @huggingface/transformers only inside src/adapters (Spec 08 §6.1).',
            },
          ],
        },
      ],
    },
  },
  {
    // The composition root and the adapters/ directory are the only places
    // allowed to touch real boundaries directly (Spec 08 §5.2, §6.1).
    files: ['src/main.ts', 'src/adapters/**/*.ts', 'bin/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Test files exercise error paths and fakes; keep type-safety strict but
    // allow the patterns tests legitimately need.
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
