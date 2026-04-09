import { useEffect, useState } from 'react'

import {
  createDeliveryEvent,
  syncDeliveriesFromTrades,
  updateDelivery,
  updateDeliveryLogisticsDetails,
  updateDeliveryPipelineDetails,
  updateDeliveryPowerDetails,
  type CreateDeliveryEventInput,
  type DeliverySyncResult,
  type UpdateDeliveryInput,
  type UpdateDeliveryLogisticsDetailInput,
  type UpdateDeliveryPipelineDetailInput,
  type UpdateDeliveryPowerDetailInput,
} from '../shipments/api'
import { appConfig } from '../../shared/config'

type RefreshMutationData = (mutation: 'delivery') => Promise<void>

export function useAppShipmentMutations(args: {
  refreshMutationData: RefreshMutationData
  resetKey: string
}) {
  const { refreshMutationData, resetKey } = args
  const [deliveryMutationError, setDeliveryMutationError] = useState('')
  const [deliveryMutationPendingId, setDeliveryMutationPendingId] = useState<string | null>(null)
  const [deliverySyncError, setDeliverySyncError] = useState('')
  const [deliverySyncSuccess, setDeliverySyncSuccess] = useState('')
  const [deliveriesSyncing, setDeliveriesSyncing] = useState(false)

  useEffect(() => {
    setDeliveryMutationError('')
    setDeliveryMutationPendingId(null)
    setDeliverySyncError('')
    setDeliverySyncSuccess('')
    setDeliveriesSyncing(false)
  }, [resetKey])

  async function runDeliveryMutation(args: {
    deliveryId: string
    run: () => Promise<unknown>
    fallbackMessage: string
  }) {
    const { deliveryId, run, fallbackMessage } = args
    setDeliveryMutationError('')
    setDeliveryMutationPendingId(deliveryId)

    try {
      await run()
      await refreshMutationData('delivery')
    } catch (nextError) {
      setDeliveryMutationError(nextError instanceof Error ? nextError.message : fallbackMessage)
    } finally {
      setDeliveryMutationPendingId((current) => (current === deliveryId ? null : current))
    }
  }

  async function handleUpdateDelivery(deliveryId: string, payload: UpdateDeliveryInput) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update delivery controls.',
      run: () =>
        updateDelivery(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleUpdateDeliveryLogisticsDetails(
    deliveryId: string,
    payload: UpdateDeliveryLogisticsDetailInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update logistics delivery details.',
      run: () =>
        updateDeliveryLogisticsDetails(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleUpdateDeliveryPipelineDetails(
    deliveryId: string,
    payload: UpdateDeliveryPipelineDetailInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update pipeline delivery details.',
      run: () =>
        updateDeliveryPipelineDetails(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleUpdateDeliveryPowerDetails(deliveryId: string, payload: UpdateDeliveryPowerDetailInput) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update power delivery details.',
      run: () =>
        updateDeliveryPowerDetails(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleCreateDeliveryEvent(deliveryId: string, payload: CreateDeliveryEventInput) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to log delivery event.',
      run: () =>
        createDeliveryEvent(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleSyncDeliveriesFromTrades() {
    setDeliveriesSyncing(true)
    setDeliverySyncError('')
    setDeliverySyncSuccess('')

    try {
      const payload: DeliverySyncResult = await syncDeliveriesFromTrades(appConfig.apiBase)
      await refreshMutationData('delivery')
      setDeliverySyncSuccess(
        `Synced ${payload.total_count} deliveries: ${payload.created_count} created, ${payload.updated_count} updated, ${payload.deleted_count} removed.`,
      )
    } catch (nextError) {
      setDeliverySyncError(
        nextError instanceof Error ? nextError.message : 'Failed to sync deliveries from trades.',
      )
    } finally {
      setDeliveriesSyncing(false)
    }
  }

  return {
    deliveriesSyncing,
    deliveryMutationError,
    deliveryMutationPendingId,
    deliverySyncError,
    deliverySyncSuccess,
    handleSyncDeliveriesFromTrades,
    handleCreateDeliveryEvent,
    handleUpdateDelivery,
    handleUpdateDeliveryLogisticsDetails,
    handleUpdateDeliveryPipelineDetails,
    handleUpdateDeliveryPowerDetails,
  }
}
