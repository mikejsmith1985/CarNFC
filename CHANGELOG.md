# Changelog — CarNFC

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Forge Workflow initialized with Forge Terminal Workflow Architect
- Next.js 16 toolchain: TypeScript, Tailwind CSS 4 (CSS-first), ESLint enforcing the
  Article IV naming and complexity rules, Prettier, and a Vitest configuration split into
  two projects so Article V's layers stay separated — unit tests carry a 10ms per-test
  budget, integration tests get real containers.
- `scripts/run-dev-clean.ps1`, the mandated UX-test launcher. Terminates the port owner by
  PID only, never a wildcard process match (Article II).
- `scripts/check-secret-boundaries.ts`, which fails the build if the service-role key could
  reach a browser bundle (Article IX).
- `scripts/local-release.ps1`, verifying and publishing entirely on the local machine —
  never a GitHub Actions runner (Article VIII).

### Changed
- Pre-commit test gate now enforces Article V's three-layer separation rather than a
  co-located filename convention. `.forge/test-coverage-policy.json` declares which layer
  covers which paths; coverage stays mandatory and the gate still blocks an untested file
  under `lib/`, but a Server Component is no longer asked for a mocked unit test it could
  not meaningfully have.

### Fixed

### Removed
