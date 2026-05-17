import {
  TERMINAL_SHORTCUT_DEFINITIONS,
  TERMINAL_WORKSPACE_SHORTCUTS,
} from './terminalKeyboardShortcuts'

type TerminalShortcutReferenceProps = {
  isOpen: boolean
  onClose: () => void
}

export function TerminalShortcutReference({
  isOpen,
  onClose,
}: TerminalShortcutReferenceProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="terminal-shortcut-overlay" role="presentation">
      <button
        type="button"
        className="terminal-command-backdrop"
        aria-label="Close keyboard shortcuts"
        onClick={onClose}
      />

      <section
        className="surface terminal-shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-shortcut-title"
      >
        <div className="terminal-command-head">
          <div className="terminal-command-head-copy">
            <span className="eyebrow">Keyboard</span>
            <strong id="terminal-shortcut-title">Terminal Shortcuts</strong>
            <p>
              Shortcuts are navigation-only and skip form fields unless they intentionally open terminal search.
            </p>
          </div>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="terminal-shortcut-grid">
          {TERMINAL_SHORTCUT_DEFINITIONS.map((shortcut) => (
            <article key={shortcut.id} className="terminal-shortcut-card">
              <div className="terminal-shortcut-card-copy">
                <span>{shortcut.category}</span>
                <strong>{shortcut.label}</strong>
                <p>{shortcut.detail}</p>
              </div>
              <div className="terminal-shortcut-key-row">
                {shortcut.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </div>
              {shortcut.conflictSafe ? (
                <small>Paused while typing in inputs and editors.</small>
              ) : (
                <small>Global escape hatch into navigation.</small>
              )}
            </article>
          ))}
        </div>

        <section className="terminal-shortcut-workspaces">
          <div className="terminal-command-group-head">
            <strong>Workspace Numbers</strong>
            <small>{TERMINAL_WORKSPACE_SHORTCUTS.length}</small>
          </div>
          <div className="terminal-shortcut-workspace-list">
            {TERMINAL_WORKSPACE_SHORTCUTS.map((shortcut) => (
              <article key={shortcut.key} className="terminal-shortcut-workspace-row">
                <kbd>Alt+{shortcut.key}</kbd>
                <div>
                  <strong>{shortcut.label}</strong>
                  <p>{shortcut.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}
