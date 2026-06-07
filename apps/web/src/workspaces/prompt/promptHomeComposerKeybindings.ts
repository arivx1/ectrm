export type PromptHomeComposerKeyEvent = {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  nativeEvent?: {
    isComposing?: boolean
  }
}

export function shouldSubmitPromptHomeComposerKey(
  event: PromptHomeComposerKeyEvent,
): boolean {
  return (
    event.key === 'Enter' &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.nativeEvent?.isComposing
  )
}
