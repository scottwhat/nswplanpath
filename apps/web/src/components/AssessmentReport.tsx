import {
  DISCLAIMER,
  VERDICT_LABELS,
  type Assessment,
  type Confidence,
  type CriterionStatus,
  type Verdict,
} from '@planpath/shared'
import type { ReactNode } from 'react'
import { parseReply, type ReplySectionKey } from '../lib/agentReply'
import { Markdown } from './Markdown'

/**
 * The building report — the assess response rendered in full (SYSTEM_DESIGN.md
 * §4.3). The pipeline that fills it does not exist yet, so every block also has
 * an awaiting state that says what will land there rather than showing a
 * plausible-looking number. Nothing here invents a figure, a clause or a fee:
 * with no assessment, the report is honestly blank (CLAUDE.md rules 3, 7).
 */

interface Props {
  /** Null until the assess query returns — the awaiting state renders instead. */
  assessment: Assessment | null
  /** True while /assess is in flight. */
  loading?: boolean
  /**
   * The assistant's latest finished reply. Shown only while there is no
   * assessment, and always marked advisory — it is the model's reading, not a
   * rules-engine verdict (CLAUDE.md rule 1).
   */
  advisory?: string | null
}

export function AssessmentReport({ assessment, loading = false, advisory = null }: Props) {
  if (!assessment && !loading && advisory?.trim()) {
    return <AdvisoryReport reply={advisory} />
  }

  return (
    <section aria-labelledby="report-heading" className="mt-8">
      <div className="mb-2.5 flex items-center gap-3">
        <span className="h-4 w-0.5 rounded-full bg-beam-600" aria-hidden="true" />
        <h2 id="report-heading" className="readout !text-navy-800">
          Report
        </h2>
        <span className="truncate text-xs text-navy-700">
          {assessment
            ? 'Pathway, approvals, studies and indicative costs'
            : loading
              ? 'Assessing…'
              : 'Awaiting an address and a proposal'}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-navy-300/70 to-transparent" />
      </div>

      <VerdictCard assessment={assessment} loading={loading} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Block
          title="What you can build"
          note="Each available pathway, its consent authority and indicative timeframe."
          empty={!assessment || assessment.pathway_options.length === 0}
        >
          <ul className="space-y-3">
            {assessment?.pathway_options.map((option) => (
              <li key={option.pathway} className="border-l-2 border-beam-600 pl-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-semibold text-navy-990">
                    {VERDICT_LABELS[option.pathway]}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-beam-800">
                    {option.indicative_timeframe}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug text-navy-700">{option.summary}</p>
                <dl className="mt-1.5 space-y-0.5 text-xs text-navy-600">
                  <Field label="Consent authority" value={option.consent_authority} />
                  <Field label="Trade-offs" value={option.tradeoffs} />
                </dl>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Criteria"
          note="Every test the rules engine applied, with actual against required and the instrument it comes from."
          empty={!assessment || assessment.criteria.length === 0}
        >
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-navy-200 text-navy-600">
                  <th scope="col" className="py-1.5 pr-2 font-medium">Criterion</th>
                  <th scope="col" className="py-1.5 pr-2 font-medium">Actual</th>
                  <th scope="col" className="py-1.5 pr-2 font-medium">Required</th>
                  <th scope="col" className="py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assessment?.criteria.map((criterion) => (
                  <tr key={criterion.id} className="border-b border-navy-100 align-top">
                    <td className="py-2 pr-2">
                      <span className="text-navy-900">{criterion.label}</span>
                      <span className="mt-0.5 block text-[11px] text-navy-600">
                        {criterion.instrument}
                        {criterion.clause ? ` · ${criterion.clause}` : ''}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-mono text-[11px] text-navy-800">
                      {criterion.actual ?? '—'}
                    </td>
                    <td className="py-2 pr-2 font-mono text-[11px] text-navy-800">
                      {criterion.required ?? '—'}
                    </td>
                    <td className="py-2">
                      <StatusPill status={criterion.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>

        <Block
          title="Council guidance"
          note="Approvals to obtain, who issues each one, and when in the process it is needed."
          empty={!assessment || assessment.approvals_required.length === 0}
        >
          <ul className="space-y-2.5">
            {assessment?.approvals_required.map((approval) => (
              <li key={approval.name} className="text-sm">
                <span className="font-medium text-navy-990">{approval.name}</span>
                <span className="mt-0.5 block text-xs text-navy-600">
                  {approval.body} · {approval.when}
                </span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Studies triggered"
          note="Specialist reports a constraint brings in — named, with who prepares them. PlanPath never produces these itself."
          empty={!assessment || assessment.assessments_required.length === 0}
        >
          <ul className="space-y-2.5">
            {assessment?.assessments_required.map((study) => (
              <li key={study.name} className="text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-medium text-navy-990">{study.name}</span>
                  <span className="font-mono text-[11px] text-beam-800">
                    {study.indicative_cost}
                  </span>
                </div>
                <span className="mt-0.5 block text-xs text-navy-600">
                  {study.trigger} · prepared by {study.prepared_by}
                </span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Indicative costs"
          note="Line items from the fee schedule and market ranges, with a total range and what it excludes. Every figure carries its basis."
          empty={!assessment || assessment.indicative_costs.line_items.length === 0}
        >
          {assessment && (
            <>
              <ul className="divide-y divide-navy-100">
                {assessment.indicative_costs.line_items.map((item) => (
                  <li key={item.item} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="text-sm text-navy-900">
                      {item.item}
                      <span className="mt-0.5 block text-[11px] text-navy-600">{item.basis}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-navy-990">{item.amount}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t-2 border-beam-600/60 pt-2">
                <span className="readout !text-navy-800">Total range</span>
                <span className="font-mono text-sm font-medium text-navy-990">
                  {assessment.indicative_costs.total_range}
                </span>
              </div>
              {assessment.indicative_costs.excludes.length > 0 && (
                <p className="mt-2 text-[11px] leading-snug text-navy-600">
                  Excludes: {assessment.indicative_costs.excludes.join(', ')}.
                </p>
              )}
              {assessment.indicative_costs.fee_schedule_version && (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-navy-600">
                  Fees current as of {assessment.indicative_costs.fee_schedule_version}
                </p>
              )}
            </>
          )}
        </Block>

        <Block
          title="Contributions"
          note="Whether a s7.11 or s7.12 contribution applies, under which plan, and an indicative amount where the plan gives a rate."
          empty={!assessment}
        >
          {assessment && (
            <dl className="space-y-1 text-xs text-navy-600">
              <Field
                label="Applies"
                value={
                  assessment.contributions.applicable === 'unknown'
                    ? 'Unknown'
                    : assessment.contributions.applicable
                      ? 'Yes'
                      : 'No'
                }
              />
              {assessment.contributions.plan_name && (
                <Field label="Plan" value={assessment.contributions.plan_name} />
              )}
              {assessment.contributions.mechanism && (
                <Field label="Mechanism" value={assessment.contributions.mechanism} />
              )}
              {assessment.contributions.indicative_amount && (
                <Field label="Indicative" value={assessment.contributions.indicative_amount} />
              )}
              <p className="pt-1 text-xs leading-snug text-navy-700">
                {assessment.contributions.note}
              </p>
            </dl>
          )}
        </Block>

        <Block
          title="Site constraints"
          note="What the spatial layers said about this lot, and what each constraint means for the proposal."
          empty={!assessment || assessment.constraints.length === 0}
        >
          <ul className="space-y-2.5">
            {assessment?.constraints.map((constraint) => (
              <li key={constraint.constraint} className="text-sm">
                <span className="font-medium text-navy-990">{constraint.constraint}</span>
                <span className="mt-0.5 block text-xs leading-snug text-navy-700">
                  {constraint.implication}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-navy-600">
                  {constraint.source_layer}
                </span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Likely conditions"
          note="Conditions this kind of consent usually carries, grouped by category."
          empty={!assessment || assessment.likely_conditions.length === 0}
        >
          <ul className="space-y-2">
            {assessment?.likely_conditions.map((condition) => (
              <li key={condition.condition} className="text-sm text-navy-800">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-beam-800">
                  {condition.category}
                </span>
                <span className="mt-0.5 block leading-snug">{condition.condition}</span>
              </li>
            ))}
          </ul>
        </Block>

        <Block
          title="Next steps"
          note="The order to do things in, from survey to lodgement."
          empty={!assessment || assessment.next_steps.length === 0}
        >
          <ol className="space-y-2">
            {assessment?.next_steps.map((step, index) => (
              <li key={step} className="flex gap-2.5 text-sm text-navy-800">
                <span className="mt-px shrink-0 font-mono text-[11px] text-beam-800">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </Block>

        <Block
          title="Citations"
          note="Every clause the answer rests on. A citation that does not trace to a retrieved document is a failure, not a footnote."
          empty={!assessment || assessment.citations.length === 0}
        >
          <ul className="space-y-1.5">
            {assessment?.citations.map((citation) => (
              <li key={citation.doc_id} className="text-xs">
                {citation.url ? (
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-beam-800 underline decoration-beam-600/40 underline-offset-2 hover:decoration-beam-700"
                  >
                    {citation.instrument}
                    {citation.clause ? ` ${citation.clause}` : ''}
                  </a>
                ) : (
                  <span className="font-medium text-navy-900">
                    {citation.instrument}
                    {citation.clause ? ` ${citation.clause}` : ''}
                  </span>
                )}
                <span className="ml-1.5 font-mono text-[10px] text-navy-500">
                  {citation.doc_id}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      </div>

      {/* Questions the engine needs answered — prominent, because an unanswered
          question is why a verdict is INDETERMINATE or low confidence. */}
      {assessment && assessment.questions.length > 0 && (
        <div className="panel mt-4 border-l-2 border-l-beam-600 p-4">
          <h3 className="readout !text-navy-800">Questions for you</h3>
          <ul className="mt-2.5 space-y-2.5">
            {assessment.questions.map((question) => (
              <li key={question.id} className="text-sm">
                <span className="font-medium text-navy-990">{question.question}</span>
                <span className="mt-0.5 block text-xs leading-snug text-navy-700">
                  {question.why_it_matters}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-navy-600">
        {assessment?.disclaimer ?? DISCLAIMER}
      </p>
    </section>
  )
}

/** Where each labelled part of a reply lands, and how wide it sits. */
const ADVISORY_BLOCKS: { key: ReplySectionKey; title: string; wide?: boolean }[] = [
  { key: 'pathway', title: 'What you can build' },
  { key: 'controls', title: 'Criteria' },
  { key: 'siteFacts', title: 'Site constraints' },
  { key: 'approvals', title: 'Approvals and studies' },
  { key: 'costs', title: 'Indicative costs' },
  { key: 'nextSteps', title: 'Next steps' },
  { key: 'sources', title: 'Citations', wide: true },
]

/**
 * The report filled from the assistant's reply until the assess pipeline
 * exists. Only parts the reply actually contained are shown, so an empty card
 * never implies the assistant checked something and found nothing.
 */
function AdvisoryReport({ reply }: { reply: string }) {
  const { summary, sections } = parseReply(reply)
  const blocks = ADVISORY_BLOCKS.filter(({ key }) => sections[key])
  // A reply without labels (a short answer) still has something to say.
  const headline = summary || (blocks.length === 0 ? reply : '')

  return (
    <section aria-labelledby="report-heading" className="mt-8">
      <div className="mb-2.5 flex items-center gap-3">
        <span className="h-4 w-0.5 rounded-full bg-beam-600" aria-hidden="true" />
        <h2 id="report-heading" className="readout !text-navy-800">
          Report
        </h2>
        <span className="truncate text-xs text-navy-700">From the assistant's latest answer</span>
        <span className="h-px flex-1 bg-gradient-to-r from-navy-300/70 to-transparent" />
      </div>

      <div className="panel border-l-2 border-l-beam-600 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="readout !text-navy-700">Assistant's reading</span>
          <span className="shrink-0 rounded-full border border-signal-500/45 bg-signal-500/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-signal-700">
            Advisory — not verified
          </span>
        </div>
        {headline && (
          <div className="mt-2 max-w-3xl text-[15px] leading-relaxed text-navy-990">
            <Markdown text={headline} />
          </div>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {blocks.map(({ key, title, wide }) => (
            <div key={key} className={wide ? 'lg:col-span-2' : undefined}>
              <Block title={title} note="" empty={false}>
                <div className="text-sm leading-relaxed text-navy-800">
                  <Markdown text={sections[key]!} />
                </div>
              </Block>
            </div>
          ))}
        </div>
      )}

      {sections.questions && (
        <div className="panel mt-4 border-l-2 border-l-beam-600 p-4">
          <h3 className="readout !text-navy-800">Questions for you</h3>
          <div className="mt-2.5 text-sm leading-relaxed text-navy-800">
            <Markdown text={sections.questions} />
          </div>
          <p className="mt-2.5 text-xs text-navy-600">Answer these in the assistant.</p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-navy-600">{DISCLAIMER}</p>
    </section>
  )
}

/** The headline result. Low confidence is loud here, not fine print. */
function VerdictCard({ assessment, loading }: { assessment: Assessment | null; loading: boolean }) {
  if (!assessment) {
    return (
      <div className="panel border-dashed p-5">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 rounded-full ${loading ? 'pulse-dot bg-beam-600' : 'bg-navy-300'}`}
            aria-hidden="true"
          />
          <span className="readout !text-navy-700">
            {loading ? 'Assessing' : 'No assessment yet'}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-700">
          {loading
            ? 'Reading the planning layers for this lot, running the rules engine and retrieving the clauses that apply.'
            : 'Set an address above and describe your project in the assistant. The verdict — exempt, complying development or a development application — appears here with the criteria behind it, the approvals and studies it triggers, and indicative costs.'}
        </p>
        {loading && (
          <span
            className="sweep relative mt-3 block h-px w-40 overflow-hidden bg-beam-600/25"
            aria-hidden="true"
          />
        )}
      </div>
    )
  }

  return (
    <div className={`panel border-l-2 p-5 ${VERDICT_EDGE[assessment.verdict]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="readout !text-navy-700">{VERDICT_LABELS[assessment.verdict]}</span>
          <p className="mt-1.5 max-w-3xl text-lg font-semibold leading-snug text-navy-990">
            {assessment.headline}
          </p>
        </div>
        <ConfidenceBadge confidence={assessment.confidence} />
      </div>
      {assessment.confidence === 'LOW' && (
        <p className="mt-3 border-l-2 border-signal-500 bg-signal-500/8 px-3 py-2 text-xs leading-snug text-signal-700">
          Low confidence — facts this verdict depends on are unknown. Answer the questions
          below before relying on it.
        </p>
      )}
    </div>
  )
}

const VERDICT_EDGE: Record<Verdict, string> = {
  EXEMPT: 'border-l-emerald-600',
  CDC: 'border-l-beam-600',
  LOCAL_DA: 'border-l-navy-700',
  REGIONAL_DA: 'border-l-navy-700',
  SSD: 'border-l-navy-900',
  PROHIBITED: 'border-l-signal-500',
  INDETERMINATE: 'border-l-navy-300',
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const tone =
    confidence === 'HIGH'
      ? 'border-emerald-600/40 bg-emerald-600/8 text-emerald-800'
      : confidence === 'MEDIUM'
        ? 'border-beam-600/40 bg-beam-500/8 text-beam-800'
        : 'border-signal-500/45 bg-signal-500/8 text-signal-700'
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${tone}`}
    >
      {confidence} confidence
    </span>
  )
}

function StatusPill({ status }: { status: CriterionStatus }) {
  const tone =
    status === 'PASS'
      ? 'border-emerald-600/40 bg-emerald-600/8 text-emerald-800'
      : status === 'FAIL'
        ? 'border-signal-500/45 bg-signal-500/8 text-signal-700'
        : 'border-navy-300 bg-navy-100 text-navy-700'
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${tone}`}
    >
      {status}
    </span>
  )
}

/** A report block: its content, or a note saying what will fill it. */
function Block({
  title,
  note,
  empty,
  children,
}: {
  title: string
  note: string
  empty: boolean
  children?: ReactNode
}) {
  return (
    <div className={`panel p-4 ${empty ? 'border-dashed' : ''}`}>
      <h3 className="readout !text-navy-800">{title}</h3>
      <div className="mt-2.5">
        {empty ? <p className="text-xs leading-relaxed text-navy-600">{note}</p> : children}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-navy-500">
        {label}
      </dt>
      <dd className="leading-snug text-navy-700">{value}</dd>
    </div>
  )
}
