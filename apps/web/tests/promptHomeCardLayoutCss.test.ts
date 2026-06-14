import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

function cssBlock(css: string, selector: string): string {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1);

  const end = css.indexOf("\n}", start);
  assert.notEqual(end, -1);

  return css.slice(start, end + 2);
}

test("prompt home cards keep their horizontal span when collapsed", () => {
  const css = readFileSync(
    new URL("../src/styles/prompt-home.css", import.meta.url),
    "utf8",
  );
  const slotBlock = cssBlock(css, ".prompt-home-card-slot {");
  const collapsedBlock = cssBlock(
    css,
    ".prompt-home-card-slot:has(> .prompt-home-card-slot-inner > .is-collapsed) {",
  );

  assert.match(
    slotBlock,
    /--prompt-home-current-column-span:\s*var\(--prompt-home-expanded-column-span,\s*6\);/,
  );
  assert.doesNotMatch(collapsedBlock, /--prompt-home-current-column-span:/);
  assert.match(
    collapsedBlock,
    /--prompt-home-current-row-span:\s*var\(--prompt-home-collapsed-row-span,\s*1\);/,
  );
});
