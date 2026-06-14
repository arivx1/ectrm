import type { PublicRuntimeSettings } from '../../entities/app/api'

type ProjectionMonitoringEmailRuntimeSettings = PublicRuntimeSettings['projection_monitoring_email']

function recipientLabel(recipientCount: number): string {
  return `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`
}

export function formatProjectionMonitoringEmailStatusLabel(
  settings: ProjectionMonitoringEmailRuntimeSettings,
): string {
  if (settings.transport === 'local_archive') {
    return 'Local archive'
  }
  if (settings.provider_hint === 'gmail') {
    return settings.auth_status === 'configured' ? 'Gmail SMTP' : 'Gmail SMTP setup'
  }
  return 'SMTP'
}

export function formatProjectionMonitoringEmailAuthLabel(
  settings: ProjectionMonitoringEmailRuntimeSettings,
): string {
  switch (settings.auth_status) {
    case 'configured':
      return 'Configured'
    case 'partial':
      return 'Partial'
    default:
      return 'None'
  }
}

export function summarizeProjectionMonitoringEmail(
  settings: ProjectionMonitoringEmailRuntimeSettings,
): string {
  const recipients = recipientLabel(settings.recipient_count)
  if (settings.transport === 'local_archive') {
    return `Email digests stay in the local archive until SMTP is configured. ${recipients} would receive them once external delivery is enabled.`
  }
  if (settings.provider_hint === 'gmail') {
    if (settings.auth_status === 'configured') {
      return `Projection monitoring digests are pointed at Gmail SMTP for ${recipients}.`
    }
    return `Gmail SMTP is selected for ${recipients}, but authentication still needs to be completed.`
  }
  return `Projection monitoring digests use SMTP for ${recipients}.`
}
