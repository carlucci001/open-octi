import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@/lib/dataStore', () => ({
  readData: (file) => store.get(file) || null,
  writeData: (file, data) => store.set(file, data),
}))

vi.mock('@/lib/agent-creds', () => ({
  getCred: () => null,
}))

describe('Content Lab engine', () => {
  beforeEach(() => {
    store.clear()
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('GOOGLE_API_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
  })

  it('creates, lists, updates, and deletes durable content drafts', async () => {
    const {
      createContentJob,
      listContentJobs,
      updateContentJob,
      deleteContentJob,
    } = await import('@/lib/content-lab')

    const job = await createContentJob({
      workflow: 'blog',
      topic: 'Command Center content workflow',
      audience: 'small business owners',
      source: 'Use a review queue before making images or reels.',
      createdBy: 'test-agent',
    })

    expect(job).toMatchObject({
      workflow: 'blog',
      workflowLabel: 'Blog',
      status: 'draft',
      provider: 'template',
      createdBy: 'test-agent',
    })
    expect(job.content).toContain('Command Center content workflow')

    expect(listContentJobs({ q: 'review queue' })).toHaveLength(1)
    expect(updateContentJob(job.id, { status: 'review' })?.status).toBe('review')
    expect(deleteContentJob(job.id)).toBe(true)
    expect(listContentJobs()).toHaveLength(0)
  })

  it('includes an OpenMontage-ready video package workflow', async () => {
    const { CONTENT_WORKFLOWS, createContentJob } = await import('@/lib/content-lab')
    const workflow = CONTENT_WORKFLOWS.find(item => item.id === 'video-package')

    expect(workflow).toMatchObject({
      label: 'Video Package',
      destination: 'OpenMontage pipeline',
    })

    const job = await createContentJob({
      workflow: 'video-package',
      topic: 'Command Center demo reel',
      openMontagePipeline: 'screen-demo',
      source: 'Show the dashboard, agents, media library, and social planner.',
    })

    expect(job.workflow).toBe('video-package')
    expect(job.openMontagePipeline).toBe('screen-demo')
    expect(job.content).toContain('OpenMontage Handoff')
    expect(job.content).toContain('screen-demo')
  })
})
