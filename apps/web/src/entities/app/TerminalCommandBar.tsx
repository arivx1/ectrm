import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'

import {
  resolveTerminalCommandSearchState,
  type TerminalCommandAction,
  type TerminalCommandResult,
} from './terminalCommandSearch'
import type { AppRouteHandoff } from '../../shared/appRouteHandoff'
import type {
  CounterpartyRecord,
  PriceIndexRecord,
  ReferenceRecord,
  ReferenceTab,
  Trade,
  ViewKey,
} from '../../shared/models'

type ReferenceNavigator = {
  setReferenceTab: (tab: ReferenceTab) => void
  startEditCommodity: (code: string) => void
  startEditPriceIndex: (code: string) => void
  startEditCounterparty: (code: string) => void
}

type TerminalCommandBarProps = {
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  isLoading: boolean
  trades: readonly Trade[]
  counterparties: readonly CounterpartyRecord[]
  commodities: readonly ReferenceRecord[]
  priceIndices: readonly PriceIndexRecord[]
  navigateToView: (
    view: ViewKey,
    handoff?: AppRouteHandoff | null,
    options?: { tradeId?: string | null; hash?: string | null },
  ) => void
  navigateToTrade: (tradeId: string, handoff?: AppRouteHandoff | null) => void
  referenceNavigator: ReferenceNavigator
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

function shortcutDisplayLabel(): string {
  return 'Ctrl/Cmd+K'
}

function prefixExampleLabel(): string {
  return 'MON DES TRD CP PX EOD'
}

function referenceRecordKindLabel(action: Extract<TerminalCommandAction, { kind: 'reference_record' }>): string {
  switch (action.recordKind) {
    case 'counterparty':
      return 'Counterparty'
    case 'commodity':
      return 'Commodity'
    case 'price_index':
      return 'Price index'
  }
}

function actionScopeLabel(result: TerminalCommandResult): string {
  if (result.scope === 'function') {
    return 'Function'
  }

  switch (result.action.kind) {
    case 'view':
      return result.action.view === 'reports' && result.action.handoff ? 'Report' : 'Workspace'
    case 'trade':
      return 'Trade'
    case 'reference_record':
      return referenceRecordKindLabel(result.action)
  }
}

export function TerminalCommandBar({
  isOpen,
  onOpen,
  onClose,
  isLoading,
  trades,
  counterparties,
  commodities,
  priceIndices,
  navigateToView,
  navigateToTrade,
  referenceNavigator,
}: TerminalCommandBarProps) {
  const titleId = useId()
  const descriptionId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const searchState = useMemo(
    () =>
      resolveTerminalCommandSearchState({
        query,
        isLoading,
        trades,
        counterparties,
        commodities,
        priceIndices,
      }),
    [commodities, counterparties, isLoading, priceIndices, query, trades],
  )

  const flattenedResults = useMemo(
    () => (searchState.status === 'results' ? searchState.groups.flatMap((group) => group.results) : []),
    [searchState],
  )
  const boundedSelectedIndex =
    flattenedResults.length === 0 ? 0 : Math.min(selectedIndex, flattenedResults.length - 1)
  const activeResult =
    flattenedResults.length > 0 ? flattenedResults[boundedSelectedIndex] ?? null : null

  function handleClose() {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  function handleSelectResult(result: TerminalCommandResult) {
    switch (result.action.kind) {
      case 'view':
        navigateToView(result.action.view, result.action.handoff, {
          hash: result.action.hash ?? null,
        })
        break
      case 'trade':
        navigateToTrade(result.action.tradeId, result.action.handoff)
        break
      case 'reference_record':
        referenceNavigator.setReferenceTab(result.action.referenceTab)
        switch (result.action.recordKind) {
          case 'commodity':
            referenceNavigator.startEditCommodity(result.action.recordCode)
            break
          case 'price_index':
            referenceNavigator.startEditPriceIndex(result.action.recordCode)
            break
          case 'counterparty':
            referenceNavigator.startEditCounterparty(result.action.recordCode)
            break
        }
        navigateToView('reference', result.action.handoff)
        break
    }

    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  const handleGlobalKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const normalizedKey = event.key.toLowerCase()
    const openWithCommandShortcut = normalizedKey === 'k' && (event.metaKey || event.ctrlKey)
    const openWithSlashShortcut = event.key === '/' && !isEditableTarget(event.target)

    if (openWithCommandShortcut || openWithSlashShortcut) {
      event.preventDefault()
      onOpen()
      window.setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
      return
    }

    if (!isOpen) {
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      handleClose()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div className="terminal-command-overlay" role="presentation">
      <button
        type="button"
        className="terminal-command-backdrop"
        aria-label="Close terminal search"
        onClick={handleClose}
      />

      <section
        className="surface terminal-command-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="terminal-command-head">
          <div className="terminal-command-head-copy">
            <span className="eyebrow">Terminal Search</span>
            <strong id={titleId}>Open a workspace or record</strong>
            <p id={descriptionId}>
              Search navigation targets or type deterministic aliases. Business mutations still happen inside the destination workspace.
            </p>
          </div>

          <button type="button" className="button button-ghost" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="terminal-command-input-shell">
          <span className="terminal-command-prompt" aria-hidden="true">
            TERM
          </span>
          <input
            ref={inputRef}
            className="terminal-command-input"
            type="text"
            value={query}
            placeholder="Try MON, DES HENRY, TRD TRD-1001, CP SHELL, PX HENRY, EOD, or a workspace"
            aria-label="Search terminal navigation targets"
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex(flattenedResults.length === 0 ? 0 : Math.min(boundedSelectedIndex + 1, flattenedResults.length - 1))
                return
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex(flattenedResults.length === 0 ? 0 : Math.max(boundedSelectedIndex - 1, 0))
                return
              }

              if (event.key === 'Enter' && activeResult) {
                event.preventDefault()
                handleSelectResult(activeResult)
                return
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                handleClose()
              }
            }}
          />
        </div>

        <div className="terminal-command-hints" aria-label="Search shortcuts">
          <span>{shortcutDisplayLabel()}</span>
          <span>{prefixExampleLabel()}</span>
          <span>? for shortcuts</span>
          <span>Use arrows to move and Enter to open</span>
        </div>

        {searchState.status === 'results' ? (
          <div className="terminal-command-results" role="listbox" aria-label="Terminal navigation results">
            {searchState.groups.map((group) => (
              <section key={group.scope} className="terminal-command-group">
                <div className="terminal-command-group-head">
                  <strong>{group.label}</strong>
                  <small>{group.results.length}</small>
                </div>

                <div className="terminal-command-group-results">
                  {group.results.map((result) => {
                    const resultIndex = flattenedResults.findIndex((candidate) => candidate.id === result.id)
                    const isActive = resultIndex === boundedSelectedIndex

                    return (
                      <button
                        key={result.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`terminal-command-result ${isActive ? 'is-active' : ''}`}
                        onMouseEnter={() => setSelectedIndex(resultIndex)}
                        onClick={() => handleSelectResult(result)}
                      >
                        <div className="terminal-command-result-copy">
                          <strong>{result.title}</strong>
                          <p>{result.detail}</p>
                        </div>
                        <span className="terminal-command-result-kind">{actionScopeLabel(result)}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section
            className={`surface empty-state terminal-command-state terminal-command-state-${searchState.status}`}
            aria-live="polite"
          >
            <strong>{searchState.title}</strong>
            <p>{searchState.detail}</p>
          </section>
        )}

        <div className="terminal-command-footer">
          <small>
            {activeResult
              ? `Ready to open ${activeResult.title}.`
              : 'Use the command bar to jump to a workspace or record.'}
          </small>
          <small>Navigation only. Book, amend, approve, and settle actions stay inside governed workflows.</small>
        </div>
      </section>
    </div>
  )
}
