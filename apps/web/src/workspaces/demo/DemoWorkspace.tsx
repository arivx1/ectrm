import { useMemo, useState } from 'react'

import {
  buildTradeDemoScenario,
  demoScenarioConfigsEqual,
  DEMO_COMMODITY_OPTIONS,
  DEMO_CONFIRMATION_STATE_OPTIONS,
  DEMO_PAYMENT_STATE_OPTIONS,
  DEMO_SCENARIO_PRESETS,
  DEMO_SCHEDULING_STATE_OPTIONS,
  DEMO_TRADE_SIDE_OPTIONS,
  getDefaultDemoScenarioConfig,
  getDemoCommodityDefinition,
  getDemoScenarioPresetConfig,
  getDemoStepToneLabel,
  getDemoTriggerSourceLabel,
  type DemoScenarioConfig,
  type DemoStepTone,
} from '../../features/demo/tradeLifecycleDemo'
import { workspaceLabel } from '../../entities/app/appViews'
import type { ViewKey } from '../../shared/models'
import type { StoredAuthSession } from '../../shared/mutation'

type DemoWorkspaceProps = {
  authSession: StoredAuthSession | null
  onOpenView: (view: ViewKey) => void
}

const VOLUME_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

function toneClassName(tone: DemoStepTone): string {
  return `demo-tone-chip demo-tone-chip-${tone}`
}

function describeSelectedOption<TValue extends string>(
  options: Array<{ value: TValue; description: string }>,
  value: TValue,
): string {
  return options.find((option) => option.value === value)?.description ?? ''
}

export function DemoWorkspace({ authSession, onOpenView }: DemoWorkspaceProps) {
  const [config, setConfig] = useState<DemoScenarioConfig>(() => getDefaultDemoScenarioConfig())
  const scenario = useMemo(() => buildTradeDemoScenario(config), [config])
  const [selectedStepKey, setSelectedStepKey] = useState(() => scenario.recommendedStepKey)

  const commodity = getDemoCommodityDefinition(config.commodityKey)
  const exceptionCount = scenario.steps.filter((step) => step.tone !== 'nominal').length
  const blockedCount = scenario.steps.filter((step) => step.tone === 'blocked').length
  const activePresetKey =
    DEMO_SCENARIO_PRESETS.find((preset) => demoScenarioConfigsEqual(preset.config, config))?.key ?? null
  const selectedStepIndex = Math.max(
    scenario.steps.findIndex((step) => step.key === selectedStepKey),
    0,
  )
  const selectedStep = scenario.steps[selectedStepIndex] ?? scenario.steps[0]
  const recommendedStep =
    scenario.steps.find((step) => step.key === scenario.recommendedStepKey) ?? scenario.steps[0]

  function updateConfig<TKey extends keyof DemoScenarioConfig>(
    key: TKey,
    value: DemoScenarioConfig[TKey],
  ) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  function handleCommodityChange(nextCommodityKey: DemoScenarioConfig['commodityKey']) {
    const nextCommodity = getDemoCommodityDefinition(nextCommodityKey)
    setConfig((current) => ({
      ...current,
      commodityKey: nextCommodityKey,
      volume: nextCommodity.defaultVolume,
    }))
  }

  function handlePresetApply(key: (typeof DEMO_SCENARIO_PRESETS)[number]['key']) {
    const nextConfig = getDemoScenarioPresetConfig(key)
    const nextScenario = buildTradeDemoScenario(nextConfig)
    setConfig(nextConfig)
    setSelectedStepKey(nextScenario.recommendedStepKey)
  }

  function handleNextStep() {
    const nextStep = scenario.steps[selectedStepIndex + 1]
    if (nextStep) {
      setSelectedStepKey(nextStep.key)
    }
  }

  function handlePreviousStep() {
    const previousStep = scenario.steps[selectedStepIndex - 1]
    if (previousStep) {
      setSelectedStepKey(previousStep.key)
    }
  }

  return (
    <div className="workspace-grid demo-workspace">
      <section className="stack">
        <article className="surface feature-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">Scenario Demo</span>
              <h3>{scenario.headline}</h3>
            </div>
            <p>{scenario.narrative}</p>
          </div>

          <div className="feedback-banner feedback-banner-success">
            {authSession
              ? 'This walkthrough stays local to the browser, but every stage can jump directly into the corresponding live workspace.'
              : 'This walkthrough is local-only, so you can demo the lifecycle without signing in or mutating live trades.'}
          </div>

          <div className="demo-preset-row">
            {DEMO_SCENARIO_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                className={`button button-ghost demo-preset-button${
                  activePresetKey === preset.key ? ' is-active' : ''
                }`}
                onClick={() => handlePresetApply(preset.key)}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
        </article>

        <div className="metric-grid demo-summary-grid">
          <article className="surface metric-card demo-summary-card">
            <span>Trade Shape</span>
            <strong>
              {DEMO_TRADE_SIDE_OPTIONS.find((option) => option.value === config.tradeSide)?.label ?? 'Sell'}{' '}
              {VOLUME_FORMATTER.format(config.volume)} {commodity.unit}
            </strong>
            <p>{commodity.label}</p>
          </article>
          <article className="surface metric-card demo-summary-card">
            <span>Execution Path</span>
            <strong>{commodity.modeLabel}</strong>
            <p>{commodity.deskLabel} desk workflow</p>
          </article>
          <article className="surface metric-card demo-summary-card">
            <span>Exceptions</span>
            <strong>
              {exceptionCount} active
              {blockedCount > 0 ? ` / ${blockedCount} blocking` : ''}
            </strong>
            <p>{exceptionCount === 0 ? 'All lifecycle stages are on track.' : 'Scenario friction is now visible in the flow.'}</p>
          </article>
          <article className="surface metric-card demo-summary-card">
            <span>Suggested Start</span>
            <strong>{recommendedStep.label}</strong>
            <p>{workspaceLabel(recommendedStep.workspace)}</p>
          </article>
        </div>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Inputs</span>
              <h3>Initial Parameters</h3>
            </div>
            <p>
              Set the commodity and the lifecycle friction you want to narrate, then use the step list below to walk
              the audience through the trade.
            </p>
          </div>

          <div className="demo-parameter-grid">
            <label className="field">
              <span>Commodity</span>
              <select
                className="control"
                value={config.commodityKey}
                onChange={(event) =>
                  handleCommodityChange(event.currentTarget.value as DemoScenarioConfig['commodityKey'])
                }
              >
                {DEMO_COMMODITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="trade-form-helper">
                {describeSelectedOption(DEMO_COMMODITY_OPTIONS, config.commodityKey)}
              </p>
            </label>

            <label className="field">
              <span>Trade side</span>
              <select
                className="control"
                value={config.tradeSide}
                onChange={(event) => updateConfig('tradeSide', event.currentTarget.value as DemoScenarioConfig['tradeSide'])}
              >
                {DEMO_TRADE_SIDE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="trade-form-helper">
                {describeSelectedOption(DEMO_TRADE_SIDE_OPTIONS, config.tradeSide)}
              </p>
            </label>

            <label className="field">
              <span>Volume</span>
              <input
                type="number"
                min="1"
                step="1"
                className="control"
                value={config.volume}
                onChange={(event) => {
                  if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                    updateConfig('volume', event.currentTarget.valueAsNumber)
                  }
                }}
              />
              <p className="trade-form-helper">Units follow the commodity selection and default to {commodity.unit}.</p>
            </label>

            <label className="field">
              <span>Confirmation state</span>
              <select
                className="control"
                value={config.confirmationState}
                onChange={(event) =>
                  updateConfig(
                    'confirmationState',
                    event.currentTarget.value as DemoScenarioConfig['confirmationState'],
                  )
                }
              >
                {DEMO_CONFIRMATION_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="trade-form-helper">
                {describeSelectedOption(DEMO_CONFIRMATION_STATE_OPTIONS, config.confirmationState)}
              </p>
            </label>

            <label className="field">
              <span>Scheduling</span>
              <select
                className="control"
                value={config.schedulingState}
                onChange={(event) =>
                  updateConfig(
                    'schedulingState',
                    event.currentTarget.value as DemoScenarioConfig['schedulingState'],
                  )
                }
              >
                {DEMO_SCHEDULING_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="trade-form-helper">
                {describeSelectedOption(DEMO_SCHEDULING_STATE_OPTIONS, config.schedulingState)}
              </p>
            </label>

            <label className="field">
              <span>Payment outcome</span>
              <select
                className="control"
                value={config.paymentState}
                onChange={(event) =>
                  updateConfig('paymentState', event.currentTarget.value as DemoScenarioConfig['paymentState'])
                }
              >
                {DEMO_PAYMENT_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="trade-form-helper">
                {describeSelectedOption(DEMO_PAYMENT_STATE_OPTIONS, config.paymentState)}
              </p>
            </label>
          </div>

          <div className="demo-readout-grid">
            <article className="demo-readout-card">
              <span>Primary Unit</span>
              <strong>{commodity.unit}</strong>
              <p>Auto-set from the selected commodity.</p>
            </article>
            <article className="demo-readout-card">
              <span>Delivery Lens</span>
              <strong>{commodity.schedulingLabel}</strong>
              <p>Use this as the operating language during the walkthrough.</p>
            </article>
            <article className="demo-readout-card">
              <span>Suggested Entry</span>
              <strong>{recommendedStep.label}</strong>
              <p>
                {getDemoStepToneLabel(recommendedStep.tone)} in {workspaceLabel(recommendedStep.workspace)}.
              </p>
            </article>
          </div>
        </article>

        <article className="surface">
          <div className="section-head">
            <div>
              <span className="eyebrow">Lifecycle</span>
              <h3>Step Through The Trade</h3>
            </div>
            <p>
              Each stage is linked to a real workspace so the demo can begin as a guided walkthrough and then pivot
              into the live product surface behind that step.
            </p>
          </div>

          <div className="demo-step-list">
            {scenario.steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                className={`demo-step-card${step.key === selectedStep.key ? ' is-active' : ''}`}
                aria-pressed={step.key === selectedStep.key}
                onClick={() => setSelectedStepKey(step.key)}
              >
                <div className="demo-step-card-head">
                  <div className="demo-step-card-copy">
                    <span>Step {String(index + 1).padStart(2, '0')}</span>
                    <strong>{step.label}</strong>
                  </div>
                  <span className={`entity-chip ${toneClassName(step.tone)}`}>
                    {getDemoStepToneLabel(step.tone)}
                  </span>
                </div>
                <p className="demo-step-card-summary">{step.summary}</p>
                <div className="demo-step-card-meta">
                  <span className="entity-chip entity-chip-soft">{workspaceLabel(step.workspace)}</span>
                  <span className="entity-chip entity-chip-soft">{step.owner}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
      </section>

      <aside className="stack demo-side-rail">
        <article className="surface demo-detail-panel">
          <div className="section-head demo-panel-head">
            <div>
              <span className="eyebrow">Active Step</span>
              <h3>{selectedStep.label}</h3>
            </div>
            <p>{selectedStep.summary}</p>
          </div>

          <div className="chip-row">
            <span className="entity-chip entity-chip-soft">{workspaceLabel(selectedStep.workspace)}</span>
            <span className="entity-chip entity-chip-soft">{selectedStep.owner}</span>
            <span className={`entity-chip ${toneClassName(selectedStep.tone)}`}>
              {getDemoStepToneLabel(selectedStep.tone)}
            </span>
          </div>

          <p className="demo-detail-copy">{selectedStep.detail}</p>

          <div className={`feedback-banner demo-feedback-banner demo-feedback-banner-${selectedStep.tone}`}>
            {selectedStep.attention}
          </div>

          <div className="stack">
            <div className="section-head demo-panel-head demo-mini-head">
              <div>
                <span className="eyebrow">Triggered Rules</span>
                <h3>What Changed This Step</h3>
              </div>
              <p>These are the explicit scenario controls and dependency gates currently shaping the active stage.</p>
            </div>

            <div className="demo-trigger-list">
              {selectedStep.triggers.map((trigger) => (
                <div key={trigger.id} className="demo-trigger-card">
                  <div className="demo-trigger-card-head">
                    <strong>{trigger.label}</strong>
                    <span className="entity-chip entity-chip-soft">
                      {getDemoTriggerSourceLabel(trigger.source)}
                    </span>
                  </div>
                  <p>{trigger.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="stack">
            <div className="section-head demo-panel-head demo-mini-head">
              <div>
                <span className="eyebrow">Talk Track</span>
                <h3>How To Narrate It</h3>
              </div>
              <p>Use these cues while walking a stakeholder through the stage.</p>
            </div>

            <div className="demo-guidance-list">
              {selectedStep.guidance.map((item, index) => (
                <div key={`${selectedStep.key}-guidance-${index}`} className="demo-guidance-item">
                  <strong>{index + 1}</strong>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="demo-step-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={handlePreviousStep}
              disabled={selectedStepIndex === 0}
            >
              Previous step
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleNextStep}
              disabled={selectedStepIndex >= scenario.steps.length - 1}
            >
              Next step
            </button>
          </div>

          <button type="button" className="button button-primary" onClick={() => onOpenView(selectedStep.workspace)}>
            Open {workspaceLabel(selectedStep.workspace)}
          </button>
        </article>

        <article className="surface demo-artifact-panel">
          <div className="section-head demo-panel-head">
            <div>
              <span className="eyebrow">Demo Artifacts</span>
              <h3>Stage Outputs</h3>
            </div>
            <p>These mock records are generated from the scenario schema so each step has a concrete document or workflow object to show.</p>
          </div>

          <div className="demo-artifact-list">
            {selectedStep.artifacts.map((artifact) => (
              <div key={artifact.id} className="demo-artifact-card">
                <div className="demo-artifact-card-head">
                  <div className="demo-artifact-card-copy">
                    <span>{artifact.kind}</span>
                    <strong>{artifact.title}</strong>
                  </div>
                  <span className={`entity-chip ${toneClassName(artifact.tone)}`}>{artifact.statusLabel}</span>
                </div>
                <p className="demo-artifact-summary">{artifact.summary}</p>
                <div className="demo-artifact-grid">
                  {artifact.fields.map((field) => (
                    <div key={`${artifact.id}-${field.label}`} className="demo-artifact-field">
                      <span>{field.label}</span>
                      <strong>{field.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="demo-artifact-notes">
                  {artifact.notes.map((note, index) => (
                    <div key={`${artifact.id}-note-${index}`} className="demo-artifact-note">
                      <strong>{index + 1}</strong>
                      <p>{note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="surface demo-readout-panel">
          <div className="section-head demo-panel-head">
            <div>
              <span className="eyebrow">Scenario Readout</span>
              <h3>What This Demo Is Modeling</h3>
            </div>
            <p>These summary points are useful when you need a fast introduction before drilling into a specific stage.</p>
          </div>

          <div className="demo-highlights">
            {scenario.highlights.map((highlight, index) => (
              <div key={`${highlight}-${index}`} className="demo-highlight-row">
                <strong>{index + 1}</strong>
                <p>{highlight}</p>
              </div>
            ))}
          </div>
        </article>
      </aside>
    </div>
  )
}
