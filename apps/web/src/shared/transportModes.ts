import type { DeliveryRecord, ReferenceRecord } from './models'

export type ConfigurableTransportMode = Exclude<DeliveryRecord['transport_mode'], 'UNSPECIFIED'>

export const CONFIGURABLE_TRANSPORT_MODES: ConfigurableTransportMode[] = [
  'AIR',
  'TRUCK',
  'RAIL',
  'BARGE',
  'VESSEL',
  'PIPELINE',
  'POWER_GRID',
  'STORAGE',
]

export const ALL_TRANSPORT_MODES: DeliveryRecord['transport_mode'][] = [
  'UNSPECIFIED',
  ...CONFIGURABLE_TRANSPORT_MODES,
]

export function formatTransportModeLabel(value: string): string {
  return value.replaceAll('_', ' ')
}

export function findCommodityReference(
  commodities: ReferenceRecord[],
  commodityCode: string,
): ReferenceRecord | null {
  return commodities.find((record) => record.code === commodityCode) ?? null
}

export function resolveAllowedTransportModes(
  record: Pick<ReferenceRecord, 'allowed_transport_modes'> | null | undefined,
): ConfigurableTransportMode[] {
  const allowedModes = record?.allowed_transport_modes ?? []
  const dedupedModes = new Set<ConfigurableTransportMode>()
  for (const allowedMode of allowedModes) {
    if (CONFIGURABLE_TRANSPORT_MODES.includes(allowedMode)) {
      dedupedModes.add(allowedMode)
    }
  }
  return Array.from(dedupedModes)
}

export function resolveAllowedTransportModesForDelivery(
  delivery: Pick<DeliveryRecord, 'commodity'>,
  commodities: ReferenceRecord[],
): ConfigurableTransportMode[] {
  return resolveAllowedTransportModes(findCommodityReference(commodities, delivery.commodity))
}

export function buildTransportModeSelectOptions(args: {
  allowedModes: ConfigurableTransportMode[]
  currentMode: DeliveryRecord['transport_mode']
  includeUnspecified?: boolean
}): DeliveryRecord['transport_mode'][] {
  const { allowedModes, currentMode, includeUnspecified = true } = args
  const options = new Set<DeliveryRecord['transport_mode']>()
  if (includeUnspecified) {
    options.add('UNSPECIFIED')
  }
  if (currentMode !== 'UNSPECIFIED') {
    options.add(currentMode)
  }
  for (const allowedMode of allowedModes) {
    options.add(allowedMode)
  }
  return Array.from(options)
}
