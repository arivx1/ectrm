import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  formatProjectionMonitoringEmailAuthLabel,
  formatProjectionMonitoringEmailStatusLabel,
  summarizeProjectionMonitoringEmail,
} from '../src/workspaces/settings/projectionMonitoringEmailRuntime.ts'

test('projection monitoring email helpers describe the local archive fallback', () => {
  const settings = {
    transport: 'local_archive',
    provider_hint: 'none',
    smtp_host: null,
    smtp_port: null,
    sender: 'projection-monitoring@localhost',
    recipient_count: 1,
    auth_status: 'none',
  } as const

  assert.equal(formatProjectionMonitoringEmailStatusLabel(settings), 'Local archive')
  assert.equal(formatProjectionMonitoringEmailAuthLabel(settings), 'None')
  assert.match(summarizeProjectionMonitoringEmail(settings), /local archive/i)
})

test('projection monitoring email helpers call out configured Gmail delivery', () => {
  const settings = {
    transport: 'smtp',
    provider_hint: 'gmail',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    sender: 'alerts@gmail.com',
    recipient_count: 2,
    auth_status: 'configured',
  } as const

  assert.equal(formatProjectionMonitoringEmailStatusLabel(settings), 'Gmail SMTP')
  assert.equal(formatProjectionMonitoringEmailAuthLabel(settings), 'Configured')
  assert.match(summarizeProjectionMonitoringEmail(settings), /Gmail SMTP/i)
})

test('projection monitoring email helpers flag incomplete Gmail setup', () => {
  const settings = {
    transport: 'smtp',
    provider_hint: 'gmail',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    sender: 'alerts@gmail.com',
    recipient_count: 1,
    auth_status: 'partial',
  } as const

  assert.equal(formatProjectionMonitoringEmailStatusLabel(settings), 'Gmail SMTP setup')
  assert.equal(formatProjectionMonitoringEmailAuthLabel(settings), 'Partial')
  assert.match(summarizeProjectionMonitoringEmail(settings), /needs to be completed/i)
})
