import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type {
  CounterpartyCreditProfileForm,
  CounterpartyCreditProfileRecord,
  CounterpartyCreditReportRow,
  CounterpartyExternalCreditSnapshotRecord,
  CounterpartyRecord,
  CounterpartyStandards,
} from '../../shared/models'
import { type useReferenceDataWorkspace } from './useReferenceDataWorkspace'
import {
  buildCounterpartyCreditProfileFieldErrors,
  isCounterpartyCreditProfileDirty,
} from './referenceDataFormState'
import {
  buildCounterpartyCreditProfileForm,
  emptyCounterpartyCreditProfileForm,
} from './referenceDataHelpers'

type ReferenceDataWorkspaceState = ReturnType<typeof useReferenceDataWorkspace>

type UseReferenceDataCounterpartyControllerArgs = {
  workspace: Pick<
    ReferenceDataWorkspaceState,
    | 'counterpartyForm'
    | 'counterpartyFormMode'
    | 'selectedCounterparty'
    | 'startCreateCounterparty'
    | 'startEditCounterparty'
  >
  counterpartyStandards: CounterpartyStandards
  counterpartyCreditProfileByCode: Map<string, CounterpartyCreditProfileRecord>
  counterpartyCreditReportByCode: Map<string, CounterpartyCreditReportRow>
  counterpartyExternalCreditSnapshotsByCode: Map<string, CounterpartyExternalCreditSnapshotRecord[]>
  beginReferenceAction: (action: () => void) => void
  currentActorId: () => string
  submitReference: (
    path: string,
    method: 'POST' | 'PUT',
    payload: Record<string, unknown>,
    successMessage: string,
  ) => Promise<void>
  setReferenceActionError: (message: string) => void
  setReferenceActionSuccess: (message: string) => void
}

export function useReferenceDataCounterpartyController({
  workspace,
  counterpartyStandards,
  counterpartyCreditProfileByCode,
  counterpartyCreditReportByCode,
  counterpartyExternalCreditSnapshotsByCode,
  beginReferenceAction,
  currentActorId,
  submitReference,
  setReferenceActionError,
  setReferenceActionSuccess,
}: UseReferenceDataCounterpartyControllerArgs) {
  const {
    counterpartyForm,
    counterpartyFormMode,
    selectedCounterparty,
    startCreateCounterparty: startCreateCounterpartyBase,
    startEditCounterparty: startEditCounterpartyBase,
  } = workspace

  const selectedCounterpartyCreditProfile = selectedCounterparty
    ? counterpartyCreditProfileByCode.get(selectedCounterparty.code) ?? null
    : null

  const selectedCounterpartyCreditReport = selectedCounterparty
    ? counterpartyCreditReportByCode.get(selectedCounterparty.code) ?? null
    : null

  const selectedCounterpartyExternalCreditSnapshots = selectedCounterparty
    ? counterpartyExternalCreditSnapshotsByCode.get(selectedCounterparty.code) ?? []
    : []

  const counterpartyCreditProfileFormKey = `${counterpartyFormMode}:${selectedCounterparty?.code ?? ''}:${selectedCounterpartyCreditProfile?.updated_at ?? ''}:${selectedCounterpartyCreditProfile?.version ?? ''}:${counterpartyStandards.default_counterparty_credit_breach_action}`

  const counterpartyCreditProfileBaseline = useMemo(
    () =>
      counterpartyFormMode !== 'edit' || !selectedCounterparty
        ? emptyCounterpartyCreditProfileForm(counterpartyStandards)
        : buildCounterpartyCreditProfileForm(selectedCounterpartyCreditProfile, counterpartyStandards),
    [
      counterpartyFormMode,
      counterpartyStandards,
      selectedCounterparty,
      selectedCounterpartyCreditProfile,
    ],
  )

  const [counterpartyCreditProfileDraftState, setCounterpartyCreditProfileDraftState] = useState(() => ({
    key: counterpartyCreditProfileFormKey,
    value: counterpartyCreditProfileBaseline,
  }))

  const counterpartyCreditProfileForm =
    counterpartyCreditProfileDraftState.key === counterpartyCreditProfileFormKey
      ? counterpartyCreditProfileDraftState.value
      : counterpartyCreditProfileBaseline

  const setCounterpartyCreditProfileForm: Dispatch<SetStateAction<CounterpartyCreditProfileForm>> = (value) => {
    setCounterpartyCreditProfileDraftState((current) => {
      const currentValue =
        current.key === counterpartyCreditProfileFormKey
          ? current.value
          : counterpartyCreditProfileBaseline

      return {
        key: counterpartyCreditProfileFormKey,
        value: typeof value === 'function' ? value(currentValue) : value,
      }
    })
  }

  const counterpartyCreditProfileFieldErrors = useMemo(
    () => buildCounterpartyCreditProfileFieldErrors(counterpartyCreditProfileForm),
    [counterpartyCreditProfileForm],
  )

  const counterpartyCreditProfileDirty = useMemo(
    () =>
      isCounterpartyCreditProfileDirty(
        counterpartyCreditProfileForm,
        counterpartyFormMode,
        selectedCounterparty,
        selectedCounterpartyCreditProfile,
        counterpartyStandards,
      ),
    [
      counterpartyCreditProfileForm,
      counterpartyFormMode,
      counterpartyStandards,
      selectedCounterparty,
      selectedCounterpartyCreditProfile,
    ],
  )

  function startCreateCounterparty() {
    beginReferenceAction(startCreateCounterpartyBase)
  }

  function startEditCounterparty(code: string) {
    beginReferenceAction(() => startEditCounterpartyBase(code))
  }

  async function handleSaveCounterparty(e: React.FormEvent) {
    e.preventDefault()
    if (!counterpartyForm.code.trim() || !counterpartyForm.name.trim() || !counterpartyForm.counterparty_type.trim()) {
      setReferenceActionError('Counterparty code, name, and type are required.')
      return
    }

    const payload = {
      code: counterpartyForm.code.trim().toUpperCase(),
      name: counterpartyForm.name.trim(),
      short_name: counterpartyForm.short_name.trim() || null,
      legal_entity_name: counterpartyForm.legal_entity_name.trim() || null,
      counterparty_type: counterpartyForm.counterparty_type.trim().toUpperCase(),
      country_code: counterpartyForm.country_code.trim().toUpperCase() || null,
      lei_code: counterpartyForm.lei_code.trim().toUpperCase() || null,
      duns_number: counterpartyForm.duns_number.trim() || null,
      ticker_symbol: counterpartyForm.ticker_symbol.trim().toUpperCase() || null,
      credit_status: counterpartyForm.credit_status.trim().toUpperCase(),
      description: counterpartyForm.description.trim() || null,
    }

    if (counterpartyFormMode === 'create') {
      await submitReference('/reference/counterparties', 'POST', { ...payload, created_by: currentActorId() }, `Counterparty ${payload.code} created.`)
      startEditCounterpartyBase(payload.code)
    } else if (selectedCounterparty) {
      await submitReference(
        `/reference/counterparties/${selectedCounterparty.code}`,
        'PUT',
        { ...payload, updated_by: currentActorId() },
        `Counterparty ${selectedCounterparty.code} updated.`,
      )
    }
  }

  async function handleToggleCounterparty(record: CounterpartyRecord) {
    await submitReference(
      `/reference/counterparties/${record.code}/${record.is_active ? 'deactivate' : 'activate'}`,
      'POST',
      { updated_by: currentActorId() },
      `Counterparty ${record.code} ${record.is_active ? 'deactivated' : 'activated'}.`,
    )
  }

  async function handleSaveCounterpartyCreditProfile(e: React.FormEvent) {
    e.preventDefault()
    if (counterpartyFormMode !== 'edit' || !selectedCounterparty) {
      setReferenceActionError('Save the counterparty first before maintaining its credit profile.')
      setReferenceActionSuccess('')
      return
    }

    const normalizedLimitAmountText = counterpartyCreditProfileForm.limit_amount.trim()
    const normalizedLimitAmount = normalizedLimitAmountText ? Number(normalizedLimitAmountText) : null

    if (
      counterpartyCreditProfileFieldErrors.limit_currency_code ||
      counterpartyCreditProfileFieldErrors.limit_amount ||
      (normalizedLimitAmountText && (normalizedLimitAmount === null || Number.isNaN(normalizedLimitAmount)))
    ) {
      setReferenceActionError('Credit profile limits must use a valid currency and a positive numeric amount.')
      setReferenceActionSuccess('')
      return
    }

    await submitReference(
      `/reference/counterparties/${selectedCounterparty.code}/credit-profile`,
      'PUT',
      {
        credit_rating: counterpartyCreditProfileForm.credit_rating.trim() || null,
        review_due_at: counterpartyCreditProfileForm.review_due_at.trim() || null,
        limit_currency_code: counterpartyCreditProfileForm.limit_currency_code.trim().toUpperCase() || null,
        limit_amount: normalizedLimitAmount,
        breach_action: counterpartyCreditProfileForm.breach_action.trim().toUpperCase(),
        notes: counterpartyCreditProfileForm.notes.trim() || null,
        updated_by: currentActorId(),
      },
      `Counterparty credit profile ${selectedCounterparty.code} saved.`,
    )
  }

  async function handlePromoteCounterpartyExternalCreditSnapshot(snapshotId: number) {
    if (counterpartyFormMode !== 'edit' || !selectedCounterparty) {
      setReferenceActionError('Save the counterparty first before promoting external credit data.')
      setReferenceActionSuccess('')
      return
    }

    const snapshot = selectedCounterpartyExternalCreditSnapshots.find((entry) => entry.id === snapshotId)
    if (!snapshot) {
      setReferenceActionError('The selected external credit snapshot could not be found.')
      setReferenceActionSuccess('')
      return
    }

    await submitReference(
      `/reference/counterparties/${selectedCounterparty.code}/external-credit-snapshots/${snapshotId}/promote`,
      'POST',
      {
        promote_rating: true,
        promote_limit: true,
        append_commentary_to_notes: true,
        updated_by: currentActorId(),
      },
      `${snapshot.provider} credit snapshot promoted into ${selectedCounterparty.code}.`,
    )
  }

  return {
    selectedCounterpartyCreditProfile,
    selectedCounterpartyCreditReport,
    selectedCounterpartyExternalCreditSnapshots,
    counterpartyCreditProfileForm,
    setCounterpartyCreditProfileForm,
    counterpartyCreditProfileFieldErrors,
    counterpartyCreditProfileDirty,
    startCreateCounterparty,
    startEditCounterparty,
    handleSaveCounterparty,
    handleToggleCounterparty,
    handleSaveCounterpartyCreditProfile,
    handlePromoteCounterpartyExternalCreditSnapshot,
  }
}
