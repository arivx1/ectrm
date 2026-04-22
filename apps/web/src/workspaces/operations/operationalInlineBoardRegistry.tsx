import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from 'react'

import type { OperationalResourceDescriptor, OperationalResourceKey } from '../../entities/app/api'
import { SettlementInvoiceBoard } from '../settlement/SettlementInvoiceBoard'
import { SettlementPaymentBoard } from '../settlement/SettlementPaymentBoard'
import { ConfirmationLedgerBoard } from './ConfirmationLedgerBoard'
import { WorkflowQueueEditor } from './WorkflowQueueEditor'

export type OperationalInlineBoardKey =
  | 'confirmationLedger'
  | 'workflowQueue'
  | 'invoiceLedger'
  | 'paymentLedger'

type OperationalInlineBoardPropsMap = {
  confirmationLedger: ComponentProps<typeof ConfirmationLedgerBoard>
  workflowQueue: ComponentProps<typeof WorkflowQueueEditor>
  invoiceLedger: ComponentProps<typeof SettlementInvoiceBoard>
  paymentLedger: ComponentProps<typeof SettlementPaymentBoard>
}

type OperationalInlineBoardDefinition<K extends OperationalInlineBoardKey = OperationalInlineBoardKey> = {
  resourceKey: OperationalResourceKey
  title: string
  description: string
  render: (props: OperationalInlineBoardPropsMap[K]) => ReactNode
}

export type ResolvedOperationalInlineBoardDefinition = {
  key: OperationalInlineBoardKey
  resourceKey: OperationalResourceKey
  title: string
  description: string
  resourceTitle: string
  contractActions: string[]
}

function formatToken(value: string): string {
  return value.replaceAll('_', ' ')
}

function preferredResourceTitle(
  resourceKey: OperationalResourceKey,
  descriptors: OperationalResourceDescriptor[],
): string {
  const descriptor = descriptors.find((item) => item.resource_key === resourceKey)
  return descriptor?.surface?.title ?? formatToken(resourceKey)
}

const OPERATIONAL_INLINE_BOARD_REGISTRY: {
  [K in OperationalInlineBoardKey]: OperationalInlineBoardDefinition<K>
} = {
  confirmationLedger: {
    resourceKey: 'confirmations',
    title: 'Confirmation Ledger',
    description: 'Manage drafted, confirmed, disputed, and amended confirmation records from one shared ledger surface.',
    render: (props) => <ConfirmationLedgerBoard {...props} />,
  },
  workflowQueue: {
    resourceKey: 'work_items',
    title: 'Operational Work Queue',
    description: 'Handle owners, due dates, exception paths, and manual handoffs from one shared workflow editor.',
    render: (props) => <WorkflowQueueEditor {...props} />,
  },
  invoiceLedger: {
    resourceKey: 'invoices',
    title: 'Invoice Ledger',
    description: 'Issue and maintain invoice records from the same configured settlement ledger surface.',
    render: (props) => <SettlementInvoiceBoard {...props} />,
  },
  paymentLedger: {
    resourceKey: 'payments',
    title: 'Payment Ledger',
    description: 'Create, receive, and reconcile cash records from one shared payment ledger surface.',
    render: (props) => <SettlementPaymentBoard {...props} />,
  },
}

export function resolveOperationalInlineBoardDefinition(
  key: OperationalInlineBoardKey,
  operationalResourceDescriptors: OperationalResourceDescriptor[],
): ResolvedOperationalInlineBoardDefinition {
  const definition = OPERATIONAL_INLINE_BOARD_REGISTRY[key]
  const descriptor = operationalResourceDescriptors.find((item) => item.resource_key === definition.resourceKey)

  return {
    key,
    resourceKey: definition.resourceKey,
    title: definition.title,
    description: definition.description,
    resourceTitle: preferredResourceTitle(definition.resourceKey, operationalResourceDescriptors),
    contractActions: descriptor?.actions.map((action) => formatToken(action)) ?? [],
  }
}

export function renderOperationalInlineBoard<K extends OperationalInlineBoardKey>(
  key: K,
  panelProps: OperationalInlineBoardPropsMap[K],
  elementKey?: string,
) {
  const definition = OPERATIONAL_INLINE_BOARD_REGISTRY[key]
  const node = definition.render(panelProps)

  if (elementKey && isValidElement(node)) {
    return cloneElement(node, { key: elementKey })
  }

  return node
}
