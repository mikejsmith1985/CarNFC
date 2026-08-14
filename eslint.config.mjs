// ESLint configuration enforcing the Article IV naming and complexity rules alongside the Next.js defaults.
//
// eslint-config-next v16 exports a flat-config array directly, so it is spread
// here rather than bridged through FlatCompat — the eslintrc bridge cannot
// serialize its plugin graph and throws on a circular structure.

import nextConfig from 'eslint-config-next'

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'public/sw.js',
      'supabase/.temp/**',
      '**/*.min.js',
    ],
  },

  ...nextConfig,

  {
    rules: {
      // Article IV: names must be self-documenting. Loop iterators and HTTP
      // handler parameters are the only permitted single-letter identifiers.
      'id-length': [
        'error',
        { min: 2, exceptions: ['i', 'j', 'k', 'w', 'r', '_'], properties: 'never' },
      ],
      // Article IV: no magic numbers. Limits belong in lib/constants.ts.
      'no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          enforceConst: true,
          detectObjects: false,
        },
      ],
      // Article IV: functions stay under 40 lines.
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    // Presentational components are markup-heavy. The 40-line rule exists to
    // keep logic readable, not to fragment a JSX tree into meaningless pieces.
    files: ['components/**/*.tsx', 'app/**/*.tsx'],
    rules: { 'max-lines-per-function': 'off' },
  },

  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', 'scripts/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: { 'no-magic-numbers': 'off', 'no-console': 'off', 'max-lines-per-function': 'off' },
  },

  {
    /*
      Validation schemas and bit-level code.

      Article IV bans magic numbers so a reader is never left asking "why this
      value?". In a Zod string bound — `.max(120)` on a brand name — and in a
      UUIDv7 bitmask, the number IS the meaning; lifting it into a named
      constant adds a layer of indirection without adding any information.
      Values that carry product meaning (attachment caps, backoff ceilings,
      touch targets) still live in lib/constants.ts and are still enforced.
    */
    files: [
      'lib/validation/**/*.ts',
      'lib/offline/uuid.ts',
      // The constants file's entire job is to be where the numbers live.
      'lib/constants.ts',
      // Base32 encoding: 8 bits in, 5 bits out, masked with 31.
      'lib/tags/generate.ts',
      // Unit conversions, where the literal is the definition.
      'lib/calc/**/*.ts',
    ],
    rules: { 'no-magic-numbers': 'off' },
  },

  {
    /*
      Column mappers translate one shape into another, field by field. They are
      long but perfectly flat — splitting them would scatter a single mapping
      across several functions and make a missing column harder to spot, not
      easier.
    */
    files: ['app/actions/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
]

export default config
