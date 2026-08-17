// Decides whether the test-only sign-in and tag routes may exist at all.
//
// Those routes hand out a real session without an email, which is exactly what
// the UX layer needs and exactly what must never be reachable on a deployed
// site. Gating them on `NODE_ENV !== 'production'` alone is too blunt: it also
// blocks running the suite against a local production build, which is the only
// build that has a service worker — so offline behaviour could never be
// exercised against the thing that implements it.
//
// The gate asks two questions instead of one, and the second cannot be
// satisfied from off the machine: the request must have arrived on the loopback
// interface. Anything reaching a deployed site — or this machine through a
// tunnel — carries a different host and is refused, so a stray environment
// variable cannot open the door on its own.

/** Hosts that can only mean a request that never left this machine. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1']

export interface TestAuthEnvironment {
  nodeEnv: string | undefined
  /** Opt-in flag, only consulted for a production build. */
  enableTestAuth: string | undefined
  /** The request's Host header, port included. */
  requestHost: string | null | undefined
}

/** Whether the test-only routes may respond rather than 404. */
export function isTestAuthAllowed(environment: TestAuthEnvironment): boolean {
  if (environment.nodeEnv !== 'production') return true

  if (environment.enableTestAuth !== '1') return false

  return isLoopbackHost(environment.requestHost)
}

/** True only for a Host header that cannot have come from another machine. */
export function isLoopbackHost(requestHost: string | null | undefined): boolean {
  if (!requestHost) return false

  // Strip the port without tripping over an IPv6 literal's own colons.
  const hostname = requestHost.startsWith('[')
    ? (requestHost.split(']')[0] ?? '') + ']'
    : (requestHost.split(':')[0] ?? '')

  return LOOPBACK_HOSTS.includes(hostname.toLowerCase())
}
