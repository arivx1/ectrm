import { useEffect, useMemo, useState } from 'react'
import type { PriceIndexRecord, ReferenceRecord, TradeLegDraft } from '../../shared/models'

export function makeLegDraft(overrides: Partial<TradeLegDraft> = {}): TradeLegDraft {
  return {
    leg_no: overrides.leg_no ?? 1,
    side: overrides.side ?? 'BUY',
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
        side: typeof row.side === 'string' ? row.side : 'BUY',
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
  const [tradeNatureInput, setTradeNatureInput] = useState('PHYSICAL')
  const [tradeStructureInput, setTradeStructureInput] = useState('SINGLE')
  const [tradeSideInput, setTradeSideInput] = useState('BUY')
  const [bookInput, setBookInput] = useState('')
  const [commodityClassInput, setCommodityClassInput] = useState('')
  const [commodityInput, setCommodityInput] = useState('')
  const [pricingTypeInput, setPricingTypeInput] = useState('FIXED')
  const [priceIndexInput, setPriceIndexInput] = useState('')
  const [priceInput, setPriceInput] = useState('80.00')
  const [volumeInput, setVolumeInput] = useState('1000')
  const [createLegs, setCreateLegs] = useState<TradeLegDraft[]>([
    makeLegDraft({ leg_no: 1 }),
    makeLegDraft({ leg_no: 2, side: 'SELL' }),
  ])

  const createCommodityOptions = useMemo(
    () => activeCommodities.filter((commodity) => commodity.commodity_class === commodityClassInput),
    [activeCommodities, commodityClassInput],
  )

  const createPriceIndexOptions = useMemo(
    () =>
      priceIndices.filter(
        (priceIndex) => priceIndex.is_active && (!commodityInput || priceIndex.commodity_code === commodityInput),
      ),
    [commodityInput, priceIndices],
  )

  useEffect(() => {
    if (!bookInput && activeBooks.length > 0) {
      setBookInput(activeBooks[0].code)
    }
  }, [activeBooks, bookInput])

  useEffect(() => {
    if (!commodityClassInput && commodityClassOptions.length > 0) {
      setCommodityClassInput(commodityClassOptions[0])
    }
  }, [commodityClassInput, commodityClassOptions])

  useEffect(() => {
    if (!commodityClassInput) {
      return
    }
    if (!createCommodityOptions.some((commodity) => commodity.code === commodityInput)) {
      setCommodityInput(createCommodityOptions[0]?.code ?? '')
    }
  }, [commodityClassInput, commodityInput, createCommodityOptions])

  useEffect(() => {
    if (pricingTypeInput === 'FIXED' || pricingTypeInput === 'FORMULA') {
      setPriceIndexInput('')
      return
    }
    if (!createPriceIndexOptions.some((priceIndex) => priceIndex.code === priceIndexInput)) {
      setPriceIndexInput(createPriceIndexOptions[0]?.code ?? '')
    }
  }, [createPriceIndexOptions, priceIndexInput, pricingTypeInput])

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
      makeLegDraft({ leg_no: current.length + 1, side: current.length % 2 === 0 ? 'BUY' : 'SELL' }),
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
    setTradeNatureInput('PHYSICAL')
    setTradeStructureInput('SINGLE')
    setTradeSideInput('BUY')
    setBookInput(activeBooks[0]?.code ?? '')
    setCommodityClassInput(commodityClassOptions[0] ?? '')
    setCommodityInput('')
    setPricingTypeInput('FIXED')
    setPriceIndexInput('')
    setPriceInput('80.00')
    setVolumeInput('1000')
    setCreateLegs([makeLegDraft({ leg_no: 1 }), makeLegDraft({ leg_no: 2, side: 'SELL' })])
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
    bookInput,
    setBookInput,
    commodityClassInput,
    setCommodityClassInput,
    commodityInput,
    setCommodityInput,
    pricingTypeInput,
    setPricingTypeInput,
    priceIndexInput,
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
