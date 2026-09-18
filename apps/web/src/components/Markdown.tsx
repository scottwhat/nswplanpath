import type { ReactNode } from 'react'

/**
 * Renders the small Markdown subset the agent prompt allows (Section 8):
 * paragraphs, "-" and "1." lists, **bold**, `code`, [links](https://…) and one
 * simple table.
 * Anything outside that subset — headings, rules, italics — is degraded to
 * plain text rather than shown as raw punctuation, so a reply that ignores the
 * prompt still reads cleanly.
 *
 * Output is built as React nodes, never HTML strings, so model text (which can
 * echo retrieved documents) cannot inject markup.
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-2.5">{parseBlocks(text)}</div>
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'label'; text: string }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let current: Block | null = null

  const flush = () => {
    if (current) blocks.push(current)
    current = null
  }

  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd()

    if (line.trim() === '' || RULE.test(line)) {
      flush()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'label', text: heading[1] })
      continue
    }

    if (TABLE_ROW.test(line)) {
      if (TABLE_DIVIDER.test(line)) continue
      if (current?.kind !== 'table') {
        flush()
        current = { kind: 'table', rows: [] }
      }
      current.rows.push(splitRow(line))
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol'
      if (current?.kind !== kind) {
        flush()
        current = { kind, items: [] }
      }
      current.items.push((bullet ?? numbered)![1])
      continue
    }

    // A continuation line under a list item belongs to that item.
    if ((current?.kind === 'ul' || current?.kind === 'ol') && /^\s{2,}/.test(raw)) {
      current.items[current.items.length - 1] += ` ${line.trim()}`
      continue
    }

    if (current?.kind !== 'p') {
      flush()
      current = { kind: 'p', lines: [] }
    }
    current.lines.push(line.trim())
  }
  flush()
  return blocks
}

function parseBlocks(text: string): ReactNode[] {
  return toBlocks(text).map((block, index) => {
    switch (block.kind) {
      case 'label':
        return (
          <p key={index} className="pt-1 font-semibold text-navy-990">
            {inline(block.text)}
          </p>
        )
      case 'p':
        return (
          <p key={index}>
            {block.lines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                {inline(line)}
              </span>
            ))}
          </p>
        )
      case 'ul':
        return (
          <ul key={index} className="list-disc space-y-1 pl-5 marker:text-beam-600">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ul>
        )
      case 'ol':
        return (
          <ol key={index} className="list-decimal space-y-1 pl-5 marker:text-navy-600">
            {block.items.map((item, i) => (
              <li key={i}>{inline(item)}</li>
            ))}
          </ol>
        )
      case 'table': {
        const [head, ...body] = block.rows
        return (
          <div key={index} className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {head.map((cell, i) => (
                    <th
                      key={i}
                      className="border-b border-navy-300 px-2 py-1.5 text-left font-semibold text-navy-990"
                    >
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r} className="border-b border-navy-100 last:border-0">
                    {row.map((cell, i) => (
                      <td key={i} className="px-2 py-1.5 align-top">
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    }
  })
}

// [text](https://…), **bold**, __bold__ and `code` are rendered; single *italics*
// and _italics_ are unwrapped to plain text, which is what the prompt asks for
// anyway. Links come first so underscores inside a URL aren't read as italics.
const LINK = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/
const INLINE = /(\[[^\]]+\]\(https:\/\/[^\s)]+\)|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*|(?<![\w])_[^_\s][^_]*_(?![\w]))/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null
    // https only: model text can echo retrieved documents, so no javascript: or
    // other schemes ever reach an href.
    const link = LINK.exec(part)
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-beam-800 underline underline-offset-2 hover:text-beam-600"
        >
          {link[1]}
        </a>
      )
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return (
        <strong key={i} className="font-semibold text-navy-990">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={i} className="rounded-sm bg-navy-50 px-1 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (/^[*_].+[*_]$/.test(part)) return part.slice(1, -1)
    // Stray markers left by an unclosed pair during streaming.
    return part.replace(/\*\*/g, '')
  })
}
