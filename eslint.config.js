import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '.claude/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    // Le service worker vit dans son propre contexte d'exécution.
    files: ['apps/client/public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
      },
    },
  },
]);
