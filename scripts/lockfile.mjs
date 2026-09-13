#!/usr/bin/env node
// Regenerates package-lock.json using the Node/npm that CI uses.
//
//   npm run lockfile
//
// The lock file is npm-version-sensitive. next-intl bundles @swc/core, which
// declares an OPTIONAL peer `@swc/helpers >=0.5.17` while the root tree has
// 0.5.15 for Next. npm 10 resolves that by adding a nested
// next-intl/node_modules/@swc/helpers; npm 11 does not. A lock written by
// npm 11 is therefore missing an entry npm 10 insists on, and `npm ci` — which
// is strict, unlike `npm install` — fails in CI while everything looks fine
// locally.
//
// So the lock is always generated with CI's npm, in a container, whatever the
// developer happens to be running. CI is the backstop if someone forgets.

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NODE = process.env.LOCKFILE_NODE_IMAGE ?? 'node:22-slim'

try {
  execFileSync('docker', ['info'], { stdio: 'ignore' })
} catch {
  console.error(
    'Docker is not running, and the lock file must be generated with CI\'s npm.\n' +
      'Start Docker, or run this on Node 22 directly:\n' +
      '  npm install --package-lock-only',
  )
  process.exit(2)
}

console.log(`· regenerating package-lock.json with ${NODE}`)
execFileSync(
  'docker',
  ['run', '--rm', '-v', `${ROOT}:/app`, '-w', '/app', NODE,
   'npm', 'install', '--package-lock-only', '--no-audit', '--no-fund'],
  { stdio: 'inherit' },
)
console.log('· done — commit package-lock.json, and let CI confirm `npm ci` works')
console.log(
  '\n  To verify locally, do NOT bind-mount the repo into a container and run\n' +
    '  `npm ci` there: it installs LINUX binaries into your host node_modules and\n' +
    '  breaks your local toolchain until you reinstall. Mask it instead:\n' +
    '    docker run --rm -v "$PWD":/app -v /app/node_modules -w /app node:22-slim npm ci',
)
