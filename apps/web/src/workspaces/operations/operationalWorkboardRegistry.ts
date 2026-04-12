import type { OperationalResourceDescriptor, OperationalResourceKey } from '../../entities/app/api'

export type OperationalWorkboardKey =
  | 'confirmationLedger'
  | 'workflowQueue'
  | 'deliveryBoard'
  | 'invoiceLedger'
  | 'paymentLedger'
  | 'schedulingWorkbench'
  | 'actualizationWorkbench'
  | 'schedulerWorkflow'
  | 'tradeOperationalProjection'

type OperationalWorkboardMetadataMode = 'all' | 'actions' | 'actions-and-filters'

type OperationalWorkboardDefinition = {
  resourceKeys: OperationalResourceKey[]
  title: string
  description: string
  metadataMode?: OperationalWorkboardMetadataMode
}

export type ResolvedOperationalWorkboardDefinition = OperationalWorkboardDefinition & {
  key: OperationalWorkboardKey
  resources: OperationalResourceDescriptor[]
  metadataChips: string[]
}

export const OPERATIONAL_WORKBOARD_REGISTRY: Record<
  OperationalWorkboardKey,
  OperationalWorkboardDefinition
> = {
  confirmationLedger: {
    resourceKeys: ['confirmations'],
    title: 'Confirmation Ledger',
    description:
      'Dedicated confirmation records drive draft, issue, dispute, and amendment handling straight from the operational record set.',
  },
  workflowQueue: {
    resourceKeys: ['work_items'],
    title: 'Operational Work Queue',
    description:
      'The queue stays focused on owner, due date, and downstream handoff decisions after record-managed ledgers set lifecycle state.',
  },
  deliveryBoard: {
    resourceKeys: ['deliveries', 'shipments'],
    title: 'Delivery Board',
    description:
      'One cross-mode board now spans delivery obligations, shipment actualization, event history, and trade-derived resync behavior.',
  },
  invoiceLedger: {
    resourceKeys: ['invoices'],
    title: 'Invoice Ledger',
    description:
      'Dedicated invoice records drive invoice issuance, update, and settlement rollups for each active trade.',
  },
  paymentLedger: {
    resourceKeys: ['payments'],
    title: 'Payment Ledger',
    description:
      'Cash collection and settlement now run from dedicated payment records instead of a status-only workflow row.',
  },
  schedulingWorkbench: {
    resourceKeys: ['deliveries', 'shipments', 'work_items'],
    title: 'Scheduling Workbench',
    description:
      'The scheduler workbench now composes delivery projections, actualization controls, and workflow handoffs from one shared operational contract.',
    metadataMode: 'actions-and-filters',
  },
  actualizationWorkbench: {
    resourceKeys: ['shipments'],
    title: 'Execution Actualization',
    description:
      'Actualization is a descriptor-backed shipment action, so executed quantity and timing updates follow the same operational contract as the rest of the workboard.',
    metadataMode: 'actions',
  },
  schedulerWorkflow: {
    resourceKeys: ['work_items'],
    title: 'Scheduler Workflow',
    description:
      'Scheduler handoffs now use the shared operational work-item contract for ownership, due dates, and lifecycle updates.',
    metadataMode: 'actions-and-filters',
  },
  tradeOperationalProjection: {
    resourceKeys: ['confirmations', 'deliveries', 'work_items', 'invoices', 'payments'],
    title: 'Downstream Operational Projection',
    description:
      'The blotter inspector now reads the same confirmation, logistics, workflow, invoice, and payment resource definitions that power the operational workspaces.',
    metadataMode: 'actions',
  },
}

function formatToken(value: string): string {
  return value.replaceAll('_', ' ')
}

function formatResourceLabel(resourceKey: OperationalResourceKey): string {
  return formatToken(resourceKey)
}

function buildMetadataChips(
  resources: OperationalResourceDescriptor[],
  metadataMode: OperationalWorkboardMetadataMode,
): string[] {
  const chips: string[] = []
  const seen = new Set<string>()

  for (const resource of resources) {
    const resourceLabel = formatResourceLabel(resource.resource_key)
    const chipGroups =
      metadataMode === 'actions'
        ? resource.actions.map((action) => `${resourceLabel} action ${formatToken(action)}`)
        : metadataMode === 'actions-and-filters'
          ? [
              ...resource.filters.map((filter) => `${resourceLabel} filter ${formatToken(filter)}`),
              ...resource.actions.map((action) => `${resourceLabel} action ${formatToken(action)}`),
            ]
          : [
              ...resource.filters.map((filter) => `${resourceLabel} filter ${formatToken(filter)}`),
              ...resource.sort_fields.map((field) => `${resourceLabel} sort ${formatToken(field)}`),
              ...resource.actions.map((action) => `${resourceLabel} action ${formatToken(action)}`),
            ]

    for (const chip of chipGroups) {
      if (seen.has(chip)) {
        continue
      }
      seen.add(chip)
      chips.push(chip)
    }
  }

  return chips
}

export function resolveOperationalWorkboardDefinition(
  key: OperationalWorkboardKey,
  operationalResourceDescriptors: OperationalResourceDescriptor[],
): ResolvedOperationalWorkboardDefinition {
  const definition = OPERATIONAL_WORKBOARD_REGISTRY[key]
  const resources = definition.resourceKeys.flatMap((resourceKey) => {
    const descriptor = operationalResourceDescriptors.find((item) => item.resource_key === resourceKey)
    return descriptor ? [descriptor] : []
  })

  return {
    ...definition,
    key,
    resources,
    metadataChips: buildMetadataChips(resources, definition.metadataMode ?? 'all'),
  }
}
