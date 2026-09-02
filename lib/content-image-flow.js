export function buildContentImageContext(job = {}) {
  const articleContext = String(job.content || '').slice(0, 8_000)
  return `Create an appropriate, polished image for the content below. Infer the main subject, setting, mood, and visual emphasis from the actual content instead of making a generic marketing image. The image should support the piece without adding claims or details that are not present.

Title: ${job.title || job.workflowLabel || 'Untitled content'}
Content type: ${job.workflowLabel || job.workflow || 'content'}
Audience: ${job.audience || 'the intended reader'}
Goal: ${job.goal || 'support the content'}
Tone: ${job.tone || 'match the content'}

Content:
${articleContext}

Create one strong visual concept. Avoid fake logos, watermarks, and unreadable text. Unless the content specifically requires typography, communicate the idea visually rather than placing paragraphs in the image.`
}

export function buildImageRequestPrompt(contextPrompt = '', additionalGuidance = '') {
  return [
    String(contextPrompt || '').trim(),
    String(additionalGuidance || '').trim() ? `Additional creative guidance:\n${String(additionalGuidance).trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

export function requireGeneratedImageItem(item) {
  if (!item?.id || !item.url) throw new Error('The image provider returned no usable image')
  return item
}
