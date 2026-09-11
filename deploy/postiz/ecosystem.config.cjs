// Launch real Node processes without PM2's in-process Node wrapper. With the
// pinned Postiz 2.23.0 image, that wrapper stalled before the API opened.
const node = '/usr/local/bin/node'
const app = (name, cwd, args) => ({
  name, cwd, script: node, args, interpreter: 'none',
  autorestart: true, restart_delay: 2000, kill_timeout: 10000,
})

module.exports = {
  apps: [
    app('backend', '/app/apps/backend', ['--experimental-require-module', './dist/apps/backend/src/main.js']),
    app('frontend', '/app/apps/frontend', [require.resolve('next/dist/bin/next', { paths: ['/app/apps/frontend'] }), 'start', '-p', '4200']),
    app('orchestrator', '/app/apps/orchestrator', ['--experimental-require-module', './dist/apps/orchestrator/src/main.js']),
  ],
}
