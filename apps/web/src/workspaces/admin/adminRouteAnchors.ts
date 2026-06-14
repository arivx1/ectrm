export const ADMIN_PRICE_SOURCES_SECTION_ID = 'admin-price-sources'
export const ADMIN_PRICE_SOURCE_DETAIL_PREFIX = 'admin-price-source-'

export function adminPriceSourceDetailAnchorId(sourceId: number | string): string {
  return `${ADMIN_PRICE_SOURCE_DETAIL_PREFIX}${sourceId}`
}

export function readAdminPriceSourceIdFromHash(hash: string): number | null {
  const normalizedHash = hash.replace(/^#/, '').trim()
  if (!normalizedHash.startsWith(ADMIN_PRICE_SOURCE_DETAIL_PREFIX)) {
    return null
  }

  const rawId = normalizedHash.slice(ADMIN_PRICE_SOURCE_DETAIL_PREFIX.length)
  const sourceId = Number(rawId)
  return Number.isInteger(sourceId) && sourceId > 0 ? sourceId : null
}
