/* eslint-disable react-refresh/only-export-components -- This registry intentionally co-locates form descriptors, helpers, and renderers. */
import type { InputHTMLAttributes } from 'react'

import type { OperationalResourceKey } from '../../entities/app/api'
import type {
  DocumentIngestionRecord,
  Trade,
  TradeConfirmationRecord,
  TradeInvoiceRecord,
  TradePaymentRecord,
  TradeWorkflowItemRecord,
} from '../../shared/models'
import {
  OperationalInputField,
  OperationalFormGrid,
  OperationalSelectField,
  OperationalTextareaField,
} from './operationalFormPrimitives'

type OperationalFormOption = {
  label: string
  value: string
}

type OperationalResolvedInputField = {
  key: string
  kind: 'input'
  label: string
  disabled?: boolean
  inputType?: InputHTMLAttributes<HTMLInputElement>['type']
  max?: string
  min?: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  step?: string
  value: string
  wide?: boolean
}

type OperationalResolvedSelectField = {
  key: string
  kind: 'select'
  label: string
  disabled?: boolean
  onChange?: (value: string) => void
  options: OperationalFormOption[]
  value: string
  wide?: boolean
}

type OperationalResolvedTextareaField = {
  key: string
  kind: 'textarea'
  label: string
  disabled?: boolean
  onChange?: (value: string) => void
  placeholder?: string
  rows?: number
  value: string
  variant?: 'compact' | 'textarea'
  wide?: boolean
}

export type OperationalResolvedFormField =
  | OperationalResolvedInputField
  | OperationalResolvedSelectField
  | OperationalResolvedTextareaField

export type OperationalResolvedFormValidation = {
  message: string
  tone: 'error' | 'note'
}

export type OperationalResolvedForm = {
  action: string
  description: string
  fields: OperationalResolvedFormField[]
  helpText: string | null
  key: OperationalFormKey
  resourceKey: OperationalResourceKey
  title: string
  validations: OperationalResolvedFormValidation[]
}

type ConfirmationLedgerFormState = {
  comparisonWaiverNote: string
  confirmationNumber: string
  confirmedAt: string
  disputeReason: string
  issueMethod: string
  issueNote: string
  issueRecipient: string
  notes: string
  receivedAt: string
  responseMethod: string
  responseNote: string
  responseReference: string
  sentAt: string
  sourceDocumentId: string
  status: string
}

type WorkflowItemEditFormState = {
  dueAt: string
  notes: string
  owner: string
  status: string
}

type WorkflowItemCreateFormState = {
  dueAt: string
  notes: string
  owner: string
  tradeId: string
  workflowType: string
}

type InvoiceFormState = {
  billedQuantity: string
  disputeReason: string
  dueAt: string
  invoiceAmount: string
  invoiceCurrencyCode: string
  invoiceNumber: string
  issuedAt: string
  legNo: string
  notes: string
}

type PaymentFormState = {
  dueAt: string
  notes: string
  paymentAmount: string
  paymentCurrencyCode: string
  paymentReference: string
  receivedAt: string
  status: string
}

type ConfirmationLedgerFormContext = {
  candidateDocuments: DocumentIngestionRecord[]
  comparisonMismatchCount: number
  currentConfirmation: TradeConfirmationRecord | undefined
  draft: ConfirmationLedgerFormState
  hasAuthenticatedSession: boolean
  isSaving: boolean
  onSourceDocumentChange: (value: string) => void
  responseDisputeNeedsComment: boolean
  selectedDocumentMissing: boolean
  statusOptions: readonly string[]
  updateDraft: (patch: Partial<ConfirmationLedgerFormState>) => void
  workflowOwner: string
}

type WorkflowItemEditFormContext = {
  creditApprovalFreshnessSummary: string | null
  creditDecisionCommentRequired: boolean
  creditStatusLocked: boolean
  draft: WorkflowItemEditFormState
  hasAuthenticatedSession: boolean
  item: TradeWorkflowItemRecord
  lifecycleStatusLocked: boolean
  lockReason: string
  savingItemId: number | null
  statusOptions: readonly string[]
  updateDraft: (patch: Partial<WorkflowItemEditFormState>) => void
  workflowStatusManaged: boolean
}

type WorkflowItemCreateFormContext = {
  createWorkflowOptions: Array<{
    detail: string
    label: string
    value: string
  }>
  creationPending: boolean
  draft: WorkflowItemCreateFormState
  initialWorkflowTypeForTrade: (trade: Trade | null) => string
  selectedTrade: Trade | null
  trades: Trade[]
  updateDraft: (patch: Partial<WorkflowItemCreateFormState>) => void
}

type InvoiceCreateFormContext = {
  creditHoldActive: boolean
  creditHoldReason: string
  draft: InvoiceFormState
  isSaving: boolean
  trade: Trade
  updateDraft: (patch: Partial<InvoiceFormState>) => void
}

type InvoiceEditFormContext = {
  billedQuantityLabel: string | null
  creditHoldActive: boolean
  creditHoldReason: string
  draft: InvoiceFormState
  invoice: TradeInvoiceRecord
  isSaving: boolean
  scopeLabel: string
  updateDraft: (patch: Partial<InvoiceFormState>) => void
}

type PaymentCreateFormContext = {
  createPending: boolean
  draft: PaymentFormState
  formatMoney: (value: number | null, currencyCode?: string | null) => string
  invoice: TradeInvoiceRecord
  statusOptions: OperationalFormOption[]
  updateDraft: (patch: Partial<PaymentFormState>) => void
}

type PaymentEditFormContext = {
  draft: PaymentFormState
  payment: TradePaymentRecord
  pending: boolean
  statusOptions: OperationalFormOption[]
  updateDraft: (patch: Partial<PaymentFormState>) => void
}

type OperationalFormContextMap = {
  confirmationLedgerRecord: ConfirmationLedgerFormContext
  invoiceCreate: InvoiceCreateFormContext
  invoiceEdit: InvoiceEditFormContext
  paymentCreate: PaymentCreateFormContext
  paymentEdit: PaymentEditFormContext
  workflowItemCreate: WorkflowItemCreateFormContext
  workflowItemEdit: WorkflowItemEditFormContext
}

export type OperationalFormKey = keyof OperationalFormContextMap

type OperationalFormDefinition<K extends OperationalFormKey = OperationalFormKey> = {
  action: string
  description: string
  resourceKey: OperationalResourceKey
  resolve: (context: OperationalFormContextMap[K]) => {
    fields: OperationalResolvedFormField[]
    helpText?: string | null
    validations?: OperationalResolvedFormValidation[]
  }
  title: string
}

const confirmationIssueMethodOptions = ['EMAIL', 'EDI', 'PORTAL', 'MANUAL', 'OTHER'] as const
const confirmationResponseMethodOptions = ['EMAIL', 'EDI', 'PORTAL', 'PHONE', 'MANUAL', 'OTHER'] as const

function buildInvoiceCreateHelpText(trade: Trade): string {
  return trade.trade_nature === 'PHYSICAL'
    ? 'Leave amount blank to default from remaining actualized quantity. Provide a leg and/or billed quantity to target a specific delivery slice.'
    : 'Leave amount blank to default from the trade notional.'
}

function buildInvoiceEditHelpText(
  invoice: TradeInvoiceRecord,
  scopeLabel: string,
  billedQuantityLabel: string | null,
): string {
  return invoice.delivery_id
    ? `Scoped to ${scopeLabel.toLowerCase()}${billedQuantityLabel ? ` for ${billedQuantityLabel}` : ''}.`
    : 'Recorded as a trade-level adjustment invoice.'
}

const OPERATIONAL_FORM_REGISTRY: {
  [K in OperationalFormKey]: OperationalFormDefinition<K>
} = {
  confirmationLedgerRecord: {
    resourceKey: 'confirmations',
    action: 'update',
    title: 'Confirmation Record',
    description: 'Manage dispatch, receipt, and response details for the active confirmation record.',
    resolve: (context) => ({
      helpText: context.currentConfirmation
        ? context.currentConfirmation.comparison_status === 'MISMATCHED'
          ? 'Resolve the mismatches, record a waiver, or log a new version when a reissued confirmation arrives. Use the response actions to track receipt, confirmation, and disputes from the counterparty.'
          : 'Save the latest record in place, issue or reissue it outbound, and use the response actions to track receipt, confirmation, or dispute. Trade capture and booked economic amendments now auto-open a fresh draft version automatically.'
        : 'Manual confirmations can be logged directly, or linked to a verified TRADE_CONFIRMATION document from document intake.',
      validations: [
        ...(context.comparisonMismatchCount > 0
          ? [
              {
                tone: 'error' as const,
                message:
                  'Linked confirmation economics do not match the booked trade. Counterparty Confirmed stays blocked until the mismatches are resolved or a comparison waiver note is recorded.',
              },
            ]
          : []),
        ...(context.responseDisputeNeedsComment
          ? [
              {
                tone: 'error' as const,
                message: 'Counterparty dispute requires a dispute reason or response note before the response can be saved.',
              },
            ]
          : []),
      ],
      fields: [
        {
          key: 'confirmationNumber',
          kind: 'input',
          label: 'Confirmation Number',
          value: context.draft.confirmationNumber,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ confirmationNumber: value }),
        },
        {
          key: 'sourceDocumentId',
          kind: 'select',
          label: 'Source Document',
          value: context.draft.sourceDocumentId,
          disabled: context.isSaving || !context.hasAuthenticatedSession,
          onChange: (value) => context.onSourceDocumentChange(value),
          options: [
            { value: '', label: 'Manual / no linked document' },
            ...(context.selectedDocumentMissing
              ? [
                  {
                    value: context.draft.sourceDocumentId,
                    label:
                      context.currentConfirmation?.source_document_display_name ??
                      context.draft.sourceDocumentId,
                  },
                ]
              : []),
            ...context.candidateDocuments.map((document) => ({
              value: document.document_id,
              label: document.display_name,
            })),
          ],
        },
        {
          key: 'status',
          kind: 'select',
          label: 'Status',
          value: context.draft.status,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ status: value }),
          options: context.statusOptions.map((option) => ({
            value: option,
            label: option.replaceAll('_', ' '),
          })),
        },
        {
          key: 'sentAt',
          kind: 'input',
          label: 'Sent',
          inputType: 'date',
          value: context.draft.sentAt,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ sentAt: value }),
        },
        {
          key: 'confirmedAt',
          kind: 'input',
          label: 'Confirmed',
          inputType: 'date',
          value: context.draft.confirmedAt,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ confirmedAt: value }),
        },
        {
          key: 'receivedAt',
          kind: 'input',
          label: 'Received',
          inputType: 'date',
          value: context.draft.receivedAt,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ receivedAt: value }),
        },
        {
          key: 'workflowOwner',
          kind: 'input',
          label: 'Workflow Owner',
          value: context.workflowOwner,
          disabled: true,
        },
        {
          key: 'issueMethod',
          kind: 'select',
          label: 'Issue Method',
          value: context.draft.issueMethod,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ issueMethod: value }),
          options: confirmationIssueMethodOptions.map((option) => ({
            value: option,
            label: option,
          })),
        },
        {
          key: 'issueRecipient',
          kind: 'input',
          label: 'Recipient',
          value: context.draft.issueRecipient,
          disabled: context.isSaving,
          placeholder: 'email, portal user, or counterparty contact',
          onChange: (value) => context.updateDraft({ issueRecipient: value }),
        },
        {
          key: 'issueNote',
          kind: 'textarea',
          label: 'Latest Issue Note',
          value: context.draft.issueNote,
          disabled: context.isSaving,
          placeholder: 'Optional dispatch note for the latest issue or resend.',
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ issueNote: value }),
        },
        {
          key: 'responseMethod',
          kind: 'select',
          label: 'Response Method',
          value: context.draft.responseMethod,
          disabled: context.isSaving,
          onChange: (value) => context.updateDraft({ responseMethod: value }),
          options: confirmationResponseMethodOptions.map((option) => ({
            value: option,
            label: option,
          })),
        },
        {
          key: 'responseReference',
          kind: 'input',
          label: 'Response Reference',
          value: context.draft.responseReference,
          disabled: context.isSaving,
          placeholder: 'email thread, portal id, or call note ref',
          onChange: (value) => context.updateDraft({ responseReference: value }),
        },
        {
          key: 'responseNote',
          kind: 'textarea',
          label: 'Response Note',
          value: context.draft.responseNote,
          disabled: context.isSaving,
          placeholder: 'Counterparty acknowledgement, confirm text, or dispute context.',
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ responseNote: value }),
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.isSaving,
          rows: 3,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
        {
          key: 'disputeReason',
          kind: 'textarea',
          label: 'Dispute Reason',
          value: context.draft.disputeReason,
          disabled: context.isSaving,
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ disputeReason: value }),
        },
        {
          key: 'comparisonWaiverNote',
          kind: 'textarea',
          label: 'Comparison Waiver Note',
          value: context.draft.comparisonWaiverNote,
          disabled: context.isSaving,
          placeholder:
            'Required only when confirming a linked document that still has unresolved mismatches.',
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ comparisonWaiverNote: value }),
        },
      ],
    }),
  },
  workflowItemEdit: {
    resourceKey: 'work_items',
    action: 'update',
    title: 'Workflow Step',
    description: 'Edit the working state, ownership, and follow-up details for an operational handoff.',
    resolve: (context) => ({
      validations: [
        ...(context.lifecycleStatusLocked
          ? [{ tone: 'error' as const, message: context.lockReason }]
          : []),
        ...(context.workflowStatusManaged
          ? [
              {
                tone: 'note' as const,
                message:
                  'Confirmation status is managed from the Confirmation Ledger. Owner, due date, and notes can still be updated here.',
              },
            ]
          : []),
        ...(context.creditStatusLocked && context.hasAuthenticatedSession
          ? [
              {
                tone: 'note' as const,
                message:
                  'Only CREDIT_APPROVER, OPS_ADMIN, or ADMIN sessions can change credit approval status.',
              },
            ]
          : []),
        ...(context.item.workflow_type === 'CREDIT_APPROVAL' && context.creditApprovalFreshnessSummary
          ? [
              {
                tone: 'error' as const,
                message: `Credit approval is blocked until fresh credit data is loaded: ${context.creditApprovalFreshnessSummary}`,
              },
            ]
          : []),
        ...(context.creditDecisionCommentRequired
          ? [{ tone: 'error' as const, message: 'Approval and rejection decisions require a comment in notes.' }]
          : []),
      ],
      fields: [
        {
          key: 'status',
          kind: 'select',
          label: 'Status',
          value: context.draft.status,
          disabled:
            context.savingItemId === context.item.item_id ||
            context.lifecycleStatusLocked ||
            context.creditStatusLocked ||
            context.workflowStatusManaged,
          onChange: (value) => context.updateDraft({ status: value }),
          options: context.statusOptions.map((option) => ({
            value: option,
            label: option.replaceAll('_', ' '),
          })),
        },
        {
          key: 'owner',
          kind: 'input',
          label: 'Owner',
          value: context.draft.owner,
          disabled: context.savingItemId === context.item.item_id,
          placeholder: 'Unassigned',
          onChange: (value) => context.updateDraft({ owner: value }),
        },
        {
          key: 'dueAt',
          kind: 'input',
          label: 'Due',
          inputType: 'date',
          value: context.draft.dueAt,
          disabled: context.savingItemId === context.item.item_id,
          onChange: (value) => context.updateDraft({ dueAt: value }),
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.savingItemId === context.item.item_id,
          placeholder:
            context.item.workflow_type === 'OPTION_SETTLEMENT'
              ? 'Track the resulting underlying booking or settlement handoff.'
              : context.item.workflow_type === 'ACTUALIZATION'
                ? 'Track meter tickets, terminal statements, or execution follow-up.'
                : 'Add an operational handoff note or settlement comment.',
          rows: 1,
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
      ],
      helpText: null,
    }),
  },
  workflowItemCreate: {
    resourceKey: 'work_items',
    action: 'create',
    title: 'Manual Workflow Item',
    description: 'Open an operational handoff that the projection layer did not create automatically.',
    resolve: (context) => ({
      helpText: context.selectedTrade
        ? `${context.selectedTrade.commodity} • ${context.selectedTrade.counterparty ?? 'Counterparty TBD'} • ${context.selectedTrade.book}`
        : 'Select a trade to open a manual work item.',
      fields: [
        {
          key: 'tradeId',
          kind: 'select',
          label: 'Trade',
          value: context.draft.tradeId,
          disabled: context.creationPending,
            onChange: (value) => {
              const nextTrade = context.trades.find((trade) => trade.trade_id === value) ?? context.trades[0] ?? null
            const nextWorkflowType = context.initialWorkflowTypeForTrade(nextTrade)
            context.updateDraft({ tradeId: value, workflowType: nextWorkflowType })
          },
          options: context.trades.map((trade) => ({
            value: trade.trade_id,
            label: `${trade.trade_id} • ${trade.commodity} • ${trade.book}`,
          })),
        },
        {
          key: 'workflowType',
          kind: 'select',
          label: 'Workflow Type',
          value: context.draft.workflowType,
          disabled: context.creationPending || context.createWorkflowOptions.length === 0,
          onChange: (value) => context.updateDraft({ workflowType: value }),
          options: context.createWorkflowOptions.map((option) => ({
            value: option.value,
            label: option.label,
          })),
        },
        {
          key: 'owner',
          kind: 'input',
          label: 'Owner',
          value: context.draft.owner,
          disabled: context.creationPending,
          placeholder: 'Unassigned',
          onChange: (value) => context.updateDraft({ owner: value }),
        },
        {
          key: 'dueAt',
          kind: 'input',
          label: 'Due',
          inputType: 'date',
          value: context.draft.dueAt,
          disabled: context.creationPending,
          onChange: (value) => context.updateDraft({ dueAt: value }),
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.creationPending,
          placeholder:
            context.createWorkflowOptions.find((option) => option.value === context.draft.workflowType)?.detail ??
            'Describe why this handoff needs to exist and what the desk should do next.',
          rows: 1,
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
      ],
      validations: [],
    }),
  },
  invoiceCreate: {
    resourceKey: 'invoices',
    action: 'create',
    title: 'Issue Invoice',
    description: 'Create a new invoice record for the selected trade or delivery slice.',
    resolve: (context) => ({
      helpText: buildInvoiceCreateHelpText(context.trade),
      validations: context.creditHoldActive
        ? [{ tone: 'error', message: context.creditHoldReason }]
        : [],
      fields: [
        {
          key: 'invoiceNumber',
          kind: 'input',
          label: 'Invoice Number',
          value: context.draft.invoiceNumber,
          disabled: context.isSaving || context.creditHoldActive,
          placeholder: 'Auto-sequence',
          onChange: (value) => context.updateDraft({ invoiceNumber: value }),
        },
        {
          key: 'legNo',
          kind: 'input',
          label: 'Leg',
          inputType: 'number',
          min: '1',
          step: '1',
          value: context.draft.legNo,
          disabled: context.isSaving || context.creditHoldActive,
          placeholder: 'Optional',
          onChange: (value) => context.updateDraft({ legNo: value }),
        },
        {
          key: 'billedQuantity',
          kind: 'input',
          label: 'Billed Quantity',
          inputType: 'number',
          min: '0',
          step: '0.000001',
          value: context.draft.billedQuantity,
          disabled: context.isSaving || context.creditHoldActive,
          placeholder: 'Default remaining actualized',
          onChange: (value) => context.updateDraft({ billedQuantity: value }),
        },
        {
          key: 'invoiceCurrencyCode',
          kind: 'input',
          label: 'Currency',
          value: context.draft.invoiceCurrencyCode,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ invoiceCurrencyCode: value }),
        },
        {
          key: 'invoiceAmount',
          kind: 'input',
          label: 'Amount',
          inputType: 'number',
          min: '0',
          step: '0.01',
          value: context.draft.invoiceAmount,
          disabled: context.isSaving || context.creditHoldActive,
          placeholder: 'Default from settlement basis',
          onChange: (value) => context.updateDraft({ invoiceAmount: value }),
        },
        {
          key: 'issuedAt',
          kind: 'input',
          label: 'Issued',
          inputType: 'date',
          value: context.draft.issuedAt,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ issuedAt: value }),
        },
        {
          key: 'dueAt',
          kind: 'input',
          label: 'Due',
          inputType: 'date',
          value: context.draft.dueAt,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ dueAt: value }),
        },
        {
          key: 'settlementStatus',
          kind: 'input',
          label: 'Settlement',
          value: context.trade.settlement_status.replaceAll('_', ' '),
          disabled: true,
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.isSaving || context.creditHoldActive,
          rows: 3,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
      ],
    }),
  },
  invoiceEdit: {
    resourceKey: 'invoices',
    action: 'update',
    title: 'Edit Invoice',
    description: 'Maintain the issued invoice record, payment state, and dispute details.',
    resolve: (context) => ({
      helpText: buildInvoiceEditHelpText(context.invoice, context.scopeLabel, context.billedQuantityLabel),
      validations: context.creditHoldActive
        ? [{ tone: 'error', message: context.creditHoldReason }]
        : [],
      fields: [
        {
          key: 'invoiceNumber',
          kind: 'input',
          label: 'Invoice Number',
          value: context.draft.invoiceNumber,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ invoiceNumber: value }),
        },
        {
          key: 'scope',
          kind: 'input',
          label: 'Scope',
          value: context.scopeLabel,
          disabled: true,
        },
        {
          key: 'quantity',
          kind: 'input',
          label: 'Quantity',
          value: context.billedQuantityLabel ?? 'Manual amount',
          disabled: true,
        },
        {
          key: 'invoiceCurrencyCode',
          kind: 'input',
          label: 'Currency',
          value: context.draft.invoiceCurrencyCode,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ invoiceCurrencyCode: value }),
        },
        {
          key: 'invoiceAmount',
          kind: 'input',
          label: 'Amount',
          inputType: 'number',
          min: '0',
          step: '0.01',
          value: context.draft.invoiceAmount,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ invoiceAmount: value }),
        },
        {
          key: 'issuedAt',
          kind: 'input',
          label: 'Issued',
          inputType: 'date',
          value: context.draft.issuedAt,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ issuedAt: value }),
        },
        {
          key: 'dueAt',
          kind: 'input',
          label: 'Due',
          inputType: 'date',
          value: context.draft.dueAt,
          disabled: context.isSaving || context.creditHoldActive,
          onChange: (value) => context.updateDraft({ dueAt: value }),
        },
        {
          key: 'paymentStatus',
          kind: 'input',
          label: 'Payment',
          value: context.invoice.payment_status.replaceAll('_', ' '),
          disabled: true,
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.isSaving || context.creditHoldActive,
          rows: 3,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
        {
          key: 'disputeReason',
          kind: 'textarea',
          label: 'Dispute Reason',
          value: context.draft.disputeReason,
          disabled: context.isSaving || context.creditHoldActive,
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ disputeReason: value }),
        },
      ],
    }),
  },
  paymentCreate: {
    resourceKey: 'payments',
    action: 'create',
    title: 'Add Payment',
    description: 'Create the next payment record against an issued invoice.',
    resolve: (context) => ({
      helpText: `Invoice ${context.invoice.invoice_number} for ${context.formatMoney(
        context.invoice.invoice_amount,
        context.invoice.invoice_currency_code,
      )}. Open trade payment status is ${context.invoice.payment_status.replaceAll('_', ' ')}.`,
      validations: [],
      fields: [
        {
          key: 'paymentReference',
          kind: 'input',
          label: 'New Reference',
          value: context.draft.paymentReference,
          disabled: context.createPending,
          onChange: (value) => context.updateDraft({ paymentReference: value }),
        },
        {
          key: 'paymentCurrencyCode',
          kind: 'input',
          label: 'Currency',
          value: context.draft.paymentCurrencyCode,
          disabled: context.createPending,
          onChange: (value) => context.updateDraft({ paymentCurrencyCode: value }),
        },
        {
          key: 'paymentAmount',
          kind: 'input',
          label: 'Amount',
          inputType: 'number',
          min: '0',
          step: '0.01',
          value: context.draft.paymentAmount,
          disabled: context.createPending,
          onChange: (value) => context.updateDraft({ paymentAmount: value }),
        },
        {
          key: 'status',
          kind: 'select',
          label: 'Status',
          value: context.draft.status,
          disabled: context.createPending,
          onChange: (value) => context.updateDraft({ status: value }),
          options: context.statusOptions,
        },
        {
          key: 'dueAt',
          kind: 'input',
          label: 'Due',
          inputType: 'date',
          value: context.draft.dueAt,
          disabled: context.createPending,
          onChange: (value) => context.updateDraft({ dueAt: value }),
        },
        {
          key: 'receivedAt',
          kind: 'input',
          label: 'Received',
          inputType: 'date',
          value: context.draft.receivedAt,
          disabled: context.createPending,
          onChange: (value) => context.updateDraft({ receivedAt: value }),
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.createPending,
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
      ],
    }),
  },
  paymentEdit: {
    resourceKey: 'payments',
    action: 'update',
    title: 'Edit Payment',
    description: 'Maintain the cash record as funds are scheduled, received, and reconciled.',
    resolve: (context) => ({
      helpText: null,
      validations: [],
      fields: [
        {
          key: 'paymentReference',
          kind: 'input',
          label: 'Reference',
          value: context.draft.paymentReference,
          disabled: context.pending,
          onChange: (value) => context.updateDraft({ paymentReference: value }),
        },
        {
          key: 'paymentCurrencyCode',
          kind: 'input',
          label: 'Currency',
          value: context.draft.paymentCurrencyCode,
          disabled: context.pending,
          onChange: (value) => context.updateDraft({ paymentCurrencyCode: value }),
        },
        {
          key: 'paymentAmount',
          kind: 'input',
          label: 'Amount',
          inputType: 'number',
          min: '0',
          step: '0.01',
          value: context.draft.paymentAmount,
          disabled: context.pending,
          onChange: (value) => context.updateDraft({ paymentAmount: value }),
        },
        {
          key: 'status',
          kind: 'select',
          label: 'Status',
          value: context.draft.status,
          disabled: context.pending,
          onChange: (value) => context.updateDraft({ status: value }),
          options: context.statusOptions,
        },
        {
          key: 'dueAt',
          kind: 'input',
          label: 'Due',
          inputType: 'date',
          value: context.draft.dueAt,
          disabled: context.pending,
          onChange: (value) => context.updateDraft({ dueAt: value }),
        },
        {
          key: 'receivedAt',
          kind: 'input',
          label: 'Received',
          inputType: 'date',
          value: context.draft.receivedAt,
          disabled: context.pending,
          onChange: (value) => context.updateDraft({ receivedAt: value }),
        },
        {
          key: 'notes',
          kind: 'textarea',
          label: 'Notes',
          value: context.draft.notes,
          disabled: context.pending,
          rows: 2,
          variant: 'compact',
          wide: true,
          onChange: (value) => context.updateDraft({ notes: value }),
        },
      ],
    }),
  },
}

export function resolveOperationalFormDefinition<K extends OperationalFormKey>(
  key: K,
  context: OperationalFormContextMap[K],
): OperationalResolvedForm {
  const definition = OPERATIONAL_FORM_REGISTRY[key]
  const resolved = definition.resolve(context)

  return {
    key,
    action: definition.action,
    description: definition.description,
    fields: resolved.fields,
    helpText: resolved.helpText ?? null,
    resourceKey: definition.resourceKey,
    title: definition.title,
    validations: resolved.validations ?? [],
  }
}

type OperationalDescriptorFormProps = {
  className?: string
  form: OperationalResolvedForm
}

export function OperationalDescriptorForm({
  className,
  form,
}: OperationalDescriptorFormProps) {
  return (
    <OperationalFormGrid className={className}>
      {form.fields.map((field) => {
        if (field.kind === 'input') {
          return (
            <OperationalInputField
              key={field.key}
              label={field.label}
              disabled={field.disabled}
              max={field.max}
              min={field.min}
              onChange={field.onChange ? (event) => field.onChange?.(event.target.value) : undefined}
              placeholder={field.placeholder}
              readOnly={field.readOnly}
              step={field.step}
              type={field.inputType}
              value={field.value}
              wide={field.wide}
            />
          )
        }

        if (field.kind === 'select') {
          return (
            <OperationalSelectField
              key={field.key}
              label={field.label}
              disabled={field.disabled}
              onChange={field.onChange ? (event) => field.onChange?.(event.target.value) : undefined}
              value={field.value}
              wide={field.wide}
            >
              {field.options.map((option) => (
                <option key={`${field.key}-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </OperationalSelectField>
          )
        }

        return (
          <OperationalTextareaField
            key={field.key}
            label={field.label}
            disabled={field.disabled}
            onChange={field.onChange ? (event) => field.onChange?.(event.target.value) : undefined}
            placeholder={field.placeholder}
            rows={field.rows}
            value={field.value}
            variant={field.variant}
            wide={field.wide}
          />
        )
      })}
    </OperationalFormGrid>
  )
}

type OperationalDescriptorFormFeedbackProps = {
  form: OperationalResolvedForm
}

export function OperationalDescriptorFormFeedback({
  form,
}: OperationalDescriptorFormFeedbackProps) {
  if (form.validations.length === 0) {
    return null
  }

  return (
    <>
      {form.validations.map((validation) => (
        <p
          key={`${form.key}-${validation.tone}-${validation.message}`}
          className={validation.tone === 'error' ? 'field-error' : 'workflow-editor-note'}
        >
          {validation.message}
        </p>
      ))}
    </>
  )
}
