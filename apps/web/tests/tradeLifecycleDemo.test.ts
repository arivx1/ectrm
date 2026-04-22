import assert from 'node:assert/strict'
import { test } from 'vitest'

import {
  buildTradeDemoScenario,
  getDefaultDemoScenarioConfig,
} from '../src/features/demo/tradeLifecycleDemo.ts'

test('buildTradeDemoScenario keeps a clean flow on track', () => {
  const scenario = buildTradeDemoScenario(getDefaultDemoScenarioConfig())
  const paymentStep = scenario.steps.find((step) => step.key === 'payment')
  const closeoutStep = scenario.steps.find((step) => step.key === 'closeout')
  const captureStep = scenario.steps.find((step) => step.key === 'capture')

  assert.equal(scenario.recommendedStepKey, 'capture')
  assert.ok(captureStep)
  assert.equal(captureStep.triggers[0]?.label, 'Nominal flow')
  assert.equal(captureStep.artifacts[0]?.kind, 'Trade ticket')
  assert.ok(paymentStep)
  assert.equal(paymentStep.tone, 'nominal')
  assert.ok(closeoutStep)
  assert.equal(closeoutStep.tone, 'nominal')
  assert.equal(scenario.steps.filter((step) => step.tone !== 'nominal').length, 0)
})

test('buildTradeDemoScenario pushes a major scheduling delay into execution and settlement blockers', () => {
  const scenario = buildTradeDemoScenario({
    commodityKey: 'natural-gas',
    tradeSide: 'BUY',
    volume: 100000,
    confirmationState: 'clean',
    schedulingState: 'major-delay',
    paymentState: 'match',
  })
  const schedulingStep = scenario.steps.find((step) => step.key === 'scheduling')
  const executionStep = scenario.steps.find((step) => step.key === 'execution')
  const invoiceStep = scenario.steps.find((step) => step.key === 'invoice')
  const paymentStep = scenario.steps.find((step) => step.key === 'payment')

  assert.equal(scenario.recommendedStepKey, 'scheduling')
  assert.ok(schedulingStep)
  assert.equal(schedulingStep.tone, 'action')
  assert.equal(schedulingStep.triggers[0]?.label, 'Material scheduling miss')
  assert.ok(executionStep)
  assert.equal(executionStep.tone, 'blocked')
  assert.equal(executionStep.triggers.some((trigger) => trigger.source === 'dependency'), true)
  assert.ok(invoiceStep)
  assert.equal(invoiceStep.tone, 'blocked')
  assert.ok(paymentStep)
  assert.equal(paymentStep.tone, 'blocked')
})

test('buildTradeDemoScenario surfaces payment mismatches in settlement and closeout', () => {
  const scenario = buildTradeDemoScenario({
    commodityKey: 'grain',
    tradeSide: 'SELL',
    volume: 120000,
    confirmationState: 'clean',
    schedulingState: 'on-time',
    paymentState: 'short-pay',
  })
  const paymentStep = scenario.steps.find((step) => step.key === 'payment')
  const closeoutStep = scenario.steps.find((step) => step.key === 'closeout')

  assert.equal(scenario.recommendedStepKey, 'payment')
  assert.ok(paymentStep)
  assert.equal(paymentStep.tone, 'action')
  assert.equal(paymentStep.artifacts[1]?.kind, 'Settlement exception')
  assert.ok(closeoutStep)
  assert.equal(closeoutStep.tone, 'blocked')
  assert.equal(closeoutStep.triggers.some((trigger) => trigger.label === 'Payment mismatch blocks closeout'), true)
})
