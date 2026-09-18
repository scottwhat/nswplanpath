import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/pathways')({
  component: PathwaysExplained,
})

/* ── Content ──────────────────────────────────────────────────────────────
 * Instrument names only. No clause numbers, thresholds, fees or timeframes
 * beyond an order of magnitude — those come from a retrieved chunk, a spatial
 * layer or data/fee-schedule.json at assessment time, never from prose here.
 */

interface Pathway {
  id: string
  name: string
  headline: string
  body: string[]
  decidedBy: string
  scale: string
  instrument: string
}

interface Group {
  id: string
  label: string
  blurb: string
  pathways: Pathway[]
}

const EPA_ACT = 'Environmental Planning and Assessment Act 1979'
const CODES_SEPP =
  'State Environmental Planning Policy (Exempt and Complying Development Codes) 2008'

const GROUPS: Group[] = [
  {
    id: 'everyday',
    label: 'The three everyday pathways',
    blurb:
      'Almost all residential work lands in one of these. They differ in who decides, how much discretion they have, and how long it takes.',
    pathways: [
      {
        id: 'exempt',
        name: 'Exempt development',
        headline: 'No approval needed — if every standard is met.',
        body: [
          'Minor, low-impact work that can be carried out without any planning approval at all, provided it satisfies every development standard that applies to it. There is no application, no certificate, and no assessment by anyone.',
          'The standards are cumulative and unforgiving. Miss one — a setback, a height, a floor area, a land constraint such as heritage or a flood control lot — and the work is not exempt. It falls back to complying development or a development application.',
          'Because nobody checks, the risk sits entirely with the owner. Work carried out as exempt development that turns out not to have qualified is unauthorised, and the usual way that surfaces is at sale.',
        ],
        decidedBy: 'Nobody — self-assessed',
        scale: 'No application',
        instrument: CODES_SEPP,
      },
      {
        id: 'cdc',
        name: 'Complying development (CDC)',
        headline: 'A certificate, not a merit assessment.',
        body: [
          'A combined planning and construction approval issued by a council or a registered certifier. Complying development is checked against a fixed list of development standards: meet all of them and the certifier must issue the certificate; fail one and the certifier cannot issue it. There is no discretion to weigh the merits in either direction.',
          'That trade — no negotiation, but a fast and predictable outcome — is the whole point of the pathway. Neighbours are notified, but the certificate does not turn on their objections.',
          'Land constraints are what usually rule it out: heritage items and conservation areas, some bushfire and flood land, and land where an environmental planning instrument switches the code off. A lot that fails the code by a small margin is not a candidate for argument — it is a development application.',
        ],
        decidedBy: 'Council or a registered certifier',
        scale: 'Weeks',
        instrument: CODES_SEPP,
      },
      {
        id: 'local',
        name: 'Local development (a DA)',
        headline: 'A merit assessment by the council.',
        body: [
          'The general pathway: everything permissible with consent that does not fit exempt or complying development. The council weighs the proposal on its merits against the local environmental plan, the applicable State policies, the development control plan, submissions received, and the matters the Act requires it to consider.',
          'Merit assessment cuts both ways. A proposal that breaches a numeric development standard can still be approved if the variation is properly justified, and one that meets every number can still be refused on impact. Conditions of consent are negotiated rather than fixed.',
          'It is the slowest and most expensive of the three, and the one most likely to trigger specialist studies — but it is also the only one with any flexibility at all.',
        ],
        decidedBy: 'Council, under delegation or at a meeting',
        scale: 'Months',
        instrument: `${EPA_ACT} — development assessment`,
      },
    ],
  },
  {
    id: 'no-consent',
    label: 'When consent is not the question',
    blurb:
      'Two ends of the range. Some development needs no consent because the zone permits it outright; some cannot be applied for at all until the planning instrument itself changes.',
    pathways: [
      {
        id: 'without-consent',
        name: 'Permitted without consent',
        headline: 'The zone allows it outright — but that is not the end of it.',
        body: [
          'Each land use zone lists uses permitted without consent, uses permitted with consent, and prohibited uses. A use in the first list needs no development application.',
          'Where a public authority carries out or approves such an activity, it still has to consider its environmental impact under the Act before proceeding — usually through a review of environmental factors, and through a fuller environmental impact statement where the activity is likely to significantly affect the environment.',
          'For a private landowner the practical point is narrower: no consent does not mean no other approvals. Construction, vegetation removal, driveway access and utility connections can each still require their own.',
        ],
        decidedBy: 'The proponent or public authority',
        scale: 'No development application',
        instrument: `${EPA_ACT} — environmental assessment of activities`,
      },
      {
        id: 'prohibited',
        name: 'Prohibited development',
        headline: 'Not refusable — unapplicable.',
        body: [
          'If the use is prohibited in the zone, there is no application to make. A council cannot approve it, and there is nothing to appeal. This is the outcome people most often mistake for a hard assessment when it is really a threshold one.',
          'The route through is to change the instrument rather than to argue the proposal: a planning proposal to amend the local environmental plan, submitted to the council, gateway-assessed by the Department, exhibited, and made only if it succeeds. It is a policy process measured in years, not an application.',
          'Occasionally a use that looks prohibited under the local plan is enabled by a State policy that overrides it. That is worth checking before concluding anything.',
        ],
        decidedBy: 'The Department and the council, via a planning proposal',
        scale: 'Years',
        instrument: 'The local environmental plan for the site',
      },
    ],
  },
  {
    id: 'da-variants',
    label: 'When a DA is not an ordinary DA',
    blurb:
      'These are not alternatives to a development application — they are a development application with extra machinery bolted on, or with the decision taken away from the council.',
    pathways: [
      {
        id: 'integrated',
        name: 'Integrated development',
        headline: 'The council decides, but another agency sets the terms.',
        body: [
          'Development that also needs an approval from another agency under a different Act — water, fisheries, heritage, rural fire, mining, contaminated land and similar. Rather than run two processes in sequence, the council refers the application and the agency returns general terms of approval that the consent must be consistent with.',
          'The practical effect is a longer assessment and a set of conditions the council did not write and cannot soften. If an agency declines to provide general terms, the council cannot grant consent.',
        ],
        decidedBy: 'Council, on terms set by the approval body',
        scale: 'Months, plus referral time',
        instrument: `${EPA_ACT} — integrated development`,
      },
      {
        id: 'designated',
        name: 'Designated development',
        headline: 'High-impact development, with a heavier process.',
        body: [
          'A listed class of development with the potential for significant environmental impact — certain intensive industries, extractive operations, waste facilities and the like — identified by the planning regulation and, in some cases, by an environmental planning instrument.',
          'It carries an environmental impact statement prepared to the Secretary’s requirements, an extended public exhibition, and objector appeal rights that an ordinary application does not attract. Very little residential development is designated development.',
        ],
        decidedBy: 'Council, or a panel',
        scale: 'Many months',
        instrument: `${EPA_ACT} and the planning regulation`,
      },
      {
        id: 'regional',
        name: 'Regionally significant development',
        headline: 'Same assessment, different decision-maker.',
        body: [
          'Above a capital investment threshold, or in classes where the council has an interest in the land or is the applicant, the consent authority becomes a Sydney district or regional planning panel rather than the council.',
          'The council still assesses the application and writes the report; the panel determines it in public. The change is in who decides and how visibly, not in the tests applied.',
        ],
        decidedBy: 'A Sydney district or regional planning panel',
        scale: 'Months',
        instrument: 'State Environmental Planning Policy (Planning Systems) 2021',
      },
      {
        id: 'ssd',
        name: 'State significant development and infrastructure',
        headline: 'Assessed by the Department, determined by the Minister or the Commission.',
        body: [
          'The largest and most strategically significant projects — major infrastructure, large industry, some health, education and tourism development — are declared State significant by a State policy or by the Minister. Assessment moves to the Department, and determination to the Minister or the Independent Planning Commission.',
          'The process runs on Secretary’s environmental assessment requirements, an environmental impact statement, agency referrals and public exhibition. Several ordinary approvals are switched off and replaced by conditions of the one consent.',
          'State significant infrastructure follows a parallel track for infrastructure carried out by or for a public authority.',
        ],
        decidedBy: 'The Minister or the Independent Planning Commission',
        scale: 'A year or more',
        instrument: 'State Environmental Planning Policy (Planning Systems) 2021',
      },
    ],
  },
  {
    id: 'after',
    label: 'After a determination',
    blurb:
      'A pathway does not end at the decision. Three routes matter after one, and none of them is a fresh application.',
    pathways: [
      {
        id: 'modification',
        name: 'Modification of a consent',
        headline: 'Change the approval, not the application.',
        body: [
          'An approved development can be modified — to correct a minor error, to make a change of minimal environmental impact, or to make a more substantial change, provided the development remains substantially the same as what was approved.',
          'The larger the change, the closer the assessment resembles the original application, including re-notification. A change that is no longer substantially the same development cannot be modified; it needs a new application.',
        ],
        decidedBy: 'The original consent authority',
        scale: 'Weeks to months',
        instrument: `${EPA_ACT} — modification of consents`,
      },
      {
        id: 'review-appeal',
        name: 'Review and appeal',
        headline: 'A refusal is not necessarily final.',
        body: [
          'A refused or unhappily conditioned application can be reviewed by the consent authority itself — a fresh look, usually by different officers, with amendments allowed — or appealed to the Land and Environment Court.',
          'Both are time-limited. The Court hears the matter afresh on the merits rather than reviewing the council for error, which is why an appeal is a genuine second assessment and why most appeals settle through amended plans rather than judgment.',
        ],
        decidedBy: 'The consent authority, or the Land and Environment Court',
        scale: 'Months to a year',
        instrument: `${EPA_ACT} — reviews and appeals`,
      },
      {
        id: 'certificates',
        name: 'Construction and occupation certificates',
        headline: 'Approvals that follow consent — not pathways in themselves.',
        body: [
          'Consent grants permission to develop; it does not permit building work to start. A construction certificate confirms the detailed plans meet the Building Code and the conditions of consent, a principal certifier is appointed, and an occupation certificate is required before the building is used.',
          'A complying development certificate covers this ground itself, which is a large part of why the pathway is faster. Exempt development needs none of it.',
        ],
        decidedBy: 'Council or a registered certifier',
        scale: 'After consent, before and after building work',
        instrument: 'Building and Development Certifiers Act 2018 and the planning regulation',
      },
    ],
  },
]

const DECIDING_FACTORS = [
  {
    title: 'The land use zone',
    detail:
      'Whether the proposed use is permitted without consent, permitted with consent, or prohibited. This is the first gate and the only one that can end the enquiry outright.',
  },
  {
    title: 'Numeric development standards',
    detail:
      'Minimum lot size, height of buildings and floor space ratio, read from the mapped spatial layers rather than from the text of the plan.',
  },
  {
    title: 'Land constraints',
    detail:
      'Heritage, bushfire prone land, flood, acid sulfate soils, foreshore, coastal and similar overlays — any one of which can close off the faster pathways even when every number is met.',
  },
  {
    title: 'The proposal itself',
    detail:
      'Its type, scale, siting on the lot, and capital investment value — which is what moves an application between a council, a panel and the Department.',
  },
]

/* ── The flow chart ───────────────────────────────────────────────────────
 * A single spine of threshold questions, each with one side exit. Read top to
 * bottom: the first question that resolves ends the enquiry. Anything that
 * survives every gate is a development application.
 */

interface FlowStep {
  question: string[]
  /** Which answer leaves the spine. The other answer continues down. */
  exitOn: 'Yes' | 'No'
  exit: { lines: string[]; href: string; tone: 'accent' | 'muted' }
}

const FLOW: FlowStep[] = [
  {
    question: ['Declared State', 'significant?'],
    exitOn: 'Yes',
    exit: { lines: ['SSD / SSI —', 'Minister or', 'the Commission'], href: '#ssd', tone: 'accent' },
  },
  {
    question: ['Permitted in', 'the zone?'],
    exitOn: 'No',
    exit: { lines: ['Prohibited —', 'amend the LEP'], href: '#prohibited', tone: 'muted' },
  },
  {
    question: ['Permitted without', 'consent?'],
    exitOn: 'Yes',
    exit: { lines: ['No consent —', 'assess impact', 'and proceed'], href: '#without-consent', tone: 'accent' },
  },
  {
    question: ['Meets every', 'exempt standard?'],
    exitOn: 'Yes',
    exit: { lines: ['Exempt —', 'no approval'], href: '#exempt', tone: 'accent' },
  },
  {
    question: ['Meets the complying', 'development code?'],
    exitOn: 'Yes',
    exit: { lines: ['CDC — council', 'or certifier'], href: '#cdc', tone: 'accent' },
  },
]

const TOP = 14
const STEP = 102
const BOX = { x: 10, w: 178, h: 56 }
const SPINE = BOX.x + BOX.w / 2
const EXIT_X = 230
const EXIT_W = 104
const CHART_H = TOP + FLOW.length * STEP + 60

/* Layered on top of a development application, not alternatives to it. */
const DA_LAYERS = [
  { label: 'Integrated', href: '#integrated' },
  { label: 'Designated', href: '#designated' },
  { label: 'Regionally significant', href: '#regional' },
]

function PathwayFlow() {
  const terminalY = TOP + FLOW.length * STEP

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="readout">Threshold questions</h2>
        <span className="text-[10px] text-navy-600">in order</span>
      </div>

      <svg
        viewBox={`0 0 340 ${CHART_H}`}
        className="mt-3 w-full"
        role="img"
        aria-label="Decision flow: State significant development, then whether the use is permitted in the zone, permitted without consent, exempt, or complying development. Anything that passes every gate is a development application."
      >
        <defs>
          <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0 0 L8 4 L0 8 z" fill="var(--color-navy-500)" />
          </marker>
        </defs>

        {FLOW.map((step, i) => {
          const y = TOP + i * STEP
          const mid = y + BOX.h / 2
          const exitH = 14 + 13 * step.exit.lines.length
          const exitY = mid - exitH / 2
          const accent = step.exit.tone === 'accent'

          return (
            <g key={step.exit.href}>
              {/* Question */}
              <rect
                x={BOX.x}
                y={y}
                width={BOX.w}
                height={BOX.h}
                rx="4"
                fill="var(--color-sky-panel)"
                stroke="var(--color-navy-500)"
                strokeOpacity="0.4"
              />
              <text textAnchor="middle" fontSize="11.5" fill="var(--color-navy-950)">
                {step.question.map((line, l) => (
                  <tspan key={line} x={SPINE} y={y + 24 + l * 15}>
                    {line}
                  </tspan>
                ))}
              </text>

              {/* Exit branch */}
              <line
                x1={BOX.x + BOX.w}
                y1={mid}
                x2={EXIT_X - 4}
                y2={mid}
                stroke="var(--color-navy-500)"
                strokeOpacity="0.55"
                markerEnd="url(#flow-arrow)"
              />
              <text
                x={BOX.x + BOX.w + 4}
                y={mid - 5}
                fontSize="8"
                fontFamily="var(--font-mono)"
                fill="var(--color-beam-700)"
              >
                {step.exitOn}
              </text>

              <a href={step.exit.href}>
                <rect
                  x={EXIT_X}
                  y={exitY}
                  width={EXIT_W}
                  height={exitH}
                  rx="4"
                  fill={accent ? 'color-mix(in oklab, var(--color-beam-500) 12%, white)' : 'var(--color-navy-50)'}
                  stroke={accent ? 'var(--color-beam-600)' : 'var(--color-navy-500)'}
                  strokeOpacity={accent ? '0.45' : '0.4'}
                />
                <text
                  textAnchor="middle"
                  fontSize="10"
                  fill={accent ? 'var(--color-beam-800)' : 'var(--color-navy-700)'}
                >
                  {step.exit.lines.map((line, l) => (
                    <tspan key={line} x={EXIT_X + EXIT_W / 2} y={exitY + 15 + l * 13}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </a>

              {/* Continue down the spine */}
              <line
                x1={SPINE}
                y1={y + BOX.h}
                x2={SPINE}
                y2={y + STEP - 4}
                stroke="var(--color-navy-500)"
                strokeOpacity="0.55"
                markerEnd="url(#flow-arrow)"
              />
              <text
                x={SPINE + 6}
                y={y + BOX.h + 30}
                fontSize="8"
                fontFamily="var(--font-mono)"
                fill="var(--color-navy-600)"
              >
                {step.exitOn === 'Yes' ? 'No' : 'Yes'}
              </text>
            </g>
          )
        })}

        {/* Terminal */}
        <a href="#local">
          <rect
            x={BOX.x}
            y={terminalY}
            width={BOX.w}
            height="52"
            rx="4"
            fill="color-mix(in oklab, var(--color-beam-500) 14%, white)"
            stroke="var(--color-beam-600)"
            strokeOpacity="0.7"
          />
          <text textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--color-beam-800)">
            <tspan x={SPINE} y={terminalY + 22}>
              Development
            </tspan>
            <tspan x={SPINE} y={terminalY + 37}>
              application
            </tspan>
          </text>
        </a>
      </svg>

      <div className="mt-4 border-t border-navy-500/20 pt-4">
        <h3 className="readout !text-navy-600">A DA may also be</h3>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {DA_LAYERS.map((layer) => (
            <a
              key={layer.href}
              href={layer.href}
              className="rounded-full border border-navy-300/70 bg-white/70 px-2.5 py-1 text-[11px] text-navy-700 transition hover:border-beam-600/40 hover:text-beam-800"
            >
              {layer.label}
            </a>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-navy-600">
          These layer onto a development application rather than replacing it, and more than
          one can apply at once.
        </p>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────── */

function PathwaysExplained() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14 sm:py-18">
      <span className="readout inline-flex items-center gap-2">
        <span className="h-px w-8 bg-beam-600/60" aria-hidden="true" />
        Reference
      </span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-950 sm:text-5xl">
        Planning pathways, explained
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-navy-700 sm:text-base">
        Development in NSW reaches approval by one of a handful of routes. Which one applies
        is not a choice — it is decided by what the proposal is, where it sits, and what the
        land is subject to. Working that out is the question PlanPath answers.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Chart first in the DOM so it reads as the overview on a phone. */}
        <aside className="lg:order-2">
          {/* The chart can outgrow a short viewport, so let it scroll inside the
              sticky frame rather than stranding its footnotes below the fold. */}
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <PathwayFlow />
          </div>
        </aside>

        <div className="space-y-12 lg:order-1">
          {GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`group-${group.id}`}>
              <div className="flex items-center gap-3">
                <h2
                  id={`group-${group.id}`}
                  className="text-sm font-semibold uppercase tracking-[0.14em] text-navy-950"
                >
                  {group.label}
                </h2>
                <span className="h-px flex-1 bg-gradient-to-r from-navy-300/70 to-transparent" />
              </div>
              <p className="mt-2.5 max-w-2xl text-xs leading-relaxed text-navy-600">
                {group.blurb}
              </p>

              <div className="mt-5 space-y-5">
                {group.pathways.map((pathway) => (
                  <PathwayCard key={pathway.id} pathway={pathway} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <section className="panel mt-12 p-6 sm:p-8">
        <h2 className="readout !text-navy-600">What decides the pathway</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          {DECIDING_FACTORS.map((factor) => (
            <div key={factor.title}>
              <dt className="text-sm font-medium text-navy-950">{factor.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-navy-800">{factor.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 border-t border-navy-500/20 pt-5 text-xs leading-relaxed text-navy-600">
          Where a fact is unknown, it stays unknown. PlanPath turns it into a question rather
          than assuming an answer, because an assumed &quot;no&quot; is how a pathway
          assessment goes quietly wrong.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="rounded-sm border border-beam-700/40 bg-beam-500/10 px-4 py-2 text-sm font-medium text-beam-800 transition hover:bg-beam-500/20"
        >
          Assess an address
        </Link>
        <Link to="/about" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          About PlanPath
        </Link>
      </div>
    </div>
  )
}

function PathwayCard({ pathway }: { pathway: Pathway }) {
  return (
    <article id={pathway.id} className="panel rule-beam scroll-mt-24 p-6 sm:p-7">
      <h3 className="text-xl font-semibold tracking-tight text-navy-950">{pathway.name}</h3>
      <p className="mt-1.5 text-sm font-medium text-beam-800">{pathway.headline}</p>

      <div className="mt-4 space-y-3 text-sm leading-relaxed text-navy-800">
        {pathway.body.map((paragraph) => (
          <p key={paragraph.slice(0, 32)}>{paragraph}</p>
        ))}
      </div>

      <dl className="mt-5 grid gap-4 border-t border-navy-500/20 pt-4 sm:grid-cols-3">
        <Fact label="Decided by" value={pathway.decidedBy} />
        <Fact label="Order of time" value={pathway.scale} />
        <Fact label="Instrument" value={pathway.instrument} />
      </dl>
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="readout !text-navy-600">{label}</dt>
      <dd className="mt-1.5 text-xs leading-relaxed text-navy-800">{value}</dd>
    </div>
  )
}
