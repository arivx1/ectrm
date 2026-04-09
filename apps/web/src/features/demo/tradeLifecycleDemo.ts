import type { ViewKey } from '../../shared/models'

export type DemoCommodityKey = 'steel' | 'crude-oil' | 'natural-gas' | 'grain' | 'power'
export type DemoTradeSide = 'BUY' | 'SELL'
export type DemoConfirmationState = 'clean' | 'late' | 'missing'
export type DemoSchedulingState = 'on-time' | 'minor-delay' | 'major-delay'
export type DemoPaymentState = 'match' | 'short-pay' | 'over-pay'
export type DemoScenarioPresetKey =
  | 'clean-physical'
  | 'scheduling-delay'
  | 'payment-mismatch'
  | 'compound-exception'
export type DemoStepTone = 'nominal' | 'watch' | 'action' | 'blocked'
export type DemoStepKey =
  | 'capture'
  | 'confirmation'
  | 'scheduling'
  | 'execution'
  | 'invoice'
  | 'payment'
  | 'closeout'

type DemoCommodityDefinition = {
  key: DemoCommodityKey
  label: string
  deskLabel: string
  defaultVolume: number
  unit: string
  modeLabel: string
  schedulingLabel: string
  invoiceBasisLabel: string
}

type DemoSelectionOption<TValue extends string> = {
  value: TValue
  label: string
  description: string
}

export type DemoScenarioConfig = {
  commodityKey: DemoCommodityKey
  tradeSide: DemoTradeSide
  volume: number
  confirmationState: DemoConfirmationState
  schedulingState: DemoSchedulingState
  paymentState: DemoPaymentState
}

export type DemoScenarioStep = {
  key: DemoStepKey
  label: string
  workspace: ViewKey
  owner: string
  tone: DemoStepTone
  summary: string
  detail: string
  attention: string | null
  guidance: string[]
}

export type DemoScenario = {
  headline: string
  narrative: string
  highlights: string[]
  recommendedStepKey: DemoStepKey
  steps: DemoScenarioStep[]
}

const VOLUME_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const DEMO_COMMODITIES: DemoCommodityDefinition[] = [
  {
    key: 'steel',
    label: 'Steel',
    deskLabel: 'Metals',
    defaultVolume: 2500,
    unit: 'ST',
    modeLabel: 'Truck / rail release',
    schedulingLabel: 'mill release and carrier slot',
    invoiceBasisLabel: 'delivered tons and surcharge terms',
  },
  {
    key: 'crude-oil',
    label: 'Crude oil',
    deskLabel: 'Liquids',
    defaultVolume: 25000,
    unit: 'BBL',
    modeLabel: 'Pipeline / vessel nomination',
    schedulingLabel: 'nomination window',
    invoiceBasisLabel: 'actual barrels and pricing-period settlement',
  },
  {
    key: 'natural-gas',
    label: 'Natural gas',
    deskLabel: 'Gas',
    defaultVolume: 100000,
    unit: 'MMBtu',
    modeLabel: 'Pipeline nomination',
    schedulingLabel: 'pipeline cycle',
    invoiceBasisLabel: 'allocated gas and index settlement',
  },
  {
    key: 'grain',
    label: 'Grain',
    deskLabel: 'Agriculture',
    defaultVolume: 120000,
    unit: 'BU',
    modeLabel: 'Rail / barge slot',
    schedulingLabel: 'elevator slot',
    invoiceBasisLabel: 'graded bushels and basis terms',
  },
  {
    key: 'power',
    label: 'Power',
    deskLabel: 'Power',
    defaultVolume: 500,
    unit: 'MWh',
    modeLabel: 'ISO schedule',
    schedulingLabel: 'market schedule',
    invoiceBasisLabel: 'actual interval quantity and nodal price',
  },
]

const DEMO_COMMODITY_BY_KEY = new Map(DEMO_COMMODITIES.map((commodity) => [commodity.key, commodity]))

export const DEMO_COMMODITY_OPTIONS = DEMO_COMMODITIES.map((commodity) => ({
  value: commodity.key,
  label: commodity.label,
  description: `${commodity.modeLabel} workflow with ${commodity.unit} as the default unit.`,
}))

export const DEMO_TRADE_SIDE_OPTIONS: DemoSelectionOption<DemoTradeSide>[] = [
  {
    value: 'BUY',
    label: 'Buy',
    description: 'Model an inbound purchase that still needs downstream execution and settlement follow-through.',
  },
  {
    value: 'SELL',
    label: 'Sell',
    description: 'Model an outbound sale where revenue capture depends on clean operations and settlement.',
  },
]

export const DEMO_CONFIRMATION_STATE_OPTIONS: DemoSelectionOption<DemoConfirmationState>[] = [
  {
    value: 'clean',
    label: 'Confirmation clean',
    description: 'Counterparty acknowledgement lands on time and operations can proceed normally.',
  },
  {
    value: 'late',
    label: 'Confirmation late',
    description: 'The confirmation is moving, but operations should keep a watch item open until signed.',
  },
  {
    value: 'missing',
    label: 'Confirmation missing',
    description: 'Downstream scheduling should stay behind a control gate until the confirmation is created and issued.',
  },
]

export const DEMO_SCHEDULING_STATE_OPTIONS: DemoSelectionOption<DemoSchedulingState>[] = [
  {
    value: 'on-time',
    label: 'On time',
    description: 'The scheduling window is available and the trade can move through execution on plan.',
  },
  {
    value: 'minor-delay',
    label: 'Minor delay',
    description: 'The slot slips, but schedulers can still recover without fully breaking the trade flow.',
  },
  {
    value: 'major-delay',
    label: 'Major delay',
    description: 'The missed window becomes a material execution blocker with likely downstream settlement impact.',
  },
]

export const DEMO_PAYMENT_STATE_OPTIONS: DemoSelectionOption<DemoPaymentState>[] = [
  {
    value: 'match',
    label: 'Matches invoice',
    description: 'Cash arrives cleanly against the invoice and the trade can move toward closeout.',
  },
  {
    value: 'short-pay',
    label: 'Short pay',
    description: 'Cash received is below the invoice, forcing a deduction or dispute workflow.',
  },
  {
    value: 'over-pay',
    label: 'Over pay',
    description: 'Cash received exceeds the invoice and settlement needs an exception workflow before closing.',
  },
]

export const DEMO_SCENARIO_PRESETS: Array<{
  key: DemoScenarioPresetKey
  label: string
  description: string
  config: DemoScenarioConfig
}> = [
  {
    key: 'clean-physical',
    label: 'Clean Physical Flow',
    description: 'A simple on-time trade with no downstream exceptions.',
    config: {
      commodityKey: 'crude-oil',
      tradeSide: 'SELL',
      volume: 25000,
      confirmationState: 'clean',
      schedulingState: 'on-time',
      paymentState: 'match',
    },
  },
  {
    key: 'scheduling-delay',
    label: 'Scheduling Delay',
    description: 'A timing problem that starts in scheduling and pushes into execution.',
    config: {
      commodityKey: 'natural-gas',
      tradeSide: 'BUY',
      volume: 100000,
      confirmationState: 'clean',
      schedulingState: 'major-delay',
      paymentState: 'match',
    },
  },
  {
    key: 'payment-mismatch',
    label: 'Cash Mismatch',
    description: 'Operations complete, but the payment does not match the invoice.',
    config: {
      commodityKey: 'grain',
      tradeSide: 'SELL',
      volume: 120000,
      confirmationState: 'clean',
      schedulingState: 'on-time',
      paymentState: 'short-pay',
    },
  },
  {
    key: 'compound-exception',
    label: 'Compound Exception',
    description: 'A more stressful walkthrough with confirmation, scheduling, and payment friction layered together.',
    config: {
      commodityKey: 'steel',
      tradeSide: 'SELL',
      volume: 2500,
      confirmationState: 'late',
      schedulingState: 'major-delay',
      paymentState: 'short-pay',
    },
  },
]

export function getDemoCommodityDefinition(key: DemoCommodityKey): DemoCommodityDefinition {
  return DEMO_COMMODITY_BY_KEY.get(key) ?? DEMO_COMMODITIES[0]
}

export function getDefaultDemoScenarioConfig(): DemoScenarioConfig {
  return { ...DEMO_SCENARIO_PRESETS[0].config }
}

export function getDemoScenarioPresetConfig(key: DemoScenarioPresetKey): DemoScenarioConfig {
  const preset = DEMO_SCENARIO_PRESETS.find((entry) => entry.key === key)
  return preset ? { ...preset.config } : getDefaultDemoScenarioConfig()
}

export function demoScenarioConfigsEqual(
  left: DemoScenarioConfig,
  right: DemoScenarioConfig,
): boolean {
  return (
    left.commodityKey === right.commodityKey &&
    left.tradeSide === right.tradeSide &&
    left.volume === right.volume &&
    left.confirmationState === right.confirmationState &&
    left.schedulingState === right.schedulingState &&
    left.paymentState === right.paymentState
  )
}

function normalizeScenarioConfig(config: DemoScenarioConfig): DemoScenarioConfig {
  const commodity = getDemoCommodityDefinition(config.commodityKey)
  return {
    ...config,
    volume:
      Number.isFinite(config.volume) && config.volume > 0
        ? Math.round(config.volume * 100) / 100
        : commodity.defaultVolume,
  }
}

function formatScenarioVolume(value: number): string {
  return VOLUME_FORMATTER.format(value)
}

function toneLabel(tone: DemoStepTone): string {
  switch (tone) {
    case 'watch':
      return 'Watchlist'
    case 'action':
      return 'Needs action'
    case 'blocked':
      return 'Blocked'
    default:
      return 'On track'
  }
}

function paymentLabel(paymentState: DemoPaymentState): string {
  return DEMO_PAYMENT_STATE_OPTIONS.find((option) => option.value === paymentState)?.label ?? 'Matches invoice'
}

function confirmationLabel(confirmationState: DemoConfirmationState): string {
  return (
    DEMO_CONFIRMATION_STATE_OPTIONS.find((option) => option.value === confirmationState)?.label ??
    'Confirmation clean'
  )
}

function schedulingLabel(schedulingState: DemoSchedulingState): string {
  return (
    DEMO_SCHEDULING_STATE_OPTIONS.find((option) => option.value === schedulingState)?.label ??
    'On time'
  )
}

function summaryHeadline(config: DemoScenarioConfig, commodity: DemoCommodityDefinition): string {
  return `${commodity.label} lifecycle walkthrough`
}

function summaryNarrative(config: DemoScenarioConfig, commodity: DemoCommodityDefinition): string {
  const direction = config.tradeSide === 'BUY' ? 'buy' : 'sell'
  return `${direction.toUpperCase()} ${formatScenarioVolume(config.volume)} ${commodity.unit} of ${
    commodity.label
  } through a ${commodity.modeLabel.toLowerCase()} flow, with scenario controls layered in before each handoff.`
}

function buildCaptureStep(config: DemoScenarioConfig, commodity: DemoCommodityDefinition): DemoScenarioStep {
  const directionLabel = config.tradeSide === 'BUY' ? 'buy-side' : 'sell-side'

  return {
    key: 'capture',
    label: 'Capture Trade',
    workspace: 'trades',
    owner: 'Trader',
    tone: 'nominal',
    summary: `Book the ${directionLabel} ${commodity.label.toLowerCase()} ticket with the operational fields downstream teams need.`,
    detail: `The demo starts with a structured trade record: quantity, pricing terms, dates, counterparty, and delivery assumptions all land in one place so the rest of the lifecycle inherits a clean setup.`,
    attention: null,
    guidance: [
      'Capture core economics and dates in Trading so later teams are not rebuilding the deal from email.',
      `Anchor the trade to the ${commodity.modeLabel.toLowerCase()} path you want the walkthrough to simulate.`,
      'Use this first step to explain how the platform creates one source of truth before operations picks the trade up.',
    ],
  }
}

function buildConfirmationStep(
  config: DemoScenarioConfig,
  commodity: DemoCommodityDefinition,
): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail =
    'Operations can create and issue the confirmation immediately, which keeps the trade ready for scheduling and downstream controls.'
  let attention: string | null = null
  let guidance = [
    'Create the confirmation from the live trade record so terms stay consistent across front and back office.',
    'Issue the confirmation to the counterparty and record acknowledgement timing on the workflow item.',
    'Use this stage to show how operators can pivot from a ticket into a governed task queue.',
  ]

  if (config.confirmationState === 'late') {
    tone = 'watch'
    detail =
      'The confirmation is moving, but acknowledgement is late enough that operations should keep a visible watch item open until the counterparty signs.'
    attention = 'Confirmation timing is slipping. The trade can continue to be prepared, but operations should not treat the handoff as fully clean yet.'
    guidance = [
      'Keep the confirmation queue visible in Operations until the counterparty signs.',
      `Explain how a delayed confirmation can put pressure on the ${commodity.schedulingLabel.toLowerCase()} without stopping the desk from tracking it.`,
      'Use the workflow item to capture owner, due date, and escalation notes instead of managing the delay offline.',
    ]
  }

  if (config.confirmationState === 'missing') {
    tone = 'action'
    detail =
      'No confirmation is in place yet, so downstream teams should hold the trade behind a control gate instead of allowing scheduling to move ahead on incomplete terms.'
    attention = 'Confirmation is missing. This should trigger an operations exception before the trade advances into scheduling.'
    guidance = [
      'Create and issue the confirmation before releasing the trade into downstream execution.',
      'Show the audience that the platform can make the missing document visible as an actionable workflow item.',
      'Use this step to explain why the system should prefer controlled delay over silent operational drift.',
    ]
  }

  return {
    key: 'confirmation',
    label: 'Confirm Terms',
    workspace: 'operations',
    owner: 'Operations',
    tone,
    summary: `Lock the commercial terms before the ${commodity.modeLabel.toLowerCase()} workflow starts moving.`,
    detail,
    attention,
    guidance,
  }
}

function buildSchedulingStep(
  config: DemoScenarioConfig,
  commodity: DemoCommodityDefinition,
): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail = `Scheduling can commit the ${commodity.schedulingLabel.toLowerCase()} without needing exception handling, so the trade is ready to move into execution.`
  let attention: string | null = null
  let guidance = [
    `Commit the ${commodity.schedulingLabel.toLowerCase()} and keep the trade aligned to its delivery window.`,
    'Use the Scheduling workspace to show owner, due dates, and blockers on one dedicated surface.',
    'Explain how schedulers get a focused queue instead of working from the raw blotter.',
  ]

  if (config.confirmationState === 'missing') {
    tone = 'blocked'
    detail =
      'Scheduling should remain blocked because the confirmation is still missing and the commercial terms have not been formally released to operations.'
    attention = `Do not commit the ${commodity.schedulingLabel.toLowerCase()} until confirmation is created and issued.`
    guidance = [
      'Surface the blocked scheduling item with an explicit dependency on confirmation completion.',
      'Keep the trade visible in the scheduler queue so the issue is managed, not forgotten.',
      'Use the blockage to explain controlled handoffs between Trading, Operations, and Scheduling.',
    ]
  } else if (config.schedulingState === 'minor-delay') {
    tone = 'watch'
    detail = `The ${commodity.schedulingLabel.toLowerCase()} slipped, but schedulers still have enough room to recover the trade without materially breaking downstream processing.`
    attention = `Scheduling is delayed. Operators should rebook the ${commodity.schedulingLabel.toLowerCase()} before the slip becomes a true execution blocker.`
    guidance = [
      'Keep the item on a watchlist and show how the scheduler can update due dates without losing ownership.',
      'Use this step to talk through escalation timing before the issue hits delivery or cash.',
      'Demonstrate that the platform can represent delay without pretending the trade is fully blocked.',
    ]
  } else if (config.schedulingState === 'major-delay') {
    tone = 'action'
    detail = `The ${commodity.schedulingLabel.toLowerCase()} was missed badly enough that the trade now needs intervention before it can proceed into normal execution.`
    attention = `A major scheduling delay is active. The trade needs intervention before execution timing and settlement commitments drift further.`
    guidance = [
      `Rework the ${commodity.schedulingLabel.toLowerCase()} and capture the exception in Scheduling instead of treating it as a side note.`,
      'Use the scheduler board to show the owner, blocker, and expected recovery timing.',
      'Frame this step as the operational hinge point where a small issue can become a full downstream problem.',
    ]
  }

  return {
    key: 'scheduling',
    label: 'Schedule Delivery',
    workspace: 'scheduling',
    owner: 'Scheduler',
    tone,
    summary: `Plan the ${commodity.schedulingLabel.toLowerCase()} and decide whether the trade can move on time.`,
    detail,
    attention,
    guidance,
  }
}

function buildExecutionStep(
  config: DemoScenarioConfig,
  commodity: DemoCommodityDefinition,
): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail =
    'Execution can move normally, and operators can capture actual delivery events as the trade performs.'
  let attention: string | null = null
  let guidance = [
    'Track actual movement or delivery checkpoints in the Shipments workspace as they happen.',
    'Use execution events to connect the commercial trade to what is physically occurring on the ground.',
    'Explain that actualization is what gives settlement clean quantity and timing context later on.',
  ]

  if (config.confirmationState === 'missing' || config.schedulingState === 'major-delay') {
    tone = 'blocked'
    detail =
      config.confirmationState === 'missing'
        ? 'Execution should not start because the trade has not cleared confirmation control, so physical teams would be acting on incomplete commercial terms.'
        : 'Execution is now blocked by the major scheduling miss, so operators should focus on recovery before moving any delivery activity forward.'
    attention =
      config.confirmationState === 'missing'
        ? 'Execution is blocked behind the missing confirmation.'
        : 'Execution is blocked until scheduling recovery is complete.'
    guidance = [
      'Keep the trade visible on the execution board, but show the blocker instead of pretending movement has started.',
      'Use this moment to explain how upstream failures stay attached to the trade through the rest of the lifecycle.',
      'Demonstrate that delivery operations can see why the trade is paused without reconstructing the story elsewhere.',
    ]
  } else if (config.confirmationState === 'late' || config.schedulingState === 'minor-delay') {
    tone = 'watch'
    detail =
      'Execution can still proceed, but the earlier delay means operators should monitor the trade closely as actuals start to land.'
    attention = 'Execution is live with upstream friction still in the background, so operators should watch the trade closely.'
    guidance = [
      'Show how the shipment or delivery record keeps the earlier watch condition visible.',
      'Use the event timeline to connect execution status back to the delayed handoff that created the watch item.',
      'Explain how actuals can continue to post while the desk still sees that the trade had earlier operational friction.',
    ]
  }

  return {
    key: 'execution',
    label: 'Execute Delivery',
    workspace: 'shipments',
    owner: 'Logistics',
    tone,
    summary: `Track the ${commodity.modeLabel.toLowerCase()} path and actualize the trade as performance starts.`,
    detail,
    attention,
    guidance,
  }
}

function buildInvoiceStep(
  config: DemoScenarioConfig,
  commodity: DemoCommodityDefinition,
): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail = `Settlement can draft the invoice from ${commodity.invoiceBasisLabel.toLowerCase()} once execution actuals land.`
  let attention: string | null = null
  let guidance = [
    'Use actualized quantity and pricing terms to generate the invoice from the same trade record.',
    'Explain how settlement inherits both the commercial terms and the execution context without rekeying.',
    'Keep invoice creation attached to the trade lifecycle so later payment exceptions stay connected to the source deal.',
  ]

  if (config.confirmationState === 'missing' || config.schedulingState === 'major-delay') {
    tone = 'blocked'
    detail =
      'Invoice generation should stay blocked because the trade has not completed the upstream execution path needed to support a clean settlement record.'
    attention = 'Invoice creation is blocked because the trade is still unresolved upstream.'
    guidance = [
      'Show that settlement does not get ahead of operational reality when execution is still blocked.',
      'Keep the downstream cash step visible, but gated behind the missing operational milestone.',
      'Use this dependency to reinforce that the platform models end-to-end causality instead of isolated screens.',
    ]
  } else if (config.schedulingState === 'minor-delay') {
    tone = 'watch'
    detail =
      'Invoice timing is still workable, but the earlier scheduling slip means settlement should expect later-than-normal actuals.'
    attention = 'Invoice timing is at risk because the delivery window moved.'
    guidance = [
      'Keep the invoice queue open with a note that actuals are running late.',
      'Use this stage to show how settlement can see why billing is slowing down without leaving the trade context.',
      'Explain that watch conditions can flow into cash timing even when the trade still completes.',
    ]
  }

  return {
    key: 'invoice',
    label: 'Issue Invoice',
    workspace: 'settlement',
    owner: 'Settlement',
    tone,
    summary: 'Create the billing record once quantity and pricing are ready for cash settlement.',
    detail,
    attention,
    guidance,
  }
}

function buildPaymentStep(
  config: DemoScenarioConfig,
  commodity: DemoCommodityDefinition,
): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail =
    'Payment matches the invoice cleanly, so settlement can reconcile cash without opening a dispute or exception path.'
  let attention: string | null = null
  let guidance = [
    'Match received cash to the invoice amount and keep the reconciliation attached to the trade.',
    'Use this step to show how the platform turns a posted payment into a trade-level settlement status update.',
    'Explain that a clean match is what lets closeout move from operational completion into financial completion.',
  ]

  const upstreamBlocked = config.confirmationState === 'missing' || config.schedulingState === 'major-delay'
  if (upstreamBlocked) {
    tone = 'blocked'
    detail =
      config.paymentState === 'match'
        ? 'Payment reconciliation is still blocked because the trade has not produced the upstream settlement records required for cash matching.'
        : `A ${paymentLabel(config.paymentState).toLowerCase()} is configured for the scenario, but settlement cannot work that exception until invoice generation is unblocked.`
    attention =
      config.paymentState === 'match'
        ? 'Payment cannot be reconciled until the upstream settlement steps complete.'
        : 'Payment mismatch is part of the scenario, but it remains downstream of the current operational blocker.'
    guidance = [
      'Use the blocked payment stage to show that cash workflow depends on earlier lifecycle completion.',
      'Keep the configured mismatch visible in the story, but make clear that operators should fix the upstream blocker first.',
      'Demonstrate that downstream teams can see the dependency rather than discovering it after the fact.',
    ]
  } else if (config.paymentState === 'short-pay') {
    tone = 'action'
    detail =
      'Cash received is lower than the invoice, so settlement should open a deduction or dispute workflow instead of closing the trade.'
    attention = 'Short pay detected. Settlement needs an explicit exception path before the trade can close.'
    guidance = [
      'Record the short pay against the invoice so the discrepancy stays attached to the source trade.',
      'Use the exception to show how operators can move from payment posting into a managed dispute flow.',
      'Explain that the cash mismatch is now the main reason the trade cannot be closed out.',
    ]
  } else if (config.paymentState === 'over-pay') {
    tone = 'action'
    detail =
      'Cash received is higher than the invoice, so settlement needs to validate whether the amount belongs elsewhere or requires refund handling.'
    attention = 'Over-pay detected. Settlement should validate the source of excess cash before closeout.'
    guidance = [
      'Keep the over-pay tied to the invoice and trade instead of pushing it into an unstructured finance note.',
      'Use this stage to explain that not every exception is a short pay; over-pay handling also needs control.',
      'Show how settlement can keep the trade open with a precise explanation of what still needs to happen.',
    ]
  }

  return {
    key: 'payment',
    label: 'Reconcile Payment',
    workspace: 'settlement',
    owner: 'Treasury / Settlement',
    tone,
    summary: `Check cash against the invoice and decide whether the ${commodity.label.toLowerCase()} trade can move toward financial close.`,
    detail,
    attention,
    guidance,
  }
}

function buildCloseoutStep(
  config: DemoScenarioConfig,
  commodity: DemoCommodityDefinition,
): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail =
    'The trade can move into closed reporting because the commercial, operational, and cash story all tie out cleanly.'
  let attention: string | null = null
  let guidance = [
    'Close the trade only when operations and settlement both show the lifecycle is complete.',
    'Use the final stage to explain the value of one audit trail from capture through cash.',
    'Pivot from here into reports or analytics to show that resolved trades stay easy to analyze later on.',
  ]

  if (config.confirmationState === 'missing' || config.schedulingState === 'major-delay') {
    tone = 'blocked'
    detail =
      'Closeout should remain blocked because the trade has not cleared the upstream operational dependencies required for a full lifecycle finish.'
    attention = 'Trade closeout is blocked by unresolved upstream execution and settlement dependencies.'
    guidance = [
      'Leave the trade open and make the blocker explicit rather than forcing a premature close.',
      'Use this final stage to show how unresolved issues are visible all the way to reporting.',
      'Explain that closeout is the consequence of resolved work, not a manual override of unresolved risk.',
    ]
  } else if (config.paymentState !== 'match') {
    tone = 'blocked'
    detail =
      'Closeout is blocked by the cash exception, so the trade should remain open until the payment mismatch is resolved.'
    attention = 'Do not close the trade while payment still differs from the invoice.'
    guidance = [
      'Keep the trade in an open settlement status until the cash exception is resolved.',
      'Use this step to show that the system can make financial readiness visible alongside operational readiness.',
      'Explain that the desk still has a live issue even when physical execution is already complete.',
    ]
  } else if (config.confirmationState === 'late' || config.schedulingState === 'minor-delay') {
    tone = 'watch'
    detail =
      'The trade can be closed, but the earlier exception should remain visible in the audit story so the desk can explain why the lifecycle was noisy.'
    attention = 'Closeout is available, but the trade should retain a note about the earlier lifecycle friction.'
    guidance = [
      'Show that the trade still closes while preserving its exception history.',
      'Use reporting or timeline views to demonstrate that the earlier watch condition remains auditable.',
      'Explain how the platform supports post-mortem learning without keeping resolved trades artificially open.',
    ]
  }

  return {
    key: 'closeout',
    label: 'Close And Report',
    workspace: 'reports',
    owner: 'Desk control',
    tone,
    summary: `Move the ${commodity.label.toLowerCase()} trade into closed reporting once operations and cash are both resolved.`,
    detail,
    attention,
    guidance,
  }
}

export function buildTradeDemoScenario(input: DemoScenarioConfig): DemoScenario {
  const config = normalizeScenarioConfig(input)
  const commodity = getDemoCommodityDefinition(config.commodityKey)
  const steps = [
    buildCaptureStep(config, commodity),
    buildConfirmationStep(config, commodity),
    buildSchedulingStep(config, commodity),
    buildExecutionStep(config, commodity),
    buildInvoiceStep(config, commodity),
    buildPaymentStep(config, commodity),
    buildCloseoutStep(config, commodity),
  ]

  const recommendedStepKey = steps.find((step) => step.tone !== 'nominal')?.key ?? 'capture'
  const highlightedSteps = steps.filter((step) => step.tone !== 'nominal')

  return {
    headline: summaryHeadline(config, commodity),
    narrative: summaryNarrative(config, commodity),
    highlights: [
      `${config.tradeSide === 'BUY' ? 'Buy' : 'Sell'} ${formatScenarioVolume(config.volume)} ${commodity.unit}`,
      `${commodity.deskLabel} desk through ${commodity.modeLabel.toLowerCase()}`,
      `Confirmation: ${confirmationLabel(config.confirmationState)}`,
      `Scheduling: ${schedulingLabel(config.schedulingState)}`,
      `Payment: ${paymentLabel(config.paymentState)}`,
      highlightedSteps.length > 0
        ? `${highlightedSteps.length} stage${highlightedSteps.length === 1 ? '' : 's'} needing attention`
        : `All ${steps.length} stages on track`,
    ],
    recommendedStepKey,
    steps: steps.map((step) => ({
      ...step,
      attention:
        step.attention ??
        `${step.label} is ${toneLabel(step.tone).toLowerCase()} for this scenario.`,
    })),
  }
}
