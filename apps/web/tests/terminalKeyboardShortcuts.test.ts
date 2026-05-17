import { describe, expect, test } from 'vitest'

import {
  TERMINAL_SHORTCUT_DEFINITIONS,
  TERMINAL_WORKSPACE_SHORTCUTS,
  resolveTerminalWorkspaceShortcut,
  terminalShortcutMatches,
} from '../src/entities/app/terminalKeyboardShortcuts'

describe('terminal keyboard shortcuts', () => {
  test('maps Alt-number shortcuts to primary terminal workspaces', () => {
    expect(TERMINAL_WORKSPACE_SHORTCUTS.map((shortcut) => shortcut.view)).toEqual([
      'dashboard',
      'trades',
      'risk',
      'operations',
      'settlement',
      'reports',
      'reference',
      'assistant',
    ])

    expect(resolveTerminalWorkspaceShortcut({ key: '2', altKey: true })?.view).toBe('trades')
    expect(resolveTerminalWorkspaceShortcut({ key: '2', altKey: true, shiftKey: true })).toBeNull()
    expect(resolveTerminalWorkspaceShortcut({ key: '2', ctrlKey: true })).toBeNull()
  })

  test('documents conflict-aware focus and tile shortcuts', () => {
    expect(terminalShortcutMatches('focus-filter', { key: 'f', altKey: true })).toBe(true)
    expect(terminalShortcutMatches('next-tile', { key: 'j', altKey: true })).toBe(true)
    expect(terminalShortcutMatches('previous-tile', { key: 'k', altKey: true })).toBe(true)
    expect(terminalShortcutMatches('reset-focus', { key: '0', altKey: true })).toBe(true)
    expect(terminalShortcutMatches('shortcut-reference', { key: '?' })).toBe(true)

    const conflictAwareLabels = TERMINAL_SHORTCUT_DEFINITIONS
      .filter((shortcut) => shortcut.conflictSafe)
      .map((shortcut) => shortcut.label)
    expect(conflictAwareLabels).toEqual(
      expect.arrayContaining([
        'Switch primary workspace',
        'Focus local filter',
        'Next tile',
        'Previous tile',
        'Reset workspace focus',
        'Show shortcuts',
      ]),
    )
  })
})
