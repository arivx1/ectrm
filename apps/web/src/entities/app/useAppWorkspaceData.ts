import { useAppAdminActions } from './useAppAdminActions'
import { useAppSettlementMutations } from './useAppSettlementMutations'
import { useAppWorkspaceBootstrap } from './useAppWorkspaceBootstrap'
import type { ViewKey } from '../../shared/models'

export function useAppWorkspaceData(currentView: ViewKey) {
  const bootstrapState = useAppWorkspaceBootstrap(currentView)
  const { refreshMutationData, sessionResetKey, ...workspaceData } = bootstrapState

  const settlementMutations = useAppSettlementMutations({
    refreshMutationData,
    resetKey: sessionResetKey,
  })

  const adminActions = useAppAdminActions({
    refreshMutationData,
    resetKey: sessionResetKey,
  })

  return {
    ...workspaceData,
    ...settlementMutations,
    ...adminActions,
  }
}
