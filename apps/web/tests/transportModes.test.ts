import { describe, expect, it } from 'vitest'

import type { DeliveryRecord, ReferenceRecord } from '../src/shared/models'
import {
  buildTransportModeSelectOptions,
  resolveAllowedTransportModesForDelivery,
} from '../src/shared/transportModes'

describe('transport mode helpers', () => {
  it('resolves allowed transport modes from the matching commodity master', () => {
    const delivery = {
      commodity: 'WTI',
    } as Pick<DeliveryRecord, 'commodity'>
    const commodities: ReferenceRecord[] = [
      {
        code: 'WTI',
        name: 'WTI',
        is_active: true,
        commodity_class: 'CRUDE_OIL',
        allowed_transport_modes: ['PIPELINE', 'TRUCK', 'RAIL', 'BARGE', 'VESSEL'],
      },
    ]

    expect(resolveAllowedTransportModesForDelivery(delivery, commodities)).toEqual([
      'PIPELINE',
      'TRUCK',
      'RAIL',
      'BARGE',
      'VESSEL',
    ])
  })

  it('keeps the current mode visible while still prioritizing the commodity allowlist', () => {
    expect(
      buildTransportModeSelectOptions({
        allowedModes: ['TRUCK', 'RAIL'],
        currentMode: 'BARGE',
      }),
    ).toEqual(['UNSPECIFIED', 'BARGE', 'TRUCK', 'RAIL'])
  })
})
