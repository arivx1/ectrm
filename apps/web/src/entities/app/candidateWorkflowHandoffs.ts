import type {
  InvoiceIssueCandidateRecord,
  TradeAttentionCandidateRecord,
} from './api'
import type { AppRouteHandoff, AppRouteHandoffFocus } from '../../shared/appRouteHandoff'
import type { ViewKey } from '../../shared/models'

export type CandidateWorkflowHandoff = {
  view: ViewKey
  label: string
  handoff: AppRouteHandoff
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function buildAssistantHandoff(args: {
  tradeId: string
  focus: AppRouteHandoffFocus
  label: string
  rationale: string
  filter?: string | null
  tradeInspectorTab?: AppRouteHandoff['tradeInspectorTab']
}): AppRouteHandoff {
  return {
    source: 'assistant',
    tradeId: args.tradeId,
    focus: args.focus,
    tradeInspectorTab: args.tradeInspectorTab ?? null,
    eventType: null,
    label: args.label,
    rationale: args.rationale,
    filter: args.filter ?? null,
    sourceRunId: null,
    sourceConversationId: null,
    sourceActionRequestId: null,
  }
}

function recommendedActionType(candidate: {
  recommended_action: Record<string, unknown> | null
}): string | null {
  return asString(candidate.recommended_action?.action_type)
}

function recommendedActionPayload(candidate: {
  recommended_action: Record<string, unknown> | null
}): Record<string, unknown> | null {
  return asRecord(candidate.recommended_action?.payload)
}

function supportingRecords(candidate: TradeAttentionCandidateRecord): Record<string, unknown> {
  return asRecord(candidate.supporting_records) ?? {}
}

function openWorkflowItems(candidate: TradeAttentionCandidateRecord): Array<Record<string, unknown>> {
  const items = supportingRecords(candidate).open_workflow_items
  return Array.isArray(items)
    ? items.flatMap((item) => {
        const record = asRecord(item)
        return record ? [record] : []
      })
    : []
}

function openWorkflowItemId(
  candidate: TradeAttentionCandidateRecord,
  workflowType: string,
): number | null {
  const matchingItem = openWorkflowItems(candidate).find(
    (item) => asString(item.workflow_type) === workflowType,
  )
  return asFiniteNumber(matchingItem?.item_id)
}

function invoiceFocus(args: {
  tradeId: string
  invoiceId: number | null
  invoiceNumber: string | null
  label: string
  rationale: string
}): CandidateWorkflowHandoff {
  const invoiceId = args.invoiceId
  const filter = invoiceId !== null ? String(invoiceId) : args.tradeId
  const focus =
    invoiceId !== null
      ? {
          type: 'invoice' as const,
          id: String(invoiceId),
          label: args.invoiceNumber ?? `Invoice ${invoiceId}`,
        }
      : {
          type: 'trade' as const,
          id: args.tradeId,
          label: args.tradeId,
        }

  return {
    view: 'settlement',
    label: args.label,
    handoff: buildAssistantHandoff({
      tradeId: args.tradeId,
      focus,
      label: args.label,
      rationale: args.rationale,
      filter,
    }),
  }
}

export function buildInvoiceIssueCandidateWorkflowHandoff(
  candidate: InvoiceIssueCandidateRecord,
): CandidateWorkflowHandoff {
  return {
    view: 'settlement',
    label: 'Open invoice ledger',
    handoff: buildAssistantHandoff({
      tradeId: candidate.trade_id,
      focus: {
        type: 'trade',
        id: candidate.trade_id,
        label: candidate.trade_id,
      },
      label: 'Open invoice ledger',
      rationale:
        candidate.readiness_status === 'READY'
          ? 'This trade is ready for invoice issuance in settlement.'
          : 'This trade still needs invoice readiness follow-through in settlement.',
      filter: candidate.trade_id,
    }),
  }
}

export function buildTradeAttentionCandidateWorkflowHandoff(
  candidate: TradeAttentionCandidateRecord,
): CandidateWorkflowHandoff {
  const candidateTypes = new Set(candidate.candidate_types)
  const actionType = recommendedActionType(candidate)
  const actionPayload = recommendedActionPayload(candidate)
  const supporting = supportingRecords(candidate)
  const candidateInvoiceId =
    asFiniteNumber(actionPayload?.invoice_id) ?? asFiniteNumber(supporting.candidate_invoice_id)
  const candidateInvoiceNumber = asString(supporting.candidate_invoice_number)
  const currentConfirmationId =
    asFiniteNumber(actionPayload?.confirmation_id) ?? asFiniteNumber(supporting.current_confirmation_id)

  if (candidateTypes.has('confirmation_backlog')) {
    return {
      view: 'operations',
      label: currentConfirmationId !== null ? 'Open confirmation' : 'Open confirmation queue',
      handoff: buildAssistantHandoff({
        tradeId: candidate.trade_id,
        focus: {
          type: 'trade',
          id: candidate.trade_id,
          label: candidate.trade_id,
        },
        label: currentConfirmationId !== null ? 'Open confirmation' : 'Open confirmation queue',
        rationale:
          actionType === 'issue_trade_confirmation'
            ? 'This trade already has a confirmation row that needs issue or follow-through.'
            : 'This trade still needs confirmation follow-through in the operations queue.',
        filter: currentConfirmationId !== null ? String(currentConfirmationId) : candidate.trade_id,
      }),
    }
  }

  if (candidateTypes.has('nomination_backlog')) {
    const workflowItemId = openWorkflowItemId(candidate, 'NOMINATION')
    return {
      view: 'scheduling',
      label: 'Open nomination queue',
      handoff: buildAssistantHandoff({
        tradeId: candidate.trade_id,
        focus:
          workflowItemId !== null
            ? {
                type: 'workflow_item',
                id: String(workflowItemId),
                label: `Nomination item ${workflowItemId}`,
              }
            : {
                type: 'trade',
                id: candidate.trade_id,
                label: candidate.trade_id,
              },
        label: 'Open nomination queue',
        rationale: 'This trade is nearing delivery and still needs nomination follow-through.',
        filter: workflowItemId !== null ? String(workflowItemId) : candidate.trade_id,
      }),
    }
  }

  if (candidateTypes.has('allocation_backlog')) {
    const workflowItemId = openWorkflowItemId(candidate, 'ALLOCATION')
    return {
      view: 'scheduling',
      label: 'Open allocation queue',
      handoff: buildAssistantHandoff({
        tradeId: candidate.trade_id,
        focus:
          workflowItemId !== null
            ? {
                type: 'workflow_item',
                id: String(workflowItemId),
                label: `Allocation item ${workflowItemId}`,
              }
            : {
                type: 'trade',
                id: candidate.trade_id,
                label: candidate.trade_id,
              },
        label: 'Open allocation queue',
        rationale: 'This trade still needs allocation follow-through after nomination evidence is in place.',
        filter: workflowItemId !== null ? String(workflowItemId) : candidate.trade_id,
      }),
    }
  }

  if (candidateTypes.has('invoice_backlog')) {
    return {
      view: 'settlement',
      label: 'Open invoice ledger',
      handoff: buildAssistantHandoff({
        tradeId: candidate.trade_id,
        focus: {
          type: 'trade',
          id: candidate.trade_id,
          label: candidate.trade_id,
        },
        label: 'Open invoice ledger',
        rationale: 'This trade still needs invoice follow-through before settlement can move cleanly.',
        filter: candidate.trade_id,
      }),
    }
  }

  if (candidateTypes.has('overdue_payment') || candidateTypes.has('payment_due')) {
    return invoiceFocus({
      tradeId: candidate.trade_id,
      invoiceId: candidateInvoiceId,
      invoiceNumber: candidateInvoiceNumber,
      label: 'Open payment queue',
      rationale: candidateTypes.has('overdue_payment')
        ? 'This trade has overdue cash follow-through that belongs in the payment queue.'
        : 'This trade has due cash follow-through that belongs in the payment queue.',
    })
  }

  if (candidateTypes.has('settlement_exception') || candidateTypes.has('pending_settlement')) {
    return invoiceFocus({
      tradeId: candidate.trade_id,
      invoiceId: candidateInvoiceId,
      invoiceNumber: candidateInvoiceNumber,
      label: candidateTypes.has('settlement_exception')
        ? 'Open settlement exception'
        : 'Open settlement follow-through',
      rationale: candidateTypes.has('settlement_exception')
        ? 'This trade needs settlement exception review before the desk stages another action.'
        : 'This trade still needs settlement follow-through across invoices, cash, or workflow items.',
    })
  }

  if (candidateTypes.has('stale_pricing') || candidateTypes.has('incomplete_ops_data')) {
    return {
      view: 'trades',
      label: candidateTypes.has('stale_pricing') ? 'Open trade pricing' : 'Open trade workbench',
      handoff: buildAssistantHandoff({
        tradeId: candidate.trade_id,
        focus: {
          type: 'trade',
          id: candidate.trade_id,
          label: candidate.trade_id,
        },
        label: candidateTypes.has('stale_pricing') ? 'Open trade pricing' : 'Open trade workbench',
        rationale: candidateTypes.has('stale_pricing')
          ? 'This trade still needs pricing follow-through in Trade Capture.'
          : 'This trade is missing operational fields that should be fixed from Trade Capture.',
        tradeInspectorTab: 'amend',
      }),
    }
  }

  return {
    view: 'trades',
    label: 'Open trade workbench',
    handoff: buildAssistantHandoff({
      tradeId: candidate.trade_id,
      focus: {
        type: 'trade',
        id: candidate.trade_id,
        label: candidate.trade_id,
      },
      label: 'Open trade workbench',
      rationale: 'Open the trade in context before widening back to the full workspace.',
    }),
  }
}
