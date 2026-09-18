import {
  DISCLAIMER,
  MAX_QUESTION_LENGTH,
  type ChatRequest,
} from '@planpath/shared'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, type FormEvent } from 'react'
import { askAgent } from '../lib/agent'
import { Markdown } from './Markdown'
import { agentConfigured } from '../lib/env'
import {
  useChatStore,
  useDraft,
  useMessages,
  usePending,
  useStreaming,
} from '../stores/useChatStore'
import { useSelectedSite } from '../lib/selectedSite'

const SUGGESTIONS = [
  'Can I build a granny flat at this address?',
  'Is a dual occupancy allowed on this lot?',
  'What approvals do I need for a rear extension?',
]

export function ChatPanel() {
  const messages = useMessages()
  const draft = useDraft()
  const pending = usePending()
  const streaming = useStreaming()
  const site = useSelectedSite()
  const { setDraft, append, setPending, appendStreaming, clearStreaming } =
    useChatStore.getState()
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)


  const mutation = useMutation({
    mutationFn: (request: ChatRequest) => {
      const controller = new AbortController()
      abortRef.current = controller
      return askAgent(request, {
        onDelta: appendStreaming,
        onReset: clearStreaming,
        signal: controller.signal,
      })
    },
    // A rejected question is a verdict from the backend — out of quota, kill
    // switch, bad input. Retrying spends the allowance without changing it.
    retry: false,
    onMutate: () => {
      clearStreaming()
      setPending(true)
    },
    onSuccess: (result) => {
      append({ role: 'assistant', content: result.reply, stub: result.stub, complete: true })
    },
    onError: (error: Error) => {
      if (error.name === 'AbortError') {
        // Keep whatever arrived before the stop — throwing away a half-written
        // answer the user was reading is worse than showing it, marked.
        const partial = useChatStore.getState().streaming.trim()
        append({
          role: 'assistant',
          content: partial ? `${partial}\n\n[Stopped]` : '[Stopped before any reply.]',
        })
        return
      }
      append({ role: 'assistant', content: `Something went wrong: ${error.message}` })
    },
    onSettled: () => {
      abortRef.current = null
      clearStreaming()
      setPending(false)
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, pending, streaming])

  function send(message: string) {
    const trimmed = message.trim()
    if (!trimmed || pending) return
    if (trimmed.length > MAX_QUESTION_LENGTH) return
    append({ role: 'user', content: trimmed })
    setDraft('')
    mutation.mutate({
      message: trimmed,
      address: site.addressLabel ?? site.lotLabel,
    })
  }

  /**
   * Aborts the in-flight call. The question is already spent at the backend —
   * the quota is decremented before the harness runs — so this stops the wait,
   * not the charge, and the panel says as much rather than implying a refund.
   */
  function stop() {
    abortRef.current?.abort()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    send(draft)
  }

  return (
    <section className="panel flex h-full flex-col overflow-hidden">
      <header className="rule-beam relative shrink-0 border-b border-navy-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-navy-990">
              Planning assistant
            </h2>
            {site.hasSelection ? (
              /* Name the site the answer will be about, so it is never
                 ambiguous which lot the assistant is talking about. */
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-beam-600"
                  aria-hidden="true"
                />
                <span className="truncate text-xs font-medium text-navy-900">
                  {site.primary}
                </span>
                {site.secondary && (
                  <span className="truncate font-mono text-[11px] text-beam-800">
                    {site.secondary}
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 truncate font-mono text-[11px] text-navy-600">
                No site selected
              </p>
            )}
          </div>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${
              agentConfigured
                ? 'border-beam-600/35 bg-beam-500/8 text-beam-800'
                : 'border-signal-500/40 bg-signal-500/5 text-signal-400'
            }`}
          >
            <span
              className={`pulse-dot h-1.5 w-1.5 rounded-full ${
                agentConfigured ? 'bg-beam-600' : 'bg-signal-500'
              }`}
              aria-hidden="true"
            />
            {agentConfigured ? 'Connected' : 'Stub agent'}
          </span>
        </div>
      </header>

      {!agentConfigured && (
        <p className="border-b border-signal-500/25 bg-signal-500/8 px-4 py-2 text-xs text-signal-700">
          The assessment engine is not built yet. Replies below are placeholders and
          contain no planning verdict.
        </p>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-navy-700">
              Describe what you want to build and I'll work out the approval pathway.
            </p>
            <ul className="space-y-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => send(suggestion)}
                    className="group flex w-full items-center gap-2.5 rounded-sm border border-navy-200 bg-white px-3 py-2.5 text-left text-sm text-navy-800 shadow-sm transition hover:border-beam-600/50 hover:bg-beam-500/[0.07] hover:text-navy-990"
                  >
                    <span
                      className="font-mono text-[10px] text-beam-600/60 transition group-hover:text-beam-700"
                      aria-hidden="true"
                    >
                      ▸
                    </span>
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] rounded-sm px-3.5 py-2.5 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'whitespace-pre-wrap border border-navy-800 bg-navy-800 text-white shadow-sm'
                  : 'border border-navy-200 border-l-2 border-l-beam-600 bg-white text-navy-900 shadow-sm'
              }`}
            >
              {message.role === 'user' ? message.content : <Markdown text={message.content} />}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            {streaming ? (
              <div className="max-w-[85%] rounded-sm border border-navy-200 border-l-2 border-l-beam-600 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-navy-900 shadow-sm">
                <Markdown text={streaming} />
              </div>
            ) : (
              <div className="rounded-sm border border-navy-200 border-l-2 border-l-beam-600 bg-white px-3.5 py-2.5 shadow-sm">
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-beam-700">
                  Thinking
                </span>
                <span
                  className="sweep relative mt-2 block h-px w-28 overflow-hidden bg-beam-600/25"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t border-navy-200 bg-navy-50/70 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(draft)
              }
            }}
            rows={2}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="e.g. I want to build a two-bedroom secondary dwelling in the back yard"
            className="max-h-40 flex-1 resize-none rounded-sm border border-navy-300 bg-white px-3 py-2 text-sm text-navy-990 outline-none transition placeholder:text-navy-500 focus:border-beam-600 focus:shadow-[0_0_0_3px_rgb(6_182_212/0.18)]"
          />
          {pending ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-sm border border-signal-500 bg-white px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-signal-700 shadow-sm transition hover:bg-signal-500/10"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={
                draft.trim().length === 0 || draft.trim().length > MAX_QUESTION_LENGTH
              }
              className="rounded-sm border border-beam-700 bg-beam-700 px-4 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-white shadow-sm transition hover:border-beam-800 hover:bg-beam-800 disabled:cursor-not-allowed disabled:border-navy-200 disabled:bg-navy-100 disabled:text-navy-500 disabled:shadow-none"
            >
              Ask
            </button>
          )}
        </div>
        <p className="mt-2.5 text-[11px] leading-snug text-navy-600">{DISCLAIMER}</p>
      </form>
    </section>
  )
}
