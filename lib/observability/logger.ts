// Structured server logging. Carries identifiers only — never the content the product exists to keep private.

/**
 * What may appear in a log line.
 *
 * Deliberately narrow. The passport redacts costs and location labels in SQL so
 * a client bug cannot leak them; leaking the same values through a log
 * aggregator instead would defeat that entirely. Note the absence of email,
 * notes, cost, and location (research.md R18).
 */
export interface LogContext {
  accountId?: string
  vehicleId?: string
  componentId?: string
  revisionId?: string
  durationMs?: number
  outcome?: 'ok' | 'denied' | 'error'
  reason?: string
}

type LogLevel = 'info' | 'warn' | 'error'

/** Field names that must never be logged, whatever a caller passes. */
const FORBIDDEN_FIELDS = new Set([
  'email',
  'notes',
  'cost',
  'total_cost',
  'totalCost',
  'session_cost',
  'sessionCost',
  'price_per_gallon',
  'pricePerGallon',
  'location_label',
  'locationLabel',
  'token',
  'share_token',
  'shareToken',
])

function emit(level: LogLevel, event: string, context: LogContext): void {
  const safe: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(context)) {
    // Belt and braces: the type already excludes these, but a cast at a call
    // site would slip past the compiler and not past this.
    if (FORBIDDEN_FIELDS.has(key)) continue
    if (value !== undefined) safe[key] = value
  }

  const line = JSON.stringify({ level, event, ...safe, at: new Date().toISOString() })

  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.warn(line)
}

/** Records how long a card render took, against the SC-001 budget. */
export function logCardRender(context: LogContext): void {
  emit('info', 'card.render', context)
}

/** Records an outbox drain outcome, against SC-005 and FR-042. */
export function logSyncDrain(context: LogContext & { delivered?: number; stuck?: number }): void {
  emit(context.stuck && context.stuck > 0 ? 'warn' : 'info', 'sync.drain', context)
}

/**
 * Records an authorization refusal.
 *
 * A security signal: a run of these against tag resolution or the passport is
 * what enumeration would look like from the inside.
 */
export function logAuthorizationDenied(event: string, context: LogContext): void {
  emit('warn', `authz.denied.${event}`, { ...context, outcome: 'denied' })
}

/** Records an unexpected server-side failure. */
export function logFailure(event: string, context: LogContext): void {
  emit('error', event, { ...context, outcome: 'error' })
}
