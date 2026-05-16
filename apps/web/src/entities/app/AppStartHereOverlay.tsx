import { useEffect, useEffectEvent } from 'react'
import { createPortal } from 'react-dom'

import type { ViewKey } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'
import type { StartHereReturnView } from '../../shared/startHereReturnIntent'

type AppStartHereOverlayProps = {
  authSession: StoredAuthSession | null
  onDismiss: () => void
  onOpenView: (view: ViewKey, returnIntentView?: StartHereReturnView | null) => void
}

type StartHereAction = {
  title: string
  detail: string
  signedOutDetail: string
  signedInView: ViewKey
  signedOutView: ViewKey
  signedInActionLabel: string
  signedOutActionLabel: string
  signedInChip: string
  signedOutChip: string
  signedOutReturnIntentView: StartHereReturnView | null
}

const START_HERE_ACTIONS: StartHereAction[] = [
  {
    title: 'Book a trade',
    detail: 'Open the trade ticket and blotter when the desk needs to book, amend, or inspect a position.',
    signedOutDetail: 'Sign in first, then jump straight into ticket entry and blotter work.',
    signedInView: 'trades',
    signedOutView: 'settings',
    signedInActionLabel: 'Open Trade Capture',
    signedOutActionLabel: 'Sign In for Trade Capture',
    signedInChip: 'Capture',
    signedOutChip: 'Requires sign-in',
    signedOutReturnIntentView: 'trades',
  },
  {
    title: 'Check exposure',
    detail: 'Open exposure when the question is concentration, pricing coverage, or where the biggest books sit.',
    signedOutDetail: 'Sign in first to open the live exposure view and see current concentration.',
    signedInView: 'risk',
    signedOutView: 'settings',
    signedInActionLabel: 'Open Exposure',
    signedOutActionLabel: 'Sign In for Exposure',
    signedInChip: 'Watch',
    signedOutChip: 'Requires sign-in',
    signedOutReturnIntentView: 'risk',
  },
  {
    title: 'Investigate a trade issue',
    detail: 'Open the activity feed when you need to trace what changed on a trade before you jump into capture or ops.',
    signedOutDetail: 'Sign in first to inspect the recent trade activity trail and see what changed.',
    signedInView: 'events',
    signedOutView: 'settings',
    signedInActionLabel: 'Open Activity Feed',
    signedOutActionLabel: 'Sign In for Activity Feed',
    signedInChip: 'Investigate',
    signedOutChip: 'Requires sign-in',
    signedOutReturnIntentView: 'events',
  },
  {
    title: 'Run the work queue',
    detail: 'Open operations when teams are clearing confirmations, blockers, approvals, and handoffs.',
    signedOutDetail: 'Sign in first to work the live operational queue and post-trade blockers.',
    signedInView: 'operations',
    signedOutView: 'settings',
    signedInActionLabel: 'Open Work Queue',
    signedOutActionLabel: 'Sign In for Work Queue',
    signedInChip: 'Queue',
    signedOutChip: 'Requires sign-in',
    signedOutReturnIntentView: 'operations',
  },
  {
    title: 'Learn how this works',
    detail: 'Open the in-product guide for onboarding, workflow orientation, and platform context.',
    signedOutDetail: 'The guide is available right away, even before you connect a live session.',
    signedInView: 'guide',
    signedOutView: 'guide',
    signedInActionLabel: 'Open How It Works',
    signedOutActionLabel: 'Open How It Works',
    signedInChip: 'Learn',
    signedOutChip: 'Available now',
    signedOutReturnIntentView: null,
  },
]

export function AppStartHereOverlay({
  authSession,
  onDismiss,
  onOpenView,
}: AppStartHereOverlayProps) {
  const hasAuthSession = authSession !== null
  const handleDismiss = useEffectEvent(() => {
    onDismiss()
  })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleDismiss()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function handleOpenView(view: ViewKey, returnIntentView: StartHereReturnView | null) {
    onDismiss()
    onOpenView(view, returnIntentView)
  }

  const overlay = (
    <div className="start-here-overlay" role="presentation">
      <div className="start-here-backdrop" />

      <section
        className="surface start-here-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-here-title"
      >
        <div className="start-here-head">
          <div className="start-here-copy">
            <span className="eyebrow">Start Here</span>
            <h3 id="start-here-title">
              {hasAuthSession ? 'Choose the job in front of you' : 'Start with the job you came here to do'}
            </h3>
            <p>
              {hasAuthSession
                ? 'Use these common paths to get oriented fast after sign-in, then jump straight into the right workspace.'
                : 'You can open the guide right away. Trade capture, activity, exposure, and queue work will route you to the sign-in screen first.'}
            </p>
          </div>

          <button type="button" className="button button-ghost" onClick={onDismiss}>
            Not Now
          </button>
        </div>

        <div className="feedback-banner feedback-banner-success start-here-banner">
          {hasAuthSession
            ? `Signed in as ${authSession.user.display_name}. This first-sign-in guide stays out of the way after you choose a path.`
            : 'Dismiss this if you already know where you are going. Sign-in routes will still take you straight to the right workspace.'}
        </div>

        <div className="dashboard-report-grid start-here-grid">
          {START_HERE_ACTIONS.map((action) => {
            const targetView = hasAuthSession ? action.signedInView : action.signedOutView
            const actionLabel = hasAuthSession ? action.signedInActionLabel : action.signedOutActionLabel
            const chipLabel = hasAuthSession ? action.signedInChip : action.signedOutChip
            const detail = hasAuthSession ? action.detail : action.signedOutDetail
            const returnIntentView = hasAuthSession ? null : action.signedOutReturnIntentView

            return (
              <article key={action.title} className="dashboard-report-card section-start-card start-here-card">
                <div className="section-start-card-copy">
                  <span>{chipLabel}</span>
                  <strong>{action.title}</strong>
                  <p>{detail}</p>
                </div>

                <div className="section-start-card-actions">
                  <span className="entity-chip entity-chip-soft">
                    {targetView === 'settings' ? 'Open Settings' : `Open ${action.title}`}
                  </span>
                  <button
                    type="button"
                    className={targetView === 'settings' ? 'button button-ghost' : 'button button-secondary'}
                    onClick={() => handleOpenView(targetView, returnIntentView)}
                  >
                    {actionLabel}
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <div className="start-here-footnote">
          <p>
            {hasAuthSession
              ? 'After you dismiss this or choose a job, it stays hidden for the rest of this session and future sign-ins stay clear.'
              : 'The signed-out version stays hidden after dismissal, and the signed-in version only appears on a user\'s first successful sign-in.'}
          </p>
        </div>
      </section>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(overlay, document.body)
}
