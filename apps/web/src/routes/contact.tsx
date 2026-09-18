import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/contact')({
  component: Contact,
})

const LINKEDIN_URL = 'https://www.linkedin.com/in/scsydney/'

/* What is actually worth sending, in the order it is useful. */
const USEFUL_FEEDBACK = [
  {
    title: 'A wrong verdict',
    detail:
      'The pathway it named does not match what the council or a certifier told you. Send the address and the proposal — the rules engine is deterministic, so a wrong verdict is reproducible and fixable.',
  },
  {
    title: 'A stale or missing layer',
    detail:
      'A control read from a spatial layer that does not match the Planning Portal, or a constraint on your land that PlanPath did not see at all.',
  },
  {
    title: 'A council that behaves differently in practice',
    detail:
      'The instrument says one thing and the counter says another. This is the hardest gap to close from documents alone, and the most valuable thing anyone can report.',
  },
  {
    title: 'A document that should be in the corpus',
    detail:
      'A development control plan part, contributions plan or council policy that is missing for your area, ideally with the page you found it on.',
  },
]

function Contact() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14 sm:py-18">
      <span className="readout inline-flex items-center gap-2">
        <span className="h-px w-8 bg-beam-600/60" aria-hidden="true" />
        Contact
      </span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-950 sm:text-5xl">
        Get in touch
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-navy-700 sm:text-base">
        PlanPath is built and maintained by one person. The fastest way to reach me, and the
        best place to send anything about how the tool behaves in the real world, is LinkedIn.
      </p>

      <section className="panel rule-beam mt-10 p-6 sm:p-8">
        <h2 className="readout !text-navy-600">Direct</h2>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          <img
            src="/linkedinscott.jpeg"
            alt=""
            width="96"
            height="96"
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded-full object-cover ring-1 ring-navy-500/25 ring-offset-2 ring-offset-white"
          />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-navy-800">
              A message there reaches me faster than anything else. Include the address and
              the proposal and almost any problem can be reproduced from that alone.
            </p>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2.5 rounded-sm border border-beam-700/40 bg-beam-500/10 px-4 py-2.5 text-sm font-medium text-beam-800 transition hover:bg-beam-500/20"
            >
              <LinkedInMark />
              Connect on LinkedIn
            </a>
            <p className="mt-3 font-mono text-[11px] text-navy-600">linkedin.com/in/scsydney</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-navy-950">
            What is most useful to send
          </h2>
          <span className="hidden h-px flex-1 bg-gradient-to-r from-navy-300/70 to-transparent sm:block" />
        </div>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          {USEFUL_FEEDBACK.map((item) => (
            <div key={item.title} className="panel p-5">
              <dt className="text-sm font-medium text-navy-950">{item.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-navy-800">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel mt-6 p-6 sm:p-8">
        <h2 className="readout !text-navy-600">Before you write</h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-navy-800">
          <li>
            PlanPath is an independent prototype. It is not affiliated with the Department of
            Planning, Housing and Infrastructure, or with any NSW council — if you need a
            determination, the council is the only place to get one.
          </li>
          <li>
            I cannot give planning advice on your site, act for you, or certify anything. What
            the tool produces is a starting point for a conversation with your council or a
            registered certifier, not a substitute for it.
          </li>
          <li>
            Please do not send anything confidential. An address and a description of the
            proposal is enough to reproduce almost any problem.
          </li>
        </ul>
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
        <Link to="/data" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          Data and legislation
        </Link>
      </div>
    </div>
  )
}

function LinkedInMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05a3.74 3.74 0 0 1 3.37-1.85c3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}
