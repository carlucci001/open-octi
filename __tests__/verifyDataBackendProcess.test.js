import { describe, expect, it } from 'vitest'
import processHelpers from '../scripts/verify-data-backend-process'

const { parseProcessEnvironment, selectNextServerPid } = processHelpers

describe('data backend process selection', () => {
  it('selects the Next server whose working directory is the Command Center', () => {
    const ps = [
      '884466 next-server (v16.2.6)',
      '2768587 next-server (v14.2.35)',
    ].join('\n')
    const cwdByPid = {
      884466: '/app/frontend',
      2768587: '/root/farrington-command-center',
    }

    expect(selectNextServerPid(
      ps,
      '/root/farrington-command-center',
      pid => cwdByPid[pid],
    )).toBe('2768587')
  })

  it('parses the selected process environment without exposing unrelated values', () => {
    expect(parseProcessEnvironment('DATA_BACKEND=sqlite\0NODE_ENV=production\0')).toEqual({
      DATA_BACKEND: 'sqlite',
      NODE_ENV: 'production',
    })
  })
})
