import { useState } from 'react'

import type { ViewKey } from '../../shared/models'
import {
  buildTerminalWorkspaceSetLaunchTargets,
  getPrimaryTerminalWorkspaceSetRoute,
  listTerminalWorkspaceSets,
  readDefaultTerminalWorkspaceSetId,
  resolveTerminalWorkspaceSet,
  saveDefaultTerminalWorkspaceSetId,
  type TerminalWorkspaceSetId,
} from '../../shared/terminalWorkspaceSets'

type TerminalWorkspaceSetLauncherProps = {
  className?: string
  hrefForView: (view: ViewKey) => string
  navigateToView: (view: ViewKey) => void
  onNavigate?: () => void
}

export function TerminalWorkspaceSetLauncher({
  className,
  hrefForView,
  navigateToView,
  onNavigate,
}: TerminalWorkspaceSetLauncherProps) {
  const workspaceSets = listTerminalWorkspaceSets()
  const [selectedWorkspaceSetId, setSelectedWorkspaceSetId] = useState<TerminalWorkspaceSetId>(() =>
    readDefaultTerminalWorkspaceSetId(),
  )
  const [defaultWorkspaceSetId, setDefaultWorkspaceSetId] = useState<TerminalWorkspaceSetId>(() =>
    readDefaultTerminalWorkspaceSetId(),
  )
  const selectedWorkspaceSet = resolveTerminalWorkspaceSet(selectedWorkspaceSetId)
  const primaryRoute = getPrimaryTerminalWorkspaceSetRoute(selectedWorkspaceSet)
  const launchTargets = buildTerminalWorkspaceSetLaunchTargets(selectedWorkspaceSet, hrefForView)

  function handleOpenPrimary() {
    navigateToView(primaryRoute.view)
    onNavigate?.()
  }

  function handleSaveDefault() {
    if (saveDefaultTerminalWorkspaceSetId(selectedWorkspaceSet.id)) {
      setDefaultWorkspaceSetId(selectedWorkspaceSet.id)
    }
  }

  return (
    <section
      className={['terminal-workspace-set-launcher', className].filter(Boolean).join(' ')}
      aria-label="Terminal workspace sets"
    >
      <div className="terminal-workspace-set-head">
        <div className="terminal-workspace-set-copy">
          <span className="terminal-workspace-set-eyebrow">Workspace Set</span>
          <strong>{selectedWorkspaceSet.label}</strong>
          <p>{selectedWorkspaceSet.description}</p>
        </div>
        <label className="terminal-workspace-set-select-field">
          <span>Choose setup</span>
          <select
            className="terminal-workspace-set-select"
            value={selectedWorkspaceSet.id}
            onChange={(event) =>
              setSelectedWorkspaceSetId(resolveTerminalWorkspaceSet(event.currentTarget.value).id)
            }
          >
            {workspaceSets.map((workspaceSet) => (
              <option key={workspaceSet.id} value={workspaceSet.id}>
                {workspaceSet.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="terminal-workspace-set-toolbar">
        <button type="button" className="button button-secondary" onClick={handleOpenPrimary}>
          Open Primary
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={handleSaveDefault}
          disabled={defaultWorkspaceSetId === selectedWorkspaceSet.id}
        >
          {defaultWorkspaceSetId === selectedWorkspaceSet.id ? 'Default Setup' : 'Set As Default'}
        </button>
        <small>{selectedWorkspaceSet.operatorGoal}</small>
      </div>

      <ol className="terminal-workspace-set-targets">
        {launchTargets.map((target) => (
          <li key={target.id} className="terminal-workspace-set-target">
            <div className="terminal-workspace-set-target-copy">
              <span>{target.role}</span>
              <strong>{target.label}</strong>
              <p>{target.purpose}</p>
              {target.preset ? (
                <small>
                  Preset: {target.preset.label}
                  {target.presetAvailable ? '' : ' unavailable'}
                </small>
              ) : null}
            </div>
            <a
              className="button button-ghost terminal-workspace-set-popout"
              href={target.href}
              target="_blank"
              rel="noreferrer"
            >
              Pop Out
            </a>
          </li>
        ))}
      </ol>

      <small className="terminal-workspace-set-note">
        Browser window placement stays manual; this setup only opens safe ECTRM workspaces.
      </small>
    </section>
  )
}
