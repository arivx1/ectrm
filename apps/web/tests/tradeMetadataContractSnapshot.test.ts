import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  resolveTradeFormMetadata,
  type TradeMetadata,
} from '../src/shared/tradeMetadata.ts'

const tradeMetadataContractSnapshotUrl = new URL(
  '../../api/contracts/trade-metadata.contract.json',
  import.meta.url,
)

describe('trade metadata contract snapshot', () => {
  it('remains consumable by the web-side trade metadata helpers', () => {
    const contract = JSON.parse(
      readFileSync(tradeMetadataContractSnapshotUrl, 'utf-8'),
    ) as TradeMetadata

    const formMetadata = resolveTradeFormMetadata(contract)

    expect(contract.contract_version).toBeGreaterThan(0)
    expect(formMetadata.sourceSystem).toBe(contract.defaults.source_system)
    expect(formMetadata.tradeInstrumentTypeOptions).toEqual(contract.vocabulary.instrument_types)
    expect(formMetadata.tradeNatureOptions).toEqual(contract.vocabulary.trade_natures)
    expect(formMetadata.pricingTypeOptions).toEqual(contract.vocabulary.pricing_types)
    expect(formMetadata.pricingTypesRequiringPriceIndex).toEqual(
      contract.rules.pricing_types_requiring_price_index,
    )
    expect(formMetadata.pricingTypesRequiringExplicitPrice).toEqual(
      contract.rules.pricing_types_requiring_explicit_price,
    )
  })
})
