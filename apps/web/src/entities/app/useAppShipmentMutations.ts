import { useEffect, useState } from 'react'

import {
  cancelDeliveryTruckMovement,
  cancelDeliveryTruckStop,
  createDeliveryTruckMovement,
  createDeliveryTruckStop,
  createDeliveryEvent,
  recordDeliveryTruckStopCheckpoint,
  reverseDeliveryTruckStopCheckpoint,
  skipDeliveryTruckStop,
  syncDeliveriesFromTrades,
  updateDelivery,
  updateDeliveryLogisticsDetails,
  updateDeliveryPipelineDetails,
  updateDeliveryPowerDetails,
  updateDeliveryTruckDetails,
  updateDeliveryVesselDetails,
  updateDeliveryTruckMovement,
  updateDeliveryTruckStop,
  type CancelDeliveryTruckMovementInput,
  type CancelDeliveryTruckStopInput,
  type CreateDeliveryEventInput,
  type DeliveryTruckMovementCreateInput,
  type DeliveryTruckStopCreateInput,
  type DeliverySyncResult,
  type UpdateDeliveryInput,
  type RecordDeliveryTruckStopCheckpointInput,
  type ReverseDeliveryTruckStopCheckpointInput,
  type UpdateDeliveryLogisticsDetailInput,
  type UpdateDeliveryPipelineDetailInput,
  type UpdateDeliveryPowerDetailInput,
  type UpdateDeliveryTruckDetailInput,
  type UpdateDeliveryVesselDetailInput,
  type UpdateDeliveryTruckMovementInput,
  type UpdateDeliveryTruckStopInput,
  type SkipDeliveryTruckStopInput,
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
  }): Promise<void> {
    await runDeliveryMutationResult(args)
  }

  async function runDeliveryMutationResult(args: {
    deliveryId: string
    run: () => Promise<unknown>
    fallbackMessage: string
  }): Promise<string | null> {
    const { deliveryId, run, fallbackMessage } = args
    setDeliveryMutationError('')
    setDeliveryMutationPendingId(deliveryId)

    try {
      await run()
      await refreshMutationData('delivery')
      return null
    } catch (nextError) {
      const errorMessage = nextError instanceof Error ? nextError.message : fallbackMessage
      setDeliveryMutationError(errorMessage)
      return errorMessage
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

  async function handleUpdateDeliveryTruckDetails(deliveryId: string, payload: UpdateDeliveryTruckDetailInput) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update truck delivery details.',
      run: () =>
        updateDeliveryTruckDetails(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleUpdateDeliveryVesselDetails(deliveryId: string, payload: UpdateDeliveryVesselDetailInput) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update vessel tracking details.',
      run: () =>
        updateDeliveryVesselDetails(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleCreateDeliveryTruckMovement(
    deliveryId: string,
    payload: DeliveryTruckMovementCreateInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to create truck movement.',
      run: () =>
        createDeliveryTruckMovement(appConfig.apiBase, {
          deliveryId,
          payload,
        }),
    })
  }

  async function handleUpdateDeliveryTruckMovement(
    deliveryId: string,
    movementId: string,
    payload: UpdateDeliveryTruckMovementInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update truck movement.',
      run: () =>
        updateDeliveryTruckMovement(appConfig.apiBase, {
          movementId,
          payload,
        }),
    })
  }

  async function handleCancelDeliveryTruckMovement(
    deliveryId: string,
    movementId: string,
    payload: CancelDeliveryTruckMovementInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to cancel truck movement.',
      run: () =>
        cancelDeliveryTruckMovement(appConfig.apiBase, {
          movementId,
          payload,
        }),
    })
  }

  async function handleCreateDeliveryTruckStop(
    deliveryId: string,
    movementId: string,
    payload: DeliveryTruckStopCreateInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to add truck stop.',
      run: () =>
        createDeliveryTruckStop(appConfig.apiBase, {
          movementId,
          payload,
        }),
    })
  }

  async function handleUpdateDeliveryTruckStop(
    deliveryId: string,
    stopId: string,
    payload: UpdateDeliveryTruckStopInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to update truck stop.',
      run: () =>
        updateDeliveryTruckStop(appConfig.apiBase, {
          stopId,
          payload,
        }),
    })
  }

  async function handleSkipDeliveryTruckStop(
    deliveryId: string,
    stopId: string,
    payload: SkipDeliveryTruckStopInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to skip truck stop.',
      run: () =>
        skipDeliveryTruckStop(appConfig.apiBase, {
          stopId,
          payload,
        }),
    })
  }

  async function handleCancelDeliveryTruckStop(
    deliveryId: string,
    stopId: string,
    payload: CancelDeliveryTruckStopInput,
  ) {
    await runDeliveryMutation({
      deliveryId,
      fallbackMessage: 'Failed to cancel truck stop.',
      run: () =>
        cancelDeliveryTruckStop(appConfig.apiBase, {
          stopId,
          payload,
        }),
    })
  }

  async function handleRecordDeliveryTruckStopCheckpoint(
    deliveryId: string,
    stopId: string,
    payload: RecordDeliveryTruckStopCheckpointInput,
  ): Promise<string | null> {
    return runDeliveryMutationResult({
      deliveryId,
      fallbackMessage: 'Failed to record truck checkpoint.',
      run: () =>
        recordDeliveryTruckStopCheckpoint(appConfig.apiBase, {
          stopId,
          payload,
        }),
    })
  }

  async function handleReverseDeliveryTruckStopCheckpoint(
    deliveryId: string,
    stopId: string,
    eventId: number,
    payload: ReverseDeliveryTruckStopCheckpointInput,
  ): Promise<string | null> {
    return runDeliveryMutationResult({
      deliveryId,
      fallbackMessage: 'Failed to reverse truck checkpoint.',
      run: () =>
        reverseDeliveryTruckStopCheckpoint(appConfig.apiBase, {
          stopId,
          eventId,
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
    handleUpdateDeliveryTruckDetails,
    handleUpdateDeliveryVesselDetails,
    handleCreateDeliveryTruckMovement,
    handleUpdateDeliveryTruckMovement,
    handleCancelDeliveryTruckMovement,
    handleCreateDeliveryTruckStop,
    handleUpdateDeliveryTruckStop,
    handleSkipDeliveryTruckStop,
    handleCancelDeliveryTruckStop,
    handleRecordDeliveryTruckStopCheckpoint,
    handleReverseDeliveryTruckStopCheckpoint,
  }
}
