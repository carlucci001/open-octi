import { Fragment } from 'react'

// Chat currently renders plain text. Enable only the Research links emitted by
// the research workflow, without interpreting arbitrary HTML or Markdown URLs.
export default function ResearchChatText({ children }) {
  const text = String(children || '')
  const parts = text.split(/(\[[^\]\n]+\]\(\/\?tab=research(?:&(?:job|dossier)=[A-Za-z0-9%_.~-]+)?\))/g)
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]\n]+)\]\((\/\?tab=research(?:&(?:job|dossier)=[A-Za-z0-9%_.~-]+)?)\)$/)
    return link
      ? <a key={index} href={link[2]} style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{link[1]}</a>
      : <Fragment key={index}>{part}</Fragment>
  })
}
