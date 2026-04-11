import { useDeferredValue, useId, useMemo, useState } from 'react'

import {
  buildCounterpartySearchDisplayValue,
  buildCounterpartySearchSelectionLabel,
  buildVisibleCounterpartySearchOptions,
  findCounterpartySearchMatch,
} from './counterpartySearch'
import {
  buildReferenceSearchDisplayValue,
  buildVisibleReferenceSearchOptions,
  findReferenceSearchMatch,
} from './referenceSearch'

type ReferenceSearchRecord = {
  code: string
  name: string
}

type CounterpartySearchRecord = ReferenceSearchRecord & {
  credit_status?: string | null
}

type ReferenceSearchFieldProps<RecordType extends ReferenceSearchRecord> = {
  label: string
  selectedCode: string
  setSelectedCode: (value: string) => void
  searchInput: string
  setSearchInput: (value: string) => void
  options: RecordType[]
  disabled: boolean
  allowEmpty: boolean
  preserveSelectionWhileSearching?: boolean
  placeholder: string
  idleHelperText: string
  unmatchedHelperText: string
  emptyStateText: string
  selectedHelperText: (record: RecordType) => string
  searchingHelperText?: (record: RecordType) => string
  buildSecondaryLabel: (record: RecordType) => string
}

export function ReferenceSearchField<RecordType extends ReferenceSearchRecord>({
  label,
  selectedCode,
  setSelectedCode,
  searchInput,
  setSearchInput,
  options,
  disabled,
  allowEmpty,
  preserveSelectionWhileSearching = false,
  placeholder,
  idleHelperText,
  unmatchedHelperText,
  emptyStateText,
  selectedHelperText,
  searchingHelperText,
  buildSecondaryLabel,
}: ReferenceSearchFieldProps<RecordType>) {
  const inputId = useId()
  const listboxId = `${inputId}-results`
  const selectedRecord = useMemo(
    () => options.find((option) => option.code === selectedCode) ?? null,
    [options, selectedCode],
  )
  const deferredSearchInput = useDeferredValue(searchInput)
  const visibleOptions = useMemo(
    () => buildVisibleReferenceSearchOptions(options, deferredSearchInput, selectedCode, buildSecondaryLabel),
    [buildSecondaryLabel, deferredSearchInput, options, selectedCode],
  )
  const exactMatch = useMemo(() => findReferenceSearchMatch(options, searchInput), [options, searchInput])
  const [resultsOpen, setResultsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const activeOption = visibleOptions[highlightedIndex] ?? null
  const activeOptionId = activeOption ? `${inputId}-${activeOption.code}` : undefined
  const selectedDisplayValue = buildReferenceSearchDisplayValue(selectedRecord)
  const trimmedSearchInput = searchInput.trim()
  const queryMatchesSelection =
    !!selectedRecord &&
    (
      (!!exactMatch && exactMatch.code === selectedRecord.code) ||
      trimmedSearchInput.length === 0 ||
      searchInput === selectedDisplayValue
    )
  const showResults = !disabled && resultsOpen && visibleOptions.length > 0
  const showEmptyState = !disabled && resultsOpen && trimmedSearchInput.length > 0 && visibleOptions.length === 0
  const showOpenState = showResults || showEmptyState
  const helperText =
    selectedRecord && queryMatchesSelection
      ? selectedHelperText(selectedRecord)
      : selectedRecord && preserveSelectionWhileSearching && trimmedSearchInput.length > 0
        ? (searchingHelperText ?? selectedHelperText)(selectedRecord)
        : trimmedSearchInput.length > 0
          ? unmatchedHelperText
          : selectedRecord
            ? selectedHelperText(selectedRecord)
            : idleHelperText

  function commitSelection(nextRecord: RecordType | null) {
    setSelectedCode(nextRecord?.code ?? '')
    setSearchInput(buildReferenceSearchDisplayValue(nextRecord))
    setHighlightedIndex(0)
    setResultsOpen(false)
  }

  function commitQuery() {
    if (trimmedSearchInput.length === 0) {
      if (allowEmpty) {
        commitSelection(null)
        return
      }

      setSearchInput(selectedDisplayValue)
      setResultsOpen(false)
      setHighlightedIndex(0)
      return
    }

    if (exactMatch) {
      commitSelection(exactMatch)
      return
    }

    setSearchInput(selectedDisplayValue)
    setResultsOpen(false)
    setHighlightedIndex(0)
  }

  function handleSearchInputChange(value: string) {
    setSearchInput(value)
    setResultsOpen(true)
    setHighlightedIndex(0)

    if (value.trim().length === 0) {
      if (allowEmpty) {
        setSelectedCode('')
      }
      return
    }

    const nextExactMatch = findReferenceSearchMatch(options, value)
    if (nextExactMatch) {
      setSelectedCode(nextExactMatch.code)
      return
    }

    if (!preserveSelectionWhileSearching && selectedCode) {
      setSelectedCode('')
    }
  }

  function moveHighlight(direction: 1 | -1) {
    if (visibleOptions.length === 0) {
      return
    }

    setResultsOpen(true)
    setHighlightedIndex((current) => {
      if (direction === 1) {
        return current >= visibleOptions.length - 1 ? 0 : current + 1
      }
      return current <= 0 ? visibleOptions.length - 1 : current - 1
    })
  }

  return (
    <div className="field trade-search-field">
      <div className="trade-form-field-title">
        <span>{label}</span>
        {selectedRecord ? <span className="entity-chip entity-chip-soft">{selectedRecord.code}</span> : null}
      </div>
      <div className="trade-search-control">
        <input
          id={inputId}
          className="control trade-search-input"
          value={searchInput}
          onChange={(event) => handleSearchInputChange(event.target.value)}
          onFocus={() => setResultsOpen(true)}
          onBlur={commitQuery}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveHighlight(1)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveHighlight(-1)
            }
            if (event.key === 'Enter' && activeOption) {
              event.preventDefault()
              const nextRecord = options.find((option) => option.code === activeOption.code) ?? null
              commitSelection(nextRecord)
            }
            if (event.key === 'Escape') {
              setSearchInput(selectedDisplayValue)
              setResultsOpen(false)
              setHighlightedIndex(0)
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showOpenState}
          aria-controls={showOpenState ? listboxId : undefined}
          aria-activedescendant={showResults ? activeOptionId : undefined}
        />
        {showResults ? (
          <div id={listboxId} className="trade-search-results" role="listbox">
            {visibleOptions.map((option, index) => (
              <button
                key={option.code}
                id={`${inputId}-${option.code}`}
                type="button"
                className={`trade-search-option${index === highlightedIndex ? ' is-active' : ''}`}
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseDown={(event) => {
                  event.preventDefault()
                  const nextRecord = options.find((optionRecord) => optionRecord.code === option.code) ?? null
                  commitSelection(nextRecord)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <strong>{option.name}</strong>
                <span>{option.secondaryLabel}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showEmptyState ? <div className="trade-search-empty">{emptyStateText}</div> : null}
      </div>
      <p className="trade-form-helper trade-search-helper">{helperText}</p>
    </div>
  )
}

type CounterpartySearchFieldProps = {
  counterpartyInput: string
  setCounterpartyInput: (value: string) => void
  counterpartySearchInput: string
  setCounterpartySearchInput: (value: string) => void
  createCounterpartyOptions: CounterpartySearchRecord[]
  disabled: boolean
}

export function CounterpartySearchField({
  counterpartyInput,
  setCounterpartyInput,
  counterpartySearchInput,
  setCounterpartySearchInput,
  createCounterpartyOptions,
  disabled,
}: CounterpartySearchFieldProps) {
  const inputId = useId()
  const listboxId = `${inputId}-results`
  const selectedCounterparty = useMemo(
    () => createCounterpartyOptions.find((counterparty) => counterparty.code === counterpartyInput) ?? null,
    [counterpartyInput, createCounterpartyOptions],
  )
  const deferredCounterpartySearchInput = useDeferredValue(counterpartySearchInput)
  const visibleOptions = useMemo(
    () =>
      buildVisibleCounterpartySearchOptions(
        createCounterpartyOptions,
        deferredCounterpartySearchInput,
        counterpartyInput,
      ),
    [counterpartyInput, createCounterpartyOptions, deferredCounterpartySearchInput],
  )
  const [resultsOpen, setResultsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const activeOption = visibleOptions[highlightedIndex] ?? null
  const activeOptionId = activeOption ? `${inputId}-${activeOption.code}` : undefined
  const selectedDisplayValue = buildCounterpartySearchDisplayValue(selectedCounterparty)
  const selectionLabel = buildCounterpartySearchSelectionLabel(selectedCounterparty)
  const showResults = !disabled && resultsOpen && visibleOptions.length > 0
  const showEmptyState = !disabled && resultsOpen && counterpartySearchInput.trim().length > 0 && visibleOptions.length === 0
  const helperText = selectionLabel
    ? selectionLabel
    : counterpartySearchInput.trim().length > 0
      ? 'No exact counterparty is selected yet. Choose a result or clear the field for no counterparty.'
      : 'Search by legal name or code. Leave blank when the ticket has no counterparty.'

  function commitCounterpartySelection(nextCounterparty: CounterpartySearchRecord | null) {
    const nextDisplayValue = buildCounterpartySearchDisplayValue(nextCounterparty)
    setCounterpartyInput(nextCounterparty?.code ?? '')
    setCounterpartySearchInput(nextDisplayValue)
    setHighlightedIndex(0)
    setResultsOpen(false)
  }

  function commitCounterpartyQuery() {
    const trimmedQuery = counterpartySearchInput.trim()
    if (!trimmedQuery) {
      commitCounterpartySelection(null)
      return
    }

    const exactMatch = findCounterpartySearchMatch(createCounterpartyOptions, trimmedQuery)
    if (exactMatch) {
      commitCounterpartySelection(exactMatch)
      return
    }

    setCounterpartySearchInput(selectedDisplayValue)
    setResultsOpen(false)
  }

  function handleSearchInputChange(value: string) {
    setCounterpartySearchInput(value)
    setResultsOpen(true)
    setHighlightedIndex(0)

    if (!value.trim()) {
      setCounterpartyInput('')
      return
    }

    const exactMatch = findCounterpartySearchMatch(createCounterpartyOptions, value)
    if (exactMatch) {
      setCounterpartyInput(exactMatch.code)
      return
    }

    if (counterpartyInput) {
      setCounterpartyInput('')
    }
  }

  function moveHighlight(direction: 1 | -1) {
    if (visibleOptions.length === 0) {
      return
    }

    setResultsOpen(true)
    setHighlightedIndex((current) => {
      if (direction === 1) {
        return current >= visibleOptions.length - 1 ? 0 : current + 1
      }
      return current <= 0 ? visibleOptions.length - 1 : current - 1
    })
  }

  return (
    <div className="field trade-search-field">
      <div className="trade-form-field-title">
        <span>Counterparty</span>
        {selectedCounterparty ? <span className="entity-chip entity-chip-soft">{selectedCounterparty.code}</span> : null}
      </div>
      <div className="trade-search-control">
        <input
          id={inputId}
          className="control trade-search-input"
          value={counterpartySearchInput}
          onChange={(event) => handleSearchInputChange(event.target.value)}
          onFocus={() => setResultsOpen(true)}
          onBlur={commitCounterpartyQuery}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveHighlight(1)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveHighlight(-1)
            }
            if (event.key === 'Enter' && activeOption) {
              event.preventDefault()
              const nextCounterparty =
                createCounterpartyOptions.find((counterparty) => counterparty.code === activeOption.code) ?? null
              commitCounterpartySelection(nextCounterparty)
            }
            if (event.key === 'Escape') {
              setCounterpartySearchInput(selectedDisplayValue)
              setResultsOpen(false)
              setHighlightedIndex(0)
            }
          }}
          placeholder="Search by name or code"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults ? listboxId : undefined}
          aria-activedescendant={showResults ? activeOptionId : undefined}
        />
        {showResults ? (
          <div id={listboxId} className="trade-search-results" role="listbox">
            {visibleOptions.map((option, index) => (
              <button
                key={option.code}
                id={`${inputId}-${option.code}`}
                type="button"
                className={`trade-search-option${index === highlightedIndex ? ' is-active' : ''}`}
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseDown={(event) => {
                  event.preventDefault()
                  const nextCounterparty =
                    createCounterpartyOptions.find((counterparty) => counterparty.code === option.code) ?? null
                  commitCounterpartySelection(nextCounterparty)
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <strong>{option.name}</strong>
                <span>{option.secondaryLabel}</span>
              </button>
            ))}
          </div>
        ) : null}
        {showEmptyState ? <div className="trade-search-empty">No counterparty matches that search yet.</div> : null}
      </div>
      <p className="trade-form-helper trade-search-helper">{helperText}</p>
    </div>
  )
}
