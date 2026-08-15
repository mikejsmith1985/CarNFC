// Reports whether React has hydrated, so interactive roots can say when they are genuinely clickable.
'use client'

import { useSyncExternalStore } from 'react'

/** The value never changes after hydration, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {}
}

/**
 * True once the client has taken over from the server-rendered markup.
 *
 * A real browser click on a server-rendered button does nothing until React has
 * wired up its handler. Tests using real events — which Article V requires —
 * therefore race hydration, and the failure looks exactly like a broken feature
 * while the feature is fine. Marking the root with this lets a spec wait for
 * the moment the page actually became interactive.
 *
 * `useSyncExternalStore` rather than an effect: it returns false during server
 * render and true on the client with no state update, so it costs no extra
 * render pass.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  )
}

/**
 * Props spread onto an interactive root to advertise its readiness.
 *
 * A data attribute rather than a class so it never collides with styling, and
 * so a spec waiting on it cannot be satisfied by an unrelated visual change.
 */
export function hydrationMarker(isHydrated: boolean): { 'data-ready': 'true' | 'false' } {
  return { 'data-ready': isHydrated ? 'true' : 'false' }
}
