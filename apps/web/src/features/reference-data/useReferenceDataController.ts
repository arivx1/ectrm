import { useState } from 'react'

import { submitReferenceMutation } from '../../entities/reference-data/api'
import type {
  CounterpartyCreditProfileRecord,
  CounterpartyCreditReportRow,
  CounterpartyExternalCreditSnapshotRecord,
  CounterpartyRecord,
  CounterpartyStandards,
  CurrencyRecord,
  LocationRecord,
  LocationStandards,
  PortfolioRecord,
  PriceIndexRecord,
  ReferenceRecord,
  Trade,
  UnitRecord,
} from '../../shared/models'
import { getMutationContext } from '../../shared/mutation'
import { useReferenceDataDerivedState } from './referenceDataDerived'
import {
  useReferenceDataCommodityController,
  useReferenceDataCurrencyController,
  useReferenceDataLocationController,
  useReferenceDataPortfolioController,
  useReferenceDataPriceIndexController,
  useReferenceDataUnitController,
} from './useReferenceDataEntityControllers'
import { useReferenceDataBookController } from './useReferenceDataBookController'
import { useReferenceDataCounterpartyController } from './useReferenceDataCounterpartyController'
import { useReferenceDataWorkspace } from './useReferenceDataWorkspace'

export {
  buildBookForm,
  buildCounterpartyCreditProfileForm,
  emptyCounterpartyCreditProfileForm,
  parseDelimitedLine,
  parsePastedGrid,
  resolveBookPasteMapping,
  sameText,
  stageBooksFromPasteInput,
  validateBookSheetForm,
} from './referenceDataHelpers'
export type { BookPasteIssue, BookPasteSummary } from './referenceDataHelpers'

type UseReferenceDataControllerArgs = {
  apiBase: string
  reloadData: () => Promise<void>
  trades: Trade[]
  books: ReferenceRecord[]
  commodities: ReferenceRecord[]
  priceIndices: PriceIndexRecord[]
  currencies: CurrencyRecord[]
  units: UnitRecord[]
  locations: LocationRecord[]
  counterparties: CounterpartyRecord[]
  counterpartyCreditProfiles: CounterpartyCreditProfileRecord[]
  counterpartyExternalCreditSnapshots: CounterpartyExternalCreditSnapshotRecord[]
  counterpartyCreditReport: CounterpartyCreditReportRow[]
  portfolios: PortfolioRecord[]
  activeBooks: ReferenceRecord[]
  activeCommodities: ReferenceRecord[]
  activeCurrencies: CurrencyRecord[]
  activeUnits: UnitRecord[]
  activeLocations: LocationRecord[]
  locationStandards: LocationStandards
  counterpartyStandards: CounterpartyStandards
  commodityClassOrder: readonly string[]
}

export function useReferenceDataController({
  apiBase,
  reloadData,
  trades,
  books,
  commodities,
  priceIndices,
  currencies,
  units,
  locations,
  counterparties,
  counterpartyCreditProfiles,
  counterpartyExternalCreditSnapshots,
  counterpartyCreditReport,
  portfolios,
  activeBooks,
  activeCommodities,
  activeCurrencies,
  activeUnits,
  activeLocations,
  locationStandards,
  counterpartyStandards,
  commodityClassOrder,
}: UseReferenceDataControllerArgs) {
  const [referenceActionError, setReferenceActionError] = useState('')
  const [referenceActionSuccess, setReferenceActionSuccess] = useState('')
  const [savingReference, setSavingReference] = useState(false)

  const workspace = useReferenceDataWorkspace({
    books,
    commodities,
    priceIndices,
    currencies,
    units,
    locations,
    counterparties,
    portfolios,
    activeBooks,
    activeCommodities,
    activeCurrencies,
    activeUnits,
    activeLocations,
    locationStandards,
    counterpartyStandards,
    commodityClassOrder,
  })

  const derived = useReferenceDataDerivedState({
    trades,
    priceIndices,
    counterpartyCreditProfiles,
    counterpartyExternalCreditSnapshots,
    counterpartyCreditReport,
  })

  function resetReferenceMessages() {
    setReferenceActionError('')
    setReferenceActionSuccess('')
  }

  function beginReferenceAction(action: () => void) {
    resetReferenceMessages()
    action()
  }

  function currentActorId(): string {
    return getMutationContext().actorId
  }

  async function submitReference(
    path: string,
    method: 'POST' | 'PUT',
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setSavingReference(true)
    resetReferenceMessages()

    try {
      await submitReferenceMutation(apiBase, path, method, payload)
      await reloadData()
      setReferenceActionSuccess(successMessage)
    } catch (err) {
      setReferenceActionError(err instanceof Error ? err.message : 'Reference update failed.')
    } finally {
      setSavingReference(false)
    }
  }

  const bookController = useReferenceDataBookController({
    apiBase,
    reloadData,
    books,
    workspace,
    bookUsageByCode: derived.bookUsageByCode,
    beginReferenceAction,
    resetReferenceMessages,
    currentActorId,
    setReferenceActionError,
    setReferenceActionSuccess,
    setSavingReference,
    submitReference,
  })

  const commodityController = useReferenceDataCommodityController({
    workspace,
    commodities,
    commodityClassOrder,
    commodityUsageByCode: derived.commodityUsageByCode,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
    setReferenceActionSuccess,
  })

  const priceIndexController = useReferenceDataPriceIndexController({
    workspace,
    activeCommodities,
    priceIndices,
    priceIndexUsageByCode: derived.priceIndexUsageByCode,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
    setReferenceActionSuccess,
  })

  const currencyController = useReferenceDataCurrencyController({
    workspace,
    currencies,
    currencyUsageByCode: derived.currencyUsageByCode,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
    setReferenceActionSuccess,
  })

  const unitController = useReferenceDataUnitController({
    workspace,
    selectedCommodity: workspace.selectedCommodity,
    commodityClassOrder,
    units,
    unitUsageByCode: derived.unitUsageByCode,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
    setReferenceActionSuccess,
  })

  const locationController = useReferenceDataLocationController({
    workspace,
    locations,
    locationStandards,
    locationUsageByCode: derived.locationUsageByCode,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
    setReferenceActionSuccess,
  })

  const counterpartyController = useReferenceDataCounterpartyController({
    workspace,
    counterpartyStandards,
    counterpartyCreditProfileByCode: derived.counterpartyCreditProfileByCode,
    counterpartyCreditReportByCode: derived.counterpartyCreditReportByCode,
    counterpartyExternalCreditSnapshotsByCode: derived.counterpartyExternalCreditSnapshotsByCode,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
    setReferenceActionSuccess,
  })

  const portfolioController = useReferenceDataPortfolioController({
    workspace,
    beginReferenceAction,
    currentActorId,
    submitReference,
    setReferenceActionError,
  })

  const selectedBookUsage = workspace.selectedBook
    ? derived.bookUsageByCode.get(workspace.selectedBook.code) ?? { activeTrades: 0, totalTrades: 0 }
    : null

  return {
    ...workspace,
    activeBooks,
    activeCommodities,
    activeCurrencies,
    activeLocations,
    locationStandards,
    counterpartyStandards,
    commodityClassOrder,
    referenceActionError,
    referenceActionSuccess,
    savingReference,
    selectedBookUsage,
    counterpartyCreditReportByCode: derived.counterpartyCreditReportByCode,
    ...bookController,
    ...commodityController,
    ...priceIndexController,
    ...currencyController,
    ...unitController,
    ...locationController,
    ...counterpartyController,
    ...portfolioController,
  }
}
