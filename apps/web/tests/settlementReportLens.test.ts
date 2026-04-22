import { describe, expect, it } from 'vitest'

import {
  ALL_FILTER_VALUE,
  filtersEqual,
  mergeSettlementFilterCatalog,
  normalizeSettlementReportFilters,
  sanitizeFilters,
  sortSettlementReportPresets,
} from '../src/workspaces/reports/settlementReportLens'

describe('settlement report lens helpers', () => {
  it('normalizes stored filters from mixed casing and snake_case keys', () => {
    expect(
      normalizeSettlementReportFilters({
        book: ' Gulf ',
        counterparty: ' shell ',
        currency: 'usd',
        exception_type: ' short_pay ',
        severity: 'BLOCKED',
      }),
    ).toEqual({
      book: 'Gulf',
      counterparty: 'shell',
      currency: 'USD',
      exceptionType: 'SHORT_PAY',
      severity: 'blocked',
    })
  })

  it('merges api, fallback, and active selections into one catalog', () => {
    expect(
      mergeSettlementFilterCatalog({
        apiOptions: {
          books: ['CRUDE'],
          counterparties: ['BP'],
          currencies: ['USD'],
          exception_types: ['SHORT_PAY'],
          severities: ['blocked'],
        },
        fallbackOptions: {
          books: ['NGL'],
          counterparties: ['Shell'],
          currencies: ['CAD'],
          exceptionTypes: ['OVERDUE'],
          severities: ['in-progress'],
        },
        filters: {
          book: 'POWER',
          counterparty: ALL_FILTER_VALUE,
          currency: 'EUR',
          exceptionType: ALL_FILTER_VALUE,
          severity: 'blocked',
        },
      }),
    ).toEqual({
      books: ['CRUDE', 'NGL', 'POWER'],
      counterparties: ['BP', 'Shell'],
      currencies: ['CAD', 'EUR', 'USD'],
      exceptionTypes: ['OVERDUE', 'SHORT_PAY'],
      severities: ['blocked', 'in-progress'],
    })
  })

  it('sanitizes invalid selections while preserving valid ones', () => {
    const current = {
      book: 'CRUDE',
      counterparty: 'Shell',
      currency: 'USD',
      exceptionType: 'SHORT_PAY',
      severity: 'blocked',
    }

    const sanitized = sanitizeFilters(current, {
      books: ['POWER'],
      counterparties: ['Shell'],
      currencies: ['USD'],
      exceptionTypes: ['OVERDUE'],
      severities: ['blocked'],
    })

    expect(sanitized).toEqual({
      book: ALL_FILTER_VALUE,
      counterparty: 'Shell',
      currency: 'USD',
      exceptionType: ALL_FILTER_VALUE,
      severity: 'blocked',
    })
    expect(filtersEqual(sanitized, current)).toBe(false)
  })

  it('sorts shared presets ahead of personal ones and then by name', () => {
    const presets = sortSettlementReportPresets([
      {
        presetId: 3,
        name: 'zulu',
        scope: 'PERSONAL',
        filters: normalizeSettlementReportFilters(null),
        canEdit: true,
        updatedAt: null,
        updatedBy: null,
      },
      {
        presetId: 2,
        name: 'alpha',
        scope: 'SHARED',
        filters: normalizeSettlementReportFilters(null),
        canEdit: true,
        updatedAt: null,
        updatedBy: null,
      },
      {
        presetId: 1,
        name: 'bravo',
        scope: 'SHARED',
        filters: normalizeSettlementReportFilters(null),
        canEdit: true,
        updatedAt: null,
        updatedBy: null,
      },
    ])

    expect(presets.map((preset) => `${preset.scope}:${preset.name}`)).toEqual([
      'SHARED:alpha',
      'SHARED:bravo',
      'PERSONAL:zulu',
    ])
  })
})
