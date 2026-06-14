export const PROMPT_HOME_CLOCK_TICK_MS = 60_000

export function getPromptHomeNextClockTickDelay(now: Date): number {
  const elapsedMilliseconds = now.getSeconds() * 1000 + now.getMilliseconds()
  const remainingMilliseconds = PROMPT_HOME_CLOCK_TICK_MS - elapsedMilliseconds

  return remainingMilliseconds > 0 ? remainingMilliseconds : PROMPT_HOME_CLOCK_TICK_MS
}
