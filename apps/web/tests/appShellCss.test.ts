import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vitest'

test('terminal-theme mobile overrides keep the app shell in a single column', () => {
  const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
  const terminalThemeIndex = css.indexOf(':root {\n  --terminal-bg: #08121c;')
  const finalMobileBlockIndex = css.lastIndexOf('@media (max-width: 960px) {')
  const nextBlockIndex = css.indexOf('@media (max-width: 720px) {', finalMobileBlockIndex)

  assert.notEqual(terminalThemeIndex, -1)
  assert.ok(finalMobileBlockIndex > terminalThemeIndex)

  const finalMobileBlock = css.slice(finalMobileBlockIndex, nextBlockIndex === -1 ? undefined : nextBlockIndex)

  assert.match(
    finalMobileBlock,
    /\.app-shell\s*\{\s*grid-template-columns:\s*1fr;\s*\}/,
  )
})
