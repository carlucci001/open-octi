// Platform surface selection — GetFound3 workspace + reports toggle
// (work order 2026-08-02). Covers the pure decision function PlatformsModule
// uses to choose between the legacy embedded reports manager and the
// generic PlatformAdminWorkspace, so the branching is testable without
// mounting the full React tree.
import { describe, expect, it } from 'vitest'
import { resolvePlatformSurface } from '../lib/platforms/surfaceSelection'

describe('resolvePlatformSurface', () => {
  it('sends a generic platform with a non-empty adminApiBasePath and a live connection to the workspace', () => {
    const platform = {
      surface: 'generic',
      adminApiBasePath: '/api/platform-admin/v1',
      status: 'ok',
      credentialRef: 'Some Platform Admin',
    }
    expect(resolvePlatformSurface(platform)).toEqual({ primary: 'workspace', showReportsToggle: false })
  })

  it('keeps a generic platform unavailable when it is not connected, even with adminApiBasePath set', () => {
    const platform = {
      surface: 'generic',
      adminApiBasePath: '/api/platform-admin/v1',
      status: 'unknown',
      credentialRef: '',
    }
    expect(resolvePlatformSurface(platform).primary).toBe('unavailable')
  })

  it('keeps GetFound3 on the legacy manager (no toggle) when it has no adminApiBasePath yet', () => {
    const platform = {
      surface: 'getfound3',
      adminApiBasePath: '',
      status: 'unknown',
      credentialRef: '',
    }
    expect(resolvePlatformSurface(platform)).toEqual({ primary: 'legacyManager', showReportsToggle: false })
  })

  it('sends GetFound3 to the workspace with the reports toggle once adminApiBasePath is set', () => {
    const platform = {
      surface: 'getfound3',
      adminApiBasePath: '/api/platform-admin/v1',
      status: 'unknown',
      credentialRef: '',
    }
    expect(resolvePlatformSurface(platform)).toEqual({ primary: 'workspace', showReportsToggle: true })
  })

  it('sends GetFound3 to the workspace regardless of connection status once adminApiBasePath is set', () => {
    const platform = {
      surface: 'getfound3',
      adminApiBasePath: '/api/platform-admin/v1',
      status: 'error',
      credentialRef: 'GetFound3 Admin',
    }
    expect(resolvePlatformSurface(platform).primary).toBe('workspace')
  })

  it('returns none for a missing platform', () => {
    expect(resolvePlatformSurface(null)).toEqual({ primary: 'none', showReportsToggle: false })
  })
})
