/**
 * Splits a finished agent reply into the parts the report shows.
 *
 * The agent prompt (packages/prompt/agent-system-prompt.md, Section 8) makes a
 * full assessment open with the answer and then give each part under a fixed
 * bold label — "**Pathway:**", "**Next steps:**" and so on. This reads those
 * labels back. It is a reading of prose, not the structured `Assessment` the
 * assess pipeline will return, so the report marks it as advisory.
 */

export const REPLY_SECTIONS = [
  { key: 'siteFacts', label: 'Site facts' },
  { key: 'controls', label: 'Controls' },
  { key: 'pathway', label: 'Pathway' },
  { key: 'approvals', label: 'Approvals and reports' },
  { key: 'costs', label: 'Costs' },
  { key: 'questions', label: 'Questions' },
  { key: 'nextSteps', label: 'Next steps' },
  { key: 'sources', label: 'Sources' },
] as const

export type ReplySectionKey = (typeof REPLY_SECTIONS)[number]['key']

export interface ParsedReply {
  /** The opening answer — everything before the first label. */
  summary: string
  /** Body text of each labelled part the reply included. */
  sections: Partial<Record<ReplySectionKey, string>>
}

const LABEL_TO_KEY = new Map<string, ReplySectionKey>(
  REPLY_SECTIONS.map(({ key, label }) => [label.toLowerCase(), key]),
)

// "**Next steps:**", "**Next steps**:", "Next steps:" or a "## Next steps"
// heading from a reply that ignored the formatting rules.
const LABEL_LINE = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?([A-Za-z][A-Za-z ]+?)(?::\s*(?:\*\*|__)|(?:\*\*|__)\s*:|:|(?:\*\*|__)\s*$|\s*$)\s*(.*)$/

/** The prompt's fixed closing paragraph; the page already shows its own. */
const DISCLAIMER_START = /^\s*"?this is general information, not planning advice/i

export function parseReply(text: string): ParsedReply {
  const summary: string[] = []
  const sections: Partial<Record<ReplySectionKey, string[]>> = {}
  let current: string[] = summary

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (DISCLAIMER_START.test(line)) break

    const match = LABEL_LINE.exec(line)
    const key = match ? LABEL_TO_KEY.get(match[1].trim().toLowerCase()) : undefined
    if (match && key) {
      current = sections[key] ??= []
      if (match[2].trim()) current.push(match[2].trim())
      continue
    }
    current.push(line)
  }

  const tidy = (lines: string[]) => lines.join('\n').trim()
  return {
    summary: tidy(summary),
    sections: Object.fromEntries(
      Object.entries(sections)
        .map(([key, lines]) => [key, tidy(lines)])
        .filter(([, body]) => body),
    ),
  }
}
