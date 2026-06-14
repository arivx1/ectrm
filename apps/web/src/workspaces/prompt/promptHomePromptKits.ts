import type { ViewKey } from '../../shared/models'

export type PromptHomePromptKitSuggestion = {
  label: string
  prompt: string
}

export type PromptHomePromptKitLink = {
  label: string
  view: ViewKey
}

export type PromptHomePromptKit = {
  key: 'trade' | 'schedule' | 'manage-shipments' | 'manage-risk' | 'settle' | 'accounting'
  label: string
  detail: string
  suggestedPrompts: PromptHomePromptKitSuggestion[]
  workspaceLinks: PromptHomePromptKitLink[]
}

const TRADE_GUIDE_PROMPT =
  'I would like to build a trade. Treat this as drafting and analysis only, not trade capture. Ask me one question at a time. First ask whether the trade should be real or simulated. Next ask whether I want to tell you the data or want you to build the trade for me. If I want you to build it, ask whether I am trying to make my positions flat, minimize my exposure, hedge my risk, speculate, or look for arbitrage opportunities. Then ask only the minimum follow-up questions needed to propose a trade structure, the rationale, the key risks, and what data is still missing before it could move to Trade Capture.'

export const PROMPT_HOME_PROMPT_KITS: PromptHomePromptKit[] = [
  {
    key: 'trade',
    label: 'Trade',
    detail: 'Draft a trade idea, pressure-test it, or jump into capture and pre-trade review.',
    suggestedPrompts: [
      {
        label: 'Walk me through building a trade draft.',
        prompt: TRADE_GUIDE_PROMPT,
      },
      {
        label: 'Help me build a simulated trade idea to hedge risk.',
        prompt: 'Help me build a simulated trade idea to hedge risk.',
      },
    ],
    workspaceLinks: [
      { label: 'Open Trade Capture', view: 'trades' },
      { label: 'Open Pre-Trade Review', view: 'pretrade' },
    ],
  },
  {
    key: 'schedule',
    label: 'Schedule',
    detail: 'Prepare or review schedule decisions, timing changes, and operational constraints.',
    suggestedPrompts: [
      {
        label: 'Help me prepare today’s schedules.',
        prompt:
          'Help me prepare today’s schedules. Start by asking what market, delivery window, and constraints matter, then tell me what I should confirm before finalizing changes.',
      },
      {
        label: 'What should I confirm before finalizing a schedule change?',
        prompt: 'What should I confirm before finalizing a schedule change?',
      },
    ],
    workspaceLinks: [
      { label: 'Open Scheduling', view: 'scheduling' },
      { label: 'Open Work Queue', view: 'operations' },
    ],
  },
  {
    key: 'manage-shipments',
    label: 'Manage Shipments',
    detail: 'Triage delivery blockers, delayed movement, and follow-up steps across the shipment queue.',
    suggestedPrompts: [
      {
        label: 'Help me triage today’s shipment blockers.',
        prompt: 'Help me triage today’s shipment blockers and tell me what needs attention first.',
      },
      {
        label: 'Walk me through a delayed shipment.',
        prompt:
          'Walk me through the next steps for a delayed or at-risk shipment and tell me what data I should confirm first.',
      },
    ],
    workspaceLinks: [
      { label: 'Open Shipments', view: 'shipments' },
      { label: 'Open Work Queue', view: 'operations' },
    ],
  },
  {
    key: 'manage-risk',
    label: 'Manage Risk',
    detail: 'Review exposure, investigate risk changes, and pull in market context that could move the book.',
    suggestedPrompts: [
      {
        label: 'Summarize the biggest exposure risks I should look at right now.',
        prompt: 'Summarize the biggest exposure risks I should look at right now.',
      },
      {
        label: 'Help me investigate a risk change by book, commodity, or location.',
        prompt: 'Help me investigate a risk change by book, commodity, or location.',
      },
      {
        label: 'Tell me updates about the Strait of Hormuz.',
        prompt: 'Tell me updates about the Strait of Hormuz.',
      },
    ],
    workspaceLinks: [
      { label: 'Open Risk', view: 'risk' },
      { label: 'Open Positions', view: 'positions' },
    ],
  },
  {
    key: 'settle',
    label: 'Settle',
    detail: 'Prioritize invoices, payments, and settlement exceptions that need guided follow-up.',
    suggestedPrompts: [
      {
        label: 'Help me triage the settlement queue.',
        prompt: 'Help me triage the settlement queue and prioritize what to work first.',
      },
      {
        label: 'What should I check before approving an invoice or payment exception?',
        prompt: 'What should I check before approving an invoice or payment exception?',
      },
    ],
    workspaceLinks: [
      { label: 'Open Settlement', view: 'settlement' },
      { label: 'Open Work Queue', view: 'operations' },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    detail: 'Review reconciliations, close questions, and accounting follow-up without leaving the prompt flow.',
    suggestedPrompts: [
      {
        label: 'Help me prepare an accounting review.',
        prompt:
          'Help me prepare an accounting review for invoices, payments, accruals, and close questions. Start by asking which area I am trying to reconcile.',
      },
      {
        label: 'What should I reconcile before month-end close for today’s activity?',
        prompt: 'What should I reconcile before month-end close for today’s activity?',
      },
    ],
    workspaceLinks: [
      { label: 'Open Reports', view: 'reports' },
      { label: 'Open Events', view: 'events' },
    ],
  },
]
