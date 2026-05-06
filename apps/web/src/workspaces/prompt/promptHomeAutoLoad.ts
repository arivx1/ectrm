export function shouldAutoEnsurePromptHomeData({
  hasSession,
  dataLoaded,
  dataLoading,
  dataError = '',
  hasEnsureHandler,
}: {
  hasSession: boolean
  dataLoaded: boolean
  dataLoading: boolean
  dataError?: string
  hasEnsureHandler: boolean
}): boolean {
  return hasSession && !dataLoaded && !dataLoading && !dataError.trim() && hasEnsureHandler
}
