import { createFileRoute, Link } from '@tanstack/react-router'
import summary from '../data/kb-summary.json'

export const Route = createFileRoute('/data')({
  component: DataAndLegislation,
})

/* Every number and date on this page comes from ../data/kb-summary.json, which
 * scripts/corpus/build-kb-summary.mjs generates by reading the metadata sidecar
 * of every document in the corpus. Nothing here is hand-typed — re-run the
 * script after an ingest and the page follows. */

const TIER_NOTES: Record<string, { blurb: string; weight: string }> = {
  legislation: {
    blurb:
      'Acts, regulations and State environmental planning policies, taken as the in-force HTML from the NSW legislation register rather than as PDF. Clause-numbered, versioned, and authoritative: where this tier conflicts with anything below it, this tier wins.',
    weight: 'Highest authority — cited first',
  },
  local: {
    blurb:
      'The instruments that apply to one council area: the local environmental plan, every part of the development control plan, contributions plans, flood policy and the published fee schedule. Retrieval is always filtered to the LGA of the site, because another council’s DCP in context is the single most likely cause of a wrong answer.',
    weight: 'Binding within the LGA',
  },
  guidance: {
    blurb:
      'Departmental circulars and practice notes, the bushfire and flood manuals, and the complying development guides. These explain how the instruments are applied in practice. They are persuasive rather than binding, and they never override a clause.',
    weight: 'Persuasive, not binding',
  },
  advisory: {
    blurb:
      'Land and Environment Court planning principles — a curated set of judgments on view sharing, overshadowing, privacy, standard variation and existing use rights. Carried at the lowest retrieval weight and only ever used to frame a merit question, never to decide a pathway.',
    weight: 'Lowest retrieval weight',
  },
}

const TYPE_LABELS: Record<string, string> = {
  ACT: 'Acts',
  REGULATION: 'Regulations',
  SEPP: 'State policies',
  LEP: 'Local environmental plans',
  DCP: 'Development control plans',
  CONTRIBUTIONS_PLAN: 'Contributions plans',
  COUNCIL_POLICY: 'Council policies',
  GUIDELINE: 'Guidelines',
  CASE_LAW: 'Case law',
}

const GROUP_LABELS: Record<string, string> = {
  'guidance/circulars': 'Planning circulars',
  'guidance/practice-notes': 'Departmental practice notes',
  'guidance/transport-oriented-development': 'Transport oriented development',
  'guidance/design': 'Design guidance',
  'guidance/bushfire': 'Planning for Bush Fire Protection',
  'guidance/complying-development': 'Complying development guides',
  'guidance/flood': 'Flood risk management',
  regional: 'Regional and district plans',
  infrastructure: 'State infrastructure strategy',
  'local/wingecarribee': 'Council-published guidance',
}

const NOT_INGESTED = [
  {
    name: 'Building Code of Australia / NCC',
    reason: 'Licensed material. Cited by clause number, never reproduced.',
  },
  {
    name: 'Section 10.7 planning certificates',
    reason: 'Site-specific and issued by the council. PlanPath cannot substitute for one.',
  },
  {
    name: 'Draft and exhibited instruments',
    reason: 'Not in force. Only the in-force version of an instrument is ingested.',
  },
  {
    name: 'Fee amounts and contribution rates',
    reason:
      'Read from data/fee-schedule.json and the council’s published schedule at assessment time, not from the text of a plan.',
  },
]

function formatDate(iso: string | null) {
  if (!iso) return 'unknown'
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function DataAndLegislation() {
  const { totals, tiers, state_instruments, amendments, councils, guidance, layers } = summary
  const amendmentTotal = amendments.reduce((n, a) => n + a.documents, 0)
  const withCurrency = tiers.reduce((n, t) => n + t.dated, 0)

  return (
    <div className="mx-auto max-w-6xl px-6 py-14 sm:py-18">
      <span className="readout inline-flex items-center gap-2">
        <span className="h-px w-8 bg-beam-600/60" aria-hidden="true" />
        Knowledge base
      </span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-950 sm:text-5xl">
        Data and legislation
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-navy-700 sm:text-base">
        Everything PlanPath reasons over, and where each piece of it came from. Documents are
        ranked in four tiers of authority; spatial layers sit outside the corpus and are
        queried live. A verdict that cannot be traced to something on this page is a bug.
      </p>

      <dl className="mt-10 grid gap-px overflow-hidden rounded-sm border border-navy-500/25 bg-navy-500/25 sm:grid-cols-4">
        <Metric label="Documents" value={totals.documents.toLocaleString('en-AU')} note={`+${totals.superseded_retained} superseded, retained`} />
        <Metric label="Council areas" value={String(totals.lgas)} note="retrieval filtered per site" />
        <Metric label="Spatial layers" value={String(layers.registered.length)} note={`verified ${formatDate(layers.verified_at)}`} />
        <Metric label="Last ingest" value={formatDate(totals.ingest_window.last)} note={`from ${formatDate(totals.ingest_window.first)}`} />
      </dl>

      {/* ── Tiers ── */}
      <section className="mt-14">
        <SectionHead
          title="The four tiers"
          note="authority_tier in every metadata sidecar; it orders the citations in a result"
        />
        <div className="mt-6 space-y-5">
          {tiers.map((tier) => {
            const note = TIER_NOTES[tier.id]
            return (
              <article key={tier.id} className="panel rule-beam p-6 sm:p-7">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="readout">Tier {tier.tier}</span>
                  <h3 className="text-xl font-semibold tracking-tight text-navy-950">
                    {tier.label}
                  </h3>
                  <span className="text-xs text-navy-600">{note.weight}</span>
                  <span className="ml-auto font-mono text-xs text-navy-700">
                    {tier.documents.toLocaleString('en-AU')} docs
                  </span>
                </div>

                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-navy-800">
                  {note.blurb}
                </p>

                <div className="mt-5 flex flex-wrap gap-1.5">
                  {tier.instrument_types.map((type) => (
                    <span
                      key={type.name}
                      className="rounded-full border border-navy-300/70 bg-white/70 px-2.5 py-1 text-[11px] text-navy-700"
                    >
                      {TYPE_LABELS[type.name] ?? type.name}
                      <span className="ml-1.5 font-mono text-navy-500">{type.count}</span>
                    </span>
                  ))}
                </div>

                <dl className="mt-5 grid gap-4 border-t border-navy-500/20 pt-4 sm:grid-cols-3">
                  <Fact label="Currency range" value={`${formatDate(tier.earliest)} — ${formatDate(tier.latest)}`} />
                  <Fact label="Dated" value={`${tier.dated} of ${tier.documents}`} />
                  <Fact
                    label="Undated"
                    value={
                      tier.undated === 0
                        ? 'None — every document carries a version'
                        : `${tier.undated} — no version published at source`
                    }
                  />
                </dl>
              </article>
            )
          })}
        </div>
      </section>

      {/* ── Tier 1 in full ── */}
      <section className="mt-14">
        <SectionHead
          title="Tier 1 — every instrument, and the date it took effect"
          note="in-force HTML from legislation.nsw.gov.au"
        />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-navy-800">
          These are the principal instruments, newest commencement first. A further{' '}
          {amendmentTotal} amendment instruments are held alongside them — they are only
          meaningful read against the principal instrument they amend, so they are counted
          here rather than listed.
        </p>

        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-navy-500/25 text-left">
                <Th>Instrument</Th>
                <Th>Type</Th>
                <Th>In force from</Th>
              </tr>
            </thead>
            <tbody>
              {state_instruments.map((doc) => (
                <tr key={doc.doc_id} className="border-b border-navy-500/12 last:border-0">
                  <td className="px-4 py-2.5 text-navy-900">
                    <a
                      href={doc.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:text-beam-800 hover:underline"
                    >
                      {doc.title}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="readout !text-navy-600">{doc.instrument_type}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-navy-700">
                    {doc.version ?? 'unknown'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Tier 2 ── */}
      <section className="mt-14">
        <SectionHead title="Tier 2 — council coverage" note="depth varies by council" />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-navy-800">
          Every council here has its local environmental plan, which is where the numeric
          controls and the zone tables live. Only the councils at the top of this list have
          the full local set — development control plan, contributions plans, flood policy
          and fees. For the rest, a question that turns on the DCP will come back as
          low-confidence rather than as an answer.
        </p>

        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-navy-500/25 text-left">
                <Th>Council</Th>
                <Th>Docs</Th>
                <Th>Holdings</Th>
                <Th>LEP in force</Th>
              </tr>
            </thead>
            <tbody>
              {councils.map((council) => (
                <tr key={council.lga} className="border-b border-navy-500/12 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-navy-900">{council.lga}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-navy-700">
                    {council.documents}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {council.types.map((type) => (
                        <span
                          key={type.name}
                          className="rounded-sm bg-navy-50 px-1.5 py-0.5 font-mono text-[10px] text-navy-700"
                          title={`${TYPE_LABELS[type.name] ?? type.name}: ${type.count}`}
                        >
                          {type.name.replace('CONTRIBUTIONS_PLAN', 'CONTRIB').replace('COUNCIL_POLICY', 'POLICY')}
                          <span className="ml-1 text-navy-500">{type.count}</span>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-navy-700">
                    {formatDate(council.latest)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-navy-600">
          Councils publish development control plans as undated PDFs far more often than not,
          which is why {tiers[1].undated} of {tiers[1].documents} Tier 2 documents have no
          version string. The date shown is the council&apos;s LEP commencement — the one
          local document that is versioned at source.
        </p>
      </section>

      {/* ── Tier 3 ── */}
      <section className="mt-14">
        <SectionHead title="Tier 3 — guidance holdings" note="by collection" />
        <div className="mt-6 grid gap-px overflow-hidden rounded-sm border border-navy-500/25 bg-navy-500/25 sm:grid-cols-2 lg:grid-cols-3">
          {guidance.map((group) => (
            <div key={group.name} className="bg-white/85 px-4 py-3.5">
              <div className="text-sm text-navy-900">{GROUP_LABELS[group.name] ?? group.name}</div>
              <div className="mt-1 font-mono text-xs text-navy-600">
                {group.count} {group.count === 1 ? 'document' : 'documents'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tier 4 spatial ── */}
      <section className="mt-14">
        <SectionHead
          title="Spatial layers — queried live, never ingested"
          note={`registry verified ${formatDate(layers.verified_at)}`}
        />
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-navy-800">
          Numeric controls and land constraints are read from the mapped layer for the site
          at the moment of assessment, not from the prose of a plan. Layer URLs and field
          names change, so they live in <Code>data/layer-registry.json</Code> and are probed
          rather than hardcoded. A layer that fails to answer becomes <Code>UNKNOWN</Code> and
          then a question — never a <Code>false</Code>.
        </p>

        <div className="panel mt-6 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-navy-500/25 text-left">
                <Th>Layer</Th>
                <Th>Service</Th>
                <Th>CRS in / out</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {layers.registered.map((layer) => (
                <tr key={layer.id} className="border-b border-navy-500/12 last:border-0">
                  <td className="px-4 py-2.5 text-navy-900">
                    {layer.name}
                    <span className="ml-2 font-mono text-[10px] text-navy-500">
                      id {layer.layer_id}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-navy-700">{layer.host}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-navy-700">
                    {layer.service_crs} → {layer.query_out_crs}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-navy-700">
                    {layer.status ? 'Registered, not yet queried' : 'In use'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-navy-600">
          Address search resolves against the NSW Geocoded Addressing Theme rather than a
          third-party geocoder, so a picked result is a real NSW address point rather than an
          approximate match. The planning layers — zoning, minimum lot size, height, floor
          space ratio, heritage, bushfire and flood — are registered as the site service is
          built out, and this table is generated from the registry, so it will show them as
          they land.
        </p>
      </section>

      {/* ── Boundaries ── */}
      <section className="mt-14 grid gap-6 lg:grid-cols-2">
        <div className="panel p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight text-navy-950">
            Deliberately not in the corpus
          </h2>
          <dl className="mt-4 space-y-3.5">
            {NOT_INGESTED.map((item) => (
              <div key={item.name}>
                <dt className="text-sm font-medium text-navy-950">{item.name}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-navy-700">{item.reason}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="panel p-6 sm:p-7">
          <h2 className="text-lg font-semibold tracking-tight text-navy-950">
            How currency is kept
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-navy-800">
            <li>
              <strong className="font-medium text-navy-950">Legislation, monthly.</strong> The
              register publishes commencement dates; changed instruments are diffed and
              re-ingested.
            </li>
            <li>
              <strong className="font-medium text-navy-950">Development control plans,
              quarterly.</strong> Councils rarely version them, so change is detected by
              content hash rather than by a date.
            </li>
            <li>
              <strong className="font-medium text-navy-950">Every re-ingest runs the
              evals</strong> before the new knowledge base goes live. A citation to a document
              that was not retrieved fails the release outright.
            </li>
          </ul>
          <p className="mt-5 border-t border-navy-500/20 pt-4 text-xs leading-relaxed text-navy-600">
            {withCurrency} of {totals.documents} documents carry a version string from their
            source. The rest are dated only by when they were fetched, which is a weaker
            guarantee and is treated as one.
          </p>
        </div>
      </section>

      <p className="mt-10 text-xs leading-relaxed text-navy-600">
        Counts and dates on this page are generated from the metadata sidecar of every
        document in the corpus by <Code>scripts/corpus/build-kb-summary.mjs</Code>, last run{' '}
        {formatDate(summary.generated_at)}. Nothing here is hand-maintained.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="rounded-sm border border-beam-700/40 bg-beam-500/10 px-4 py-2 text-sm font-medium text-beam-800 transition hover:bg-beam-500/20"
        >
          Assess an address
        </Link>
        <Link to="/pathways" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          Planning pathways explained
        </Link>
      </div>
    </div>
  )
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-navy-950">{title}</h2>
      <span className="text-xs text-navy-600">{note}</span>
      <span className="hidden h-px flex-1 bg-gradient-to-r from-navy-300/70 to-transparent sm:block" />
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-white/85 px-4 py-4">
      <div className="readout !text-navy-600">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-navy-950">{value}</div>
      <div className="mt-1 text-[11px] leading-snug text-navy-600">{note}</div>
    </div>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.18em] text-navy-600">
      {children}
    </th>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm bg-navy-50 px-1.5 py-0.5 font-mono text-[0.85em] text-navy-800">
      {children}
    </code>
  )
}
