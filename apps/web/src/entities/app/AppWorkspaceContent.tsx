import { lazy } from 'react'

import type { useAppAppearance } from './useAppAppearance'
import type { useAppRouteState } from './useAppRouteState'
import type { useAppShellState } from './useAppShellState'
import type { useAppTradeActions } from './useAppTradeActions'
import type { useAppWorkspaceData } from './useAppWorkspaceData'
import type { useAppWorkspaceSummary } from './useAppWorkspaceSummary'
import type { useTradeAmendForm } from '../../features/trades/useTradeAmendForm'
import type { useTradeCaptureForm } from '../../features/trades/useTradeCaptureForm'
import { useReferenceDataController } from '../../features/reference-data/useReferenceDataController'
import {
  formatCommodityClass,
  formatDate,
  formatDateOnly,
  formatMoney,
  formatNumber,
  statusTone,
} from '../../shared/format'
import {
  allocationStatusOptions,
  confirmationStatusOptions,
  invoiceStatusOptions,
  nominationStatusOptions,
  optionStyleOptions,
  optionTypeOptions,
  paymentStatusOptions,
  pricingStatusOptions,
  pricingTypeOptions,
  settlementStatusOptions,
  tradeInstrumentTypeOptions,
  tradeNatureOptions,
  tradeSideOptions,
  tradeStructureOptions,
} from '../../shared/trading'
import type { DocumentationDocumentKey } from '../../workspaces/docs/DocumentationWorkspace'

const DocumentationWorkspace = lazy(() =>
  import('../../workspaces/docs/DocumentationWorkspace').then((module) => ({
    default: module.DocumentationWorkspace,
  })),
)
const DashboardWorkspace = lazy(() =>
  import('../../workspaces/dashboard/DashboardWorkspace').then((module) => ({
    default: module.DashboardWorkspace,
  })),
)
const TradingWorkspace = lazy(() =>
  import('../../workspaces/trading/TradingWorkspace').then((module) => ({
    default: module.TradingWorkspace,
  })),
)
const EventsWorkspace = lazy(() =>
  import('../../workspaces/events/EventsWorkspace').then((module) => ({
    default: module.EventsWorkspace,
  })),
)
const RiskWorkspace = lazy(() =>
  import('../../workspaces/risk/RiskWorkspace').then((module) => ({
    default: module.RiskWorkspace,
  })),
)
const PositionsWorkspace = lazy(() =>
  import('../../workspaces/positions/PositionsWorkspace').then((module) => ({
    default: module.PositionsWorkspace,
  })),
)
const DeliveryWorkspace = lazy(() =>
  import('../../workspaces/shipments/ShipmentWorkspace').then((module) => ({
    default: module.DeliveryWorkspace,
  })),
)
const SchedulingWorkspace = lazy(() =>
  import('../../workspaces/scheduling/SchedulingWorkspace').then((module) => ({
    default: module.SchedulingWorkspace,
  })),
)
const OperationsWorkspace = lazy(() =>
  import('../../workspaces/operations/OperationsWorkspace').then((module) => ({
    default: module.OperationsWorkspace,
  })),
)
const SettlementWorkspace = lazy(() =>
  import('../../workspaces/settlement/SettlementWorkspace').then((module) => ({
    default: module.SettlementWorkspace,
  })),
)
const ReportsWorkspace = lazy(() =>
  import('../../workspaces/reports/ReportsWorkspace').then((module) => ({
    default: module.ReportsWorkspace,
  })),
)
const ReferenceDataWorkspace = lazy(() =>
  import('../../workspaces/reference-data/ReferenceDataWorkspace').then((module) => ({
    default: module.ReferenceDataWorkspace,
  })),
)
const AdminWorkspace = lazy(() =>
  import('../../workspaces/admin/AdminWorkspace').then((module) => ({
    default: module.AdminWorkspace,
  })),
)
const SettingsWorkspace = lazy(() =>
  import('../../workspaces/settings/SettingsWorkspace').then((module) => ({
    default: module.SettingsWorkspace,
  })),
)
const AssistantWorkspace = lazy(() =>
  import('../../workspaces/assistant/AssistantWorkspace').then((module) => ({
    default: module.AssistantWorkspace,
  })),
)

type AppWorkspaceContentProps = {
  activeDocumentationDocumentKey: DocumentationDocumentKey
  captureForm: ReturnType<typeof useTradeCaptureForm>
  amendForm: ReturnType<typeof useTradeAmendForm>
  appearance: Pick<
    ReturnType<typeof useAppAppearance>,
    'appearanceSettings' | 'handleAppearanceSettingsChange' | 'handleAppearanceSettingsReset' | 'resolvedColorMode'
  >
  currentView: ReturnType<typeof useAppRouteState>['currentView']
  handleDocumentationDocumentChange: ReturnType<typeof useAppRouteState>['handleDocumentationDocumentChange']
  navigateToTrade: ReturnType<typeof useAppRouteState>['navigateToTrade']
  navigateToView: ReturnType<typeof useAppRouteState>['navigateToView']
  referenceState: ReturnType<typeof useReferenceDataController>
  hrefForView: ReturnType<typeof useAppRouteState>['hrefForView']
  handleRoadmapPublished: ReturnType<typeof useAppShellState>['handleRoadmapPublished']
  roadmapRefreshVersion: ReturnType<typeof useAppShellState>['roadmapRefreshVersion']
  selectedTradeId: ReturnType<typeof useAppRouteState>['selectedTradeId']
  setInspectorTab: ReturnType<typeof useAppShellState>['setInspectorTab']
  setSelectedTradeId: ReturnType<typeof useAppRouteState>['setSelectedTradeId']
  shell: Pick<ReturnType<typeof useAppShellState>, 'eventFilter' | 'inspectorTab' | 'setEventFilter'>
  summary: ReturnType<typeof useAppWorkspaceSummary>
  tradeActions: ReturnType<typeof useAppTradeActions>
  workspaceData: ReturnType<typeof useAppWorkspaceData>
}

export function AppWorkspaceContent({
  activeDocumentationDocumentKey,
  captureForm,
  amendForm,
  appearance,
  currentView,
  handleDocumentationDocumentChange,
  hrefForView,
  handleRoadmapPublished,
  navigateToTrade,
  navigateToView,
  referenceState,
  roadmapRefreshVersion,
  selectedTradeId,
  setInspectorTab,
  setSelectedTradeId,
  shell,
  summary,
  tradeActions,
  workspaceData,
}: AppWorkspaceContentProps) {
  const referenceDataLoading = workspaceData.groupLoading.reference && !workspaceData.groupLoaded.reference

  const tradeCaptureFormProps = {
    onSubmit: tradeActions.handleCreateTrade,
    tradeIdInput: captureForm.tradeIdInput,
    setTradeIdInput: captureForm.setTradeIdInput,
    tradeInstrumentTypeInput: captureForm.tradeInstrumentTypeInput,
    setTradeInstrumentTypeInput: captureForm.setTradeInstrumentTypeInput,
    optionTypeInput: captureForm.optionTypeInput,
    setOptionTypeInput: captureForm.setOptionTypeInput,
    optionStyleInput: captureForm.optionStyleInput,
    setOptionStyleInput: captureForm.setOptionStyleInput,
    optionExpirationDateInput: captureForm.optionExpirationDateInput,
    setOptionExpirationDateInput: captureForm.setOptionExpirationDateInput,
    optionStrikePriceInput: captureForm.optionStrikePriceInput,
    setOptionStrikePriceInput: captureForm.setOptionStrikePriceInput,
    tradeNatureInput: captureForm.tradeNatureInput,
    setTradeNatureInput: captureForm.setTradeNatureInput,
    tradeStructureInput: captureForm.tradeStructureInput,
    setTradeStructureInput: captureForm.setTradeStructureInput,
    tradeSideInput: captureForm.tradeSideInput,
    setTradeSideInput: captureForm.setTradeSideInput,
    bookInput: captureForm.bookInput,
    setBookInput: captureForm.setBookInput,
    activeBooks: summary.activeBooks,
    commodityClassInput: captureForm.commodityClassInput,
    setCommodityClassInput: captureForm.setCommodityClassInput,
    commodityClassOptions: summary.commodityClassOptions,
    commodityInput: captureForm.commodityInput,
    setCommodityInput: captureForm.setCommodityInput,
    createCommodityOptions: captureForm.createCommodityOptions,
    pricingTypeInput: captureForm.pricingTypeInput,
    setPricingTypeInput: captureForm.setPricingTypeInput,
    pricingStatusInput: captureForm.pricingStatusInput,
    setPricingStatusInput: captureForm.setPricingStatusInput,
    priceIndexInput: captureForm.priceIndexInput,
    setPriceIndexInput: captureForm.setPriceIndexInput,
    createPriceIndexOptions: captureForm.createPriceIndexOptions,
    priceInput: captureForm.priceInput,
    setPriceInput: captureForm.setPriceInput,
    volumeInput: captureForm.volumeInput,
    setVolumeInput: captureForm.setVolumeInput,
    qualitySpecInput: captureForm.qualitySpecInput,
    setQualitySpecInput: captureForm.setQualitySpecInput,
    unitInput: captureForm.unitInput,
    setUnitInput: captureForm.setUnitInput,
    createUnitOptions: captureForm.createUnitOptions,
    externalTradeIdInput: captureForm.externalTradeIdInput,
    setExternalTradeIdInput: captureForm.setExternalTradeIdInput,
    sourceSystemInput: captureForm.sourceSystemInput,
    executionTimestampInput: captureForm.executionTimestampInput,
    setExecutionTimestampInput: captureForm.setExecutionTimestampInput,
    tradeDateInput: captureForm.tradeDateInput,
    setTradeDateInput: captureForm.setTradeDateInput,
    effectiveStartDateInput: captureForm.effectiveStartDateInput,
    setEffectiveStartDateInput: captureForm.setEffectiveStartDateInput,
    effectiveEndDateInput: captureForm.effectiveEndDateInput,
    setEffectiveEndDateInput: captureForm.setEffectiveEndDateInput,
    portfolioInput: captureForm.portfolioInput,
    setPortfolioInput: captureForm.setPortfolioInput,
    createPortfolioOptions: captureForm.createPortfolioOptions,
    counterpartyInput: captureForm.counterpartyInput,
    setCounterpartyInput: captureForm.setCounterpartyInput,
    createCounterpartyOptions: captureForm.createCounterpartyOptions,
    tradeCurrencyInput: captureForm.tradeCurrencyInput,
    setTradeCurrencyInput: captureForm.setTradeCurrencyInput,
    createCurrencyOptions: captureForm.createCurrencyOptions,
    locationInput: captureForm.locationInput,
    setLocationInput: captureForm.setLocationInput,
    createLocationOptions: captureForm.createLocationOptions,
    deliveryStartInput: captureForm.deliveryStartInput,
    setDeliveryStartInput: captureForm.setDeliveryStartInput,
    deliveryEndInput: captureForm.deliveryEndInput,
    setDeliveryEndInput: captureForm.setDeliveryEndInput,
    priceUnitInput: captureForm.priceUnitInput,
    setPriceUnitInput: captureForm.setPriceUnitInput,
    settlementStatusInput: captureForm.settlementStatusInput,
    setSettlementStatusInput: captureForm.setSettlementStatusInput,
    traderUserInput: captureForm.traderUserInput,
    setTraderUserInput: captureForm.setTraderUserInput,
    duplicateSourceTradeId: captureForm.duplicateSourceTradeId,
    createLegs: captureForm.createLegs,
    activeCommodities: summary.activeCommodities,
    addDraftLeg: captureForm.addDraftLeg,
    removeDraftLeg: captureForm.removeDraftLeg,
    updateDraftLeg: captureForm.updateDraftLeg,
    submitting: tradeActions.submitting,
    referenceDataLoading,
    hasReferenceOptions: summary.hasReferenceOptions,
    createError: tradeActions.createError,
    counterpartyCreditPolicyPreview: tradeActions.createCounterpartyCreditPolicyPreview,
    tradeInstrumentTypeOptions,
    optionTypeOptions,
    optionStyleOptions,
    tradeNatureOptions,
    tradeStructureOptions,
    tradeSideOptions,
    pricingTypeOptions,
    pricingStatusOptions,
    settlementStatusOptions,
    formatCommodityClass,
  }

  switch (currentView) {
    case 'guide':
      return (
        <DocumentationWorkspace
          activeDocumentKey={activeDocumentationDocumentKey}
          getViewHref={hrefForView}
          onDocumentKeyChange={handleDocumentationDocumentChange}
          onOpenView={navigateToView}
          roadmapRefreshVersion={roadmapRefreshVersion}
        />
      )
    case 'dashboard':
      return (
        <DashboardWorkspace
          authSession={workspaceData.authSession}
          appLoading={workspaceData.appLoading}
          activeTrades={summary.activeTrades}
          priceIndices={workspaceData.priceIndices}
          positionsWithClass={summary.positionsWithClass}
          events={workspaceData.events}
          formatCommodityClass={formatCommodityClass}
          formatMoney={formatMoney}
          formatNumber={formatNumber}
          formatDate={formatDate}
        />
      )
    case 'trades':
      return (
        <TradingWorkspace
          authSession={workspaceData.authSession}
          tradeCaptureFormProps={tradeCaptureFormProps}
          trades={workspaceData.trades}
          tradeWorkflowItems={workspaceData.tradeWorkflowItems}
          selectedTrade={summary.selectedTrade}
          selectedTradeId={selectedTradeId}
          selectedTradeEvents={summary.selectedTradeEvents}
          inspectorTab={shell.inspectorTab}
          setSelectedTradeId={setSelectedTradeId}
          setInspectorTab={setInspectorTab}
          handleDuplicateTrade={tradeActions.handleDuplicateTrade}
          handleAmendTrade={tradeActions.handleAmendTrade}
          handleCancelTrade={tradeActions.handleCancelTrade}
          handleOptionLifecycleEvent={tradeActions.handleOptionLifecycleEvent}
          optionLifecycleSubmittingEvent={tradeActions.optionLifecycleSubmittingEvent}
          amendmentPreviewFields={tradeActions.amendmentPreview.changedFields}
          cancelImpactSummary={tradeActions.cancelImpactSummary}
          amendmentLockedReason={tradeActions.amendmentLockedReason}
          amendExternalTradeIdInput={amendForm.amendExternalTradeIdInput}
          setAmendExternalTradeIdInput={amendForm.setAmendExternalTradeIdInput}
          amendSourceSystemInput={amendForm.amendSourceSystemInput}
          amendExecutionTimestampInput={amendForm.amendExecutionTimestampInput}
          setAmendExecutionTimestampInput={amendForm.setAmendExecutionTimestampInput}
          amendTradeDateInput={amendForm.amendTradeDateInput}
          setAmendTradeDateInput={amendForm.setAmendTradeDateInput}
          amendEffectiveStartDateInput={amendForm.amendEffectiveStartDateInput}
          setAmendEffectiveStartDateInput={amendForm.setAmendEffectiveStartDateInput}
          amendEffectiveEndDateInput={amendForm.amendEffectiveEndDateInput}
          setAmendEffectiveEndDateInput={amendForm.setAmendEffectiveEndDateInput}
          amendQualitySpecInput={amendForm.amendQualitySpecInput}
          setAmendQualitySpecInput={amendForm.setAmendQualitySpecInput}
          amendUnitInput={amendForm.amendUnitInput}
          setAmendUnitInput={amendForm.setAmendUnitInput}
          amendUnitOptions={amendForm.amendUnitOptions}
          amendTradeCurrencyInput={amendForm.amendTradeCurrencyInput}
          setAmendTradeCurrencyInput={amendForm.setAmendTradeCurrencyInput}
          amendCurrencyOptions={amendForm.amendCurrencyOptions}
          amendLocationInput={amendForm.amendLocationInput}
          setAmendLocationInput={amendForm.setAmendLocationInput}
          amendLocationOptions={amendForm.amendLocationOptions}
          amendDeliveryStartInput={amendForm.amendDeliveryStartInput}
          setAmendDeliveryStartInput={amendForm.setAmendDeliveryStartInput}
          amendDeliveryEndInput={amendForm.amendDeliveryEndInput}
          setAmendDeliveryEndInput={amendForm.setAmendDeliveryEndInput}
          amendPriceUnitInput={amendForm.amendPriceUnitInput}
          setAmendPriceUnitInput={amendForm.setAmendPriceUnitInput}
          amendPriceUnitOptions={amendForm.amendPriceUnitOptions}
          amendTradeInstrumentTypeInput={amendForm.amendTradeInstrumentTypeInput}
          setAmendTradeInstrumentTypeInput={amendForm.setAmendTradeInstrumentTypeInput}
          amendOptionTypeInput={amendForm.amendOptionTypeInput}
          setAmendOptionTypeInput={amendForm.setAmendOptionTypeInput}
          amendOptionStyleInput={amendForm.amendOptionStyleInput}
          setAmendOptionStyleInput={amendForm.setAmendOptionStyleInput}
          amendOptionExpirationDateInput={amendForm.amendOptionExpirationDateInput}
          setAmendOptionExpirationDateInput={amendForm.setAmendOptionExpirationDateInput}
          amendOptionStrikePriceInput={amendForm.amendOptionStrikePriceInput}
          setAmendOptionStrikePriceInput={amendForm.setAmendOptionStrikePriceInput}
          amendBookInput={amendForm.amendBookInput}
          setAmendBookInput={amendForm.setAmendBookInput}
          amendBookOptions={amendForm.amendBookOptions}
          amendPortfolioInput={amendForm.amendPortfolioInput}
          setAmendPortfolioInput={amendForm.setAmendPortfolioInput}
          amendPortfolioOptions={amendForm.amendPortfolioOptions}
          amendCounterpartyInput={amendForm.amendCounterpartyInput}
          setAmendCounterpartyInput={amendForm.setAmendCounterpartyInput}
          amendCounterpartyOptions={amendForm.amendCounterpartyOptions}
          amendCommodityClassInput={amendForm.amendCommodityClassInput}
          setAmendCommodityClassInput={amendForm.setAmendCommodityClassInput}
          commodityClassOptions={summary.commodityClassOptions}
          amendCommodityInput={amendForm.amendCommodityInput}
          setAmendCommodityInput={amendForm.setAmendCommodityInput}
          amendCommodityOptions={amendForm.amendCommodityOptions}
          amendTradeNatureInput={amendForm.amendTradeNatureInput}
          setAmendTradeNatureInput={amendForm.setAmendTradeNatureInput}
          amendTradeStructureInput={amendForm.amendTradeStructureInput}
          setAmendTradeStructureInput={amendForm.setAmendTradeStructureInput}
          amendTradeSideInput={amendForm.amendTradeSideInput}
          setAmendTradeSideInput={amendForm.setAmendTradeSideInput}
          amendPricingTypeInput={amendForm.amendPricingTypeInput}
          setAmendPricingTypeInput={amendForm.setAmendPricingTypeInput}
          amendPricingStatusInput={amendForm.amendPricingStatusInput}
          setAmendPricingStatusInput={amendForm.setAmendPricingStatusInput}
          amendConfirmationStatusInput={amendForm.amendConfirmationStatusInput}
          setAmendConfirmationStatusInput={amendForm.setAmendConfirmationStatusInput}
          amendNominationStatusInput={amendForm.amendNominationStatusInput}
          setAmendNominationStatusInput={amendForm.setAmendNominationStatusInput}
          amendAllocationStatusInput={amendForm.amendAllocationStatusInput}
          setAmendAllocationStatusInput={amendForm.setAmendAllocationStatusInput}
          amendPriceIndexInput={amendForm.amendPriceIndexInput}
          setAmendPriceIndexInput={amendForm.setAmendPriceIndexInput}
          amendPriceIndexOptions={amendForm.amendPriceIndexOptions}
          amendPriceInput={amendForm.amendPriceInput}
          setAmendPriceInput={amendForm.setAmendPriceInput}
          amendVolumeInput={amendForm.amendVolumeInput}
          setAmendVolumeInput={amendForm.setAmendVolumeInput}
          amendInvoiceStatusInput={amendForm.amendInvoiceStatusInput}
          setAmendInvoiceStatusInput={amendForm.setAmendInvoiceStatusInput}
          amendPaymentStatusInput={amendForm.amendPaymentStatusInput}
          setAmendPaymentStatusInput={amendForm.setAmendPaymentStatusInput}
          amendSettlementStatusInput={amendForm.amendSettlementStatusInput}
          setAmendSettlementStatusInput={amendForm.setAmendSettlementStatusInput}
          amendTraderUserInput={amendForm.amendTraderUserInput}
          setAmendTraderUserInput={amendForm.setAmendTraderUserInput}
          amendLegs={amendForm.amendLegs}
          activeCommodities={summary.activeCommodities}
          addDraftLeg={amendForm.addDraftLeg}
          removeDraftLeg={amendForm.removeDraftLeg}
          updateDraftLeg={amendForm.updateDraftLeg}
          amending={tradeActions.amending}
          cancelling={tradeActions.cancelling}
          amendError={tradeActions.amendError}
          counterpartyCreditPolicyPreview={tradeActions.amendCounterpartyCreditPolicyPreview}
          tradeInstrumentTypeOptions={tradeInstrumentTypeOptions}
          optionTypeOptions={optionTypeOptions}
          optionStyleOptions={optionStyleOptions}
          tradeNatureOptions={tradeNatureOptions}
          tradeStructureOptions={tradeStructureOptions}
          tradeSideOptions={tradeSideOptions}
          pricingTypeOptions={pricingTypeOptions}
          pricingStatusOptions={pricingStatusOptions}
          confirmationStatusOptions={confirmationStatusOptions}
          nominationStatusOptions={nominationStatusOptions}
          allocationStatusOptions={allocationStatusOptions}
          invoiceStatusOptions={invoiceStatusOptions}
          paymentStatusOptions={paymentStatusOptions}
          settlementStatusOptions={settlementStatusOptions}
          formatCommodityClass={formatCommodityClass}
          formatMoney={formatMoney}
          formatNumber={formatNumber}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          statusTone={statusTone}
        />
      )
    case 'events':
      return (
        <EventsWorkspace
          authSession={workspaceData.authSession}
          eventFilter={shell.eventFilter}
          selectedTradeId={selectedTradeId}
          setEventFilter={shell.setEventFilter}
          filteredEvents={summary.filteredEvents}
          formatDate={formatDate}
          onOpenTrade={navigateToTrade}
        />
      )
    case 'risk':
      return (
        <RiskWorkspace
          authSession={workspaceData.authSession}
          activeTrades={summary.activeTrades}
          positionsByClass={summary.positionsByClass}
          positionsWithClass={summary.positionsWithClass}
          optionExposures={workspaceData.optionExposures}
          formatCommodityClass={formatCommodityClass}
          formatNumber={formatNumber}
          formatMoney={formatMoney}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          onOpenTrade={navigateToTrade}
        />
      )
    case 'positions':
      return (
        <PositionsWorkspace
          activeTrades={summary.activeTrades}
          authSession={workspaceData.authSession}
          onOpenRisk={() => navigateToView('risk')}
          onOpenTrade={navigateToTrade}
          positionsByClass={summary.positionsByClass}
          positionsWithClass={summary.positionsWithClass}
          formatCommodityClass={formatCommodityClass}
          formatNumber={formatNumber}
          formatDate={formatDate}
        />
      )
    case 'shipments':
      return (
        <DeliveryWorkspace
          authSession={workspaceData.authSession}
          deliveries={workspaceData.deliveries}
          formatCommodityClass={formatCommodityClass}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          formatNumber={formatNumber}
          onOpenTrade={navigateToTrade}
        />
      )
    case 'scheduling':
      return (
        <SchedulingWorkspace
          authSession={workspaceData.authSession}
          deliveries={workspaceData.deliveries}
          formatCommodityClass={formatCommodityClass}
          formatNumber={formatNumber}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          onOpenTrade={navigateToTrade}
        />
      )
    case 'operations':
      return (
        <OperationsWorkspace
          authSession={workspaceData.authSession}
          deliveries={workspaceData.deliveries}
          workItems={workspaceData.tradeWorkflowItems}
          externalDataSyncStatus={workspaceData.externalDataSyncStatus}
          weatherSyncStatus={workspaceData.weatherSyncStatus}
          tradingSources={workspaceData.tradingSources}
          formatCommodityClass={formatCommodityClass}
          formatNumber={formatNumber}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          workflowMutationError={workspaceData.workflowMutationError}
          workflowMutationPendingId={workspaceData.workflowMutationPendingId}
          onOpenTrade={navigateToTrade}
          onSaveWorkflowItem={workspaceData.handleSaveWorkflowItem}
        />
      )
    case 'settlement':
      return (
        <SettlementWorkspace
          authSession={workspaceData.authSession}
          activeTrades={summary.activeTrades}
          invoices={workspaceData.tradeInvoices}
          payments={workspaceData.tradePayments}
          workItems={workspaceData.tradeWorkflowItems}
          formatCommodityClass={formatCommodityClass}
          formatMoney={formatMoney}
          formatNumber={formatNumber}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          invoiceMutationError={workspaceData.invoiceMutationError}
          invoiceMutationPendingKey={workspaceData.invoiceMutationPendingKey}
          paymentMutationError={workspaceData.paymentMutationError}
          paymentMutationPendingKey={workspaceData.paymentMutationPendingKey}
          onOpenTrade={navigateToTrade}
          onIssueInvoice={workspaceData.handleIssueTradeInvoice}
          onSaveInvoice={workspaceData.handleUpdateTradeInvoice}
          onCreatePayment={workspaceData.handleCreateTradePayment}
          onSavePayment={workspaceData.handleUpdateTradePayment}
          onSaveWorkflowItem={workspaceData.handleSaveWorkflowItem}
        />
      )
    case 'reports':
      return (
        <ReportsWorkspace
          authSession={workspaceData.authSession}
          counterpartyCreditReport={workspaceData.counterpartyCreditReport}
          formatNumber={formatNumber}
          formatMoney={formatMoney}
          formatDate={formatDate}
          formatDateOnly={formatDateOnly}
          onOpenSettlement={() => navigateToView('settlement')}
          onOpenTrade={navigateToTrade}
        />
      )
    case 'reference':
      return (
        <ReferenceDataWorkspace
          controller={referenceState}
          formatCommodityClass={formatCommodityClass}
          formatDate={formatDate}
        />
      )
    case 'admin':
      return (
          <AdminWorkspace
            authSession={workspaceData.authSession}
            onOpenSettings={() => navigateToView('settings')}
            onRoadmapPublished={handleRoadmapPublished}
          selectedTrade={summary.selectedTrade}
          selectedTradeEvents={summary.selectedTradeEvents}
          events={workspaceData.events}
          trades={workspaceData.trades}
          positions={workspaceData.positions}
          activeBooks={summary.activeBooks}
          activeCommodities={summary.activeCommodities}
          priceIndices={workspaceData.priceIndices}
          externalDataRuns={workspaceData.externalDataRuns}
          externalDataSyncStatus={workspaceData.externalDataSyncStatus}
          tradingSources={workspaceData.tradingSources}
          weatherSyncStatus={workspaceData.weatherSyncStatus}
          externalDataSyncing={workspaceData.externalDataSyncing}
          externalDataSyncingProvider={workspaceData.externalDataSyncingProvider}
          externalDataError={workspaceData.externalDataError}
          externalDataSuccess={workspaceData.externalDataSuccess}
          counterpartyCreditImportDraft={workspaceData.counterpartyCreditImportDraft}
          counterpartyCreditPreview={workspaceData.counterpartyCreditPreview}
          counterpartyCreditPreviewing={workspaceData.counterpartyCreditPreviewing}
          counterpartyCreditPreviewError={workspaceData.counterpartyCreditPreviewError}
          counterpartyCreditPreviewSuccess={workspaceData.counterpartyCreditPreviewSuccess}
          counterpartyCreditImporting={workspaceData.counterpartyCreditImporting}
          counterpartyCreditImportError={workspaceData.counterpartyCreditImportError}
          counterpartyCreditImportSuccess={workspaceData.counterpartyCreditImportSuccess}
          tradingSourcesSyncing={workspaceData.tradingSourcesSyncing}
          tradingSourcesError={workspaceData.tradingSourcesError}
          tradingSourcesSuccess={workspaceData.tradingSourcesSuccess}
          weatherSyncing={workspaceData.weatherSyncing}
          weatherSyncError={workspaceData.weatherSyncError}
          weatherSyncSuccess={workspaceData.weatherSyncSuccess}
          onRunExternalDataSync={workspaceData.handleRunExternalDataSync}
          onCounterpartyCreditImportDraftChange={workspaceData.handleCounterpartyCreditImportDraftChange}
          onPreviewCounterpartyCreditImport={workspaceData.handlePreviewCounterpartyCreditImport}
          onImportCounterpartyCreditSnapshots={workspaceData.handleImportCounterpartyCreditSnapshots}
          onRunNwsWeatherSync={workspaceData.handleRunNwsWeatherSync}
          onSeedTradingSources={workspaceData.handleSeedTradingSources}
          onRefreshData={workspaceData.loadData}
          formatDate={formatDate}
          formatMoney={formatMoney}
          formatNumber={formatNumber}
          formatCommodityClass={formatCommodityClass}
        />
      )
    case 'settings':
      return (
        <SettingsWorkspace
          health={workspaceData.health}
          authSession={workspaceData.authSession}
          appearanceSettings={appearance.appearanceSettings}
          resolvedColorMode={appearance.resolvedColorMode}
          onAppearanceSettingsChange={appearance.handleAppearanceSettingsChange}
          onAppearanceSettingsReset={appearance.handleAppearanceSettingsReset}
          onSessionChange={workspaceData.handleSessionChange}
        />
      )
    case 'assistant':
      return (
        <AssistantWorkspace
          authSession={workspaceData.authSession}
          health={workspaceData.health}
          trades={workspaceData.trades}
          events={workspaceData.events}
          positions={workspaceData.positions}
          selectedTrade={summary.selectedTrade}
          selectedTradeEvents={summary.selectedTradeEvents}
          onOpenSettings={() => navigateToView('settings')}
          onRefreshData={workspaceData.loadData}
        />
      )
  }
}
