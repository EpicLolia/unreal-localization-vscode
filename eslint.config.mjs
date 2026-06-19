// @ts-check

// https://eslint.org/docs/latest/use/configure/configuration-files
// https://typescript-eslint.io/getting-started/
// https://prettier.io/docs/integrating-with-linters

import { defineConfig } from 'eslint/config';

import js from '@eslint/js';
import globals from 'globals';
import json from '@eslint/json';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default defineConfig([
  {
    ignores: ['node_modules/', 'dist/', 'out/'],
  },

  {
    files: ['**/*.json'],
    ignores: ['package-lock.json'],
    plugins: { json },
    language: 'json/json',
    extends: ['json/recommended'],
  },

  {
    files: ['**/*.js', '**/*.mjs'],
    plugins: { js },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    extends: ['js/recommended'],
  },

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    extends: [js.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic],
    rules: {},
  },

  eslintPluginPrettierRecommended,
]);
