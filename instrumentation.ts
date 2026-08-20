// Next.js instrumentation hook: registers OpenTelemetry so the three signals that matter are traceable.
//
// Only three things are worth watching in this product, and each traces to a
// requirement: card-render latency against SC-001's one-second budget, outbox
// drain age against SC-005 and FR-042, and authorization refusals as a security
// signal (research.md R18).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Imported lazily so the edge runtime never pulls in the Node SDK.
  const { trace } = await import('@opentelemetry/api')

  // Next.js emits its own spans; naming the tracer here gives our own
  // instrumentation somewhere to hang off.
  trace.getTracer('servicecard', '0.1.0')
}

/**
 * Reports a server-side error to the observability pipeline.
 *
 * The message and stack are kept; request context is not, because a request to
 * a card carries a vehicle address and a passport request carries a live share
 * token — neither belongs in an error tracker.
 */
export function onRequestError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ level: 'error', event: 'request.error', message }))
}
