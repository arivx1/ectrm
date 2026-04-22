import { describe, expect, it } from 'vitest'

import { APP_VIEWS } from '../src/entities/app/appViews'
import { WORKSPACE_RENDERERS } from '../src/entities/app/workspaceRendererRegistry'

describe('workspace renderer registry', () => {
  it('covers every registered app view with a renderer', () => {
    expect(new Set(Object.keys(WORKSPACE_RENDERERS))).toEqual(
      new Set(APP_VIEWS.map((view) => view.key)),
    )
  })

  it('marks windowed workspaces for shared notice wrapping', () => {
    expect(WORKSPACE_RENDERERS.trades.usesWindowNotices).toBe(true)
    expect(WORKSPACE_RENDERERS.operations.usesWindowNotices).toBe(true)
    expect(WORKSPACE_RENDERERS.settlement.usesWindowNotices).toBe(true)
    expect(WORKSPACE_RENDERERS.dashboard.usesWindowNotices).toBeUndefined()
    expect(WORKSPACE_RENDERERS.settings.usesWindowNotices).toBeUndefined()
  })
})
