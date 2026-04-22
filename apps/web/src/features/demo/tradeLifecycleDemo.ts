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

type DemoSelectionOption<TValue extends string> = {
  value: TValue
  label: string
  description: string
}

type DemoCommodityDefinition = {
  key: DemoCommodityKey
  label: string
  deskLabel: string
  defaultVolume: number
  unit: string
  modeLabel: string
  schedulingLabel: string
  invoiceBasisLabel: string
  locationLabel: string
  counterpartyLabel: string
  priceUnitLabel: string
  indicativeUnitPrice: number
  settlementCycleLabel: string
}

type DemoBuilderContext = {
  commodity: DemoCommodityDefinition
  config: DemoScenarioConfig
  invoiceAmount: number
  invoiceAmountLabel: string
  paymentAmount: number
  paymentAmountLabel: string
  paymentVarianceAmount: number
  paymentVarianceLabel: string
  quantityLabel: string
  tradeReference: string
  unitPriceLabel: string
}

type DemoRuleSource = 'scenario' | 'dependency'

type DemoMatchedRule = {
  attention: string
  detail: string
  guidance: string[]
  id: string
  label: string
  source: DemoRuleSource
  tone: DemoStepTone
  triggerDetail: string
}

type DemoStepRule = {
  attention: (context: DemoBuilderContext) => string
  detail: (context: DemoBuilderContext) => string
  guidance: (context: DemoBuilderContext) => string[]
  id: string
  label: string
  tone: DemoStepTone
  triggerDetail: (context: DemoBuilderContext) => string
  when: (context: DemoBuilderContext) => boolean
}

type DemoDependencyRule = DemoStepRule & {
  targetStepKey: DemoStepKey
}

type DemoStepArtifactBuilderArgs = {
  context: DemoBuilderContext
  step: DemoScenarioStep
}

type DemoStepSchema = {
  artifacts: (args: DemoStepArtifactBuilderArgs) => DemoScenarioArtifact[]
  detail: (context: DemoBuilderContext) => string
  guidance: (context: DemoBuilderContext) => string[]
  key: DemoStepKey
  label: string
  owner: string
  rules?: DemoStepRule[]
  summary: (context: DemoBuilderContext) => string
  workspace: ViewKey
}

export type DemoScenarioConfig = {
  commodityKey: DemoCommodityKey
  tradeSide: DemoTradeSide
  volume: number
  confirmationState: DemoConfirmationState
  schedulingState: DemoSchedulingState
  paymentState: DemoPaymentState
}

export type DemoScenarioTrigger = {
  detail: string
  id: string
  label: string
  source: DemoRuleSource
}

export type DemoScenarioArtifactField = {
  label: string
  value: string
}

export type DemoScenarioArtifact = {
  fields: DemoScenarioArtifactField[]
  id: string
  kind: string
  notes: string[]
  statusLabel: string
  summary: string
  title: string
  tone: DemoStepTone
}

export type DemoScenarioStep = {
  artifacts: DemoScenarioArtifact[]
  attention: string
  detail: string
  guidance: string[]
  key: DemoStepKey
  label: string
  owner: string
  summary: string
  tone: DemoStepTone
  triggers: DemoScenarioTrigger[]
  workspace: ViewKey
}

export type DemoScenario = {
  headline: string
  highlights: string[]
  narrative: string
  recommendedStepKey: DemoStepKey
  steps: DemoScenarioStep[]
}

const VOLUME_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const MONEY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const DEMO_TONE_PRIORITY: Record<DemoStepTone, number> = {
  nominal: 0,
  watch: 1,
  action: 2,
  blocked: 3,
}

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
    locationLabel: 'Midwest mill',
    counterpartyLabel: 'North River Steel',
    priceUnitLabel: 'USD / ST',
    indicativeUnitPrice: 725,
    settlementCycleLabel: 'five business days after invoice',
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
    locationLabel: 'Cushing transfer point',
    counterpartyLabel: 'Atlantic Refining',
    priceUnitLabel: 'USD / BBL',
    indicativeUnitPrice: 74,
    settlementCycleLabel: 'three business days after final invoice',
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
    locationLabel: 'Gulf Coast pipe pool',
    counterpartyLabel: 'Continental Gas',
    priceUnitLabel: 'USD / MMBtu',
    indicativeUnitPrice: 3.35,
    settlementCycleLabel: 'monthly true-up after allocation',
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
    locationLabel: 'Gulf export elevator',
    counterpartyLabel: 'Riverbend Ag',
    priceUnitLabel: 'USD / BU',
    indicativeUnitPrice: 5.2,
    settlementCycleLabel: 'two business days after shipping documents',
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
    locationLabel: 'ERCOT North',
    counterpartyLabel: 'Peak Load Retail',
    priceUnitLabel: 'USD / MWh',
    indicativeUnitPrice: 62,
    settlementCycleLabel: 'ISO settlement run plus bilateral true-up',
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

function formatScenarioVolume(value: number): string {
  return VOLUME_FORMATTER.format(value)
}

function formatMoney(value: number): string {
  return MONEY_FORMATTER.format(value)
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

function toneArtifactStatusLabel(tone: DemoStepTone): string {
  switch (tone) {
    case 'watch':
      return 'Watch condition'
    case 'action':
      return 'Exception open'
    case 'blocked':
      return 'Blocked handoff'
    default:
      return 'Ready'
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

function ruleSourceLabel(source: DemoRuleSource): string {
  return source === 'dependency' ? 'Dependency gate' : 'Scenario control'
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

function buildTradeReference(config: DemoScenarioConfig, commodity: DemoCommodityDefinition): string {
  const commodityCode = commodity.key.replaceAll('-', '').slice(0, 4).toUpperCase()
  const volumeCode = String(Math.round(config.volume)).slice(0, 5).padStart(5, '0')
  return `DEMO-${commodityCode}-${config.tradeSide}-${volumeCode}`
}

function buildInvoiceAmount(config: DemoScenarioConfig, commodity: DemoCommodityDefinition): number {
  return Math.round(config.volume * commodity.indicativeUnitPrice)
}

function buildPaymentAmount(config: DemoScenarioConfig, invoiceAmount: number): number {
  switch (config.paymentState) {
    case 'short-pay':
      return Math.round(invoiceAmount * 0.94)
    case 'over-pay':
      return Math.round(invoiceAmount * 1.06)
    default:
      return invoiceAmount
  }
}

function buildContext(config: DemoScenarioConfig): DemoBuilderContext {
  const commodity = getDemoCommodityDefinition(config.commodityKey)
  const invoiceAmount = buildInvoiceAmount(config, commodity)
  const paymentAmount = buildPaymentAmount(config, invoiceAmount)
  const paymentVarianceAmount = paymentAmount - invoiceAmount

  return {
    commodity,
    config,
    invoiceAmount,
    invoiceAmountLabel: formatMoney(invoiceAmount),
    paymentAmount,
    paymentAmountLabel: formatMoney(paymentAmount),
    paymentVarianceAmount,
    paymentVarianceLabel: paymentVarianceAmount === 0 ? 'No variance' : formatMoney(Math.abs(paymentVarianceAmount)),
    quantityLabel: `${formatScenarioVolume(config.volume)} ${commodity.unit}`,
    tradeReference: buildTradeReference(config, commodity),
    unitPriceLabel: `${formatMoney(commodity.indicativeUnitPrice)} ${commodity.priceUnitLabel.replace('USD / ', '/ ')}`,
  }
}

function shouldReplaceRule(currentTone: DemoStepTone, nextTone: DemoStepTone): boolean {
  return DEMO_TONE_PRIORITY[nextTone] >= DEMO_TONE_PRIORITY[currentTone]
}

function buildArtifact(args: {
  fields: DemoScenarioArtifactField[]
  id: string
  kind: string
  notes: string[]
  stepTone: DemoStepTone
  summary: string
  title: string
}): DemoScenarioArtifact {
  return {
    fields: args.fields,
    id: args.id,
    kind: args.kind,
    notes: args.notes,
    statusLabel: toneArtifactStatusLabel(args.stepTone),
    summary: args.summary,
    title: args.title,
    tone: args.stepTone,
  }
}

function buildRuleMatch(rule: DemoStepRule | DemoDependencyRule, context: DemoBuilderContext): DemoMatchedRule {
  return {
    attention: rule.attention(context),
    detail: rule.detail(context),
    guidance: rule.guidance(context),
    id: rule.id,
    label: rule.label,
    source: 'targetStepKey' in rule ? 'dependency' : 'scenario',
    tone: rule.tone,
    triggerDetail: rule.triggerDetail(context),
  }
}

function buildDefaultTrigger(step: DemoStepSchema): DemoScenarioTrigger {
  return {
    detail: `${step.label} is still following the baseline lifecycle path for this scenario.`,
    id: `${step.key}-nominal-flow`,
    label: 'Nominal flow',
    source: 'scenario',
  }
}

function buildStepArtifacts(args: DemoStepArtifactBuilderArgs): DemoScenarioArtifact[] {
  return DEMO_STEP_SCHEMA_BY_KEY.get(args.step.key)?.artifacts(args) ?? []
}

const DEMO_STEP_SCHEMAS: DemoStepSchema[] = [
  {
    key: 'capture',
    label: 'Capture Trade',
    workspace: 'trades',
    owner: 'Trader',
    summary: (context) =>
      `Book the ${context.config.tradeSide === 'BUY' ? 'buy-side' : 'sell-side'} ${context.commodity.label.toLowerCase()} ticket with the operational fields downstream teams need.`,
    detail: (context) =>
      `The walkthrough starts with a structured trade record for ${context.quantityLabel} at ${context.commodity.locationLabel}. Pricing, dates, counterparty, and delivery assumptions all land in one place so the rest of the lifecycle inherits a clean setup.`,
    guidance: (context) => [
      'Capture the economics and timing once so operations is not rebuilding the trade from email later on.',
      `Anchor the trade to the ${context.commodity.modeLabel.toLowerCase()} path you want the walkthrough to simulate.`,
      `Use the trade reference ${context.tradeReference} as the story thread across the rest of the demo.`,
    ],
    artifacts: ({ context, step }) => [
      buildArtifact({
        id: 'trade-ticket',
        kind: 'Trade ticket',
        stepTone: step.tone,
        title: context.tradeReference,
        summary: `${context.config.tradeSide} ${context.quantityLabel} of ${context.commodity.label} for ${context.commodity.counterpartyLabel}.`,
        fields: [
          { label: 'Desk', value: context.commodity.deskLabel },
          { label: 'Execution path', value: context.commodity.modeLabel },
          { label: 'Location', value: context.commodity.locationLabel },
          { label: 'Indicative price', value: context.unitPriceLabel },
        ],
        notes: [
          'This is the source record every downstream artifact inherits from.',
          'The demo keeps this local-only, but the shape mirrors the live trade capture surface.',
        ],
      }),
    ],
  },
  {
    key: 'confirmation',
    label: 'Confirm Terms',
    workspace: 'operations',
    owner: 'Operations',
    summary: (context) =>
      `Lock the commercial terms before the ${context.commodity.modeLabel.toLowerCase()} workflow starts moving.`,
    detail: () =>
      'Operations can create and issue the confirmation immediately, which keeps the trade ready for scheduling and downstream controls.',
    guidance: () => [
      'Create the confirmation from the live trade record so terms stay consistent across front and back office.',
      'Issue the confirmation to the counterparty and record acknowledgement timing on the workflow item.',
      'Use this stage to show how operators can pivot from a ticket into a governed task queue.',
    ],
    rules: [
      {
        id: 'confirmation-late',
        label: 'Late acknowledgement',
        tone: 'watch',
        when: (context) => context.config.confirmationState === 'late',
        detail: () =>
          'The confirmation is moving, but acknowledgement is late enough that operations should keep a visible watch item open until the counterparty signs.',
        attention: () =>
          'Confirmation timing is slipping. The trade can continue to be prepared, but operations should not treat the handoff as fully clean yet.',
        guidance: (context) => [
          'Keep the confirmation queue visible in Operations until the counterparty signs.',
          `Explain how the delay can put pressure on the ${context.commodity.schedulingLabel.toLowerCase()} without stopping the desk from tracking it.`,
          'Use the workflow item to capture owner, due date, and escalation notes instead of managing the delay offline.',
        ],
        triggerDetail: () =>
          'Counterparty acknowledgement is late, so the confirmation stage moves onto a watchlist.',
      },
      {
        id: 'confirmation-missing',
        label: 'Missing confirmation gate',
        tone: 'action',
        when: (context) => context.config.confirmationState === 'missing',
        detail: () =>
          'No confirmation is in place yet, so downstream teams should hold the trade behind a control gate instead of allowing scheduling to move ahead on incomplete terms.',
        attention: () =>
          'Confirmation is missing. This should trigger an operations exception before the trade advances into scheduling.',
        guidance: () => [
          'Create and issue the confirmation before releasing the trade into downstream execution.',
          'Show that the platform can make the missing document visible as an actionable workflow item.',
          'Use this step to explain why the system should prefer controlled delay over silent operational drift.',
        ],
        triggerDetail: () =>
          'The confirmation has not been issued, so operations opens an exception before the trade can progress.',
      },
    ],
    artifacts: ({ context, step }) => {
      const artifacts = [
        buildArtifact({
          id: 'confirmation-document',
          kind: 'Confirmation',
          stepTone: step.tone,
          title: `CONF-${context.tradeReference}`,
          summary: `${confirmationLabel(context.config.confirmationState)} for ${context.commodity.counterpartyLabel}.`,
          fields: [
            { label: 'Trade reference', value: context.tradeReference },
            { label: 'Counterparty', value: context.commodity.counterpartyLabel },
            { label: 'Quantity', value: context.quantityLabel },
            { label: 'Terms basis', value: context.commodity.invoiceBasisLabel },
          ],
          notes: [
            'This artifact mirrors the commercial handshake operations would issue from the live queue.',
            'The status changes with the scenario state rather than being hardcoded per preset.',
          ],
        }),
      ]

      if (step.tone !== 'nominal') {
        artifacts.push(
          buildArtifact({
            id: 'confirmation-work-item',
            kind: 'Workflow item',
            stepTone: step.tone,
            title: `OPS-${context.tradeReference}`,
            summary: 'Operations follow-up item tied directly to the confirmation stage.',
            fields: [
              { label: 'Owner', value: 'Operations analyst' },
              { label: 'Queue', value: 'Confirmation' },
              { label: 'Priority', value: step.tone === 'action' ? 'High' : 'Medium' },
              { label: 'Trigger', value: confirmationLabel(context.config.confirmationState) },
            ],
            notes: ['This is the reusable control artifact for late or missing confirmation states.'],
          }),
        )
      }

      return artifacts
    },
  },
  {
    key: 'scheduling',
    label: 'Schedule Delivery',
    workspace: 'scheduling',
    owner: 'Scheduler',
    summary: (context) =>
      `Plan the ${context.commodity.schedulingLabel.toLowerCase()} and decide whether the trade can move on time.`,
    detail: (context) =>
      `Scheduling can commit the ${context.commodity.schedulingLabel.toLowerCase()} without needing exception handling, so the trade is ready to move into execution.`,
    guidance: (context) => [
      `Commit the ${context.commodity.schedulingLabel.toLowerCase()} and keep the trade aligned to its delivery window.`,
      'Use the Scheduling workspace to show owner, due dates, and blockers on one dedicated surface.',
      'Explain how schedulers get a focused queue instead of working from the raw blotter.',
    ],
    rules: [
      {
        id: 'minor-scheduling-delay',
        label: 'Recoverable scheduling slip',
        tone: 'watch',
        when: (context) => context.config.schedulingState === 'minor-delay',
        detail: (context) =>
          `The ${context.commodity.schedulingLabel.toLowerCase()} slipped, but schedulers still have enough room to recover the trade without materially breaking downstream processing.`,
        attention: (context) =>
          `Scheduling is delayed. Operators should rebook the ${context.commodity.schedulingLabel.toLowerCase()} before the slip becomes a true execution blocker.`,
        guidance: () => [
          'Keep the item on a watchlist and update due dates without losing ownership.',
          'Use this step to talk through escalation timing before the issue hits delivery or cash.',
          'Demonstrate that the platform can represent delay without pretending the trade is fully blocked.',
        ],
        triggerDetail: () =>
          'The scheduler has a slip to recover, but the trade still has a path back to nominal flow.',
      },
      {
        id: 'major-scheduling-delay',
        label: 'Material scheduling miss',
        tone: 'action',
        when: (context) => context.config.schedulingState === 'major-delay',
        detail: (context) =>
          `The ${context.commodity.schedulingLabel.toLowerCase()} was missed badly enough that the trade now needs intervention before it can proceed into normal execution.`,
        attention: () =>
          'A major scheduling delay is active. The trade needs intervention before execution timing and settlement commitments drift further.',
        guidance: (context) => [
          `Rework the ${context.commodity.schedulingLabel.toLowerCase()} and capture the exception in Scheduling instead of treating it as a side note.`,
          'Use the scheduler board to show the owner, blocker, and expected recovery timing.',
          'Frame this step as the operational hinge point where a small issue can become a full downstream problem.',
        ],
        triggerDetail: () =>
          'The current scenario turns the scheduling stage into a live exception rather than a simple handoff.',
      },
    ],
    artifacts: ({ context, step }) => {
      const artifacts = [
        buildArtifact({
          id: 'schedule-commitment',
          kind: 'Schedule',
          stepTone: step.tone,
          title: `SCH-${context.tradeReference}`,
          summary: `${context.commodity.modeLabel} commitment tied to the trade lifecycle.`,
          fields: [
            { label: 'Window', value: context.commodity.schedulingLabel },
            { label: 'Mode', value: context.commodity.modeLabel },
            { label: 'Location', value: context.commodity.locationLabel },
            { label: 'Quantity', value: context.quantityLabel },
          ],
          notes: [
            'This artifact is the scheduling object that downstream execution would inherit.',
            'It becomes the main operational fork point when delay states are introduced.',
          ],
        }),
      ]

      if (step.tone !== 'nominal') {
        artifacts.push(
          buildArtifact({
            id: 'schedule-exception',
            kind: 'Scheduler exception',
            stepTone: step.tone,
            title: `EXC-${context.tradeReference}`,
            summary: 'Recovery item for the scheduling stage.',
            fields: [
              { label: 'Severity', value: toneLabel(step.tone) },
              { label: 'Trigger', value: schedulingLabel(context.config.schedulingState) },
              { label: 'Owner', value: 'Scheduler' },
              { label: 'Downstream risk', value: 'Execution and settlement timing' },
            ],
            notes: ['This is the reusable exception artifact for delays, holds, and scheduling recovery.'],
          }),
        )
      }

      return artifacts
    },
  },
  {
    key: 'execution',
    label: 'Execute Delivery',
    workspace: 'shipments',
    owner: 'Logistics',
    summary: (context) =>
      `Track the ${context.commodity.modeLabel.toLowerCase()} path and actualize the trade as performance starts.`,
    detail: () =>
      'Execution can move normally, and operators can capture actual delivery events as the trade performs.',
    guidance: () => [
      'Track actual movement or delivery checkpoints in the Shipments workspace as they happen.',
      'Use execution events to connect the commercial trade to what is physically occurring on the ground.',
      'Explain that actualization is what gives settlement clean quantity and timing context later on.',
    ],
    artifacts: ({ context, step }) => {
      const artifacts = [
        buildArtifact({
          id: 'delivery-event',
          kind: 'Delivery event',
          stepTone: step.tone,
          title: `DLV-${context.tradeReference}`,
          summary: `${context.commodity.modeLabel} event stream for ${context.quantityLabel}.`,
          fields: [
            { label: 'Execution path', value: context.commodity.modeLabel },
            { label: 'Location', value: context.commodity.locationLabel },
            { label: 'Counterparty', value: context.commodity.counterpartyLabel },
            { label: 'Quantity', value: context.quantityLabel },
          ],
          notes: [
            'Execution and actualization should always stay tied to the source trade and schedule.',
            'This artifact becomes a hold notice when the stage is blocked.',
          ],
        }),
      ]

      if (step.tone !== 'nominal') {
        artifacts.push(
          buildArtifact({
            id: 'delivery-hold',
            kind: step.tone === 'blocked' ? 'Execution hold' : 'Execution watch',
            stepTone: step.tone,
            title: `HOLD-${context.tradeReference}`,
            summary: 'Operational notice for logistics and shipment operators.',
            fields: [
              { label: 'Status', value: toneLabel(step.tone) },
              { label: 'Inherited from', value: step.triggers[0]?.label ?? 'Scenario rule' },
              { label: 'Owner', value: 'Logistics coordinator' },
              { label: 'Next step', value: 'Clear upstream blocker or continue monitored execution' },
            ],
            notes: ['This is the reusable operational notice artifact for execution-stage friction.'],
          }),
        )
      }

      return artifacts
    },
  },
  {
    key: 'invoice',
    label: 'Issue Invoice',
    workspace: 'settlement',
    owner: 'Settlement',
    summary: () => 'Create the billing record once quantity and pricing are ready for cash settlement.',
    detail: (context) =>
      `Settlement can draft the invoice from ${context.commodity.invoiceBasisLabel.toLowerCase()} once execution actuals land.`,
    guidance: () => [
      'Use actualized quantity and pricing terms to generate the invoice from the same trade record.',
      'Explain how settlement inherits both the commercial terms and the execution context without rekeying.',
      'Keep invoice creation attached to the trade lifecycle so later payment exceptions stay connected to the source deal.',
    ],
    artifacts: ({ context, step }) => [
      buildArtifact({
        id: 'invoice-record',
        kind: 'Invoice',
        stepTone: step.tone,
        title: `INV-${context.tradeReference}`,
        summary: `${context.invoiceAmountLabel} derived from ${context.commodity.invoiceBasisLabel.toLowerCase()}.`,
        fields: [
          { label: 'Invoice amount', value: context.invoiceAmountLabel },
          { label: 'Pricing basis', value: context.commodity.priceUnitLabel },
          { label: 'Settlement cycle', value: context.commodity.settlementCycleLabel },
          { label: 'Trade reference', value: context.tradeReference },
        ],
        notes: [
          'The invoice stays attached to trade and execution context so later cash exceptions can be traced cleanly.',
          'Blocked invoice stages keep the artifact visible but marked as a pending settlement handoff.',
        ],
      }),
    ],
  },
  {
    key: 'payment',
    label: 'Reconcile Payment',
    workspace: 'settlement',
    owner: 'Treasury / Settlement',
    summary: (context) =>
      `Check cash against the invoice and decide whether the ${context.commodity.label.toLowerCase()} trade can move toward financial close.`,
    detail: () =>
      'Payment matches the invoice cleanly, so settlement can reconcile cash without opening a dispute or exception path.',
    guidance: () => [
      'Match received cash to the invoice amount and keep the reconciliation attached to the trade.',
      'Use this step to show how the platform turns a posted payment into a trade-level settlement status update.',
      'Explain that a clean match is what lets closeout move from operational completion into financial completion.',
    ],
    rules: [
      {
        id: 'short-pay-detected',
        label: 'Short pay exception',
        tone: 'action',
        when: (context) => context.config.paymentState === 'short-pay',
        detail: () =>
          'Cash received is lower than the invoice, so settlement should open a deduction or dispute workflow instead of closing the trade.',
        attention: () =>
          'Short pay detected. Settlement needs an explicit exception path before the trade can close.',
        guidance: () => [
          'Record the short pay against the invoice so the discrepancy stays attached to the source trade.',
          'Use the exception to show how operators can move from payment posting into a managed dispute flow.',
          'Explain that the cash mismatch is now the main reason the trade cannot be closed out.',
        ],
        triggerDetail: (context) =>
          `Payment posted ${context.paymentVarianceLabel} below the invoice, so settlement opens an exception workflow.`,
      },
      {
        id: 'over-pay-detected',
        label: 'Over pay exception',
        tone: 'action',
        when: (context) => context.config.paymentState === 'over-pay',
        detail: () =>
          'Cash received is higher than the invoice, so settlement needs to validate whether the amount belongs elsewhere or requires refund handling.',
        attention: () =>
          'Over-pay detected. Settlement should validate the source of excess cash before closeout.',
        guidance: () => [
          'Keep the over-pay tied to the invoice and trade instead of pushing it into an unstructured finance note.',
          'Use this stage to explain that not every exception is a short pay; over-pay handling also needs control.',
          'Show how settlement can keep the trade open with a precise explanation of what still needs to happen.',
        ],
        triggerDetail: (context) =>
          `Payment posted ${context.paymentVarianceLabel} above the invoice, so settlement opens a validation workflow.`,
      },
    ],
    artifacts: ({ context, step }) => {
      const artifacts = [
        buildArtifact({
          id: 'cash-application',
          kind: 'Cash application',
          stepTone: step.tone,
          title: `PAY-${context.tradeReference}`,
          summary: `${context.paymentAmountLabel} received against ${context.invoiceAmountLabel}.`,
          fields: [
            { label: 'Invoice amount', value: context.invoiceAmountLabel },
            { label: 'Payment posted', value: context.paymentAmountLabel },
            { label: 'Variance', value: context.paymentVarianceLabel },
            { label: 'Outcome', value: paymentLabel(context.config.paymentState) },
          ],
          notes: [
            'This artifact is the settlement-side proof of cash application for the scenario.',
            'It stays on the same lifecycle thread as the invoice and the original trade.',
          ],
        }),
      ]

      if (context.config.paymentState !== 'match' || step.tone === 'blocked') {
        artifacts.push(
          buildArtifact({
            id: 'cash-exception',
            kind: step.tone === 'blocked' ? 'Blocked settlement task' : 'Settlement exception',
            stepTone: step.tone,
            title: `SET-${context.tradeReference}`,
            summary: 'Exception or hold record for the cash application stage.',
            fields: [
              { label: 'Owner', value: 'Settlement analyst' },
              { label: 'Trigger', value: step.triggers[0]?.label ?? paymentLabel(context.config.paymentState) },
              { label: 'Priority', value: step.tone === 'blocked' ? 'Critical' : 'High' },
              { label: 'Closeout gate', value: 'Trade cannot close while unresolved' },
            ],
            notes: ['This reusable artifact is what turns a payment mismatch into a governed settlement workflow.'],
          }),
        )
      }

      return artifacts
    },
  },
  {
    key: 'closeout',
    label: 'Close And Report',
    workspace: 'reports',
    owner: 'Desk control',
    summary: (context) =>
      `Move the ${context.commodity.label.toLowerCase()} trade into closed reporting once operations and cash are both resolved.`,
    detail: () =>
      'The trade can move into closed reporting because the commercial, operational, and cash story all tie out cleanly.',
    guidance: () => [
      'Close the trade only when operations and settlement both show the lifecycle is complete.',
      'Use the final stage to explain the value of one audit trail from capture through cash.',
      'Pivot from here into reports or analytics to show that resolved trades stay easy to analyze later on.',
    ],
    artifacts: ({ context, step }) => [
      buildArtifact({
        id: 'closeout-summary',
        kind: 'Closeout',
        stepTone: step.tone,
        title: `CLS-${context.tradeReference}`,
        summary: `Desk control review for ${context.tradeReference}.`,
        fields: [
          { label: 'Operational story', value: step.tone === 'nominal' ? 'Resolved' : toneLabel(step.tone) },
          { label: 'Cash status', value: paymentLabel(context.config.paymentState) },
          { label: 'Reporting desk', value: context.commodity.deskLabel },
          { label: 'Trade reference', value: context.tradeReference },
        ],
        notes: [
          'Closeout is intentionally modeled as the final consequence of earlier lifecycle stages.',
          'The artifact stays open when dependency or payment rules are still active.',
        ],
      }),
    ],
  },
]

const DEMO_STEP_SCHEMA_BY_KEY = new Map(DEMO_STEP_SCHEMAS.map((step) => [step.key, step]))

const DEMO_DEPENDENCY_RULES: DemoDependencyRule[] = [
  {
    id: 'confirmation-required-for-scheduling',
    label: 'Confirmation required before scheduling',
    targetStepKey: 'scheduling',
    tone: 'blocked',
    when: (context) => context.config.confirmationState === 'missing',
    detail: (context) =>
      `Scheduling should remain blocked because the confirmation is still missing and the ${context.commodity.schedulingLabel.toLowerCase()} cannot be released on incomplete commercial terms.`,
    attention: (context) =>
      `Do not commit the ${context.commodity.schedulingLabel.toLowerCase()} until confirmation is created and issued.`,
    guidance: () => [
      'Surface the blocked scheduling item with an explicit dependency on confirmation completion.',
      'Keep the trade visible in the scheduler queue so the issue is managed, not forgotten.',
      'Use the blockage to explain controlled handoffs between Trading, Operations, and Scheduling.',
    ],
    triggerDetail: () =>
      'The scheduling stage inherits a hard gate because confirmation is still missing.',
  },
  {
    id: 'confirmation-delay-monitors-execution',
    label: 'Late confirmation keeps execution on watch',
    targetStepKey: 'execution',
    tone: 'watch',
    when: (context) => context.config.confirmationState === 'late',
    detail: () =>
      'Execution can still proceed, but the delayed confirmation means operators should monitor the trade closely as actuals start to land.',
    attention: () =>
      'Execution is live with confirmation friction still in the background, so operators should keep a closer watch on the trade.',
    guidance: () => [
      'Keep the shipment or delivery record tied to the delayed confirmation status.',
      'Use the event timeline to show how the watch condition traveled into execution.',
      'Demonstrate that the trade can remain operational while still preserving its exception history.',
    ],
    triggerDetail: () =>
      'Execution inherits a watch condition because the commercial acknowledgement arrived late.',
  },
  {
    id: 'confirmation-required-for-execution',
    label: 'Missing confirmation blocks execution',
    targetStepKey: 'execution',
    tone: 'blocked',
    when: (context) => context.config.confirmationState === 'missing',
    detail: () =>
      'Execution should not start because the trade has not cleared confirmation control, so physical teams would be acting on incomplete commercial terms.',
    attention: () => 'Execution is blocked behind the missing confirmation.',
    guidance: () => [
      'Keep the trade visible on the execution board, but show the blocker instead of pretending movement has started.',
      'Use this moment to explain how upstream failures stay attached to the trade through the rest of the lifecycle.',
      'Demonstrate that delivery operations can see why the trade is paused without reconstructing the story elsewhere.',
    ],
    triggerDetail: () =>
      'Execution is explicitly gated behind the missing confirmation.',
  },
  {
    id: 'minor-delay-monitors-execution',
    label: 'Scheduling slip keeps execution on watch',
    targetStepKey: 'execution',
    tone: 'watch',
    when: (context) => context.config.schedulingState === 'minor-delay',
    detail: () =>
      'Execution can still proceed, but the earlier scheduling slip means operators should monitor the trade closely as actuals start to land.',
    attention: () =>
      'Execution is live with upstream scheduling friction still in the background, so operators should keep a closer watch on the trade.',
    guidance: () => [
      'Show how the shipment or delivery record keeps the earlier watch condition visible.',
      'Use the event timeline to connect execution status back to the delayed handoff that created the watch item.',
      'Explain how actuals can continue to post while the desk still sees the trade had earlier operational friction.',
    ],
    triggerDetail: () =>
      'The earlier scheduling slip is now being carried as a watch condition into execution.',
  },
  {
    id: 'major-delay-blocks-execution',
    label: 'Major scheduling miss blocks execution',
    targetStepKey: 'execution',
    tone: 'blocked',
    when: (context) => context.config.schedulingState === 'major-delay',
    detail: () =>
      'Execution is now blocked by the major scheduling miss, so operators should focus on recovery before moving any delivery activity forward.',
    attention: () => 'Execution is blocked until scheduling recovery is complete.',
    guidance: () => [
      'Keep the trade visible on the execution board as blocked rather than letting it vanish from the workflow.',
      'Use the hold state to show exactly how scheduling problems ripple into logistics.',
      'Demonstrate that the platform can stop downstream work without hiding the context that caused it.',
    ],
    triggerDetail: () =>
      'The missed scheduling window is severe enough to stop execution entirely.',
  },
  {
    id: 'confirmation-required-for-invoice',
    label: 'Missing confirmation blocks invoicing',
    targetStepKey: 'invoice',
    tone: 'blocked',
    when: (context) => context.config.confirmationState === 'missing',
    detail: () =>
      'Invoice generation should stay blocked because the trade has not cleared the earlier commercial control required for a clean settlement record.',
    attention: () => 'Invoice creation is blocked because the trade is still unresolved upstream.',
    guidance: () => [
      'Show that settlement does not get ahead of commercial control when confirmation is still unresolved.',
      'Keep the downstream cash step visible, but gated behind the missing milestone.',
      'Use this dependency to reinforce that the platform models end-to-end causality instead of isolated screens.',
    ],
    triggerDetail: () =>
      'The invoice stage cannot proceed while the trade is still missing its confirmation.',
  },
  {
    id: 'minor-delay-monitors-invoice',
    label: 'Scheduling slip delays invoicing',
    targetStepKey: 'invoice',
    tone: 'watch',
    when: (context) => context.config.schedulingState === 'minor-delay',
    detail: () =>
      'Invoice timing is still workable, but the earlier scheduling slip means settlement should expect later-than-normal actuals.',
    attention: () => 'Invoice timing is at risk because the delivery window moved.',
    guidance: () => [
      'Keep the invoice queue open with a note that actuals are running late.',
      'Use this stage to show how settlement can see why billing is slowing down without leaving the trade context.',
      'Explain that watch conditions can flow into cash timing even when the trade still completes.',
    ],
    triggerDetail: () =>
      'A recoverable scheduling slip is now showing up as billing timing risk.',
  },
  {
    id: 'major-delay-blocks-invoice',
    label: 'Major scheduling miss blocks invoicing',
    targetStepKey: 'invoice',
    tone: 'blocked',
    when: (context) => context.config.schedulingState === 'major-delay',
    detail: () =>
      'Invoice generation should stay blocked because the trade has not completed the upstream execution path needed to support a clean settlement record.',
    attention: () => 'Invoice creation is blocked because the trade is still unresolved upstream.',
    guidance: () => [
      'Keep the invoice visible as pending so settlement can see what is waiting on operations.',
      'Use this stage to show how the platform avoids creating cash workflow on top of incomplete execution.',
      'Demonstrate that unresolved delivery risk stays visible in settlement rather than getting hidden.',
    ],
    triggerDetail: () =>
      'The major scheduling miss blocks the invoice handoff because execution has not cleared.',
  },
  {
    id: 'confirmation-required-for-payment',
    label: 'Missing confirmation blocks payment reconciliation',
    targetStepKey: 'payment',
    tone: 'blocked',
    when: (context) => context.config.confirmationState === 'missing',
    detail: (context) =>
      context.config.paymentState === 'match'
        ? 'Payment reconciliation is still blocked because the trade has not produced the upstream settlement records required for cash matching.'
        : `A ${paymentLabel(context.config.paymentState).toLowerCase()} is configured for the scenario, but settlement cannot work that exception until invoice generation is unblocked.`,
    attention: (context) =>
      context.config.paymentState === 'match'
        ? 'Payment cannot be reconciled until the upstream settlement steps complete.'
        : 'Payment mismatch is part of the scenario, but it remains downstream of the current commercial blocker.',
    guidance: () => [
      'Use the blocked payment stage to show that cash workflow depends on earlier lifecycle completion.',
      'Keep the configured mismatch visible in the story, but make clear that operators should fix the upstream blocker first.',
      'Demonstrate that downstream teams can see the dependency rather than discovering it after the fact.',
    ],
    triggerDetail: () =>
      'Payment reconciliation is held behind the same commercial gate that is blocking the rest of settlement.',
  },
  {
    id: 'major-delay-blocks-payment',
    label: 'Major scheduling miss blocks payment reconciliation',
    targetStepKey: 'payment',
    tone: 'blocked',
    when: (context) => context.config.schedulingState === 'major-delay',
    detail: (context) =>
      context.config.paymentState === 'match'
        ? 'Payment reconciliation is still blocked because the trade has not produced the upstream settlement records required for cash matching.'
        : `A ${paymentLabel(context.config.paymentState).toLowerCase()} is configured for the scenario, but settlement cannot work that exception until invoice generation is unblocked.`,
    attention: () =>
      'Payment mismatch is part of the scenario, but settlement should clear the upstream delivery blocker before working cash exceptions.',
    guidance: () => [
      'Use the blocked payment stage to show that cash workflow depends on earlier lifecycle completion.',
      'Keep the configured mismatch visible in the story, but make clear that operators should fix the upstream blocker first.',
      'Demonstrate that downstream teams can see the dependency rather than discovering it after the fact.',
    ],
    triggerDetail: () =>
      'Payment reconciliation is held because the delivery path has not produced a clean settlement basis yet.',
  },
  {
    id: 'confirmation-late-keeps-closeout-on-watch',
    label: 'Late confirmation remains in the audit trail',
    targetStepKey: 'closeout',
    tone: 'watch',
    when: (context) => context.config.confirmationState === 'late',
    detail: () =>
      'The trade can be closed, but the earlier confirmation exception should remain visible in the audit story so the desk can explain why the lifecycle was noisy.',
    attention: () =>
      'Closeout is available, but the trade should retain a note about the earlier lifecycle friction.',
    guidance: () => [
      'Show that the trade still closes while preserving its exception history.',
      'Use reporting or timeline views to demonstrate that the earlier watch condition remains auditable.',
      'Explain how the platform supports post-mortem learning without keeping resolved trades artificially open.',
    ],
    triggerDetail: () =>
      'The trade is closeable, but the earlier confirmation delay should remain visible in reporting.',
  },
  {
    id: 'minor-delay-keeps-closeout-on-watch',
    label: 'Recovered scheduling slip remains visible in closeout',
    targetStepKey: 'closeout',
    tone: 'watch',
    when: (context) => context.config.schedulingState === 'minor-delay',
    detail: () =>
      'The trade can be closed, but the earlier scheduling exception should remain visible in the audit story so the desk can explain why the lifecycle was noisy.',
    attention: () =>
      'Closeout is available, but the trade should retain a note about the earlier lifecycle friction.',
    guidance: () => [
      'Show that the trade still closes while preserving its exception history.',
      'Use reporting or timeline views to demonstrate that the earlier watch condition remains auditable.',
      'Explain how the platform supports post-mortem learning without keeping resolved trades artificially open.',
    ],
    triggerDetail: () =>
      'The trade recovered operationally, but the earlier scheduling slip should stay visible in the final audit trail.',
  },
  {
    id: 'confirmation-required-for-closeout',
    label: 'Missing confirmation blocks closeout',
    targetStepKey: 'closeout',
    tone: 'blocked',
    when: (context) => context.config.confirmationState === 'missing',
    detail: () =>
      'Closeout should remain blocked because the trade has not cleared the upstream commercial dependencies required for a full lifecycle finish.',
    attention: () =>
      'Trade closeout is blocked by unresolved confirmation, execution, and settlement dependencies.',
    guidance: () => [
      'Leave the trade open and make the blocker explicit rather than forcing a premature close.',
      'Use this final stage to show how unresolved issues are visible all the way to reporting.',
      'Explain that closeout is the consequence of resolved work, not a manual override of unresolved risk.',
    ],
    triggerDetail: () =>
      'The trade cannot close while the confirmation dependency is still unresolved.',
  },
  {
    id: 'major-delay-blocks-closeout',
    label: 'Major scheduling miss blocks closeout',
    targetStepKey: 'closeout',
    tone: 'blocked',
    when: (context) => context.config.schedulingState === 'major-delay',
    detail: () =>
      'Closeout should remain blocked because the trade has not cleared the upstream operational dependencies required for a full lifecycle finish.',
    attention: () =>
      'Trade closeout is blocked by unresolved execution and settlement dependencies.',
    guidance: () => [
      'Leave the trade open and make the blocker explicit rather than forcing a premature close.',
      'Use this final stage to show how unresolved issues are visible all the way to reporting.',
      'Explain that closeout is the consequence of resolved work, not a manual override of unresolved risk.',
    ],
    triggerDetail: () =>
      'The trade cannot close while the major scheduling exception is still rippling through execution and settlement.',
  },
  {
    id: 'payment-mismatch-blocks-closeout',
    label: 'Payment mismatch blocks closeout',
    targetStepKey: 'closeout',
    tone: 'blocked',
    when: (context) => context.config.paymentState !== 'match',
    detail: () =>
      'Closeout is blocked by the cash exception, so the trade should remain open until the payment mismatch is resolved.',
    attention: () =>
      'Do not close the trade while payment still differs from the invoice.',
    guidance: () => [
      'Keep the trade in an open settlement status until the cash exception is resolved.',
      'Use this step to show that the system can make financial readiness visible alongside operational readiness.',
      'Explain that the desk still has a live issue even when physical execution is already complete.',
    ],
    triggerDetail: () =>
      'The trade remains open because cash does not yet match the invoice.',
  },
]

function evaluateStep(schema: DemoStepSchema, context: DemoBuilderContext): DemoScenarioStep {
  let tone: DemoStepTone = 'nominal'
  let detail = schema.detail(context)
  let attention = `${schema.label} is ${toneLabel(tone).toLowerCase()} for this scenario.`
  let guidance = schema.guidance(context)
  const triggers: DemoScenarioTrigger[] = []

  for (const rule of schema.rules ?? []) {
    if (!rule.when(context)) {
      continue
    }

    const match = buildRuleMatch(rule, context)
    triggers.push({
      detail: match.triggerDetail,
      id: match.id,
      label: match.label,
      source: match.source,
    })

    if (shouldReplaceRule(tone, match.tone)) {
      tone = match.tone
      detail = match.detail
      attention = match.attention
      guidance = match.guidance
    }
  }

  for (const rule of DEMO_DEPENDENCY_RULES) {
    if (rule.targetStepKey !== schema.key || !rule.when(context)) {
      continue
    }

    const match = buildRuleMatch(rule, context)
    triggers.push({
      detail: match.triggerDetail,
      id: match.id,
      label: match.label,
      source: match.source,
    })

    if (shouldReplaceRule(tone, match.tone)) {
      tone = match.tone
      detail = match.detail
      attention = match.attention
      guidance = match.guidance
    }
  }

  const step: DemoScenarioStep = {
    artifacts: [],
    attention,
    detail,
    guidance,
    key: schema.key,
    label: schema.label,
    owner: schema.owner,
    summary: schema.summary(context),
    tone,
    triggers: triggers.length > 0 ? triggers : [buildDefaultTrigger(schema)],
    workspace: schema.workspace,
  }

  step.artifacts = buildStepArtifacts({ context, step })
  return step
}

function summaryHeadline(commodity: DemoCommodityDefinition): string {
  return `${commodity.label} lifecycle walkthrough`
}

function summaryNarrative(context: DemoBuilderContext): string {
  const direction = context.config.tradeSide === 'BUY' ? 'buy' : 'sell'
  return `${direction.toUpperCase()} ${context.quantityLabel} of ${context.commodity.label} through a ${context.commodity.modeLabel.toLowerCase()} flow, with explicit dependency rules and reusable artifacts generated at each handoff.`
}

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

export function buildTradeDemoScenario(input: DemoScenarioConfig): DemoScenario {
  const config = normalizeScenarioConfig(input)
  const context = buildContext(config)
  const steps = DEMO_STEP_SCHEMAS.map((schema) => evaluateStep(schema, context))
  const recommendedStepKey = steps.find((step) => step.tone !== 'nominal')?.key ?? 'capture'
  const highlightedSteps = steps.filter((step) => step.tone !== 'nominal')

  return {
    headline: summaryHeadline(context.commodity),
    narrative: summaryNarrative(context),
    highlights: [
      `${config.tradeSide === 'BUY' ? 'Buy' : 'Sell'} ${context.quantityLabel}`,
      `${context.commodity.deskLabel} desk through ${context.commodity.modeLabel.toLowerCase()}`,
      `Confirmation: ${confirmationLabel(config.confirmationState)}`,
      `Scheduling: ${schedulingLabel(config.schedulingState)}`,
      `Payment: ${paymentLabel(config.paymentState)}`,
      `Invoice basis: ${context.invoiceAmountLabel} at ${context.unitPriceLabel}`,
      highlightedSteps.length > 0
        ? `${highlightedSteps.length} stage${highlightedSteps.length === 1 ? '' : 's'} needing attention`
        : `All ${steps.length} stages on track`,
    ],
    recommendedStepKey,
    steps,
  }
}

export function getDemoStepToneLabel(tone: DemoStepTone): string {
  return toneLabel(tone)
}

export function getDemoTriggerSourceLabel(source: DemoRuleSource): string {
  return ruleSourceLabel(source)
}
