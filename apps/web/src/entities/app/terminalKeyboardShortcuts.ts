import type { ViewKey } from '../../shared/models'

export type TerminalShortcutId =
  | 'command-bar'
  | 'workspace-switch'
  | 'focus-filter'
  | 'next-tile'
  | 'previous-tile'
  | 'reset-focus'
  | 'shortcut-reference'

export type TerminalShortcutCategory = 'Navigation' | 'Workspace' | 'Focus'

export type TerminalShortcutDefinition = {
  id: TerminalShortcutId
  category: TerminalShortcutCategory
  label: string
  keys: string[]
  detail: string
  conflictSafe: boolean
}

export type TerminalWorkspaceShortcut = {
  key: string
  view: ViewKey
  label: string
  detail: string
}

type TerminalShortcutKeyEvent = {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export const TERMINAL_WORKSPACE_SHORTCUTS: TerminalWorkspaceShortcut[] = [
  {
    key: '1',
    view: 'prompt',
    label: 'Home',
    detail: 'Open the configurable Home apps surface.',
  },
  {
    key: '2',
    view: 'trades',
    label: 'Trade Capture',
    detail: 'Open trade capture, blotter, and selected trade context.',
  },
  {
    key: '3',
    view: 'risk',
    label: 'Exposure',
    detail: 'Open risk, pricing coverage, and concentration views.',
  },
  {
    key: '4',
    view: 'operations',
    label: 'Operations',
    detail: 'Open confirmations, action queues, and operational blockers.',
  },
  {
    key: '5',
    view: 'settlement',
    label: 'Settlement',
    detail: 'Open invoices, payments, and cash follow-through.',
  },
  {
    key: '6',
    view: 'reports',
    label: 'Reports',
    detail: 'Open curated desk reports.',
  },
  {
    key: '7',
    view: 'reference',
    label: 'Reference',
    detail: 'Open governed reference data.',
  },
  {
    key: '8',
    view: 'assistant',
    label: 'Assistant',
    detail: 'Open the assistant console.',
  },
]

export const TERMINAL_SHORTCUT_DEFINITIONS: TerminalShortcutDefinition[] = [
  {
    id: 'command-bar',
    category: 'Navigation',
    label: 'Open command bar',
    keys: ['Ctrl/Cmd+K', '/'],
    detail: 'Search workspaces, trades, reports, and reference records.',
    conflictSafe: false,
  },
  {
    id: 'workspace-switch',
    category: 'Navigation',
    label: 'Switch primary workspace',
    keys: ['Alt+1...8'],
    detail: 'Jump across Home, Trades, Risk, Operations, Settlement, Reports, Reference, and Assistant.',
    conflictSafe: true,
  },
  {
    id: 'focus-filter',
    category: 'Focus',
    label: 'Focus local filter',
    keys: ['Alt+F'],
    detail: 'Move focus into the current workspace filter when one is available.',
    conflictSafe: true,
  },
  {
    id: 'next-tile',
    category: 'Workspace',
    label: 'Next tile',
    keys: ['Alt+J'],
    detail: 'Move focus to the next visible tile or panel.',
    conflictSafe: true,
  },
  {
    id: 'previous-tile',
    category: 'Workspace',
    label: 'Previous tile',
    keys: ['Alt+K'],
    detail: 'Move focus to the previous visible tile or panel.',
    conflictSafe: true,
  },
  {
    id: 'reset-focus',
    category: 'Workspace',
    label: 'Reset workspace focus',
    keys: ['Alt+0'],
    detail: 'Clear terminal handoff focus and return to the top of the current workspace.',
    conflictSafe: true,
  },
  {
    id: 'shortcut-reference',
    category: 'Navigation',
    label: 'Show shortcuts',
    keys: ['?'],
    detail: 'Open the in-product shortcut reference.',
    conflictSafe: true,
  },
]

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

export function resolveTerminalWorkspaceShortcut(
  event: TerminalShortcutKeyEvent,
): TerminalWorkspaceShortcut | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null
  }

  return TERMINAL_WORKSPACE_SHORTCUTS.find((shortcut) => shortcut.key === event.key) ?? null
}

export function terminalShortcutMatches(
  shortcutId: Exclude<TerminalShortcutId, 'command-bar' | 'workspace-switch'>,
  event: TerminalShortcutKeyEvent,
): boolean {
  const normalizedKey = event.key.toLowerCase()

  switch (shortcutId) {
    case 'focus-filter':
      return normalizedKey === 'f' && Boolean(event.altKey) && !event.ctrlKey && !event.metaKey && !event.shiftKey
    case 'next-tile':
      return normalizedKey === 'j' && Boolean(event.altKey) && !event.ctrlKey && !event.metaKey && !event.shiftKey
    case 'previous-tile':
      return normalizedKey === 'k' && Boolean(event.altKey) && !event.ctrlKey && !event.metaKey && !event.shiftKey
    case 'reset-focus':
      return event.key === '0' && Boolean(event.altKey) && !event.ctrlKey && !event.metaKey && !event.shiftKey
    case 'shortcut-reference':
      return event.key === '?' && !event.altKey && !event.ctrlKey && !event.metaKey
  }
}
