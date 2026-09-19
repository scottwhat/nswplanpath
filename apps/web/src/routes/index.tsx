import { createFileRoute } from '@tanstack/react-router'
import { AddressSearch } from '../components/AddressSearch'
import { AssessmentReport } from '../components/AssessmentReport'
import { ChatPanel } from '../components/ChatPanel'
import { SiteMap } from '../components/SiteMap'
import { useSelectedSite } from '../lib/selectedSite'
import { useLatestAnswer } from '../stores/useChatStore'

export const Route = createFileRoute('/')({
  component: Landing,
})

const PATHWAYS = ['Exempt', 'CDC', 'Development application'] as const

function Landing() {
  const site = useSelectedSite()
  const answer = useLatestAnswer()

  return (
    <>
      <section className="relative">
        {/* Horizon: a lit edge where the hero meets the content below. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-beam-600/50 to-transparent" />
        <div className="mx-auto max-w-7xl px-6 pb-5 pt-6">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight text-navy-990 sm:text-3xl">
              What can I build{' '}
              <span className="bg-gradient-to-r from-beam-600 via-beam-700 to-navy-700 bg-clip-text text-transparent">
                here?
              </span>
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {PATHWAYS.map((pathway) => (
                <span
                  key={pathway}
                  className="rounded-full border border-navy-300/60 bg-white/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-navy-700"
                >
                  {pathway}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 max-w-3xl">
            <p className="mb-1.5 font-mono text-xs font-semibold text-signal-600">
              Step 1 — enter your address
            </p>
            {/* This wrapper starts at the input's top edge, so the cue can be
                pinned to the input's centre rather than the block's. */}
            <div className="relative">
              <AddressSearch />
              <StepTwoArrow />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-8 pt-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="h-4 w-0.5 rounded-full bg-beam-600" aria-hidden="true" />
          <h2 className="readout !text-navy-800">Site</h2>
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-beam-700">
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 1.5 14 5v6l-6 3.5L2 11V5z M2 5l6 3.5L14 5 M8 8.5v6" />
            </svg>
            3D maps, click and drag
          </span>
          {site.hasSelection ? (
            /* The selected site, stated plainly — a lot the user clicked leads,
               with the searched address underneath it. */
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-beam-600/35 bg-beam-500/8 py-1 pl-2.5 pr-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-beam-600" aria-hidden="true" />
              <span className="truncate text-xs font-semibold text-navy-990">{site.primary}</span>
              {site.secondary && (
                <span className="truncate font-mono text-[11px] text-beam-800">
                  {site.secondary}
                </span>
              )}
            </span>
          ) : (
            <span className="truncate text-xs text-navy-600">
              No site selected — search an address or click a lot on the map
            </span>
          )}
          <span className="h-px flex-1 bg-gradient-to-r from-navy-300/70 to-transparent" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="h-[26rem] lg:h-[34rem]">
            <SiteMap />
          </div>
          <div className="h-[26rem] lg:h-[34rem]">
            <ChatPanel />
          </div>
        </div>

        {/* The report the assess pipeline fills. Null until POST /assess exists
            (build plan step 5); until then it shows the assistant's latest
            finished answer, marked advisory. */}
        <AssessmentReport assessment={null} advisory={answer?.content ?? null} />
      </div>
    </>
  )
}

/**
 * Hand-drawn cue from the address box, out to the right of the page and back
 * down onto the chat panel. Anchored to the search row and drawn in its own
 * SVG coordinate space so the curve never distorts. xl-only: it needs the
 * ~420px of clear space to the right of the search box, and below that
 * breakpoint the chat panel eventually stacks under the map, so the arrow
 * would point at nothing.
 */
function StepTwoArrow() {
  return (
    <svg
      viewBox="0 0 420 200"
      width="420"
      height="200"
      fill="none"
      role="img"
      aria-label="Step 2 — ask AI what you want to build"
      /* top-[25px] is the input's vertical centre (py-3.5 + a line of text);
         the horizontal run is centred in the viewBox, so -translate-y-1/2
         lands it exactly on the end of the search bar. */
      className="pointer-events-none absolute left-full top-[25px] z-20 hidden -translate-y-1/2 xl:block"
    >
      <defs>
        {/* The glow: the stroke's own colour, blurred, with no offset. */}
        <filter id="step2-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="3.5"
            floodColor="var(--color-signal-500)"
            floodOpacity="0.55"
          />
        </filter>
      </defs>

      <g filter="url(#step2-glow)">
        {/* Straight out from the end of the search bar, one rounded corner,
            then straight down onto the chat panel's top edge. */}
        <path
          d="M 8 100 H 288 Q 300 100 300 112 V 183"
          stroke="var(--color-signal-500)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 288 175 L 300 191 L 312 175"
          stroke="var(--color-signal-500)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Above the line, clear of both the search bar and the arrow. */}
      <text
        className="font-mono"
        fill="var(--color-signal-600)"
        fontSize="12"
        fontWeight="600"
      >
        <tspan x="86" y="62">Step 2 — ask AI what</tspan>
        <tspan x="86" y="78">you want to build</tspan>
      </text>
    </svg>
  )
}
