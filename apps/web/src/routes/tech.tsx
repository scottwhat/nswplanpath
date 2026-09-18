import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/tech')({
  component: Tech,
})

const STACK = [
  {
    tag: 'Frontend',
    name: 'React',
    body: 'The interface is a React and TypeScript single-page app built with Vite. TanStack Router keeps the address and assessment in the URL so a result can be reloaded or shared, TanStack Query fetches and caches site data, and Tailwind handles styling.',
  },
  {
    tag: 'Map',
    name: 'Mapbox',
    body: 'Mapbox GL, through react-map-gl, draws the base map. Lot boundaries from the NSW Digital Cadastral Database are laid over it, and the map zooms to the lot you searched for.',
  },
  {
    tag: 'Cloud',
    name: 'AWS',
    body: 'The backend runs on Amazon Web Services in the Sydney region (ap-southeast-2). Lambda functions behind API Gateway do the site lookups and assessments, DynamoDB caches results, Cognito gives the browser short-lived access, and the whole thing is defined in code with the AWS CDK.',
  },
  {
    tag: 'Agents',
    name: 'Amazon Bedrock AgentCore',
    body: 'Chat runs as an agent hosted on Bedrock AgentCore. It can search a Bedrock Knowledge Base built from NSW planning legislation and council documents, filtered to your council, so answers are based on the instruments that apply to your site.',
  },
  {
    tag: 'Model',
    name: 'Claude Sonnet 5',
    body: "Anthropic's Claude Sonnet 5 writes the explanations. It explains the result in plain English and cites the clauses it retrieved. It does not decide the pathway: that comes from the rules engine.",
  },
] as const

function Tech() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-14 sm:py-18">
      <span className="readout inline-flex items-center gap-2">
        <span className="h-px w-8 bg-beam-600/60" aria-hidden="true" />
        Tech
      </span>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-navy-950 sm:text-5xl">
        How PlanPath is built
      </h1>
      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-navy-700 sm:text-base">
        A short tour of the technology behind the site: what runs in your browser, what runs
        in the cloud, and where the AI fits in.
      </p>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {STACK.map((item, i) => (
          <section
            key={item.name}
            className={`panel p-6 sm:p-8 ${i === 0 ? 'rule-beam' : ''}`}
          >
            <span className="readout">{item.tag}</span>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-navy-950">
              {item.name}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-navy-800">{item.body}</p>
          </section>
        ))}
      </div>

      <section className="panel mt-6 p-6 sm:p-8">
        <h2 className="readout !text-navy-600">The rules engine decides, the model explains</h2>
        <p className="mt-3 text-sm leading-relaxed text-navy-800">
          The pathway verdict comes from a deterministic rules engine that checks the
          development standards against data read from the spatial layers. The language model
          explains that verdict and cites its sources. If the two ever disagree, the engine
          wins. Any fact the system can't verify is marked unknown and turned into a question
          for you, not treated as a no.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="rounded-sm border border-beam-700/40 bg-beam-500/10 px-4 py-2 text-sm font-medium text-beam-800 transition hover:bg-beam-500/20"
        >
          Assess an address
        </Link>
        <Link to="/data" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          Data and legislation
        </Link>
        <Link to="/about" className="text-sm text-navy-700 underline-offset-4 hover:underline">
          About
        </Link>
      </div>
    </div>
  )
}
