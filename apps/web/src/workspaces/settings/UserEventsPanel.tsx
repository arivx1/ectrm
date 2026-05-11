import { useMemo, useState, type FormEvent } from 'react'

import {
  createUserEvent,
  type CreateUserEventInput,
  type UserEventKind,
} from '../../entities/user-events/api'
import { appConfig } from '../../shared/config'
import type { StoredAuthSession } from '../../shared/mutation'
import { getSystemTimeZone } from '../../shared/timeDisplaySettings'
import { SettingsDisclosureCard } from './SettingsDisclosureCard'
import { SETTINGS_CUSTOM_EVENTS_CARD_ANCHOR_ID } from './userEventsPanelShared'
import { formatUserEventSaveError } from './userEventsPanelSupport'

type UserEventsPanelProps = {
  authSession: StoredAuthSession | null
}

type UserEventDraft = {
  title: string
  kind: UserEventKind
  allDay: boolean
  startsAt: string
  endsAt: string
  place: string
  description: string
}

type SaveTone = 'success' | 'error'

type SaveMessage = {
  tone: SaveTone
  message: string
}

const USER_EVENT_KIND_OPTIONS: Array<{ value: UserEventKind; label: string; detail: string }> = [
  {
    value: 'EVENT',
    label: 'Event',
    detail: 'A one-off desk event or appointment.',
  },
  {
    value: 'REMINDER',
    label: 'Reminder',
    detail: 'An operator reminder that should be captured alongside desk context.',
  },
  {
    value: 'HOLIDAY',
    label: 'Holiday',
    detail: 'A closure or holiday that belongs in your desk calendar context.',
  },
  {
    value: 'OTHER',
    label: 'Other',
    detail: 'Anything that does not fit the standard categories.',
  },
]

function padInputNumber(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateInput(value: Date): string {
  return `${value.getFullYear()}-${padInputNumber(value.getMonth() + 1)}-${padInputNumber(value.getDate())}`
}

function formatLocalDateTimeInput(value: Date): string {
  return `${formatLocalDateInput(value)}T${padInputNumber(value.getHours())}:${padInputNumber(value.getMinutes())}`
}

function buildDefaultDraft(now = new Date()): UserEventDraft {
  return {
    title: '',
    kind: 'EVENT',
    allDay: false,
    startsAt: formatLocalDateTimeInput(now),
    endsAt: '',
    place: '',
    description: '',
  }
}

function normalizeOptionalText(value: string): string | null {
  const normalizedValue = value.trim()
  return normalizedValue ? normalizedValue : null
}

function parseDraftDateValue(
  value: string,
  options: { allDay: boolean },
): Date | null {
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return null
  }

  const parsedValue = new Date(
    options.allDay ? `${normalizedValue}T00:00` : normalizedValue,
  )
  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue
}

function buildCreatePayload(
  draft: UserEventDraft,
  timezone: string,
): CreateUserEventInput {
  const title = draft.title.trim()
  if (!title) {
    throw new Error('Enter an event name before saving.')
  }

  const startsAt = parseDraftDateValue(draft.startsAt, { allDay: draft.allDay })
  if (!startsAt) {
    throw new Error(draft.allDay ? 'Choose a start date.' : 'Choose a valid start time.')
  }

  const endsAt = parseDraftDateValue(draft.endsAt, { allDay: draft.allDay })
  if (draft.endsAt.trim() && !endsAt) {
    throw new Error(draft.allDay ? 'Choose a valid end date or leave it blank.' : 'Choose a valid end time or leave it blank.')
  }

  if (endsAt && endsAt.getTime() < startsAt.getTime()) {
    throw new Error('The end must be the same as or later than the start.')
  }

  return {
    title,
    kind: draft.kind,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt ? endsAt.toISOString() : null,
    all_day: draft.allDay,
    timezone,
    place: normalizeOptionalText(draft.place),
    description: normalizeOptionalText(draft.description),
  }
}

export function UserEventsPanel({ authSession }: UserEventsPanelProps) {
  const browserTimeZone = useMemo(() => getSystemTimeZone(), [])
  const [draft, setDraft] = useState<UserEventDraft>(() => buildDefaultDraft())
  const [savePending, setSavePending] = useState(false)
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!authSession) {
      setSaveMessage({
        tone: 'error',
        message: 'Sign in before adding custom events.',
      })
      return
    }

    try {
      const payload = buildCreatePayload(draft, browserTimeZone)
      setSavePending(true)
      setSaveMessage(null)
      await createUserEvent(appConfig.apiBase, authSession, payload)
      setDraft(buildDefaultDraft())
      setSaveMessage({
        tone: 'success',
        message: `Saved ${payload.title}.`,
      })
    } catch (error) {
      setSaveMessage({
        tone: 'error',
        message: formatUserEventSaveError(error),
      })
    } finally {
      setSavePending(false)
    }
  }

  return (
    <SettingsDisclosureCard
      cardKey="settings.custom-events-card"
      hashAnchorId={SETTINGS_CUSTOM_EVENTS_CARD_ANCHOR_ID}
      eyebrow="Custom"
      title="Custom Events"
      summary="Create one-off desk reminders, closures, and manual events without leaving ECTRM."
    >
      <div className="settings-custom-events-panel">
        <div className="settings-summary-grid">
          <article className="settings-summary-card">
            <span>Entry mode</span>
            <strong>Manual</strong>
            <p>Use this card when a desk event belongs in ECTRM even if it does not exist in Google Calendar.</p>
          </article>
          <article className="settings-summary-card">
            <span>Timezone</span>
            <strong>{browserTimeZone}</strong>
            <p>This first pass saves custom events in the current browser timezone.</p>
          </article>
          <article className="settings-summary-card">
            <span>Scope</span>
            <strong>One-off events</strong>
            <p>Capture a single date or time window for now, then add the next item from the same screen.</p>
          </article>
        </div>

        {!authSession ? (
          <div className="empty-state">
            <strong>Sign in to add custom events</strong>
            <p>ECTRM needs an authenticated session before it can save manual desk events.</p>
          </div>
        ) : (
          <form className="settings-custom-events-form" onSubmit={handleSubmit}>
            <div className="settings-custom-events-form-grid">
              <label className="field settings-custom-events-form-field settings-custom-events-form-field-wide">
                <span>Event name</span>
                <input
                  className="control"
                  type="text"
                  value={draft.title}
                  maxLength={200}
                  placeholder="Desk holiday closure"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </label>

              <label className="field settings-custom-events-form-field">
                <span>Type</span>
                <select
                  className="control"
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      kind: event.target.value as UserEventKind,
                    }))
                  }
                >
                  {USER_EVENT_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small>{USER_EVENT_KIND_OPTIONS.find((option) => option.value === draft.kind)?.detail}</small>
              </label>

              <div className="field settings-custom-events-form-field settings-custom-events-form-field-checkbox">
                <span>Timing</span>
                <label className="settings-custom-events-checkbox">
                  <input
                    type="checkbox"
                    checked={draft.allDay}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        allDay: event.target.checked,
                        startsAt: event.target.checked
                          ? formatLocalDateInput(new Date())
                          : formatLocalDateTimeInput(new Date()),
                        endsAt: '',
                      }))
                    }
                  />
                  <span>All day</span>
                </label>
                <small>
                  {draft.allDay
                    ? 'Save a date-based event without start and end times.'
                    : 'Save a timed event using your browser clock.'}
                </small>
              </div>

              <label className="field settings-custom-events-form-field">
                <span>{draft.allDay ? 'Start date' : 'Start time'}</span>
                <input
                  className="control"
                  type={draft.allDay ? 'date' : 'datetime-local'}
                  value={draft.startsAt}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, startsAt: event.target.value }))
                  }
                />
              </label>

              <label className="field settings-custom-events-form-field">
                <span>{draft.allDay ? 'End date' : 'End time'}</span>
                <input
                  className="control"
                  type={draft.allDay ? 'date' : 'datetime-local'}
                  value={draft.endsAt}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, endsAt: event.target.value }))
                  }
                />
                <small>Optional. Leave blank if the event only needs a single starting point.</small>
              </label>

              <label className="field settings-custom-events-form-field">
                <span>Place</span>
                <input
                  className="control"
                  type="text"
                  value={draft.place}
                  maxLength={160}
                  placeholder="Houston Terminal"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, place: event.target.value }))
                  }
                />
              </label>

              <label className="field settings-custom-events-form-field settings-custom-events-form-field-wide">
                <span>Description</span>
                <textarea
                  className="control settings-custom-events-textarea"
                  value={draft.description}
                  maxLength={4000}
                  placeholder="Operator reminder or desk note"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            {saveMessage ? (
              <p
                className={`form-note ${saveMessage.tone === 'error' ? 'form-note-error' : 'form-note-success'}`}
              >
                {saveMessage.message}
              </p>
            ) : null}

            <div className="toolbar settings-actions">
              <button
                type="submit"
                className="button button-primary"
                disabled={savePending}
              >
                {savePending ? 'Saving…' : 'Add Event'}
              </button>
            </div>
          </form>
        )}
      </div>
    </SettingsDisclosureCard>
  )
}
