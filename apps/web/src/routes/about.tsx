import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14 sm:py-18">
      <span className="readout inline-flex items-center gap-2">
        <span className="h-px w-8 bg-beam-600/60" aria-hidden="true" />
        About
      </span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-950 sm:text-5xl">
        About PlanPath
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-navy-700 sm:text-base">
        PlanPath answers one question: for this address and this project, is the pathway
        exempt development, complying development, or a development application — and what
        will it take to get there?
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section className="panel rule-beam p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-navy-950">How it works</h2>
          <ol className="mt-4 space-y-4 text-sm leading-relaxed text-navy-800">
            <Step n="01" title="Resolve the site">
              Your address is matched to a lot and deposited plan, and its boundary is drawn
              from the NSW Digital Cadastral Database.
            </Step>
            <Step n="02" title="Read the layers">
              Zone, minimum lot size, height of buildings, floor space ratio, heritage,
              bushfire and flood status are read from the mapped spatial layers — not
              inferred from the text of a planning instrument.
            </Step>
            <Step n="03" title="Apply the rules">
              A deterministic rules engine tests the proposal against the development
              standards. The engine decides the verdict; nothing else does.
            </Step>
            <Step n="04" title="Explain it">
              A language model retrieves the relevant clauses for your council and puts the
              result in plain English, with every citation traceable to a source document.
            </Step>
          </ol>
          <p className="mt-5 border-t border-navy-500/20 pt-4 text-xs leading-relaxed text-navy-600">
            Everything it reads, and how current each piece of it is, is set out under{' '}
            <Link to="/data" className="text-beam-800 underline-offset-4 hover:underline">
              Data and legislation
            </Link>
            .
          </p>
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-navy-950">
            What it will not do
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-navy-800">
            <li>Invent a clause number, a fee or a rate it cannot source.</li>
            <li>
              Turn an unknown into a no. A fact it cannot verify becomes a question for you.
            </li>
            <li>
              Produce a BASIX certificate, a BAL rating, a traffic report or a contamination
              conclusion. It will name the study, what triggers it, who prepares it and
              roughly what it costs.
            </li>
            <li>Replace a s10.7 Planning Certificate or the consent authority.</li>
          </ul>
          <p className="mt-5 border-t border-navy-500/20 pt-4 text-xs leading-relaxed text-navy-600">
            The scope is pathway assessment. Where a question needs a specialist, PlanPath
            says which one and why, rather than guessing at the answer itself.
          </p>
        </section>
      </div>

      <section className="panel mt-6 p-6 sm:p-8">
        <h2 className="readout !text-navy-600">Disclaimer</h2>
        <p className="mt-3 text-sm leading-relaxed text-navy-800">
          Nothing here is planning advice. PlanPath is a research prototype working over
          published NSW planning instruments and spatial data, and both can be out of date or
          wrong at the parcel level. A s10.7 Planning Certificate and the consent authority
          for your site are the authoritative sources. Confirm anything you intend to rely on
          with your council or a registered certifier before you spend money on it.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="rounded-sm border border-beam-700/40 bg-beam-500/10 px-4 py-2 text-sm font-medium text-beam-800 transition hover:bg-beam-500/20"
        >
          Assess an address
        </Link>
        <Link to="/contact" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          Contact
        </Link>
        <Link to="/pathways" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          Planning pathways explained
        </Link>
      </div>
    </div>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="readout mt-0.5 shrink-0">{n}</span>
      <span>
        <strong className="block font-medium text-navy-950">{title}</strong>
        <span className="mt-1 block text-navy-800">{children}</span>
      </span>
    </li>
  )
}
