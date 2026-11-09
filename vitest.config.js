// Tests must never inherit NODE_ENV=production from the launching shell —
// it makes Vite resolve React's production build (act() unsupported) and
// breaks node: builtin externalization. Force test mode unconditionally.
process.env.NODE_ENV = 'test';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { transformWithOxc } from 'vite';
import path from 'path';
import fs from 'node:fs';

const publicPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).name === 'openocti';
// Same closed-module list webpack uses in OpenOcti builds (next.config.js), so tests in the
// exported tree resolve Command Center-only imports to the stub exactly like the app does.
const closedModuleRequests = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'lib/openocti/closed-module-requests.json'), 'utf8')).closedModuleRequests;
const closedModuleStub = path.resolve(__dirname, 'lib/openocti/closed-module-stub.cjs');

// Vite's hashbang detection expects LF. Windows checkouts can use CRLF,
// causing its injected imports to precede the hashbang and break collection.
const normalizeWindowsHashbang = {
  name: 'fcc-normalize-windows-hashbang',
  enforce: 'pre',
  transform(code) {
    if (!/^#![^\r\n]*\r\n/.test(code)) return null;
    return { code: code.replace(/^(#![^\r\n]*)\r\n/, '$1\n'), map: null };
  },
};

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
  plugins: [normalizeWindowsHashbang, jsAsJsx, react({ include: /\.[jt]sx?$/ })],
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
      ...(publicPackage ? Object.fromEntries(closedModuleRequests.map(request => [request, closedModuleStub])) : {}),
      '@': path.resolve(__dirname, '.'),
      '@closed/research-page': path.resolve(__dirname, 'app/research/page.js'),
    },
  },
});
