import { describe, expect, it } from 'vitest'
import { checkRepository, validateOpenSourceManifest } from '../scripts/check-open-source-compliance.mjs'

function validManifest() {
  return {
    schemaVersion: 1,
    project: {
      currentDistribution: 'private-internal',
      publicRelease: {
        status: 'not-approved',
        licenseSpdx: null,
        gates: {
          legalReview: 'pending',
          secretScan: 'pending',
          clientDataRemoval: 'blocked',
          trademarkAssetReview: 'pending',
        },
      },
    },
    components: [{
      id: 'postiz',
      name: 'Postiz',
      sourceRepository: 'https://github.com/gitroomhq/postiz-app',
      licenseSpdx: 'AGPL-3.0-only',
      licenseUrl: 'https://github.com/gitroomhq/postiz-app/blob/main/LICENSE',
      image: `ghcr.io/gitroomhq/postiz-app@sha256:${'a'.repeat(64)}`,
      boundary: {
        type: 'separate-network-service',
        vendoredSource: false,
        npmDependency: false,
        upstreamImageModified: false,
      },
      noticeFile: 'THIRD_PARTY_NOTICES.md',
      networkCopyleft: {
        modifiedDeploymentRequiresSourceOffer: true,
        correspondingSourceUrl: null,
        sourceOfferUrl: null,
      },
      operations: { publicRegistrationExpected: false },
    }],
  }
}

describe('open-source compliance gate', () => {
  it('accepts the current private sidecar boundary', () => {
    expect(validateOpenSourceManifest(validManifest())).toEqual([])
  })

  it('rejects mutable container tags', () => {
    const manifest = validManifest()
    manifest.components[0].image = 'ghcr.io/gitroomhq/postiz-app:latest'
    expect(validateOpenSourceManifest(manifest)).toContain('postiz: image must use an immutable sha256 repository digest, not a mutable tag.')
  })

  it('requires a source offer when upstream Postiz is modified', () => {
    const manifest = validManifest()
    manifest.components[0].boundary.upstreamImageModified = true
    const errors = validateOpenSourceManifest(manifest)
    expect(errors).toContain('postiz: a modified network deployment requires a corresponding-source URL.')
    expect(errors).toContain('postiz: a modified network deployment requires a source-offer URL.')
  })

  it('blocks a public Command Center release until every release gate passes', () => {
    const manifest = validManifest()
    manifest.project.publicRelease.status = 'approved'
    const errors = validateOpenSourceManifest(manifest)
    expect(errors).toContain('An approved public release requires a project SPDX license.')
    expect(errors).toContain('An approved public release requires clientDataRemoval to be passed.')
  })

  it('passes against the checked-in manifest, notices, dependency boundary, and CI workflows', () => {
    expect(checkRepository(process.cwd())).toEqual([])
  })
})
