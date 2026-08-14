// Decides which Article V layer must cover a given source file, for the pre-commit test gate.
//
// Shared by the bash and PowerShell hooks so the two cannot drift, and written
// in Node because this is a Node project — no extra dependency, and JSON
// parsing is free.
//
// Prints one of:
//   skip                    — not product logic; no test required
//   colocated               — pure logic; requires <leaf>.test.ts (hook checks)
//   layer:<dir>             — covered elsewhere; that layer must contain tests
//
// Exits non-zero only if the policy file is unreadable, which the hook treats
// as "fall back to the original co-located rule".

const { readFileSync, existsSync, readdirSync, statSync } = require('node:fs')
const { join, basename } = require('node:path')

const POLICY_PATH = '.forge/test-coverage-policy.json'
const filePath = (process.argv[2] || '').replace(/\\/g, '/')

if (!filePath || !existsSync(POLICY_PATH)) {
  process.stdout.write('colocated')
  process.exit(0)
}

let policy
try {
  policy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'))
} catch {
  process.stdout.write('colocated')
  process.exit(0)
}

/** Whether a path sits under any of the given prefixes. */
function underPrefix(candidate, prefixes) {
  return (prefixes || []).some((prefix) => candidate.startsWith(prefix))
}

/** Whether a filename matches any of the given globs (only `*` is supported). */
function matchesGlob(candidate, patterns) {
  const name = basename(candidate)
  return (patterns || []).some((pattern) => {
    const expression = new RegExp(
      '^' + pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    )
    return expression.test(name) || expression.test(candidate)
  })
}

/**
 * Whether a layer directory actually contains tests.
 *
 * An empty directory must not be able to wave a file through — the point of
 * delegating is that the coverage exists somewhere, not that a folder does.
 */
function layerHasTests(directory) {
  if (!existsSync(directory)) return false

  const stack = [directory]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) stack.push(full)
      else if (/\.(test|spec|cy)\.(ts|tsx|js|jsx)$/.test(entry)) return true
    }
  }
  return false
}

// Declarations, configuration and operational tooling carry no product logic.
if (
  underPrefix(filePath, policy.notSourceLogic?.prefixes) ||
  matchesGlob(filePath, policy.notSourceLogic?.patterns)
) {
  process.stdout.write('skip')
  process.exit(0)
}

// Covered by another layer? Say which, and whether that layer is populated.
for (const rule of policy.coveredByLayer || []) {
  if (filePath.startsWith(rule.prefix)) {
    process.stdout.write(layerHasTests(rule.layer) ? `layer:${rule.layer}` : `empty:${rule.layer}`)
    process.exit(0)
  }
}

// Everything else — pure logic included — keeps the co-located requirement.
process.stdout.write('colocated')
