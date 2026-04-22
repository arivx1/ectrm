import { describe, expect, it } from 'vitest'

import { APP_VIEWS } from '../src/entities/app/appViews'
import { WORKSPACE_DESCRIPTORS } from '../src/entities/app/workspaceRendererRegistry'

describe('workspace descriptor system', () => {
  it('backs every app view with a single descriptor entry', () => {
    expect(new Set(Object.keys(WORKSPACE_DESCRIPTORS))).toEqual(
      new Set(APP_VIEWS.map((view) => view.key)),
    )
  })

  it('co-locates metadata, refresh plans, and notice behavior for operational workspaces', () => {
    expect(WORKSPACE_DESCRIPTORS.pretrade.dataGroups).toEqual([
      'trades',
      'positions',
      'reference',
    ])
    expect(WORKSPACE_DESCRIPTORS.pretrade.buildWindowNotices).toBeUndefined()

    expect(WORKSPACE_DESCRIPTORS.operations.dataGroups).toEqual([
      'trades',
      'deliveries',
      'operations',
      'admin',
    ])
    expect(WORKSPACE_DESCRIPTORS.operations.buildWindowNotices).toBeTypeOf('function')
    expect(WORKSPACE_DESCRIPTORS.operations.mutationRefreshPlans?.confirmation).toEqual({
      groups: ['core'],
      collections: ['trades', 'deliveries', 'confirmations', 'operationsWorkItems'],
    })

    expect(WORKSPACE_DESCRIPTORS.settlement.buildWindowNotices).toBeTypeOf('function')
    expect(WORKSPACE_DESCRIPTORS.settlement.mutationRefreshPlans?.payment).toEqual({
      groups: ['core'],
      collections: ['trades', 'invoices', 'payments', 'settlementWorkItems'],
    })

    expect(WORKSPACE_DESCRIPTORS.dashboard.buildWindowNotices).toBeUndefined()
  })
})
