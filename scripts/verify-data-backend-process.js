const path = require('path')

function selectNextServerPid(psOutput, expectedCwd, readCwd) {
  const normalizedExpected = path.resolve(expectedCwd)
  const rows = String(psOutput || '').split('\n').filter(row => /next-server/.test(row))

  for (const row of rows) {
    const pid = row.trim().split(/\s+/)[0]
    if (!/^\d+$/.test(pid)) continue
    try {
      if (path.resolve(readCwd(pid)) === normalizedExpected) return pid
    } catch {
      // The process may exit between `ps` and reading /proc. Try the next row.
    }
  }

  return null
}

function parseProcessEnvironment(raw) {
  return Object.fromEntries(
    String(raw || '')
      .split('\0')
      .filter(Boolean)
      .map(entry => {
        const index = entry.indexOf('=')
        return [entry.slice(0, index), entry.slice(index + 1)]
      }),
  )
}

module.exports = { parseProcessEnvironment, selectNextServerPid }
