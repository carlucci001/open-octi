import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { preparePostizEnvironment } from './setup-openocti-postiz.mjs'

if (process.platform !== 'linux') throw new Error('The one-click updater service currently requires Linux and systemd.')
if (typeof process.getuid === 'function' && process.getuid() !== 0) throw new Error('Run this installer with sudo so it can create the guarded system service.')

const root = fs.realpathSync(process.cwd())
preparePostizEnvironment(root)
const node = fs.realpathSync(process.execPath)
const service = `[Unit]\nDescription=OpenOcti guarded updater\nAfter=network-online.target docker.service\nWants=network-online.target\n\n[Service]\nType=simple\nWorkingDirectory=${root}\nEnvironmentFile=-${path.join(root, '.env')}\nEnvironment=OPENOCTI_ROOT=${root}\nExecStart=${node} ${path.join(root, 'scripts', 'openocti-updater-service.mjs')}\nRestart=on-failure\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectHome=true\nProtectSystem=strict\nReadWritePaths=${root} /run/openocti-updater /var/lib/openocti-updater ${path.resolve(root, '..', 'openocti-backups')} /var/run/docker.sock\n\n[Install]\nWantedBy=multi-user.target\n`
fs.mkdirSync('/run/openocti-updater', { recursive: true, mode: 0o755 })
fs.mkdirSync('/var/lib/openocti-updater', { recursive: true, mode: 0o700 })
fs.writeFileSync('/etc/systemd/system/openocti-updater.service', service, { mode: 0o644 })
execFileSync('systemctl', ['daemon-reload'], { stdio: 'inherit' })
execFileSync('systemctl', ['enable', '--now', 'openocti-updater.service'], { stdio: 'inherit' })
console.log('One-click updates enabled. Restart OpenOcti once so the app can see the updater socket.')
