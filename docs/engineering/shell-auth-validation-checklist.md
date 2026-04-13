# Shell And Auth Validation Checklist

Use this checklist when a change touches any of the following:

- `apps/web/src/App.tsx`
- auth entry or session restore behavior
- start-here onboarding
- workspace bootstrap or protected read loading
- mobile shell layout and nav drawer behavior

## Automated Validation

From `apps/web`:

```bash
npm test
npm run build
npm run test:browser-smoke
npm run test:smoke
```

`npm run test:browser-smoke` is a convenience alias for `npm run test:smoke`.
Both commands run the Playwright harness in
`apps/web/tests/browser/smokeHarness.spec.ts`.

## Reviewer Checklist

### Desktop Signed-Out

- the root or a protected workspace lands on the auth gate, not a broken
  dashboard
- first-run start-here guidance appears for a fresh signed-out browser session
- password and any enabled secondary methods match the runtime settings shown by
  the API
- choosing a signed-out guided path explains where the app will return after
  sign-in

### Desktop Signed-In

- the dashboard renders without contradictory auth-required banners
- the signed-in start-here overlay appears once for a new session, then stays
  dismissed
- returning from auth interruption resumes the intended workspace, not just the
  top-level app
- trade capture and amend flows still load into a usable state

### Mobile Signed-In (`390px` Wide)

- the mobile topbar is visible
- the main stage keeps near-full viewport width while the nav drawer is closed
- opening the nav drawer does not shrink the main content into a desktop-style
  second column
- closing the drawer restores the same content width and leaves the current
  workspace usable

## Current Browser Smoke Coverage

- seeded signed-in dashboard boot
- mobile shell width and nav drawer open/close
- single-user sign-in when the API enables it
