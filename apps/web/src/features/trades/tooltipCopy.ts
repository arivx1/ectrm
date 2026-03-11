export const tradeTooltipCopy = {
  structure:
    'Single trades use one top-level side and volume. Swap trades open the leg editor so each leg can carry its own side and volume.',
  side:
    'Trade side is used for single-leg deals. When the structure is swap, each leg owns its own side and this field is locked.',
  pricing:
    'Fixed pricing uses the entered price. Index and Hybrid pricing let you attach a market index for settlement or valuation workflows.',
  priceIndex:
    'Price indices are only relevant for Index or Hybrid pricing. Fixed and Formula trades can leave this blank.',
  legs:
    'Swap legs let one trade capture both sides of a spread or exchange, with separate commodities and volumes per leg.',
  systemReady:
    'The console reached the API and loaded reference data cleanly, so trading and inspection flows are available.',
  systemAttention:
    'Bootstrap checks hit an error. Review the banner and API health lines below to see which dependency needs attention.',
  activeTrade:
    'This trade is still live and contributes to the active exposure views.',
  cancelledTrade:
    'This trade has been cancelled and is excluded from open-trade exposure counts.',
} as const
