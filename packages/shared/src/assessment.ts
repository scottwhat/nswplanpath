import { z } from 'zod'

/**
 * The assess response contract — SYSTEM_DESIGN.md §4.3, and the shape the
 * report UI renders. Shared by the web app and (once it exists) the assess
 * Lambda, so the model's JSON is validated against the same schema the UI
 * reads (CLAUDE.md §Conventions).
 *
 * Every monetary and clause field is a string, not a number: figures come from
 * `data/fee-schedule.json` or a retrieved chunk already formatted with their
 * basis, and `unknown` has to be expressible everywhere (CLAUDE.md rules 3-4).
 */

export const verdictSchema = z.enum([
  'EXEMPT',
  'CDC',
  'LOCAL_DA',
  'REGIONAL_DA',
  'SSD',
  'PROHIBITED',
  'INDETERMINATE',
])
export type Verdict = z.infer<typeof verdictSchema>

export const confidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])
export type Confidence = z.infer<typeof confidenceSchema>

export const criterionStatusSchema = z.enum(['PASS', 'FAIL', 'UNKNOWN'])
export type CriterionStatus = z.infer<typeof criterionStatusSchema>

export const criterionResultSchema = z.object({
  /** e.g. 'sd.min_lot_area' */
  id: z.string(),
  label: z.string(),
  status: criterionStatusSchema,
  actual: z.union([z.string(), z.number()]).optional(),
  required: z.union([z.string(), z.number()]).optional(),
  instrument: z.string(),
  /** Verified at ingest, never written from memory (CLAUDE.md rule 3). */
  clause: z.string().optional(),
})
export type CriterionResult = z.infer<typeof criterionResultSchema>

export const pathwayOptionSchema = z.object({
  pathway: verdictSchema,
  summary: z.string(),
  /** council / private certifier / RPP / Minister */
  consent_authority: z.string(),
  indicative_timeframe: z.string(),
  tradeoffs: z.string(),
})
export type PathwayOption = z.infer<typeof pathwayOptionSchema>

export const clarifyingQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  why_it_matters: z.string(),
})
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>

export const approvalSchema = z.object({
  name: z.string(),
  body: z.string(),
  when: z.string(),
})
export type Approval = z.infer<typeof approvalSchema>

/** A triggered specialist study — named and costed, never produced by us (CLAUDE.md rule 8). */
export const requiredAssessmentSchema = z.object({
  /** e.g. 'Bushfire Assessment (BAL)' */
  name: z.string(),
  /** e.g. 'Lot is bushfire prone land' */
  trigger: z.string(),
  prepared_by: z.string(),
  indicative_cost: z.string(),
})
export type RequiredAssessment = z.infer<typeof requiredAssessmentSchema>

export const costLineItemSchema = z.object({
  item: z.string(),
  amount: z.string(),
  /** Where the figure comes from — the fee scale, a levy rate, a market range. */
  basis: z.string(),
})
export type CostLineItem = z.infer<typeof costLineItemSchema>

export const indicativeCostsSchema = z.object({
  line_items: z.array(costLineItemSchema),
  total_range: z.string(),
  excludes: z.array(z.string()),
  /** "Fees current as of {version}" — SYSTEM_DESIGN.md §7. */
  fee_schedule_version: z.string().optional(),
})
export type IndicativeCosts = z.infer<typeof indicativeCostsSchema>

export const contributionsSchema = z.object({
  applicable: z.union([z.boolean(), z.literal('unknown')]),
  plan_name: z.string().optional(),
  mechanism: z.enum(['s7.11', 's7.12', 'planning agreement']).optional(),
  indicative_amount: z.string().optional(),
  note: z.string(),
})
export type Contributions = z.infer<typeof contributionsSchema>

export const likelyConditionSchema = z.object({
  category: z.string(),
  condition: z.string(),
})
export type LikelyCondition = z.infer<typeof likelyConditionSchema>

export const constraintSchema = z.object({
  constraint: z.string(),
  implication: z.string(),
  /** The layer the constraint was read from, for provenance. */
  source_layer: z.string(),
})
export type Constraint = z.infer<typeof constraintSchema>

export const citationSchema = z.object({
  /** Must trace to a retrieved chunk — an unknown doc_id is a hallucination. */
  doc_id: z.string(),
  instrument: z.string(),
  clause: z.string().optional(),
  url: z.string().optional(),
})
export type Citation = z.infer<typeof citationSchema>

export const assessmentSchema = z.object({
  verdict: verdictSchema,
  /** One sentence, plain English. */
  headline: z.string(),
  confidence: confidenceSchema,
  pathway_options: z.array(pathwayOptionSchema),
  criteria: z.array(criterionResultSchema),
  questions: z.array(clarifyingQuestionSchema),
  approvals_required: z.array(approvalSchema),
  assessments_required: z.array(requiredAssessmentSchema),
  indicative_costs: indicativeCostsSchema,
  contributions: contributionsSchema,
  likely_conditions: z.array(likelyConditionSchema),
  constraints: z.array(constraintSchema),
  next_steps: z.array(z.string()),
  citations: z.array(citationSchema),
  disclaimer: z.string(),
  /** Set by the Lambda when it overwrote the model's verdict (CLAUDE.md rule 1). */
  model_conflict: z.boolean().optional(),
})
export type Assessment = z.infer<typeof assessmentSchema>

/** Plain-English label for a verdict — the UI never shows the raw enum. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  EXEMPT: 'Exempt development',
  CDC: 'Complying development certificate',
  LOCAL_DA: 'Development application (council)',
  REGIONAL_DA: 'Development application (regional panel)',
  SSD: 'State significant development',
  PROHIBITED: 'Prohibited',
  INDETERMINATE: 'Not determined',
}
