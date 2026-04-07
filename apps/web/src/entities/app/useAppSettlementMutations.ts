import { useEffect, useState } from 'react'

import { updateTradeWorkflowItem, type UpdateTradeWorkflowItemInput } from '../operations/api'
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
import { appConfig } from '../../shared/config'

type RefreshMutationData = (mutation: 'workflow-item' | 'invoice' | 'payment') => Promise<void>

export function useAppSettlementMutations(args: {
  refreshMutationData: RefreshMutationData
  resetKey: string
}) {
  const { refreshMutationData, resetKey } = args
  const [workflowMutationError, setWorkflowMutationError] = useState('')
  const [workflowMutationPendingId, setWorkflowMutationPendingId] = useState<number | null>(null)
  const [invoiceMutationError, setInvoiceMutationError] = useState('')
  const [invoiceMutationPendingKey, setInvoiceMutationPendingKey] = useState<string | null>(null)
  const [paymentMutationError, setPaymentMutationError] = useState('')
  const [paymentMutationPendingKey, setPaymentMutationPendingKey] = useState<string | null>(null)

  useEffect(() => {
    setWorkflowMutationError('')
    setWorkflowMutationPendingId(null)
    setInvoiceMutationError('')
    setInvoiceMutationPendingKey(null)
    setPaymentMutationError('')
    setPaymentMutationPendingKey(null)
  }, [resetKey])

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
    handleCreateTradePayment,
    handleIssueTradeInvoice,
    handleSaveWorkflowItem,
    handleUpdateTradeInvoice,
    handleUpdateTradePayment,
    invoiceMutationError,
    invoiceMutationPendingKey,
    paymentMutationError,
    paymentMutationPendingKey,
    workflowMutationError,
    workflowMutationPendingId,
  }
}
