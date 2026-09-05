// Tests must never inherit NODE_ENV=production from the launching shell —
// it makes Vite resolve React's production build (act() unsupported) and
// breaks node: builtin externalization. Force test mode unconditionally.
process.env.NODE_ENV = 'test';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { transformWithOxc } from 'vite';
import path from 'path';

const jsAsJsx = {
  name: 'fcc-js-as-jsx',
  enforce: 'pre',
  transform(code, id) {
    if (!/[\\/](app|components)[\\/].*\.js$/.test(id)) return null;
    return transformWithOxc(code, `${id}.jsx`, {
      jsx: { runtime: 'automatic' },
    });
  },
};

export default defineConfig({
  plugins: [jsAsJsx, react({ include: /\.[jt]sx?$/ })],
  test: {
    environment: 'jsdom',
    env: { NODE_ENV: 'test' },
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    testTimeout: 15000,
    include: ['__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@closed/research-page': path.resolve(__dirname, 'app/research/page.js'),
    },
  },
});
