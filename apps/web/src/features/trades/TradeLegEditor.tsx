import { InfoTooltip } from '../../shared/ui/Tooltip'
import { tradeTooltipCopy } from './tooltipCopy'

type CommodityOption = {
  code: string
  name: string
  commodity_class?: string
}

type TradeLegDraft = {
  leg_no: number
  side: string
  commodity_class: string
  commodity: string
  volume: string
}

type TradeLegEditorProps = {
  title: string
  legs: TradeLegDraft[]
  commodityClassOptions: string[]
  activeCommodities: CommodityOption[]
  tradeSideOptions: readonly string[]
  onAdd: () => void
  onRemove: (index: number) => void
  onUpdate: (index: number, field: keyof TradeLegDraft, value: string) => void
  formatCommodityClass: (value: string) => string
}

export function TradeLegEditor({
  title,
  legs,
  commodityClassOptions,
  activeCommodities,
  tradeSideOptions,
  onAdd,
  onRemove,
  onUpdate,
  formatCommodityClass,
}: TradeLegEditorProps) {
  return (
    <div className="trade-legs-panel">
      <div className="section-head section-head-control">
        <div>
          <span className="eyebrow">Legs</span>
          <h3>
            {title} <InfoTooltip content={tradeTooltipCopy.legs} label={`More information about ${title}`} />
          </h3>
        </div>
        <div className="toolbar">
          <button type="button" className="button button-ghost" onClick={onAdd}>
            Add Leg
          </button>
        </div>
      </div>
      <div className="trade-legs-stack">
        {legs.map((leg, index) => {
          const legCommodityOptions = activeCommodities.filter(
            (commodity) => commodity.commodity_class === leg.commodity_class,
          )

          return (
            <div key={`${title}-${index}`} className="trade-leg-card">
              <div className="trade-leg-head">
                <strong>Leg {index + 1}</strong>
                {legs.length > 2 && (
                  <button type="button" className="button button-ghost" onClick={() => onRemove(index)}>
                    Remove
                  </button>
                )}
              </div>
              <div className="mini-grid">
                <label className="field">
                  <span>Side</span>
                  <select className="control" value={leg.side} onChange={(event) => onUpdate(index, 'side', event.target.value)}>
                    {tradeSideOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Class</span>
                  <select className="control" value={leg.commodity_class} onChange={(event) => onUpdate(index, 'commodity_class', event.target.value)}>
                    <option value="">Select class</option>
                    {commodityClassOptions.map((commodityClass) => (
                      <option key={commodityClass} value={commodityClass}>
                        {formatCommodityClass(commodityClass)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Commodity</span>
                  <select className="control" value={leg.commodity} onChange={(event) => onUpdate(index, 'commodity', event.target.value)}>
                    <option value="">Select commodity</option>
                    {legCommodityOptions.map((commodity) => (
                      <option key={commodity.code} value={commodity.code}>
                        {commodity.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Volume</span>
                  <input className="control" inputMode="decimal" value={leg.volume} onChange={(event) => onUpdate(index, 'volume', event.target.value)} />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
