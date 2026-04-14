import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  OperationalDescriptorForm,
  OperationalDescriptorFormFeedback,
  resolveOperationalFormDefinition,
} from '../src/workspaces/operations/operationalFormRegistry'

describe('operational form registry', () => {
  it('resolves confirmation form help copy and validation from the registry', () => {
    const form = resolveOperationalFormDefinition('confirmationLedgerRecord', {
      candidateDocuments: [],
      comparisonMismatchCount: 2,
      currentConfirmation: {
        comparison_status: 'MISMATCHED',
        source_document_display_name: 'confirm.pdf',
      } as never,
      draft: {
        comparisonWaiverNote: '',
        confirmationNumber: 'CONF-001',
        confirmedAt: '',
        disputeReason: '',
        issueMethod: 'EMAIL',
        issueNote: '',
        issueRecipient: '',
        notes: '',
        receivedAt: '',
        responseMethod: 'EMAIL',
        responseNote: '',
        responseReference: '',
        sentAt: '',
        sourceDocumentId: '',
        status: 'SENT',
      },
      hasAuthenticatedSession: false,
      isSaving: false,
      onSourceDocumentChange: vi.fn(),
      responseDisputeNeedsComment: true,
      selectedDocumentMissing: false,
      statusOptions: ['SENT', 'CONFIRMED'],
      updateDraft: vi.fn(),
      workflowOwner: 'ops.user',
    })

    expect(form.helpText).toContain('Resolve the mismatches')
    expect(form.validations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tone: 'error' }),
        expect.objectContaining({ message: expect.stringContaining('Counterparty dispute requires a dispute reason') }),
      ]),
    )

    const sourceField = form.fields.find((field) => field.key === 'sourceDocumentId')
    expect(sourceField).toEqual(expect.objectContaining({ disabled: true }))
  })

  it('renders descriptor-driven payment create forms through the shared renderer', () => {
    const form = resolveOperationalFormDefinition('paymentCreate', {
      createPending: false,
      draft: {
        dueAt: '2026-04-20',
        notes: 'Desk note',
        paymentAmount: '1000',
        paymentCurrencyCode: 'USD',
        paymentReference: 'PAY-001',
        receivedAt: '',
        status: 'PENDING',
      },
      formatMoney: (value, currencyCode) => `${currencyCode ?? 'USD'} ${value ?? 0}`,
      invoice: {
        invoice_amount: 1000,
        invoice_currency_code: 'USD',
        invoice_number: 'INV-001',
        payment_status: 'PENDING',
      } as never,
      statusOptions: [
        { value: 'PENDING', label: 'PENDING' },
        { value: 'PAID', label: 'PAID' },
      ],
      updateDraft: vi.fn(),
    })

    const markup = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(OperationalDescriptorForm, {
          className: 'settlement-payment-grid',
          form,
        }),
        createElement(OperationalDescriptorFormFeedback, { form }),
      ),
    )

    expect(form.helpText).toContain('Invoice INV-001 for USD 1000')
    expect(markup).toContain('workflow-item-grid settlement-payment-grid')
    expect(markup).toContain('New Reference')
    expect(markup).toContain('Status')
    expect(markup).toContain('Desk note')
  })
})
