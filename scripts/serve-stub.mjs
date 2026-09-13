#!/usr/bin/env node
// Serves the built app against the QA stub and stays up until killed.
// Playwright's `webServer` runs this (playwright.config.ts); it is also handy
// for poking at the app by hand without any chance of reaching production.
//
//   npm run build && node scripts/serve-stub.mjs

import { BASE, startStubbedServer } from './lib/stubbed-server.mjs'

await startStubbedServer()
console.log(`· serving ${BASE} against the stub — Ctrl-C to stop`)
// Keep the event loop alive; the children are torn down by the signal
// handlers in startStubbedServer.
setInterval(() => {}, 1 << 30)
