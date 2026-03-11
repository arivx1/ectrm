import { useMemo, useState } from 'react'
import type { PriceIndexRecord, ReferenceRecord, TradeLegDraft } from '../../shared/models'
import {
  buildDefaultTradeLegs,
  pricingTypeRequiresPriceIndex,
  tradeFormDefaults,
  tradeSideOptions,
} from '../../shared/trading'

export function makeLegDraft(overrides: Partial<TradeLegDraft> = {}): TradeLegDraft {
  return {
    leg_no: overrides.leg_no ?? 1,
    side: overrides.side ?? tradeFormDefaults.side,
    commodity_class: overrides.commodity_class ?? '',
    commodity: overrides.commodity ?? '',
    volume: overrides.volume ?? '',
  }
}

export function parseLegsFromPayload(payload: Record<string, unknown> | null | undefined): TradeLegDraft[] {
  const rawLegs = payload?.legs
  if (!Array.isArray(rawLegs)) {
    return []
  }

  return rawLegs
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map((row, index) =>
      makeLegDraft({
        leg_no: typeof row.leg_no === 'number' ? row.leg_no : index + 1,
        side: typeof row.side === 'string' ? row.side : tradeFormDefaults.side,
        commodity_class: typeof row.commodity_class === 'string' ? row.commodity_class : '',
        commodity: typeof row.commodity === 'string' ? row.commodity : '',
        volume:
          typeof row.volume === 'number'
            ? String(row.volume)
            : typeof row.volume === 'string'
              ? row.volume
              : '',
      }),
    )
}

export function useTradeCaptureForm(
  activeBooks: ReferenceRecord[],
  commodityClassOptions: string[],
  activeCommodities: ReferenceRecord[],
  priceIndices: PriceIndexRecord[],
) {
  const [tradeIdInput, setTradeIdInput] = useState('')
  const [tradeNatureInput, setTradeNatureInput] = useState<string>(tradeFormDefaults.nature)
  const [tradeStructureInput, setTradeStructureInput] = useState<string>(tradeFormDefaults.structure)
  const [tradeSideInput, setTradeSideInput] = useState<string>(tradeFormDefaults.side)
  const [bookInput, setBookInput] = useState<string>('')
  const [commodityClassInput, setCommodityClassInput] = useState<string>('')
  const [commodityInput, setCommodityInput] = useState<string>('')
  const [pricingTypeInput, setPricingTypeInput] = useState<string>(tradeFormDefaults.pricingType)
  const [priceIndexInput, setPriceIndexInput] = useState<string>('')
  const [priceInput, setPriceInput] = useState<string>(tradeFormDefaults.price)
  const [volumeInput, setVolumeInput] = useState<string>(tradeFormDefaults.volume)
  const [createLegs, setCreateLegs] = useState<TradeLegDraft[]>(() => buildDefaultTradeLegs(makeLegDraft))

  const resolvedBookInput = bookInput || activeBooks[0]?.code || ''
  const resolvedCommodityClassInput = commodityClassInput || commodityClassOptions[0] || ''

  const createCommodityOptions = useMemo(
    () => activeCommodities.filter((commodity) => commodity.commodity_class === resolvedCommodityClassInput),
    [activeCommodities, resolvedCommodityClassInput],
  )

  const resolvedCommodityInput = createCommodityOptions.some((commodity) => commodity.code === commodityInput)
    ? commodityInput
    : createCommodityOptions[0]?.code || ''

  const createPriceIndexOptions = useMemo(
    () =>
      priceIndices.filter(
        (priceIndex) => priceIndex.is_active && (!resolvedCommodityInput || priceIndex.commodity_code === resolvedCommodityInput),
      ),
    [priceIndices, resolvedCommodityInput],
  )

  const resolvedPriceIndexInput =
    !pricingTypeRequiresPriceIndex(pricingTypeInput)
      ? ''
      : createPriceIndexOptions.some((priceIndex) => priceIndex.code === priceIndexInput)
        ? priceIndexInput
        : createPriceIndexOptions[0]?.code || ''

  function updateDraftLeg(index: number, field: keyof TradeLegDraft, value: string) {
    setCreateLegs((current) =>
      current.map((leg, legIndex) =>
        legIndex === index
          ? {
              ...leg,
              [field]: field === 'leg_no' ? Number(value) || leg.leg_no : value,
            }
          : leg,
      ),
    )
  }

  function addDraftLeg() {
    setCreateLegs((current) => [
      ...current,
      makeLegDraft({
        leg_no: current.length + 1,
        side: current.length % 2 === 0 ? tradeSideOptions[0] : tradeSideOptions[1],
      }),
    ])
  }

  function removeDraftLeg(index: number) {
    setCreateLegs((current) =>
      current
        .filter((_, legIndex) => legIndex !== index)
        .map((leg, legIndex) => ({ ...leg, leg_no: legIndex + 1 })),
    )
  }

  function reset() {
    setTradeIdInput('')
    setTradeNatureInput(tradeFormDefaults.nature)
    setTradeStructureInput(tradeFormDefaults.structure)
    setTradeSideInput(tradeFormDefaults.side)
    setBookInput(activeBooks[0]?.code ?? '')
    setCommodityClassInput(commodityClassOptions[0] ?? '')
    setCommodityInput('')
    setPricingTypeInput(tradeFormDefaults.pricingType)
    setPriceIndexInput('')
    setPriceInput(tradeFormDefaults.price)
    setVolumeInput(tradeFormDefaults.volume)
    setCreateLegs(buildDefaultTradeLegs(makeLegDraft))
  }

  return {
    tradeIdInput,
    setTradeIdInput,
    tradeNatureInput,
    setTradeNatureInput,
    tradeStructureInput,
    setTradeStructureInput,
    tradeSideInput,
    setTradeSideInput,
    bookInput: resolvedBookInput,
    setBookInput,
    commodityClassInput: resolvedCommodityClassInput,
    setCommodityClassInput,
    commodityInput: resolvedCommodityInput,
    setCommodityInput,
    pricingTypeInput,
    setPricingTypeInput,
    priceIndexInput: resolvedPriceIndexInput,
    setPriceIndexInput,
    priceInput,
    setPriceInput,
    volumeInput,
    setVolumeInput,
    createLegs,
    createCommodityOptions,
    createPriceIndexOptions,
    updateDraftLeg,
    addDraftLeg,
    removeDraftLeg,
    reset,
  }
}
