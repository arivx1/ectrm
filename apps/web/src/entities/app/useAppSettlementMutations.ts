import { useEffect, useState } from 'react'

import {
  createTradeConfirmation,
  issueTradeConfirmation,
  respondTradeConfirmation,
  updateTradeConfirmation,
  type CreateTradeConfirmationInput,
  type IssueTradeConfirmationInput,
  type RespondTradeConfirmationInput,
  type UpdateTradeConfirmationInput,
} from '../confirmations/api'
import {
  createTradeWorkflowItem,
  bookOptionSettlementUnderlying,
  updateTradeWorkflowItem,
  type CreateTradeWorkflowItemInput,
  type UpdateTradeWorkflowItemInput,
} from '../operations/api'
import {
  createTradeInvoice,
  createTradePayment,
  updateTradeInvoice,
  updateTradePayment,
  type CreateTradeInvoiceInput,
  type CreateTradePaymentInput,
  type UpdateTradeInvoiceInput,
  type UpdateTradePaymentInput,
} from '../settlement/api'
import {
  saveDeliveryActualization,
  type SaveDeliveryActualizationInput,
} from '../shipments/api'
import { appConfig } from '../../shared/config'
import type { DeliveryRecord } from '../../shared/models'

type RefreshMutationData = (
  mutation: 'confirmation' | 'workflow-item' | 'actualization' | 'invoice' | 'payment'
) => Promise<void>

export function useAppSettlementMutations(args: {
  refreshMutationData: RefreshMutationData
  resetKey: string
}) {
  const { refreshMutationData, resetKey } = args
  const [confirmationMutationError, setConfirmationMutationError] = useState('')
  const [confirmationMutationPendingKey, setConfirmationMutationPendingKey] = useState<string | null>(null)
  const [workflowMutationError, setWorkflowMutationError] = useState('')
  const [workflowMutationPendingId, setWorkflowMutationPendingId] = useState<number | null>(null)
  const [workflowCreationPendingTradeId, setWorkflowCreationPendingTradeId] = useState<string | null>(null)
  const [actualizationMutationError, setActualizationMutationError] = useState('')
  const [actualizationMutationPendingDeliveryId, setActualizationMutationPendingDeliveryId] = useState<string | null>(null)
  const [invoiceMutationError, setInvoiceMutationError] = useState('')
  const [invoiceMutationPendingKey, setInvoiceMutationPendingKey] = useState<string | null>(null)
  const [paymentMutationError, setPaymentMutationError] = useState('')
  const [paymentMutationPendingKey, setPaymentMutationPendingKey] = useState<string | null>(null)

  useEffect(() => {
    setConfirmationMutationError('')
    setConfirmationMutationPendingKey(null)
    setWorkflowMutationError('')
    setWorkflowMutationPendingId(null)
    setWorkflowCreationPendingTradeId(null)
    setActualizationMutationError('')
    setActualizationMutationPendingDeliveryId(null)
    setInvoiceMutationError('')
    setInvoiceMutationPendingKey(null)
    setPaymentMutationError('')
    setPaymentMutationPendingKey(null)
  }, [resetKey])

  async function handleCreateTradeConfirmation(tradeId: string, payload: CreateTradeConfirmationInput) {
    const pendingKey = `trade:${tradeId}:confirmation:new`
    setConfirmationMutationError('')
    setConfirmationMutationPendingKey(pendingKey)

    try {
      await createTradeConfirmation(appConfig.apiBase, payload)
      await refreshMutationData('confirmation')
    } catch (nextError) {
      setConfirmationMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to create confirmation record.',
      )
    } finally {
      setConfirmationMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleUpdateTradeConfirmation(
    confirmationId: number,
    payload: UpdateTradeConfirmationInput,
  ) {
    const pendingKey = `confirmation:${confirmationId}`
    setConfirmationMutationError('')
    setConfirmationMutationPendingKey(pendingKey)

    try {
      await updateTradeConfirmation(appConfig.apiBase, confirmationId, payload)
      await refreshMutationData('confirmation')
    } catch (nextError) {
      setConfirmationMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to update confirmation record.',
      )
    } finally {
      setConfirmationMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleIssueTradeConfirmation(
    confirmationId: number,
    payload: IssueTradeConfirmationInput,
  ) {
    const pendingKey = `confirmation:${confirmationId}:issue`
    setConfirmationMutationError('')
    setConfirmationMutationPendingKey(pendingKey)

    try {
      await issueTradeConfirmation(appConfig.apiBase, confirmationId, payload)
      await refreshMutationData('confirmation')
    } catch (nextError) {
      setConfirmationMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to issue confirmation record.',
      )
    } finally {
      setConfirmationMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleRespondTradeConfirmation(
    confirmationId: number,
    payload: RespondTradeConfirmationInput,
  ) {
    const pendingKey = `confirmation:${confirmationId}:response:${payload.action}`
    setConfirmationMutationError('')
    setConfirmationMutationPendingKey(pendingKey)

    try {
      await respondTradeConfirmation(appConfig.apiBase, confirmationId, payload)
      await refreshMutationData('confirmation')
    } catch (nextError) {
      setConfirmationMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to record confirmation response.',
      )
    } finally {
      setConfirmationMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleSaveWorkflowItem(itemId: number, payload: UpdateTradeWorkflowItemInput) {
    setWorkflowMutationError('')
    setWorkflowMutationPendingId(itemId)

    try {
      await updateTradeWorkflowItem(appConfig.apiBase, itemId, payload)
      await refreshMutationData('workflow-item')
    } catch (nextError) {
      setWorkflowMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to update workflow item.',
      )
    } finally {
      setWorkflowMutationPendingId((current) => (current === itemId ? null : current))
    }
  }

  async function handleCreateWorkflowItem(tradeId: string, payload: Omit<CreateTradeWorkflowItemInput, 'trade_id'>) {
    setWorkflowMutationError('')
    setWorkflowCreationPendingTradeId(tradeId)

    try {
      await createTradeWorkflowItem(appConfig.apiBase, {
        trade_id: tradeId,
        ...payload,
      })
      await refreshMutationData('workflow-item')
    } catch (nextError) {
      setWorkflowMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to create workflow item.',
      )
    } finally {
      setWorkflowCreationPendingTradeId((current) => (current === tradeId ? null : current))
    }
  }

  async function handleBookUnderlyingTrade(itemId: number) {
    setWorkflowMutationError('')
    setWorkflowMutationPendingId(itemId)

    try {
      await bookOptionSettlementUnderlying(appConfig.apiBase, itemId)
      await refreshMutationData('workflow-item')
    } catch (nextError) {
      setWorkflowMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to book the resulting underlying trade.',
      )
    } finally {
      setWorkflowMutationPendingId((current) => (current === itemId ? null : current))
    }
  }

  async function handleSaveDeliveryActualization(
    delivery: Pick<DeliveryRecord, 'delivery_id' | 'trade_id' | 'leg_no'>,
    payload: SaveDeliveryActualizationInput,
  ) {
    setActualizationMutationError('')
    setActualizationMutationPendingDeliveryId(delivery.delivery_id)

    try {
      await saveDeliveryActualization(appConfig.apiBase, {
        tradeId: delivery.trade_id,
        legNo: delivery.leg_no,
        payload,
      })
      await refreshMutationData('actualization')
    } catch (nextError) {
      setActualizationMutationError(
        nextError instanceof Error ? nextError.message : 'Failed to save delivery actualization.',
      )
    } finally {
      setActualizationMutationPendingDeliveryId((current) =>
        current === delivery.delivery_id ? null : current,
      )
    }
  }

  async function handleIssueTradeInvoice(tradeId: string, payload: CreateTradeInvoiceInput) {
    const pendingKey = `trade:${tradeId}`
    setInvoiceMutationError('')
    setInvoiceMutationPendingKey(pendingKey)

    try {
      await createTradeInvoice(appConfig.apiBase, payload)
      await refreshMutationData('invoice')
    } catch (nextError) {
      setInvoiceMutationError(nextError instanceof Error ? nextError.message : 'Failed to issue invoice.')
    } finally {
      setInvoiceMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleUpdateTradeInvoice(invoiceId: number, payload: UpdateTradeInvoiceInput) {
    const pendingKey = `invoice:${invoiceId}`
    setInvoiceMutationError('')
    setInvoiceMutationPendingKey(pendingKey)

    try {
      await updateTradeInvoice(appConfig.apiBase, invoiceId, payload)
      await refreshMutationData('invoice')
    } catch (nextError) {
      setInvoiceMutationError(nextError instanceof Error ? nextError.message : 'Failed to update invoice.')
    } finally {
      setInvoiceMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleCreateTradePayment(invoiceId: number, payload: CreateTradePaymentInput) {
    const pendingKey = `invoice:${invoiceId}:new`
    setPaymentMutationError('')
    setPaymentMutationPendingKey(pendingKey)

    try {
      await createTradePayment(appConfig.apiBase, payload)
      await refreshMutationData('payment')
    } catch (nextError) {
      setPaymentMutationError(nextError instanceof Error ? nextError.message : 'Failed to create payment.')
    } finally {
      setPaymentMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  async function handleUpdateTradePayment(paymentId: number, payload: UpdateTradePaymentInput) {
    const pendingKey = `payment:${paymentId}`
    setPaymentMutationError('')
    setPaymentMutationPendingKey(pendingKey)

    try {
      await updateTradePayment(appConfig.apiBase, paymentId, payload)
      await refreshMutationData('payment')
    } catch (nextError) {
      setPaymentMutationError(nextError instanceof Error ? nextError.message : 'Failed to update payment.')
    } finally {
      setPaymentMutationPendingKey((current) => (current === pendingKey ? null : current))
    }
  }

  return {
    actualizationMutationError,
    actualizationMutationPendingDeliveryId,
    confirmationMutationError,
    confirmationMutationPendingKey,
    handleBookUnderlyingTrade,
    handleCreateWorkflowItem,
    handleCreateTradeConfirmation,
    handleIssueTradeConfirmation,
    handleRespondTradeConfirmation,
    handleSaveDeliveryActualization,
    handleCreateTradePayment,
    handleIssueTradeInvoice,
    handleSaveWorkflowItem,
    handleUpdateTradeConfirmation,
    handleUpdateTradeInvoice,
    handleUpdateTradePayment,
    invoiceMutationError,
    invoiceMutationPendingKey,
    paymentMutationError,
    paymentMutationPendingKey,
    workflowMutationError,
    workflowCreationPendingTradeId,
    workflowMutationPendingId,
  }
}
