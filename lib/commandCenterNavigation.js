import { navigationDestinationsFor } from './navigation-manifest'

export function commandCenterSectionsFor(env = process.env) {
  return navigationDestinationsFor(env)
    .filter(destination => destination.commandCenter && destination.routable)
    .map(({ id, label, aliases }) => ({ id, label, aliases }))
}

export const COMMAND_CENTER_SECTIONS = Object.freeze(commandCenterSectionsFor())

export const COMMAND_CENTER_MENU_GUIDE = COMMAND_CENTER_SECTIONS
  .map(section => `- ${section.label}: use tabId "${section.id}". Aliases: ${section.aliases.join(', ')}.`)
  .join('\n')

function normalizeNavigationText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(please\s+)?(transfer|send|connect|route)\s+(me\s+)?(over\s+)?(to\s+)?/, '')
    .replace(/^(please\s+)?(take|get)\s+me\s+to\s+/, '')
    .replace(/^i\s+need\s+(to\s+)?(go\s+to|be\s+transferred\s+to)\s+/, '')
    .replace(/^the\s+/, '')
}

export function resolveCommandCenterTab(value) {
  const target = normalizeNavigationText(value)
  if (!target) return ''
  for (const section of COMMAND_CENTER_SECTIONS) {
    if (section.id === target) return section.id
    if (section.aliases.some(alias => target === normalizeNavigationText(alias))) return section.id
  }
  return target
}

export function isCommandCenterNavigationPhrase(value) {
  const target = normalizeNavigationText(value)
  if (!target) return false
  return COMMAND_CENTER_SECTIONS.some(section =>
    section.id === target || section.aliases.some(alias => target.includes(normalizeNavigationText(alias)))
  )
}

export function labelForCommandCenterTab(value) {
  const id = resolveCommandCenterTab(value)
  if (!id) return ''
  const section = COMMAND_CENTER_SECTIONS.find(candidate => candidate.id === id)
  return section?.label || ''
}
