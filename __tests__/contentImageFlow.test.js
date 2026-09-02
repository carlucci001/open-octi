import { describe, expect, it } from 'vitest'
import { buildContentImageContext, buildImageRequestPrompt, requireGeneratedImageItem } from '../lib/content-image-flow'

describe('content image flow', () => {
  const job = {
    title: 'Solar upgrades cut the community center bill',
    workflowLabel: 'Blog',
    audience: 'local business owners',
    goal: 'explain the renovation',
    tone: 'warm and factual',
    content: 'A neighborhood community center installed rooftop solar panels and battery storage after its summer utility bills doubled.',
  }

  it('builds image context from the finished content without requiring extra guidance', () => {
    const context = buildContentImageContext(job)
    const request = buildImageRequestPrompt(context)

    expect(request).toContain(job.title)
    expect(request).toContain(job.content)
    expect(request).toContain(job.audience)
    expect(request).not.toContain('Additional creative guidance:')
  })

  it('adds optional user guidance after the content context', () => {
    const context = buildContentImageContext(job)
    const request = buildImageRequestPrompt(context, 'Use documentary photography at golden hour.')

    expect(request).toContain(job.content)
    expect(request).toContain('Additional creative guidance:\nUse documentary photography at golden hour.')
  })

  it('rejects a success response that has no usable image', () => {
    expect(() => requireGeneratedImageItem({ id: 'media-1' })).toThrow('no usable image')
    expect(requireGeneratedImageItem({ id: 'media-1', url: '/api/media/file/image.png' })).toEqual({
      id: 'media-1',
      url: '/api/media/file/image.png',
    })
  })
})
