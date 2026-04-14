/* eslint-disable react-refresh/only-export-components -- This registry intentionally co-locates action descriptors, gating rules, and renderers. */
import type {
  OperationalResourceDescriptor,
  OperationalResourceSurfaceAction,
} from '../../entities/app/api'
import type {
  OperationalRowActionStateRecord,
  TradeConfirmationRecord,
  TradeWorkflowItemRecord,
} from '../../shared/models'
import { OperationalFormButtonRow } from './operationalFormPrimitives'

type OperationalActionVariant = 'ghost' | 'primary' | 'secondary'

export type OperationalResolvedFormAction = {
  detail: string | null
  disabled: boolean
  disabledReason: string | null
  key: string
  label: string
  onSelect: () => void | Promise<void>
  variant: OperationalActionVariant
}

export type OperationalResolvedFormActionSet = {
  actions: OperationalResolvedFormAction[]
  key: OperationalFormActionSetKey
}

type ConfirmationLedgerActionContext = {
  actionStates: OperationalRowActionStateRecord[]
  currentConfirmation: Pick<TradeConfirmationRecord, 'issue_count' | 'status'> | undefined
  hasAuthenticatedSession: boolean
  isSaving: boolean
  onCounterpartyConfirmed: () => void | Promise<void>
  onCounterpartyDisputed: () => void | Promise<void>
  onCreateVersion: () => void | Promise<void>
  onIssue: () => void | Promise<void>
  onMarkReceived: () => void | Promise<void>
  onOpenTrade: () => void
  onSaveCurrent: () => void | Promise<void>
  responseDisputeBlocked: boolean
  responseDisputeNeedsComment: boolean
  saveBlockedByComparison: boolean
  savePayloadEmpty: boolean
}

type WorkflowItemActionContext = {
  actionStates: OperationalRowActionStateRecord[]
  approvePayloadEmpty: boolean
  creditApprovalAuthorized: boolean
  creditDecisionCommentRequired: boolean
  creditDecisionNoteAvailable: boolean
  currentUserId: string | null
  hasAuthenticatedSession: boolean
  isSaving: boolean
  item: Pick<TradeWorkflowItemRecord, 'linked_trade_id' | 'workflow_type'>
  itemOwner: string | null
  onApprove: () => void | Promise<void>
  onAssignSelf: () => void | Promise<void>
  onBookUnderlying: () => void | Promise<void>
  onOpenUnderlying: () => void
  onReject: () => void | Promise<void>
  onSave: () => void | Promise<void>
  rejectPayloadEmpty: boolean
  savePayloadEmpty: boolean
}

type WorkflowCreateActionContext = {
  creationPending: boolean
  hasAuthenticatedSession: boolean
  onCreate: () => void | Promise<void>
  tradeId: string
  workflowType: string
}

type InvoiceCreateActionContext = {
  creditHoldActive: boolean
  hasAuthenticatedSession: boolean
  hasExistingInvoices: boolean
  isCreating: boolean
  onIssue: () => void | Promise<void>
  onOpenTrade: () => void
}

type InvoiceEditActionContext = {
  actionStates: OperationalRowActionStateRecord[]
  approvePayloadEmpty: boolean
  disputeBlocked: boolean
  disputePayloadEmpty: boolean
  hasAuthenticatedSession: boolean
  isSaving: boolean
  onApprove: () => void | Promise<void>
  onDispute: () => void | Promise<void>
  onSave: () => void | Promise<void>
  savePayloadEmpty: boolean
}

type PaymentCreateActionContext = {
  createPending: boolean
  hasAuthenticatedSession: boolean
  onCreate: () => void | Promise<void>
  onOpenTrade: () => void
}

type PaymentEditActionContext = {
  actionStates: OperationalRowActionStateRecord[]
  hasAuthenticatedSession: boolean
  onMarkPaid: () => void | Promise<void>
  onSave: () => void | Promise<void>
  pending: boolean
  savePayloadEmpty: boolean
}

type OperationalFormActionContextMap = {
  confirmationLedgerActions: ConfirmationLedgerActionContext
  invoiceCreateActions: InvoiceCreateActionContext
  invoiceEditActions: InvoiceEditActionContext
  paymentCreateActions: PaymentCreateActionContext
  paymentEditActions: PaymentEditActionContext
  workflowCreateActions: WorkflowCreateActionContext
  workflowItemActions: WorkflowItemActionContext
}

export type OperationalFormActionSetKey = keyof OperationalFormActionContextMap

type OperationalFormActionSetDefinition<K extends OperationalFormActionSetKey = OperationalFormActionSetKey> = {
  resolve: (
    context: OperationalFormActionContextMap[K],
    resourceDescriptor?: OperationalResourceDescriptor | null,
  ) => Array<OperationalResolvedFormAction | null>
}

type BuildResolvedActionOptions = {
  actionStates?: OperationalRowActionStateRecord[]
  contractKey?: string | null
  defaultLabel: string
  disabled: boolean
  disabledReason?: string | null
  key: string
  label?: string
  missingComment?: boolean
  onSelect: () => void | Promise<void>
  permissionDenied?: boolean
  resourceDescriptor?: OperationalResourceDescriptor | null
  variant: OperationalActionVariant
}

function buttonClassName(variant: OperationalActionVariant): string {
  if (variant === 'primary') {
    return 'button button-primary'
  }
  if (variant === 'secondary') {
    return 'button button-secondary'
  }
  return 'button button-ghost'
}

function resolveOperationalSurfaceAction(
  resourceDescriptor: OperationalResourceDescriptor | null | undefined,
  actionKey: string,
): OperationalResourceSurfaceAction | null {
  return resourceDescriptor?.surface?.actions?.find((action) => action.key === actionKey) ?? null
}

function hasOperationalSurfaceContracts(
  resourceDescriptor: OperationalResourceDescriptor | null | undefined,
): boolean {
  return (resourceDescriptor?.surface?.actions?.length ?? 0) > 0
}

function normalizeMessage(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function resolveOperationalRowActionState(
  actionStates: OperationalRowActionStateRecord[] | undefined,
  actionKey: string,
): OperationalRowActionStateRecord | null {
  return actionStates?.find((action) => action.key === actionKey) ?? null
}

function buildResolvedAction({
  actionStates,
  contractKey,
  defaultLabel,
  disabled,
  disabledReason,
  key,
  label,
  missingComment = false,
  onSelect,
  permissionDenied = false,
  resourceDescriptor,
  variant,
}: BuildResolvedActionOptions): OperationalResolvedFormAction | null {
  const contract = contractKey ? resolveOperationalSurfaceAction(resourceDescriptor, contractKey) : null
  if (contractKey && hasOperationalSurfaceContracts(resourceDescriptor) && contract === null) {
    return null
  }
  const rowState = resolveOperationalRowActionState(actionStates, key)
  const rowStateDisabled = rowState?.available === false

  return {
    key,
    label: label ?? rowState?.label ?? contract?.label ?? defaultLabel,
    variant,
    disabled: disabled || rowStateDisabled,
    onSelect,
    detail: contract?.detail ?? null,
    disabledReason:
      normalizeMessage(disabledReason) ??
      normalizeMessage(rowState?.blocked_reason) ??
      (permissionDenied ? normalizeMessage(contract?.permission_message) : null) ??
      (missingComment ? normalizeMessage(contract?.comment_hint) : null),
  }
}

export function resolveOperationalResourcePermissionMessage(
  resourceDescriptor?: OperationalResourceDescriptor | null,
): string | null {
  return (
    (resourceDescriptor?.surface?.actions ?? [])
      .map((action) => normalizeMessage(action.permission_message))
      .find((value): value is string => value !== null) ?? null
  )
}

const OPERATIONAL_FORM_ACTION_REGISTRY: {
  [K in OperationalFormActionSetKey]: OperationalFormActionSetDefinition<K>
} = {
  confirmationLedgerActions: {
    resolve: (context, resourceDescriptor) => {
      if (!context.currentConfirmation) {
        return [
          buildResolvedAction({
            actionStates: context.actionStates,
            key: 'create',
            contractKey: 'create',
            defaultLabel: 'Create Confirmation',
            label: context.isSaving ? 'Creating...' : undefined,
            variant: 'primary',
            disabled: !context.hasAuthenticatedSession || context.isSaving,
            permissionDenied: !context.hasAuthenticatedSession,
            onSelect: context.onCreateVersion,
            resourceDescriptor,
          }),
          buildResolvedAction({
            key: 'openTrade',
            defaultLabel: 'Open Trade',
            variant: 'ghost',
            disabled: false,
            onSelect: context.onOpenTrade,
          }),
        ]
      }

      return [
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'issue',
          contractKey: 'issue',
          defaultLabel: 'Issue Confirmation',
          label: context.isSaving ? 'Issuing...' : undefined,
          variant: 'primary',
          disabled: !context.hasAuthenticatedSession || context.isSaving,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onIssue,
          resourceDescriptor,
        }),
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'received',
          contractKey: 'received',
          defaultLabel: 'Mark Received',
          variant: 'secondary',
          disabled: !context.hasAuthenticatedSession || context.isSaving,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onMarkReceived,
          resourceDescriptor,
        }),
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'confirmed',
          contractKey: 'confirmed',
          defaultLabel: 'Counterparty Confirmed',
          variant: 'secondary',
          disabled: !context.hasAuthenticatedSession || context.isSaving,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onCounterpartyConfirmed,
          resourceDescriptor,
        }),
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'disputed',
          contractKey: 'disputed',
          defaultLabel: 'Counterparty Disputed',
          variant: 'secondary',
          disabled:
            !context.hasAuthenticatedSession ||
            context.isSaving ||
            context.responseDisputeBlocked,
          permissionDenied: !context.hasAuthenticatedSession,
          missingComment: context.responseDisputeNeedsComment,
          onSelect: context.onCounterpartyDisputed,
          resourceDescriptor,
        }),
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'save',
          contractKey: 'save',
          defaultLabel: 'Save Current',
          label: context.isSaving ? 'Saving...' : undefined,
          variant: 'ghost',
          disabled:
            !context.hasAuthenticatedSession ||
            context.isSaving ||
            context.saveBlockedByComparison ||
            context.savePayloadEmpty,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onSaveCurrent,
          resourceDescriptor,
        }),
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'newVersion',
          contractKey: 'newVersion',
          defaultLabel: 'Log New Version',
          variant: 'primary',
          disabled: !context.hasAuthenticatedSession || context.isSaving,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onCreateVersion,
          resourceDescriptor,
        }),
        buildResolvedAction({
          key: 'openTrade',
          defaultLabel: 'Open Trade',
          variant: 'ghost',
          disabled: false,
          onSelect: context.onOpenTrade,
        }),
      ]
    },
  },
  workflowItemActions: {
    resolve: (context, resourceDescriptor) => {
      const actions: Array<OperationalResolvedFormAction | null> = []
      const bookUnderlyingState = resolveOperationalRowActionState(context.actionStates, 'bookUnderlying')

      if (bookUnderlyingState) {
        actions.push(
          buildResolvedAction({
            actionStates: context.actionStates,
            key: 'bookUnderlying',
            contractKey: 'bookUnderlying',
            defaultLabel: 'Book Underlying',
            label: context.isSaving
              ? context.item.linked_trade_id
                ? 'Finishing...'
                : 'Booking...'
              : undefined,
            variant: 'secondary',
            disabled: !context.hasAuthenticatedSession || context.isSaving,
            permissionDenied: !context.hasAuthenticatedSession,
            onSelect: context.onBookUnderlying,
            resourceDescriptor,
          }),
        )
      }

      if (context.item.workflow_type === 'OPTION_SETTLEMENT' && context.item.linked_trade_id) {
        actions.push(
          buildResolvedAction({
            key: 'openUnderlying',
            defaultLabel: 'Open Underlying',
            variant: 'ghost',
            disabled: context.isSaving,
            onSelect: context.onOpenUnderlying,
          }),
        )
      }

      actions.push(
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'assignSelf',
          contractKey: 'assignSelf',
          defaultLabel: 'Assign Me',
          variant: 'ghost',
          disabled:
            !context.hasAuthenticatedSession ||
            context.currentUserId === (context.itemOwner ?? '') ||
            context.isSaving,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onAssignSelf,
          resourceDescriptor,
        }),
        buildResolvedAction({
          actionStates: context.actionStates,
          key: 'save',
          contractKey: 'save',
          defaultLabel: 'Save',
          label: context.isSaving ? 'Saving…' : undefined,
          variant: 'secondary',
          disabled:
            !context.hasAuthenticatedSession ||
            context.isSaving ||
            context.savePayloadEmpty ||
            context.creditDecisionCommentRequired,
          permissionDenied: !context.hasAuthenticatedSession,
          onSelect: context.onSave,
          resourceDescriptor,
        }),
      )

      if (resolveOperationalRowActionState(context.actionStates, 'approve') || resolveOperationalRowActionState(context.actionStates, 'reject')) {
        actions.push(
          buildResolvedAction({
            actionStates: context.actionStates,
            key: 'approve',
            contractKey: 'approve',
            defaultLabel: 'Approve With Comment',
            variant: 'secondary',
            disabled:
              !context.hasAuthenticatedSession ||
              !context.creditApprovalAuthorized ||
              context.isSaving ||
              context.approvePayloadEmpty ||
              !context.creditDecisionNoteAvailable,
            permissionDenied: !context.hasAuthenticatedSession || !context.creditApprovalAuthorized,
            missingComment: !context.creditDecisionNoteAvailable,
            onSelect: context.onApprove,
            resourceDescriptor,
          }),
          buildResolvedAction({
            actionStates: context.actionStates,
            key: 'reject',
            contractKey: 'reject',
            defaultLabel: 'Reject With Comment',
            variant: 'secondary',
            disabled:
              !context.hasAuthenticatedSession ||
              !context.creditApprovalAuthorized ||
              context.isSaving ||
              context.rejectPayloadEmpty ||
              !context.creditDecisionNoteAvailable,
            permissionDenied: !context.hasAuthenticatedSession || !context.creditApprovalAuthorized,
            missingComment: !context.creditDecisionNoteAvailable,
            onSelect: context.onReject,
            resourceDescriptor,
          }),
        )
      }

      return actions
    },
  },
  workflowCreateActions: {
    resolve: (context, resourceDescriptor) => [
      buildResolvedAction({
        key: 'create',
        contractKey: 'create',
        defaultLabel: 'Create Work Item',
        label: context.creationPending ? 'Creating…' : undefined,
        variant: 'secondary',
        disabled:
          !context.hasAuthenticatedSession ||
          !context.tradeId ||
          !context.workflowType ||
          context.creationPending,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onCreate,
        resourceDescriptor,
      }),
    ],
  },
  invoiceCreateActions: {
    resolve: (context, resourceDescriptor) => [
      buildResolvedAction({
        key: 'issue',
        contractKey: 'issue',
        defaultLabel: 'Issue Invoice',
        label: context.isCreating
          ? 'Issuing...'
          : context.hasExistingInvoices
            ? 'Issue Additional Invoice'
            : 'Issue First Invoice',
        variant: 'primary',
        disabled:
          !context.hasAuthenticatedSession ||
          context.isCreating ||
          context.creditHoldActive,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onIssue,
        resourceDescriptor,
      }),
      buildResolvedAction({
        key: 'openTrade',
        defaultLabel: 'Open Trade',
        variant: 'ghost',
        disabled: false,
        onSelect: context.onOpenTrade,
      }),
    ],
  },
  invoiceEditActions: {
    resolve: (context, resourceDescriptor) => [
      buildResolvedAction({
        actionStates: context.actionStates,
        key: 'save',
        contractKey: 'save',
        defaultLabel: 'Save',
        label: context.isSaving ? 'Saving...' : undefined,
        variant: 'ghost',
        disabled:
          !context.hasAuthenticatedSession ||
          context.isSaving ||
          context.savePayloadEmpty,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onSave,
        resourceDescriptor,
      }),
      buildResolvedAction({
        actionStates: context.actionStates,
        key: 'approve',
        contractKey: 'approve',
        defaultLabel: 'Approve',
        variant: 'secondary',
        disabled:
          !context.hasAuthenticatedSession ||
          context.isSaving ||
          context.approvePayloadEmpty,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onApprove,
        resourceDescriptor,
      }),
      buildResolvedAction({
        actionStates: context.actionStates,
        key: 'dispute',
        contractKey: 'dispute',
        defaultLabel: 'Mark Disputed',
        variant: 'secondary',
        disabled:
          !context.hasAuthenticatedSession ||
          context.isSaving ||
          context.disputeBlocked ||
          context.disputePayloadEmpty,
        permissionDenied: !context.hasAuthenticatedSession,
        missingComment: context.disputeBlocked,
        onSelect: context.onDispute,
        resourceDescriptor,
      }),
    ],
  },
  paymentCreateActions: {
    resolve: (context, resourceDescriptor) => [
      buildResolvedAction({
        key: 'create',
        contractKey: 'create',
        defaultLabel: 'Add Payment',
        label: context.createPending ? 'Creating...' : undefined,
        variant: 'primary',
        disabled: !context.hasAuthenticatedSession || context.createPending,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onCreate,
        resourceDescriptor,
      }),
      buildResolvedAction({
        key: 'openTrade',
        defaultLabel: 'Open Trade',
        variant: 'ghost',
        disabled: false,
        onSelect: context.onOpenTrade,
      }),
    ],
  },
  paymentEditActions: {
    resolve: (context, resourceDescriptor) => [
      buildResolvedAction({
        actionStates: context.actionStates,
        key: 'save',
        contractKey: 'save',
        defaultLabel: 'Save',
        label: context.pending ? 'Saving...' : undefined,
        variant: 'ghost',
        disabled:
          !context.hasAuthenticatedSession ||
          context.pending ||
          context.savePayloadEmpty,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onSave,
        resourceDescriptor,
      }),
      buildResolvedAction({
        actionStates: context.actionStates,
        key: 'markPaid',
        contractKey: 'markPaid',
        defaultLabel: 'Mark Paid',
        variant: 'secondary',
        disabled:
          !context.hasAuthenticatedSession ||
          context.pending,
        permissionDenied: !context.hasAuthenticatedSession,
        onSelect: context.onMarkPaid,
        resourceDescriptor,
      }),
    ],
  },
}

export function resolveOperationalFormActionSet<K extends OperationalFormActionSetKey>(
  key: K,
  context: OperationalFormActionContextMap[K],
  resourceDescriptor?: OperationalResourceDescriptor | null,
): OperationalResolvedFormActionSet {
  return {
    key,
    actions: OPERATIONAL_FORM_ACTION_REGISTRY[key]
      .resolve(context, resourceDescriptor)
      .filter((action): action is OperationalResolvedFormAction => action !== null),
  }
}

type OperationalDescriptorActionRowProps = {
  actionSet: OperationalResolvedFormActionSet
  className?: string
}

export function OperationalDescriptorActionRow({
  actionSet,
  className,
}: OperationalDescriptorActionRowProps) {
  return (
    <OperationalFormButtonRow className={className}>
      {actionSet.actions.map((action) => (
        <button
          key={`${actionSet.key}-${action.key}`}
          type="button"
          className={buttonClassName(action.variant)}
          onClick={() => void action.onSelect()}
          disabled={action.disabled}
          title={action.disabledReason ?? action.detail ?? undefined}
        >
          {action.label}
        </button>
      ))}
    </OperationalFormButtonRow>
  )
}
