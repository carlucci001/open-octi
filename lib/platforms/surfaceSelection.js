// lib/platforms/surfaceSelection.js
// Pure decision logic for which surface PlatformsModule renders for a
// selected platform (work order 2026-08-02: GetFound3 workspace + reports
// toggle). Extracted so the branching is testable without mounting the full
// React tree.
//
// GetFound3 is a built-in platform (surface === 'getfound3'). Today it only
// has the legacy embedded reports manager. Once its registry record carries
// a non-empty adminApiBasePath — meaning the standard Platform Admin API
// (same shapes every other platform uses) is live for it — its page renders
// the generic PlatformAdminWorkspace instead, with an in-page toggle back to
// the reports manager so that surface stays reachable. No adminApiBasePath
// yet means behavior is unchanged: manager only, no toggle (truthful
// interface — never promise a surface the platform can't back up).
//
// Every other platform keeps its existing gate: the workspace only appears
// once the platform is connected (status === 'ok') AND a credential
// reference is on file.

export function resolvePlatformSurface(platform) {
  if (!platform) return { primary: 'none', showReportsToggle: false }

  const hasAdminApi = Boolean(platform.adminApiBasePath)
  const isGetFound3 = platform.surface === 'getfound3'

  if (isGetFound3) {
    return hasAdminApi
      ? { primary: 'workspace', showReportsToggle: true }
      : { primary: 'legacyManager', showReportsToggle: false }
  }

  const connected = platform.status === 'ok' && Boolean(platform.credentialRef)
  return { primary: connected ? 'workspace' : 'unavailable', showReportsToggle: false }
}
