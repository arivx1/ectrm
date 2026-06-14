import type { ReferenceTab } from '../../shared/models'
import type { ReferenceDataTabDefinition } from './referenceDataTabShared'
import {
  ReferenceDataAssetsDirectory,
  ReferenceDataAssetsEditor,
} from './tabs/ReferenceDataAssetsTab'
import {
  ReferenceDataBooksDirectory,
  ReferenceDataBooksEditor,
  ReferenceDataBooksToolbar,
} from './tabs/ReferenceDataBooksTab'
import {
  ReferenceDataCommoditiesDirectory,
  ReferenceDataCommoditiesEditor,
} from './tabs/ReferenceDataCommoditiesTab'
import {
  ReferenceDataCounterpartiesDirectory,
  ReferenceDataCounterpartiesEditor,
} from './tabs/ReferenceDataCounterpartiesTab'
import {
  ReferenceDataCurrenciesDirectory,
  ReferenceDataCurrenciesEditor,
} from './tabs/ReferenceDataCurrenciesTab'
import {
  ReferenceDataLocationsDirectory,
  ReferenceDataLocationsEditor,
} from './tabs/ReferenceDataLocationsTab'
import {
  ReferenceDataRailRoutesDirectory,
  ReferenceDataRailRoutesEditor,
} from './tabs/ReferenceDataRailRoutesTab'
import {
  ReferenceDataPortfoliosDirectory,
  ReferenceDataPortfoliosEditor,
} from './tabs/ReferenceDataPortfoliosTab'
import {
  ReferenceDataPriceIndicesDirectory,
  ReferenceDataPriceIndicesEditor,
} from './tabs/ReferenceDataPriceIndicesTab'
import {
  ReferenceDataSpatialFeaturesDirectory,
  ReferenceDataSpatialFeaturesEditor,
} from './tabs/ReferenceDataSpatialFeaturesTab'
import {
  ReferenceDataUnitsDirectory,
  ReferenceDataUnitsEditor,
} from './tabs/ReferenceDataUnitsTab'

export const REFERENCE_TAB_DEFINITIONS: Record<ReferenceTab, ReferenceDataTabDefinition> = {
  books: {
    label: 'Books',
    tooltip: 'Books are the trading containers used to validate and allocate captured trades.',
    editorTitle: 'Book Editor',
    Directory: ReferenceDataBooksDirectory,
    Editor: ReferenceDataBooksEditor,
    Toolbar: ReferenceDataBooksToolbar,
  },
  assets: {
    label: 'Assets',
    tooltip: 'Assets track physical infrastructure and facilities that shape exposure, production, and operational planning.',
    editorTitle: 'Asset Editor',
    Directory: ReferenceDataAssetsDirectory,
    Editor: ReferenceDataAssetsEditor,
  },
  commodities: {
    label: 'Commodities',
    tooltip: 'Commodity masters define the tradable products and their class-level grouping.',
    editorTitle: 'Commodity Editor',
    Directory: ReferenceDataCommoditiesDirectory,
    Editor: ReferenceDataCommoditiesEditor,
  },
  'price-indices': {
    label: 'Price Indices',
    tooltip: 'Price indices support market-linked pricing and settlement references.',
    editorTitle: 'Price Index Editor',
    Directory: ReferenceDataPriceIndicesDirectory,
    Editor: ReferenceDataPriceIndicesEditor,
  },
  currencies: {
    label: 'Currencies',
    tooltip: 'Currencies back monetary price index metadata and trade pricing outputs.',
    editorTitle: 'Currency Editor',
    Directory: ReferenceDataCurrenciesDirectory,
    Editor: ReferenceDataCurrenciesEditor,
  },
  units: {
    label: 'Units',
    tooltip: 'Units define the quantity systems used across commodities and price indices.',
    editorTitle: 'Unit Editor',
    Directory: ReferenceDataUnitsDirectory,
    Editor: ReferenceDataUnitsEditor,
  },
  locations: {
    label: 'Locations',
    tooltip: 'Locations store market or delivery points used by pricing and logistics models.',
    editorTitle: 'Location Editor',
    Directory: ReferenceDataLocationsDirectory,
    Editor: ReferenceDataLocationsEditor,
  },
  'rail-routes': {
    label: 'Rail Routes',
    tooltip: 'Rail routes define governed lanes, service clocks, and reusable scheduling context for rail delivery execution.',
    editorTitle: 'Rail Route Editor',
    Directory: ReferenceDataRailRoutesDirectory,
    Editor: ReferenceDataRailRoutesEditor,
  },
  'spatial-features': {
    label: 'Spatial Features',
    tooltip: 'Spatial features govern shared routes, pipelines, regions, and map overlays that do not belong in a point-only asset record.',
    editorTitle: 'Spatial Feature Editor',
    Directory: ReferenceDataSpatialFeaturesDirectory,
    Editor: ReferenceDataSpatialFeaturesEditor,
  },
  counterparties: {
    label: 'Counterparties',
    tooltip: 'Counterparties identify external firms available for commercial activity.',
    editorTitle: 'Counterparty Editor',
    Directory: ReferenceDataCounterpartiesDirectory,
    Editor: ReferenceDataCounterpartiesEditor,
  },
  portfolios: {
    label: 'Portfolios',
    tooltip: 'Portfolios group trades for reporting, operations, and downstream risk views.',
    editorTitle: 'Portfolio Editor',
    Directory: ReferenceDataPortfoliosDirectory,
    Editor: ReferenceDataPortfoliosEditor,
  },
}
