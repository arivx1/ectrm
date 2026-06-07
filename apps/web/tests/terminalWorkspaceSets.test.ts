import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { TerminalWorkspaceSetLauncher } from '../src/entities/app/TerminalWorkspaceSetLauncher'
import { APP_VIEWS } from '../src/entities/app/appViews'
import {
  DEFAULT_TERMINAL_WORKSPACE_SET_ID,
  TERMINAL_WORKSPACE_SET_STORAGE_KEY,
  buildTerminalWorkspaceSetLaunchTargets,
  getInvalidTerminalWorkspaceSetPresetReferences,
  getPrimaryTerminalWorkspaceSetRoute,
  listTerminalWorkspaceSets,
  parseTerminalWorkspaceSetId,
  readDefaultTerminalWorkspaceSetId,
  resolveTerminalWorkspaceSet,
  saveDefaultTerminalWorkspaceSetId,
  type TerminalWorkspaceSetStorage,
} from '../src/shared/terminalWorkspaceSets'

function createMemoryStorage(): TerminalWorkspaceSetStorage {
  const values = new Map<string, string>()

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

describe('terminal workspace sets', () => {
  test('resolve and persist the default workspace set safely', () => {
    const storage = createMemoryStorage()

    expect(readDefaultTerminalWorkspaceSetId(storage)).toBe(DEFAULT_TERMINAL_WORKSPACE_SET_ID)
    expect(parseTerminalWorkspaceSetId('risk-review')).toBe('risk-review')
    expect(parseTerminalWorkspaceSetId('not-a-set')).toBeNull()
    expect(resolveTerminalWorkspaceSet('not-a-set').id).toBe(DEFAULT_TERMINAL_WORKSPACE_SET_ID)

    expect(saveDefaultTerminalWorkspaceSetId('ops-close', storage)).toBe(true)
    expect(readDefaultTerminalWorkspaceSetId(storage)).toBe('ops-close')

    storage.setItem(TERMINAL_WORKSPACE_SET_STORAGE_KEY, 'not-a-set')
    expect(readDefaultTerminalWorkspaceSetId(storage)).toBe(DEFAULT_TERMINAL_WORKSPACE_SET_ID)
  })

  test('only references known app views and marks the first launch target as primary', () => {
    const viewKeys = new Set(APP_VIEWS.map((view) => view.key))

    for (const workspaceSet of listTerminalWorkspaceSets()) {
      const primaryRoute = getPrimaryTerminalWorkspaceSetRoute(workspaceSet)
      const targets = buildTerminalWorkspaceSetLaunchTargets(
        workspaceSet,
        (view) => `/terminal?view=${view}`,
      )

      expect(primaryRoute.role).toBe('primary')
      expect(targets[0]?.id).toBe(primaryRoute.id)

      for (const target of targets) {
        expect(viewKeys.has(target.view)).toBe(true)
        expect(target.href).toBe(`/terminal?view=${target.view}`)
      }
    }
  })

  test('does not reference missing monitor presets', () => {
    expect(getInvalidTerminalWorkspaceSetPresetReferences()).toEqual([])
  })

  test('renders a terminal-mode launcher with pop-out guidance', () => {
    const markup = renderToStaticMarkup(
      createElement(TerminalWorkspaceSetLauncher, {
        hrefForView: (view) => `/terminal?view=${view}`,
        navigateToView: () => undefined,
      }),
    )

    expect(markup).toContain('Workspace Set')
    expect(markup).toContain('Trader Morning')
    expect(markup).toContain('Home')
    expect(markup).toContain('Pop Out')
    expect(markup).toContain('Browser window placement stays manual')
  })
})
