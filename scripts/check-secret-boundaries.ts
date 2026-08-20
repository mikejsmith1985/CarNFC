// Build-time guard: fails if the service-role key could ever reach a browser bundle (Article IX).
//
// The service-role key bypasses Row Level Security entirely. One `"use client"`
// at the top of a file that imports it would ship it to every visitor, and
// nothing else in the toolchain would object.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const REPOSITORY_ROOT = process.cwd()
const SCANNED_DIRECTORIES = ['app', 'components', 'lib', 'types']
const SKIPPED = new Set(['node_modules', '.next', 'dist', 'build', 'coverage'])

const SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY'

interface Violation {
  file: string
  reason: string
}

/** Every TypeScript file under the scanned directories. */
function collectSourceFiles(directory: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(directory)) {
    if (SKIPPED.has(entry)) continue

    const fullPath = join(directory, entry)
    if (statSync(fullPath).isDirectory()) {
      found.push(...collectSourceFiles(fullPath))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(fullPath)
    }
  }

  return found
}

/**
 * Checks one file.
 *
 * Two ways the key escapes: a client module reading it directly, or someone
 * renaming it with the `NEXT_PUBLIC_` prefix, which Next.js inlines into the
 * browser bundle by design.
 */
function inspect(file: string): Violation[] {
  const source = readFileSync(file, 'utf8')
  const violations: Violation[] = []
  const isClientModule = /^\s*['"]use client['"]/m.test(source)

  if (isClientModule && source.includes(SERVICE_ROLE_KEY)) {
    violations.push({
      file: relative(REPOSITORY_ROOT, file),
      reason: 'A "use client" module references the service-role key',
    })
  }

  if (source.includes(`NEXT_PUBLIC_${SERVICE_ROLE_KEY}`)) {
    violations.push({
      file: relative(REPOSITORY_ROOT, file),
      reason:
        'The service-role key is prefixed NEXT_PUBLIC_, which inlines it into the browser bundle',
    })
  }

  return violations
}

function main(): void {
  const files = SCANNED_DIRECTORIES.flatMap((directory) => {
    const fullPath = join(REPOSITORY_ROOT, directory)
    try {
      return collectSourceFiles(fullPath)
    } catch {
      return []
    }
  })

  const violations = files.flatMap(inspect)

  if (violations.length > 0) {
    console.error('Secret boundary violations found:\n')
    for (const violation of violations) {
      console.error(`  ${violation.file}\n    ${violation.reason}\n`)
    }
    process.exit(1)
  }

  console.log(`Secret boundaries clean across ${files.length} files.`)
}

main()
