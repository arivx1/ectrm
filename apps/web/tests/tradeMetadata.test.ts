import { describe, expect, it } from 'vitest'

import {
  buildFallbackTradeMetadata,
  resolveTradeFormMetadata,
  tradeFormMetadataRequiresExplicitPrice,
  tradeFormMetadataRequiresPriceIndex,
  type TradeMetadata,
} from '../src/shared/tradeMetadata.ts'

describe('trade metadata helpers', () => {
  it('builds a fallback contract from the existing local trading defaults', () => {
    const fallback = buildFallbackTradeMetadata()
    const formMetadata = resolveTradeFormMetadata(fallback)

    expect(fallback.contract_version).toBe(0)
    expect(fallback.defaults.source_system).toBe('ETRM')
    expect(fallback.defaults.workflow_statuses_by_trade_nature.PHYSICAL?.nomination_status).toBe('PENDING')
    expect(fallback.defaults.workflow_statuses_by_trade_nature.FINANCIAL?.nomination_status).toBe('NOT_REQUIRED')
    expect(formMetadata.tradeInstrumentTypeOptions).toEqual(['LINEAR', 'OPTION'])
    expect(tradeFormMetadataRequiresPriceIndex(formMetadata, 'HYBRID')).toBe(true)
    expect(tradeFormMetadataRequiresExplicitPrice(formMetadata, 'FIXED')).toBe(true)
  })

  it('prefers the server contract when vocabulary and defaults are present', () => {
    const serverMetadata: TradeMetadata = {
      contract_version: 1,
      vocabulary: {
        trade_natures: ['FINANCIAL', 'PHYSICAL'],
        instrument_types: ['OPTION', 'LINEAR', 'SPREAD'],
        trade_structures: ['SWAP', 'SINGLE'],
        trade_sides: ['SELL', 'BUY'],
        trade_statuses: ['ACTIVE', 'CANCELLED'],
        option_types: ['PUT', 'CALL'],
        option_styles: ['EUROPEAN', 'AMERICAN'],
        option_lifecycle_event_types: ['OptionExpired', 'OptionExercised'],
        pricing_types: ['FORMULA', 'INDEX'],
        pricing_statuses: ['PRICED', 'PENDING'],
        confirmation_statuses: ['CONFIRMED', 'PENDING'],
        nomination_statuses: ['SCHEDULED', 'PENDING'],
        allocation_statuses: ['ALLOCATED', 'PENDING'],
        actualization_statuses: ['ACTUALIZED', 'PENDING'],
        invoice_statuses: ['ISSUED', 'PENDING'],
        payment_statuses: ['PAID', 'PENDING'],
        settlement_statuses: ['SETTLED', 'PENDING'],
        credit_approval_statuses: ['APPROVED'],
        option_settlement_statuses: ['BOOKED'],
      },
      defaults: {
        source_system: 'SERVER',
        instrument_type: 'SPREAD',
        trade_nature: 'FINANCIAL',
        trade_structure: 'SWAP',
        trade_side: 'SELL',
        trade_status: 'ACTIVE',
        pricing_type: 'INDEX',
        pricing_status: 'PRICED',
        settlement_status: 'SETTLED',
        option_style: 'EUROPEAN',
        workflow_statuses_by_trade_nature: {
          FINANCIAL: {
            confirmation_status: 'CONFIRMED',
            nomination_status: 'SCHEDULED',
            allocation_status: 'ALLOCATED',
            actualization_status: 'ACTUALIZED',
            invoice_status: 'ISSUED',
            payment_status: 'PAID',
          },
        },
      },
      rules: {
        pricing_types_requiring_price_index: ['INDEX'],
        pricing_types_requiring_explicit_price: ['FORMULA'],
        trade_structures_requiring_top_level_volume: ['SINGLE'],
        option_allowed_instrument_type: 'OPTION',
        option_required_trade_nature: 'FINANCIAL',
        option_required_trade_structure: 'SINGLE',
        option_required_pricing_type: 'FIXED',
        option_lifecycle_event_to_status: {
          OptionExpired: 'EXPIRED',
        },
      },
    }

    const formMetadata = resolveTradeFormMetadata(serverMetadata)

    expect(formMetadata.sourceSystem).toBe('SERVER')
    expect(formMetadata.tradeInstrumentTypeOptions).toEqual(['OPTION', 'LINEAR', 'SPREAD'])
    expect(formMetadata.defaults.instrumentType).toBe('SPREAD')
    expect(formMetadata.defaults.tradeNature).toBe('FINANCIAL')
    expect(formMetadata.defaults.pricingType).toBe('INDEX')
    expect(formMetadata.defaults.optionStyle).toBe('EUROPEAN')
    expect(formMetadata.defaults.optionType).toBe('PUT')
    expect(tradeFormMetadataRequiresPriceIndex(formMetadata, 'INDEX')).toBe(true)
    expect(tradeFormMetadataRequiresPriceIndex(formMetadata, 'FORMULA')).toBe(false)
    expect(tradeFormMetadataRequiresExplicitPrice(formMetadata, 'FORMULA')).toBe(true)
  })
})
