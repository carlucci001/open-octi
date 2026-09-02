// Video-meeting string utilities.
//
// History note: this file used to also build Jitsi URLs pointing at a
// self-hosted instance. We've consolidated on Daily.co for all video, so the
// URL builders were removed. The slugifier stays because the Conference page
// still uses it to seed Daily room names from human input.
export function slugifyForRoom(s) {
  return String(s || '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'Meeting'
}
