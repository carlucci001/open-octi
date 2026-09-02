import { create, loadAll } from '@/lib/entityStore'

export const COMMAND_CENTER_PIPELINE_ID = 'command_center'
export const COMMAND_CENTER_FIRST_STAGE_ID = 'inquiry'

const COMMAND_CENTER_PIPELINE = {
  id: COMMAND_CENTER_PIPELINE_ID,
  name: 'Farrington Command Center',
  description: 'Product sales pipeline for private Command Center installs, consults, setup fees, and platform quotes.',
  color: '#e0c388',
  stages: [
    { id: 'inquiry', label: 'Inquiry', color: '#6c7086', probability: 10 },
    { id: 'fit-review', label: 'Fit Review', color: '#89b4fa', probability: 20 },
    { id: 'setup-fee', label: 'Setup Fee', color: '#94e2d5', probability: 35 },
    { id: 'scoping', label: 'Scoping', color: '#f9e2af', probability: 50 },
    { id: 'proposal', label: 'Proposal', color: '#fab387', probability: 70 },
    { id: 'won', label: 'Won', color: '#a6e3a1', probability: 100, terminal: 'won' },
    { id: 'lost', label: 'Lost', color: '#f38ba8', probability: 0, terminal: 'lost' },
  ],
  ownerAccountId: 'inhouse',
}

export function ensureCommandCenterPipeline() {
  const existing = loadAll('pipelines').find(p => p.id === COMMAND_CENTER_PIPELINE_ID)
  if (existing) {
    const stageId = existing.stages?.some(stage => stage.id === COMMAND_CENTER_FIRST_STAGE_ID)
      ? COMMAND_CENTER_FIRST_STAGE_ID
      : existing.stages?.find(stage => !stage.terminal)?.id || existing.stages?.[0]?.id || null
    return { pipeline: existing, stageId }
  }

  const pipeline = create('pipelines', COMMAND_CENTER_PIPELINE)
  return { pipeline, stageId: COMMAND_CENTER_FIRST_STAGE_ID }
}
