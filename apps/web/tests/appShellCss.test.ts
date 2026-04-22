import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'vitest'

test('terminal-theme mobile overrides keep the app shell in a single column', () => {
  const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
  const terminalThemeImportIndex = appCss.indexOf('@import "./styles/terminal-core.css";')
  const responsiveImportIndex = appCss.indexOf('@import "./styles/shared-motion-responsive.css";')

  assert.notEqual(terminalThemeImportIndex, -1)
  assert.notEqual(responsiveImportIndex, -1)
  assert.ok(responsiveImportIndex > terminalThemeImportIndex)

  const terminalCss = readFileSync(new URL('../src/styles/terminal-core.css', import.meta.url), 'utf8')
  const responsiveCss = readFileSync(new URL('../src/styles/shared-motion-responsive.css', import.meta.url), 'utf8')
  const terminalThemeIndex = terminalCss.indexOf(':root {\n  --terminal-bg: #08121c;')
  const finalMobileBlockIndex = responsiveCss.lastIndexOf('@media (max-width: 960px) {')
  const nextBlockIndex = responsiveCss.indexOf('@media (max-width: 720px) {', finalMobileBlockIndex)

  assert.notEqual(terminalThemeIndex, -1)
  assert.notEqual(finalMobileBlockIndex, -1)

  const finalMobileBlock = responsiveCss.slice(finalMobileBlockIndex, nextBlockIndex === -1 ? undefined : nextBlockIndex)

  assert.match(
    finalMobileBlock,
    /\.app-shell\s*\{\s*grid-template-columns:\s*1fr;\s*\}/,
  )
})

test('assistant message cards keep long prompt text visible', () => {
  const assistantCss = readFileSync(new URL('../src/styles/assistant-workspace.css', import.meta.url), 'utf8')
  const messageBlock = assistantCss.slice(
    assistantCss.indexOf('.assistant-message {'),
    assistantCss.indexOf('.assistant-message-user {'),
  )
  const paragraphBlock = assistantCss.slice(
    assistantCss.indexOf('.assistant-message p {'),
    assistantCss.indexOf('.assistant-feedback {'),
  )

  assert.match(messageBlock, /overflow:\s*visible;/)
  assert.match(messageBlock, /min-height:\s*min-content;/)
  assert.match(paragraphBlock, /white-space:\s*pre-wrap;/)
  assert.match(paragraphBlock, /overflow-wrap:\s*anywhere;/)
})
