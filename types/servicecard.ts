// The complete type surface for ServiceCard: vehicles, tags, the four-category service log union, and the two energy log shapes.
//
// These types mirror lib/supabase/schema.sql one-to-one. Where a runtime check is
// also needed, the Zod schemas in lib/validation/ are the single definition and
// their inferred types are assignable to the interfaces here — the two cannot
// drift because the database CHECK constraints enforce the same exclusivity.

// =============================================================================
// Primitive aliases — a bare `string` says nothing about what it holds
// =============================================================================

/** UUIDv7, generated on the device before a record ever leaves it (FR-041). */
export type RevisionId = string
export type EntryId = string
export type VehicleId = string
export type ComponentId = string
export type AccountId = string

/** 26 base32url characters, 128 bits of entropy, fixed at manufacture (FR-001). */
export type TagId = string

/** ISO-8601 calendar date, `YYYY-MM-DD`. */
export type IsoDate = string

/** ISO-8601 timestamp with timezone. */
export type IsoTimestamp = string

// =============================================================================
// Enumerations
// =============================================================================

export type PowerSource = 'gasoline' | 'electric' | 'both'
export type LogCategory = 'maintenance' | 'repair' | 'replace' | 'upgrade'
export type EnergyMode = 'fuel' | 'charge'
export type ChargeLocation = 'home' | 'work' | 'public_fast'
export type SpecKind = 'torque' | 'capacity' | 'fluid' | 'tool' | 'part_number' | 'interval'
export type SpecOrigin = 'factory' | 'override'
export type ReminderKind = 'recheck' | 'next_due'
export type AttachmentState = 'pending' | 'uploaded' | 'failed'

// =============================================================================
// Vehicle and components
// =============================================================================

/** A single vehicle owned by exactly one account. */
export interface Vehicle {
  id: VehicleId
  ownerId: AccountId
  /** Readable identifier in the address; unique per owner, not globally (FR-001d). */
  slug: string
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  nickname: string | null
  vin: string | null
  powerSource: PowerSource
  /** Highest confirmed reading across all entry types; only ever rises (FR-025). */
  currentOdometer: number
}

/**
 * One named, unit-bearing specification on a component.
 * `origin` distinguishes a factory value from one an upgrade has superseded, and
 * `factoryValue` is retained even when overridden so the HUD can show both (FR-009).
 */
export interface ComponentSpec {
  specKey: string
  kind: SpecKind
  label: string
  effectiveValue: string
  unit: string | null
  origin: SpecOrigin
  factoryValue: string | null
  /** The upgrade revision that introduced the override, if any. */
  overrideRevisionId: RevisionId | null
  /** How many earlier overrides this one superseded (FR-010). */
  supersededOverrideCount: number
}

/** A serviceable part or location on a vehicle. */
export interface VehicleComponent {
  id: ComponentId
  vehicleId: VehicleId
  slug: string
  displayName: string
  templateKey: string | null
  /** Routes the tap to the energy logger instead of the standard card (FR-004). */
  isEnergyPort: boolean
  energyModeHint: EnergyMode | null
  serviceIntervalMiles: number | null
  serviceIntervalDays: number | null
}

/**
 * A physical NFC tag: one opaque identifier bound to one vehicle and one component.
 * The binding is re-assignable by the owner; the identifier never changes, because
 * a tag adhered to a frame rail cannot be reprogrammed (FR-046).
 */
export interface ComponentTag {
  id: TagId
  vehicleId: VehicleId | null
  componentId: ComponentId | null
  claimedBy: AccountId | null
  claimedAt: IsoTimestamp | null
}

/** What `resolve_tag` returns. Never discloses vehicle data outside the `owned` branch. */
export type TagResolution =
  | { status: 'owned'; vehicleSlug: string; componentSlug: string }
  | { status: 'zone'; vehicleSlug: string; zoneKey: string }
  | { status: 'unclaimed' }
  | { status: 'forbidden' }
  | { status: 'unknown' }

// =============================================================================
// Service logs — a discriminated union over `category`
// =============================================================================

/** Fields every service log carries, whatever its category. */
export interface ServiceLogBase {
  id: RevisionId
  entryId: EntryId
  componentId: ComponentId
  supersedesRevisionId: RevisionId | null
  isTombstone: boolean
  authorId: AccountId
  /** Untrusted — the device clock may be wrong. Display and audit only. */
  clientCreatedAt: IsoTimestamp
  /** The only ordering authority. Absent until the server has accepted the record. */
  serverReceivedAt: IsoTimestamp | null
  /** True when the entry's revision chain is longer than one (FR-027a). */
  isEdited: boolean
  performedOn: IsoDate
  odometer: number
  notes: string | null
  attachments: Attachment[]
}

/** Routine, scheduled upkeep — oil, fluids, rotations (FR-019). */
export interface MaintenanceLog extends ServiceLogBase {
  category: 'maintenance'
  fluidType: string | null
  quantity: number | null
  quantityUnit: string | null
  filterPartNumber: string | null
  appliedTorque: string | null
  nextIntervalMiles: number | null
  nextIntervalDays: number | null
}

/** Fixing something that broke, leaked, or failed (FR-020). */
export interface RepairLog extends ServiceLogBase {
  category: 'repair'
  symptom: string | null
  diagnosis: string | null
  actionTaken: string | null
  /** Distance after which to re-check; surfaces on the card once passed (FR-023). */
  recheckMiles: number | null
  recheckDays: number | null
}

/** Swapping a worn or end-of-life component for a fresh one (FR-021). */
export interface ReplaceLog extends ServiceLogBase {
  category: 'replace'
  oldPartNumber: string | null
  newPartNumber: string | null
  brand: string | null
  supplier: string | null
  cost: number | null
  warrantyExpiresOn: IsoDate | null
}

/**
 * Aftermarket or custom work (FR-022).
 * The only category that can carry specification overrides, because it is the
 * only one where the factory manual stops applying.
 */
export interface UpgradeLog extends ServiceLogBase {
  category: 'upgrade'
  upgradeBrand: string | null
  productName: string | null
  installNotes: string | null
  referenceUrl: string | null
  specOverrides: SpecOverride[]
}

/** A custom value that supersedes a factory specification (FR-009). */
export interface SpecOverride {
  specKey: string
  kind: SpecKind
  label: string
  newValue: string
  unit: string | null
  /** The factory value at time of install, kept for reference. */
  supersededValue: string | null
}

/** One recorded event against a component, of exactly one of four categories (FR-016). */
export type ServiceLog = MaintenanceLog | RepairLog | ReplaceLog | UpgradeLog

// =============================================================================
// Energy logs — a discriminated union over `mode`
// =============================================================================

/** Fields shared by fuel-ups and charging sessions. */
export interface EnergyLogBase {
  id: RevisionId
  entryId: EntryId
  /** Vehicle-scoped, so economy stays continuous across both tag types (FR-037). */
  vehicleId: VehicleId
  supersedesRevisionId: RevisionId | null
  isTombstone: boolean
  authorId: AccountId
  clientCreatedAt: IsoTimestamp
  serverReceivedAt: IsoTimestamp | null
  isEdited: boolean
  occurredAt: IsoTimestamp
  odometer: number
  notes: string | null
}

/** One liquid-fuel fill (FR-030). */
export interface FuelLog extends EnergyLogBase {
  mode: 'fuel'
  volumeGallons: number
  pricePerGallon: number | null
  totalCost: number | null
  fuelGrade: string | null
  /** Only a full fill closes an economy interval (FR-033). */
  isFullFill: boolean
  /** Set when the owner knows a fill went unrecorded, invalidating this interval. */
  missedFillBefore: boolean
}

/** One charging session (FR-034). */
export interface EVChargeLog extends EnergyLogBase {
  mode: 'charge'
  socStartPct: number
  socEndPct: number
  energyKwh: number
  chargeLocation: ChargeLocation | null
  /** Location data — never included in a shared passport (FR-050). */
  locationLabel: string | null
  sessionCost: number | null
}

export type EnergyLog = FuelLog | EVChargeLog

// =============================================================================
// Supporting entities
// =============================================================================

/** A photo or PDF associated with a service log. Photos are stored compressed. */
export interface Attachment {
  id: string
  revisionId: RevisionId
  storagePath: string
  originalFilename: string
  mimeType: string
  byteSize: number
  state: AttachmentState
}

/** A follow-up obligation, from either a repair re-check or a maintenance interval. */
export interface Reminder {
  id: string
  componentId: ComponentId
  sourceRevisionId: RevisionId | null
  kind: ReminderKind
  dueOdometer: number | null
  dueOn: IsoDate | null
  isOverdue: boolean
  completedAt: IsoTimestamp | null
}

/** A revocable, unguessable grant of read-only access to one vehicle's history. */
export interface PassportShare {
  id: string
  vehicleId: VehicleId
  includeCosts: boolean
  mintedAt: IsoTimestamp
  revokedAt: IsoTimestamp | null
  /** Present only in the response to minting; never stored or re-readable. */
  rawToken?: string
}

// =============================================================================
// Read models
// =============================================================================

/** A single timeline row as returned by `get_component_card`. */
export interface TimelineEntry {
  entryId: EntryId
  revisionId: RevisionId
  category: LogCategory
  performedOn: IsoDate
  odometer: number
  notes: string | null
  isEdited: boolean
  categoryFields: Record<string, string | number | null>
  attachments: Attachment[]
}

/** Everything the component service card renders, fetched in one round trip (SC-001). */
export interface ComponentCard {
  vehicle: Pick<
    Vehicle,
    | 'id'
    | 'slug'
    | 'year'
    | 'make'
    | 'model'
    | 'trim'
    | 'nickname'
    | 'powerSource'
    | 'currentOdometer'
  >
  component: Pick<
    VehicleComponent,
    | 'id'
    | 'slug'
    | 'displayName'
    | 'isEnergyPort'
    | 'energyModeHint'
    | 'serviceIntervalMiles'
    | 'serviceIntervalDays'
  >
  specs: ComponentSpec[]
  reminders: Reminder[]
  timeline: TimelineEntry[]
  timelineHasMore: boolean
}

// =============================================================================
// Offline sync
// =============================================================================

/** A locally captured record awaiting synchronization (FR-039). */
export interface PendingChange {
  /** Same UUIDv7 the server will use as its primary key — this is what makes retry safe. */
  id: RevisionId
  kind: 'service_revision' | 'energy_revision' | 'attachment'
  payload: unknown
  attachmentIds: string[]
  clientCreatedAt: IsoTimestamp
  attempts: number
  lastError: string | null
  state: 'pending' | 'in_flight' | 'stuck'
}

/** A card payload held in IndexedDB, with the stamp that drives the staleness banner (FR-038). */
export interface CachedCard {
  key: string
  payload: ComponentCard
  fetchedAt: IsoTimestamp
}
