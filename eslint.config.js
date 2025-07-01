import js from '@eslint/js';
import tseslintPlugin from '@typescript-eslint/eslint-plugin';
import tseslintParser from '@typescript-eslint/parser';
import { defineConfig } from 'eslint-define-config';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import promisePlugin from 'eslint-plugin-promise';
import globals from 'globals';

const isProd = process.env.NODE_ENV === 'production';

const cleanGlobals = Object.fromEntries(
  Object.entries({
    ...globals.node,
  }).map(([k, v]) => [k.trim(), v])
);

export default defineConfig([
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '**/*.d.ts'],
  },

  // Основной конфиг для backend
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslintParser,
      parserOptions: {},
      globals: cleanGlobals,
    },
    plugins: {
      import: importPlugin,
      promise: promisePlugin,
      prettier: prettierPlugin,
      '@typescript-eslint': tseslintPlugin,
    },
    rules: {
      // Стандарты
      ...js.configs.recommended.rules,
      ...tseslintPlugin.configs.recommended.rules,
      ...promisePlugin.configs.recommended.rules,
      ...prettierPlugin.configs.recommended.rules,

      // Prettier
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],

      // TypeScript
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      // JS
      'no-console': isProd ? ['error', { allow: ['warn', 'error'] }] : 'off',
      'no-debugger': isProd ? 'error' : 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unused-vars': 'off',
      'no-undef': 'off',

      // Импорты
      'import/no-duplicates': 'error',
      'import/order': 'off',

      // Стиль
      semi: ['error', 'always'],
      quotes: ['error', 'single'],

      // Ограничение по строкам
      'max-lines': [
        'warn',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },

  // Тесты
  {
    files: ['**/*.test.{js,ts}', 'config/*.js'],
    languageOptions: {
      globals: {
        ...cleanGlobals,
        ...globals.jest,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },

  // Node.js конфиги
  {
    files: ['*.js', '*.cjs', '*.mjs', '*.config.js', '*.config.ts'],
    languageOptions: {
      globals: {
        ...cleanGlobals,
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
]);
