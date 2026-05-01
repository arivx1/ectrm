import { createElement, type ComponentType } from 'react'

import type { useReferenceDataController } from '../../features/reference-data/useReferenceDataController'
import type { ReferenceTab } from '../../shared/models'
import type { DataSheetColumn } from '../../shared/ui/DataSheet'
import { ReferenceStatusBadge } from './ReferenceDataShared'

export type ReferenceDataTabProps = {
  controller: ReturnType<typeof useReferenceDataController>
  formatCommodityClass: (value: string) => string
  formatDate: (value: string | null | undefined) => string
}

export type ReferenceDataTabDefinition = {
  label: string
  tooltip: string
  editorTitle: string
  Directory: ComponentType<ReferenceDataTabProps>
  Editor: ComponentType<ReferenceDataTabProps>
  Toolbar?: ComponentType<ReferenceDataTabProps>
}

export const REFERENCE_TAB_ORDER: ReferenceTab[] = [
  'books',
  'commodities',
  'price-indices',
  'currencies',
  'units',
  'locations',
  'spatial-features',
  'assets',
  'counterparties',
  'portfolios',
]

export function createStatusColumn<Row extends { is_active: boolean }>(): DataSheetColumn<Row> {
  return {
    id: 'status',
    label: 'Status',
    width: '8rem',
    renderCell: (row) => createElement(ReferenceStatusBadge, { isActive: row.is_active }),
  }
}
