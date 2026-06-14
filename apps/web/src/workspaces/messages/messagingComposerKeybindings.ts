export function shouldSendMessageOnKeyDown(args: {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
}): boolean {
  return (
    args.key === 'Enter' &&
    !args.shiftKey &&
    !args.altKey &&
    !args.ctrlKey &&
    !args.metaKey &&
    !args.isComposing
  )
}
