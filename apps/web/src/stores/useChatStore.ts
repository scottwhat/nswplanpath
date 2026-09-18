import type { ChatRole } from '@planpath/shared'
import { create } from 'zustand'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  stub?: boolean
  /** True only for a reply the agent finished — not an error or a stopped stream. */
  complete?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  draft: string
  pending: boolean
  /** Text received so far for the reply still streaming in, if any. */
  streaming: string
  setDraft: (draft: string) => void
  append: (message: Omit<ChatMessage, 'id'>) => void
  setPending: (pending: boolean) => void
  appendStreaming: (delta: string) => void
  clearStreaming: () => void
  reset: () => void
}

/**
 * Client state only — what the user typed and what has been said in this
 * session. Assessment results, once the Lambda exists, belong to TanStack
 * Query and are never copied in here (CLAUDE.md §Conventions).
 */
export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  draft: '',
  pending: false,
  streaming: '',
  setDraft: (draft) => set({ draft }),
  append: (message) =>
    set((state) => ({
      messages: [...state.messages, { ...message, id: crypto.randomUUID() }],
    })),
  setPending: (pending) => set({ pending }),
  appendStreaming: (delta) => set((state) => ({ streaming: state.streaming + delta })),
  clearStreaming: () => set({ streaming: '' }),
  reset: () => set({ messages: [], draft: '', pending: false, streaming: '' }),
}))

export const useMessages = () => useChatStore((state) => state.messages)
export const useDraft = () => useChatStore((state) => state.draft)
export const usePending = () => useChatStore((state) => state.pending)
export const useStreaming = () => useChatStore((state) => state.streaming)

/** The newest finished answer from the connected agent, if there is one. */
export const useLatestAnswer = () =>
  useChatStore((state) => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const message = state.messages[i]
      if (message.role === 'assistant' && message.complete && !message.stub) return message
    }
    return null
  })
