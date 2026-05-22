import type {
  DocumentFacetAssignmentRecord,
  DocumentFacetSchemaRecord,
  DocumentFacetValueRecord,
} from '../../shared/models'
import { activeDocumentFacetValues, formatDocumentFacetLabel } from './documentIngestionUtils'

const FALLBACK_DOCUMENT_FACETS: DocumentFacetSchemaRecord[] = [
  {
    facet_key: 'commodity',
    label: 'Commodity',
    description: null,
    value_type: 'multi_select',
    repeatable: true,
    required: false,
    allowed_values: [
      { code: 'NATURAL_GAS', label: 'Natural Gas', description: null },
      { code: 'CRUDE_OIL', label: 'Crude Oil', description: null },
      { code: 'REFINED_PRODUCTS', label: 'Refined Products', description: null },
      { code: 'LNG', label: 'LNG', description: null },
      { code: 'NGL', label: 'NGL', description: null },
      { code: 'POWER', label: 'Power', description: null },
      { code: 'COAL', label: 'Coal', description: null },
    ],
  },
  {
    facet_key: 'commercial_side',
    label: 'Purchase/Sale',
    description: null,
    value_type: 'multi_select',
    repeatable: true,
    required: false,
    allowed_values: [
      { code: 'BUY', label: 'Purchase', description: null },
      { code: 'SELL', label: 'Sale', description: null },
    ],
  },
  {
    facet_key: 'transport_mode',
    label: 'Mode of Transportation',
    description: null,
    value_type: 'multi_select',
    repeatable: true,
    required: false,
    allowed_values: [
      { code: 'AIR', label: 'Air', description: null },
      { code: 'VESSEL', label: 'Vessel', description: null },
      { code: 'BARGE', label: 'Barge', description: null },
      { code: 'TRUCK', label: 'Truck', description: null },
      { code: 'RAIL', label: 'Rail', description: null },
      { code: 'PIPELINE', label: 'Pipeline', description: null },
    ],
  },
  {
    facet_key: 'asset',
    label: 'Asset',
    description: null,
    value_type: 'multi_select',
    repeatable: true,
    required: false,
    allowed_values: [
      { code: 'POWER_GENERATION', label: 'Power Generation', description: null },
      { code: 'TRANSMISSION', label: 'Transmission', description: null },
      { code: 'UPSTREAM', label: 'Upstream', description: null },
      { code: 'PIPELINE', label: 'Pipeline', description: null },
    ],
  },
]

type DocumentFacetEditorProps = {
  documentId: string
  pageId: number | null
  title: string
  values: DocumentFacetAssignmentRecord[]
  facetSchemas: DocumentFacetSchemaRecord[] | null | undefined
  onChange: (nextValues: DocumentFacetAssignmentRecord[]) => void
}

export function DocumentFacetEditor({
  documentId,
  pageId,
  title,
  values,
  facetSchemas,
  onChange,
}: DocumentFacetEditorProps) {
  const schemas = facetSchemas?.length ? facetSchemas : FALLBACK_DOCUMENT_FACETS
  const activeValues = activeDocumentFacetValues(values)

  function selectedCodesFor(facetKey: string): Set<string> {
    return new Set(activeValues.filter((value) => value.facet_key === facetKey).map((value) => value.value_code))
  }

  function toggleValue(schema: DocumentFacetSchemaRecord, option: DocumentFacetValueRecord) {
    const selectedCodes = selectedCodesFor(schema.facet_key)
    if (selectedCodes.has(option.code)) {
      selectedCodes.delete(option.code)
    } else if (schema.value_type === 'single_select') {
      selectedCodes.clear()
      selectedCodes.add(option.code)
    } else {
      selectedCodes.add(option.code)
    }

    const preservedValues = values.filter((value) => value.facet_key !== schema.facet_key)
    const nextFacetValues = Array.from(selectedCodes).map((code) => {
      const selectedOption = schema.allowed_values.find((candidate) => candidate.code === code) ?? option
      return buildManualFacetValue({
        documentId,
        pageId,
        facetKey: schema.facet_key,
        facetLabel: schema.label,
        valueCode: code,
        valueLabel: selectedOption.label,
      })
    })
    onChange([...preservedValues, ...nextFacetValues])
  }

  return (
    <div className="document-facet-editor document-schema-note">
      <div className="document-section-head">
        <strong>{title}</strong>
        <div className="document-ingestion-chip-row">
          {activeValues.length > 0 ? (
            activeValues.map((value) => (
              <span
                key={`${value.page_id ?? 'document'}-${value.facet_key}-${value.value_code}`}
                className={`entity-chip entity-chip-soft document-facet-chip document-facet-chip-${value.review_status.toLowerCase()}`}
              >
                {formatDocumentFacetLabel(value)}
                {value.review_status === 'SUGGESTED' ? ' • Suggested' : ''}
              </span>
            ))
          ) : (
            <span className="entity-chip entity-chip-soft">No tags</span>
          )}
        </div>
      </div>

      <div className="document-facet-grid">
        {schemas.map((schema) => {
          const selectedCodes = selectedCodesFor(schema.facet_key)
          return (
            <fieldset key={schema.facet_key} className="document-facet-group">
              <legend>{schema.label}</legend>
              <div className="document-facet-options">
                {schema.allowed_values.map((option) => {
                  const selected = selectedCodes.has(option.code)
                  return (
                    <button
                      key={option.code}
                      type="button"
                      className={`document-facet-option${selected ? ' document-facet-option-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => toggleValue(schema, option)}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )
        })}
      </div>
    </div>
  )
}

function buildManualFacetValue({
  documentId,
  pageId,
  facetKey,
  facetLabel,
  valueCode,
  valueLabel,
}: {
  documentId: string
  pageId: number | null
  facetKey: string
  facetLabel: string
  valueCode: string
  valueLabel: string
}): DocumentFacetAssignmentRecord {
  return {
    facet_value_id: 0,
    document_id: documentId,
    page_id: pageId,
    facet_key: facetKey,
    facet_label: facetLabel,
    value_code: valueCode,
    value_label: valueLabel,
    source: 'MANUAL',
    confidence: null,
    review_status: 'CONFIRMED',
    evidence: [],
    created_at: '',
    created_by: '',
    updated_at: '',
    updated_by: '',
    version: 1,
  }
}
