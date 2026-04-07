import type { DocumentationDocumentKey } from '../../workspaces/docs/DocumentationWorkspace'
import type { ViewKey } from '../../shared/models'

export const APP_VIEWS: Array<{ key: ViewKey; label: string; kicker: string }> = [
  { key: 'dashboard', label: 'Dashboard', kicker: 'Desk' },
  { key: 'guide', label: 'Guide', kicker: 'Playbook' },
  { key: 'trades', label: 'Trading', kicker: 'Blotter' },
  { key: 'events', label: 'Events', kicker: 'Tape' },
  { key: 'risk', label: 'Risk', kicker: 'Exposure' },
  { key: 'positions', label: 'Positions', kicker: 'Risk' },
  { key: 'shipments', label: 'Deliveries', kicker: 'Execution' },
  { key: 'scheduling', label: 'Scheduling', kicker: 'Scheduler' },
  { key: 'operations', label: 'Operations', kicker: 'Control' },
  { key: 'settlement', label: 'Settlement', kicker: 'Cash' },
  { key: 'reports', label: 'Reports', kicker: 'Analytics' },
  { key: 'reference', label: 'Reference Data', kicker: 'Master' },
  { key: 'admin', label: 'Admin', kicker: 'Ops' },
  { key: 'settings', label: 'Settings', kicker: 'Config' },
  { key: 'assistant', label: 'Assistant', kicker: 'AI' },
]

export const DEFAULT_DOCUMENTATION_DOCUMENT_KEY: DocumentationDocumentKey = 'guide'

const VIEW_KEYS = new Set<ViewKey>(APP_VIEWS.map((view) => view.key))

export function isViewKey(value: string | null): value is ViewKey {
  return value !== null && VIEW_KEYS.has(value as ViewKey)
}

export function isDocumentationDocumentKey(value: string | null): value is DocumentationDocumentKey {
  return value === 'guide' || value === 'roadmap'
}

export function workspaceLabel(view: ViewKey): string {
  return APP_VIEWS.find((entry) => entry.key === view)?.label ?? 'Workspace'
}

export const HERO_TITLE_BY_VIEW: Record<ViewKey, string> = {
  dashboard: 'Desk overview and market pulse',
  guide: 'Playbooks inside the console',
  trades: 'Trade blotter and ticket entry',
  events: 'Lifecycle tape and chronology',
  risk: 'Exposure concentration and pricing quality',
  positions: 'Risk buckets and net exposure',
  shipments: 'Cross-mode delivery obligations and execution readiness',
  scheduling: 'Scheduler board and delivery window readiness',
  operations: 'Operational control and workflow coverage',
  settlement: 'Invoice, payment, and settlement control',
  reports: 'Desk reporting and analyst outputs',
  reference: 'Reference master and mappings',
  admin: 'Operational controls and governance',
  settings: 'Runtime profile and access',
  assistant: 'Analyst copilot for the desk',
}

export const HERO_BODY_BY_VIEW: Record<ViewKey, string> = {
  dashboard:
    'Track the desk like a live terminal: health, market marks, positions, and operational attention stay on one screen.',
  guide:
    'Keep the operating model close to the product so onboarding, runbooks, and design notes stay in flow.',
  trades:
    'Enter tickets, inspect the active trade, and run lifecycle actions without losing the blotter context.',
  events:
    'Read the system as a tape instead of a log table, then narrow to the trade that needs attention.',
  risk:
    'Focus the desk on concentration, unpriced exposure, and the books carrying the most open risk.',
  positions:
    'Scan class-level risk first, then drop straight into the exact commodity rows carrying exposure.',
  shipments:
    'Manage logistics moves, pipeline flows, and power schedules from one delivery surface that shows mode-specific blockers without forcing them into the same workflow.',
  scheduling:
    'Give commodity schedulers a dedicated screen for open windows, nomination readiness, and blocker clearing instead of burying that work in generalized delivery queues.',
  operations:
    'Run the operational control loop from workflow queues, delivery blockers, and live platform health on one surface.',
  settlement:
    'Keep invoice, payment, and settlement aging visible so post-trade cash workflow is no longer buried in raw trade rows.',
  reports:
    'Surface curated credit, exposure, and audit outputs for operators who need answers faster than a spreadsheet refresh.',
  reference:
    'Maintain the desk registry for books, commodities, locations, and operational master data without leaving the app.',
  admin:
    'Operate sync jobs, governance flows, and privileged maintenance from one controlled workspace.',
  settings:
    'Adjust runtime behavior, stored credentials, and client overrides without leaving the trading console.',
  assistant:
    'Ask for grounded analysis with the desk state already loaded so AI stays anchored to what operations can see.',
}
