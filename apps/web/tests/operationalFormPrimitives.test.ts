import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  OperationalFormActions,
  OperationalFormActionsCopy,
  OperationalFormButtonRow,
  OperationalInputField,
  OperationalFormGrid,
  OperationalSelectField,
  OperationalTextareaField,
} from '../src/workspaces/operations/operationalFormPrimitives'

describe('operational form primitives', () => {
  it('renders shared form fields with consistent operational classes', () => {
    const markup = renderToStaticMarkup(
      createElement(
        OperationalFormGrid,
        { className: 'settlement-payment-grid' },
        createElement(OperationalInputField, {
          label: 'Reference',
          value: 'PAY-001',
          readOnly: true,
        }),
        createElement(
          OperationalSelectField,
          {
            label: 'Status',
            value: 'PENDING',
            disabled: true,
            onChange: () => {},
          },
          createElement('option', { value: 'PENDING' }, 'Pending'),
        ),
        createElement(OperationalTextareaField, {
          label: 'Notes',
          value: 'Desk note',
          readOnly: true,
          rows: 2,
          wide: true,
          variant: 'compact',
        }),
      ),
    )

    expect(markup).toContain('workflow-item-grid settlement-payment-grid')
    expect(markup).toContain('Reference')
    expect(markup).toContain('Status')
    expect(markup).toContain('Notes')
    expect(markup).toContain('control control-compact')
    expect(markup).toContain('field field-wide')
  })

  it('renders shared action wrappers for copy and button rows', () => {
    const markup = renderToStaticMarkup(
      createElement(
        OperationalFormActions,
        { className: 'shipment-card-actions' },
        createElement(OperationalFormActionsCopy, null, createElement('p', null, 'Shared guidance')),
        createElement(
          OperationalFormButtonRow,
          null,
          createElement('button', { type: 'button' }, 'Save'),
          createElement('button', { type: 'button' }, 'Approve'),
        ),
      ),
    )

    expect(markup).toContain('workflow-item-actions shipment-card-actions')
    expect(markup).toContain('shipment-card-copy')
    expect(markup).toContain('Shared guidance')
    expect(markup).toContain('workflow-item-button-row')
    expect(markup).toContain('Approve')
  })
})
