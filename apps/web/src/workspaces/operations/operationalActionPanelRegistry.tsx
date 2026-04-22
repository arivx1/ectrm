/* eslint-disable react-refresh/only-export-components -- This registry intentionally co-locates action panel metadata, helpers, and renderers. */
import type { ComponentProps, ReactNode } from 'react'

import type { OperationalResourceDescriptor, OperationalResourceKey } from '../../entities/app/api'
import { DeliveryDetailEditor } from '../shipments/DeliveryDetailEditor'
import { DeliveryActualizationEditor } from '../scheduling/DeliveryActualizationEditor'
import { SchedulingWorkflowEditor } from '../scheduling/SchedulingWorkflowEditor'

export type OperationalActionPanelKey =
  | 'deliveryControl'
  | 'deliveryActualization'
  | 'schedulerWorkflow'

type OperationalActionPanelPropsMap = {
  deliveryControl: ComponentProps<typeof DeliveryDetailEditor>
  deliveryActualization: ComponentProps<typeof DeliveryActualizationEditor>
  schedulerWorkflow: ComponentProps<typeof SchedulingWorkflowEditor>
}

type OperationalActionPanelDefinition<K extends OperationalActionPanelKey = OperationalActionPanelKey> = {
  resourceKey: OperationalResourceKey
  action: string
  actionLabel: string
  title: string
  description: string
  render: (props: OperationalActionPanelPropsMap[K]) => ReactNode
}

export type ResolvedOperationalActionPanelDefinition = {
  key: OperationalActionPanelKey
  resourceKey: OperationalResourceKey
  action: string
  actionLabel: string
  title: string
  description: string
  resourceTitle: string
  boardSection: string | null
  contractChips: string[]
}

function formatToken(value: string): string {
  return value.replaceAll('_', ' ')
}

function resourceTitle(
  resourceKey: OperationalResourceKey,
  descriptors: OperationalResourceDescriptor[],
): string {
  const descriptor = descriptors.find((item) => item.resource_key === resourceKey)
  return descriptor?.surface?.title ?? formatToken(resourceKey)
}

const OPERATIONAL_ACTION_PANEL_REGISTRY: {
  [K in OperationalActionPanelKey]: OperationalActionPanelDefinition<K>
} = {
  deliveryControl: {
    resourceKey: 'deliveries',
    action: 'update',
    actionLabel: 'Update delivery controls',
    title: 'Delivery Controls',
    description: 'Edit shared delivery controls, mode-specific instructions, and manual overrides for the selected obligation.',
    render: (props) => <DeliveryDetailEditor {...props} />,
  },
  deliveryActualization: {
    resourceKey: 'shipments',
    action: 'upsert_actualization',
    actionLabel: 'Record actualization',
    title: 'Execution Actuals',
    description: 'Record actualized quantity and timestamp once the physical movement is complete.',
    render: (props) => <DeliveryActualizationEditor {...props} />,
  },
  schedulerWorkflow: {
    resourceKey: 'work_items',
    action: 'update',
    actionLabel: 'Update scheduler workflow',
    title: 'Scheduler Workflow',
    description: 'Assign work, set due dates, and advance the open lifecycle items for the selected delivery row.',
    render: (props) => <SchedulingWorkflowEditor {...props} />,
  },
}

export function resolveOperationalActionPanelDefinition(
  key: OperationalActionPanelKey,
  operationalResourceDescriptors: OperationalResourceDescriptor[],
): ResolvedOperationalActionPanelDefinition {
  const definition = OPERATIONAL_ACTION_PANEL_REGISTRY[key]
  const descriptor = operationalResourceDescriptors.find((item) => item.resource_key === definition.resourceKey)
  const resolvedResourceTitle = resourceTitle(definition.resourceKey, operationalResourceDescriptors)
  const boardSection = descriptor?.surface?.board_section ?? null
  const contractChips = [resolvedResourceTitle, definition.actionLabel, boardSection].filter(
    (value): value is string => Boolean(value && value.trim()),
  )

  return {
    key,
    resourceKey: definition.resourceKey,
    action: definition.action,
    actionLabel: definition.actionLabel,
    title: definition.title,
    description: definition.description,
    resourceTitle: resolvedResourceTitle,
    boardSection,
    contractChips,
  }
}

type OperationalActionPanelFrameProps = {
  panel: ResolvedOperationalActionPanelDefinition
  children: ReactNode
}

export function OperationalActionPanelFrame({
  panel,
  children,
}: OperationalActionPanelFrameProps) {
  return (
    <section className="operational-action-panel">
      <div className="operational-action-panel-head">
        <div className="operational-action-panel-copy">
          <strong>{panel.title}</strong>
          <p>{panel.description}</p>
        </div>
      </div>
      <div className="shipment-card-meta">
        {panel.contractChips.map((chip) => (
          <span key={`${panel.key}-${chip}`} className="entity-chip entity-chip-soft">
            {chip}
          </span>
        ))}
      </div>
      {children}
    </section>
  )
}

export function renderOperationalActionPanel<K extends OperationalActionPanelKey>(
  key: K,
  operationalResourceDescriptors: OperationalResourceDescriptor[],
  panelProps: OperationalActionPanelPropsMap[K],
) {
  const definition = OPERATIONAL_ACTION_PANEL_REGISTRY[key]
  const panel = resolveOperationalActionPanelDefinition(key, operationalResourceDescriptors)

  return (
    <OperationalActionPanelFrame panel={panel}>
      {definition.render(panelProps)}
    </OperationalActionPanelFrame>
  )
}
