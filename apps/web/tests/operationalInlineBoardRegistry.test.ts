import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { OperationalResourceDescriptor } from '../src/entities/app/api'
import {
  renderOperationalInlineBoard,
  resolveOperationalInlineBoardDefinition,
} from '../src/workspaces/operations/operationalInlineBoardRegistry'

const RESOURCE_DESCRIPTORS = [
  {
    resource_key: 'confirmations' as const,
    filters: ['trade_id'],
    sort_fields: ['created_at desc'],
    actions: ['create', 'update', 'issue', 'record_response'],
    surface: {
      title: 'Confirmation Ledger',
      description: 'Dedicated confirmation records drive draft and issue handling.',
      board_section: 'Trade Confirmation',
      primary_action: null,
      empty_state: null,
      summary_stats: [],
    },
  },
  {
    resource_key: 'work_items' as const,
    filters: ['queue'],
    sort_fields: ['attention_rank'],
    actions: ['create', 'update', 'book_underlying'],
    surface: {
      title: 'Operational Work Queue',
      description: 'The queue stays focused on ownership and due date decisions.',
      board_section: 'Critical Path',
      primary_action: null,
      empty_state: null,
      summary_stats: [],
    },
  },
  {
    resource_key: 'invoices' as const,
    filters: ['trade_id'],
    sort_fields: ['due_at asc'],
    actions: ['create', 'update'],
    surface: {
      title: 'Invoice Ledger',
      description: 'Dedicated invoice records drive issuance and settlement rollups.',
      board_section: 'Queue',
      primary_action: null,
      empty_state: null,
      summary_stats: [],
    },
  },
  {
    resource_key: 'payments' as const,
    filters: ['trade_id', 'invoice_id'],
    sort_fields: ['due_at asc'],
    actions: ['create', 'update'],
    surface: {
      title: 'Payment Ledger',
      description: 'Cash collection and settlement run from dedicated payment records.',
      board_section: 'Queue',
      primary_action: null,
      empty_state: null,
      summary_stats: [],
    },
  },
] satisfies OperationalResourceDescriptor[]

describe('operational inline board registry', () => {
  it('resolves inline boards against operational descriptors', () => {
    const definition = resolveOperationalInlineBoardDefinition('workflowQueue', RESOURCE_DESCRIPTORS)

    expect(definition.resourceKey).toBe('work_items')
    expect(definition.resourceTitle).toBe('Operational Work Queue')
    expect(definition.contractActions).toEqual(['create', 'update', 'book underlying'])
  })

  it('renders the workflow queue editor through the registry', () => {
    const markup = renderToStaticMarkup(
      renderOperationalInlineBoard(
        'workflowQueue',
        {
          authSession: null,
          activeTrades: [],
          items: [],
          managedConfirmationTradeIds: [],
          creationPendingTradeId: null,
          savingItemId: null,
          saveError: '',
          formatCommodityClass: (value) => value,
          formatDate: (value) => value ?? '—',
          formatDateOnly: (value) => value ?? '—',
          onCreateItem: vi.fn(async () => {}),
          onOpenTrade: vi.fn(),
          onBookUnderlyingTrade: vi.fn(async () => {}),
          onSaveItem: vi.fn(async () => {}),
        },
        'workflow-registry-test',
      ),
    )

    expect(markup).toContain('Sign in to edit workflow ownership, due dates, and statuses.')
    expect(markup).toContain('No open operational work queue')
  })

  it('renders the invoice ledger through the registry', () => {
    const markup = renderToStaticMarkup(
      renderOperationalInlineBoard(
        'invoiceLedger',
        {
          authSession: null,
          trades: [],
          invoices: [],
          invoiceWorkItems: [],
          saveError: '',
          savingKey: null,
          formatCommodityClass: (value) => value,
          formatDate: (value) => value ?? '—',
          formatDateOnly: (value) => value ?? '—',
          formatMoney: (value, currencyCode) => `${currencyCode ?? 'USD'} ${value ?? 0}`,
          onIssueInvoice: vi.fn(async () => {}),
          onOpenTrade: vi.fn(),
          onSaveInvoice: vi.fn(async () => {}),
        },
        'invoice-registry-test',
      ),
    )

    expect(markup).toContain('Sign in to issue, approve, and dispute settlement invoices.')
  })
})
