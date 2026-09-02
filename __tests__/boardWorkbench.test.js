import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('Board workbench guardrails', () => {
  it('provides a shared horizontal board surface with visible controls', () => {
    const component = read('app/components/BoardWorkbench.js')
    const css = read('app/globals.css')

    expect(component).toContain('export default function BoardWorkbench')
    expect(component).toContain('board-workbench-nav is-left')
    expect(component).toContain('board-workbench-nav is-right')
    expect(component).toContain('updateFloatingControls')
    expect(component).toContain("floating.active ? ' is-floating' : ''")
    expect(component).toContain('autoScrollWhileDragging')
    expect(css).toContain('.board-workbench-scroll')
    expect(css).toContain('scrollbar-gutter: stable')
    expect(css).toContain('.board-column')
    expect(css).toContain('.board-card-move')
    expect(css).toContain('.board-workbench-nav.is-floating')
    expect(css).toContain('position: fixed')
    expect(css).toContain('top: var(--board-nav-top)')
  })

  it('uses the shared board workbench on core board pages', () => {
    const files = [
      'app/pipelines/PipelinesManager.js',
      'app/tasks/TasksManager.js',
      'app/projects/ProjectsManager.js',
      'app/sponsors/SponsorCRM.js',
    ]

    for (const file of files) {
      const source = read(file)
      expect(source).toContain('BoardWorkbench')
      expect(source).toContain('board-column')
      expect(source).toContain('board-card-move')
    }
  })

  it('documents the board scroll interaction and verification path', () => {
    const doc = read('docs/archive/voice-and-board-guardrails-2026-05-17.md')

    expect(doc).toContain('Board Workbench')
    expect(doc).toContain('viewport-centered')
    expect(doc).toContain('__tests__/boardWorkbench.test.js')
  })
})
