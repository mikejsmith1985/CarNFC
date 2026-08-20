// Readable identifier generation for vehicle and component addresses.

/** Longest slug we will produce; keeps the scanned address readable on a phone. */
const MAX_SLUG_LENGTH = 40

/**
 * Turns a display name into a readable address segment.
 *
 * These become the `/v/{vehicle}/c/{component}` address someone bookmarks and
 * shares, so they are readable by design rather than opaque. Secrecy is not the
 * job here — access control is (FR-001b, FR-001d).
 */
export function toSlug(input: string): string {
  const normalized = input
    .normalize('NFKD')
    // Strip diacritics so "Citroën" becomes "citroen" rather than losing the character.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  return normalized
}

/**
 * Resolves a slug collision by appending a numeric discriminator.
 *
 * A collision never rejects the claim: someone standing at their truck with a
 * peeled-off sticker should not be asked to invent a different name for a part
 * that already has one (FR-001d).
 */
export function resolveSlugCollision(desired: string, taken: readonly string[]): string {
  const takenSet = new Set(taken)
  if (!takenSet.has(desired)) return desired

  let discriminator = 2
  while (takenSet.has(`${desired}-${discriminator}`)) {
    discriminator += 1
  }
  return `${desired}-${discriminator}`
}

/**
 * Builds a vehicle slug from its identifying fields.
 *
 * Prefers the owner's nickname, because "raptor" is what they call it and what
 * they will recognise in an address bar. Falls back to year-make-model.
 */
export function buildVehicleSlug(vehicle: {
  nickname?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
}): string {
  if (vehicle.nickname) {
    const fromNickname = toSlug(vehicle.nickname)
    if (fromNickname !== '') return fromNickname
  }

  const fromIdentity = toSlug([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '))

  return fromIdentity === '' ? 'vehicle' : fromIdentity
}
