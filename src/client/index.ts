/**
 * @dsh-external/dsh-ungrouped-new-session — browser side.
 *
 * Makes the built-in sidebar's dead "Ungrouped" + button start a real
 * workspace-less conversation, adds a persistent footer action, and — key
 * fix — lets that blank workspace-less session actually chat. DSH's
 * ConversationRoot treats a blank session with no Workspace as inert
 * ("Choose a workspace to start"), so this plugin shadows the
 * `conversation.composer.bar` slot with a lightweight first-message bar while
 * the current session is a blank ungrouped session. The first message is sent
 * through the session's own prompt path; once the host flips the session from
 * blank (a real turn/start exists), the bar disposes itself and the native
 * composer takes over for the rest of the conversation.
 *
 * The DOM patching of the Ungrouped `+` button is deliberate but bounded:
 * listeners are tracked and removed on teardown, the match is narrowed to the
 * exact built-in labels, and the MutationObserver also handles a button that
 * is itself the inserted node.
 */

import React, { useState } from 'react'

const PLUGIN_ID = '@dsh-external/dsh-ungrouped-new-session'
const NS = 'ungroupedNewSession'

const zh = {
  'footer.label': '未分组新对话',
  'footer.aria': '新建一个不属于任何工作区的未分组对话',
  'first.badge': '未分组对话',
  'first.hint': '无需选择工作区，直接开始',
  'first.placeholder': '输入第一条消息…',
  'first.send': '发送',
  'first.sending': '发送中…',
  'first.error': '发送失败，请重试',
}

const en = {
  'footer.label': 'Ungrouped chat',
  'footer.aria': 'Start a new conversation outside any workspace',
  'first.badge': 'Ungrouped chat',
  'first.hint': 'No workspace needed — just start talking',
  'first.placeholder': 'Type your first message…',
  'first.send': 'Send',
  'first.sending': 'Sending…',
  'first.error': 'Could not send, please retry',
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The exact built-in aria-labels for the Ungrouped bucket's New Session button. */
const UNGROUPED_NEW_SESSION_LABELS = new Set([
  'New session in Ungrouped',
  '在“未分组”中新建会话',
])

/** The pieces of the session runtime this plugin needs (the wide public face omits some). */
type SessionsFaceLike = {
  create(opts?: { workspaceId?: unknown; cwd?: string; sessionId?: unknown }): Promise<string>
  open(id: string): void
  binding(id: string): { session: { prompt(
    content: ReadonlyArray<{ type: 'text'; text: string }>,
    mode: 'queue' | 'steer',
  ): Promise<{ ok: boolean }> } } | undefined
  list: {
    getSnapshot(): {
      current?: string | undefined
      byId: Record<string, { blank: boolean }>
    }
    subscribe(fn: () => void): () => void
  }
}

/** The workspace runtime pieces used to tell an "ungrouped" session from a workspace member. */
type WorkspacesFaceLike = {
  list: {
    getSnapshot(): { items: ReadonlyArray<{ sessionIds: readonly string[] }> }
    subscribe(fn: () => void): () => void
  }
}

/** Structural client context: slots + locale + sessions + workspaces. */
type ClientContextLike = {
  effect: (fn: () => void | (() => void), label?: string) => () => void
  slots: {
    inject(key: string, callback: () => () => void): () => void
    register(options: {
      name: string
      id?: string
      order?: number
      priority?: number
      locale?: string
      inject?: () => Record<string, unknown>
    }, component: unknown): () => void
  }
  locale: {
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  }
  sessions: SessionsFaceLike
  workspaces: WorkspacesFaceLike
}

// ---------------------------------------------------------------- styling ---

const firstBarStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
  border: '1px solid var(--dsw-alias-border, rgba(127, 127, 127, 0.3))',
  borderRadius: '12px',
  background: 'var(--dsw-surface, rgba(127, 127, 127, 0.06))',
}

const firstBarTextareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 56,
  padding: '8px 10px',
  resize: 'none',
  border: '0',
  outline: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  lineHeight: 1.5,
}

const firstBarRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
}

const firstBarBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: 12,
  opacity: 0.8,
  whiteSpace: 'nowrap',
}

const firstBarSendStyle: React.CSSProperties = {
  minWidth: 64,
  padding: '6px 12px',
  border: 0,
  borderRadius: 8,
  background: 'var(--dsw-accent, #4c8dff)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
}

const firstBarHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  opacity: 0.7,
  textAlign: 'center',
}

// ------------------------------------------------------------ first-message bar ---

interface FirstPromptBarProps {
  sessionId?: string | undefined
  send: (text: string) => Promise<boolean>
  t: Translate
  variant?: string
}

/**
 * The first-message composer for a blank ungrouped session. DSH's hero keeps
 * the workspace chip ("Choose workspace") because the core treats a blank
 * no-workspace session as inert; that is exactly what this bar circumvents.
 * It owns nothing but the draft: the first prompt goes through the session's
 * own prompt path, and the registration helper disposes this entry the moment
 * the session stops being a blank ungrouped one.
 */
function FirstPromptBar({ send, t, variant }: FirstPromptBarProps) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const value = text.trim()
    if (value === '' || sending) return
    setSending(true)
    setError(null)
    const ok = await send(value)
    // On success this entry is (normally being) disposed by the sessions-list
    // watcher; on failure keep the draft so the user can retry.
    if (!ok) {
      setSending(false)
      setError(t('first.error'))
    } else {
      setText('')
      setSending(false)
    }
  }

  return React.createElement(
    'div',
    { 'data-ungrouped-first-bar': '', style: firstBarStyle },
    React.createElement(
      'div',
      { style: firstBarRowStyle },
      React.createElement('span', { style: firstBarBadgeStyle }, t('first.badge')),
      React.createElement(
        'button',
        {
          type: 'button',
          style: firstBarSendStyle,
          disabled: sending || text.trim() === '',
          onClick: () => { void submit() },
        },
        sending ? t('first.sending') : t('first.send'),
      ),
    ),
    React.createElement('textarea', {
      style: firstBarTextareaStyle,
      value: text,
      placeholder: t('first.placeholder'),
      'aria-label': t('first.placeholder'),
      rows: 2,
      onChange: (event: { target: { value: string } }) => { setText(event.target.value) },
      onKeyDown: (event: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          void submit()
        }
      },
    }),
    error !== null
      ? React.createElement('p', { style: { margin: 0, fontSize: 12, color: '#e57373' } }, error)
      : null,
    variant === 'hero'
      ? React.createElement('p', { style: firstBarHintStyle }, t('first.hint'))
      : null,
  )
}

// ------------------------------------------------------------------- apply ---

export const inject = ['slots', 'sessions', 'workspaces', 'locale']

export function apply(ctx: ClientContextLike): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ungrouped-new-session: dictionaries')

  // ---- start an ungrouped session (shared by the footer and the + patch) ----
  // The flag lives on window so duplicate listeners left behind by an older
  // plugin instance (or a fast double-click) collapse to one session instead
  // of racing two creates.
  const START_FLAG = '__dsh_ungrouped_new_session_starting__'
  const isStarting = (): boolean =>
    (window as unknown as Record<string, boolean | undefined>)[START_FLAG] === true
  const setStarting = (value: boolean): void => {
    (window as unknown as Record<string, boolean | undefined>)[START_FLAG] = value
  }

  const startUngrouped = async (): Promise<void> => {
    if (isStarting()) return
    setStarting(true)
    try {
      const sessionId = await ctx.sessions.create()
      ctx.sessions.open(sessionId)
    } catch (error) {
      console.error(`[${PLUGIN_ID}] could not start an ungrouped conversation:`, error)
    } finally {
      setStarting(false)
    }
  }

  // ---- persistent sidebar footer action ----
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'ungrouped-new-session-footer',
    order: 10,
    locale: NS,
    inject: () => ({ onStart: startUngrouped }),
  }, FooterAction))

  // ---- first-message bar for blank ungrouped sessions ----
  // While the current session is blank AND belongs to no Workspace, shadow the
  // default composer with FirstPromptBar. The moment it gets a workspace or
  // stops being blank (first message accepted) the registration is disposed
  // and the native composer returns.
  ctx.effect(() => {
    let disposeBar: (() => void) | undefined
    let activeSessionId: string | undefined

    const targetSession = (): string | undefined => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const id = snapshot.current
      if (id === undefined) return undefined
      const summary = snapshot.byId[id]
      if (summary === undefined || !summary.blank) return undefined
      const workspaces = ctx.workspaces.list.getSnapshot()
      if (workspaces.items.some(workspace => workspace.sessionIds.includes(id))) return undefined
      return id
    }

    const sync = (): void => {
      const id = targetSession()
      if (id !== undefined && (disposeBar === undefined || activeSessionId !== id)) {
        // A new (or re-entered) ungrouped blank session: rebuild the seat.
        disposeBar?.()
        activeSessionId = id
        const boundSessionId = id
        disposeBar = ctx.slots.inject('conversation.composer.bar', () => ctx.slots.register({
          name: 'conversation.composer.bar',
          priority: -1,
          locale: NS,
          inject: (): { send: (text: string) => Promise<boolean> } => ({
            send: async (text) => {
              const binding = ctx.sessions.binding(boundSessionId)
              const session = binding?.session
              if (session === undefined) return false
              const result = await session.prompt([{ type: 'text', text }], 'queue')
              return result.ok
            },
          }),
        }, FirstPromptBar))
      } else if (id === undefined && disposeBar !== undefined) {
        // Left the ungrouped-blank state (attached / became non-blank / switched).
        disposeBar()
        disposeBar = undefined
        activeSessionId = undefined
      }
    }

    sync()
    const stopSessions = ctx.sessions.list.subscribe(sync)
    const stopWorkspaces = ctx.workspaces.list.subscribe(sync)
    return () => {
      stopSessions()
      stopWorkspaces()
      disposeBar?.()
    }
  }, 'ungrouped-new-session: first-message composer seat')

  // ---- make the built-in Ungrouped group row's + button live ----
  // Listeners are tracked so unload/reload removes them (a direct addEventListener
  // would otherwise survive the plugin and keep calling a stale closure, and the
  // dataset marker would block the fresh instance from re-binding).
  const domListeners = new Map<HTMLButtonElement, (event: MouseEvent) => void>()

  const detachButton = (button: HTMLButtonElement): void => {
    const handler = domListeners.get(button)
    if (handler !== undefined) {
      button.removeEventListener('click', handler)
      domListeners.delete(button)
    }
    delete button.dataset.ungroupedNewSession
  }

  const attach = (root: ParentNode): void => {
    const buttons: HTMLButtonElement[] = []
    if (root instanceof HTMLButtonElement && root.matches('button[aria-label]')) {
      buttons.push(root)
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('button[aria-label]')) {
      buttons.push(button)
    }
    for (const button of buttons) {
      if (button.dataset.ungroupedNewSession === 'true') continue
      const label = button.getAttribute('aria-label') ?? ''
      if (!UNGROUPED_NEW_SESSION_LABELS.has(label)) continue
      button.dataset.ungroupedNewSession = 'true'
      const handler = (event: MouseEvent): void => {
        event.preventDefault()
        event.stopPropagation()
        void startUngrouped()
      }
      domListeners.set(button, handler)
      button.addEventListener('click', handler)
    }
  }

  let observer: MutationObserver | undefined
  const start = (): void => {
    attach(document)
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) attach(node)
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    ctx.effect(() => () => {
      observer?.disconnect()
      for (const button of [...domListeners.keys()]) detachButton(button)
    }, 'ungrouped-new-session: DOM observer + patches')
  }

  if (document.body !== null) start()
  else {
    const onReady = (): void => start()
    document.addEventListener('DOMContentLoaded', onReady, { once: true })
    ctx.effect(() => () => document.removeEventListener('DOMContentLoaded', onReady), 'ungrouped-new-session: DOM ready listener')
  }
}

// ---------------------------------------------------------------- footer action ---

interface FooterActionProps {
  wide: boolean
  t: Translate
  onStart: () => void
}

function FooterAction({ wide, t, onStart }: FooterActionProps) {
  return React.createElement(
    'button',
    {
      type: 'button',
      onClick: (event: { preventDefault: () => void; stopPropagation: () => void }) => {
        event.preventDefault()
        event.stopPropagation()
        onStart()
      },
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        minHeight: 28,
        padding: wide ? '6px 10px' : '0',
        border: '1px solid var(--dsw-alias-border, rgba(127, 127, 127, 0.25))',
        borderRadius: '8px',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      'aria-label': t('footer.aria'),
      title: t('footer.aria'),
    },
    wide ? t('footer.label') : '+',
  )
}
