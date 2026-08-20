# Feature Specification: ServiceCard — Automotive NFC Companion

**Feature Branch**: `feature/servicecard-nfc-pwa`

**Feature Directory**: `specs/001-servicecard-nfc-pwa`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: Build the core architecture and key components for a mobile-first, offline-capable "ServiceCard" application launched by tapping physical NFC tags mounted on vehicle components (frame rails, engine bays, gas doors, EV charge ports). Tapping a tag opens the exact Component Service Card for that part, showing an at-a-glance mechanics HUD (tools, torque specs, fluid capacities, part numbers) and the component's service history, and lets the user record work in four strictly separated categories — Maintenance, Repair, Replace, Modified/Upgrade — plus specialized fuel and EV charging logs. UX mantra: "Zero friction under the vehicle."

---

## Clarifications

### Session 2026-08-13

- Q: Tags are described as pre-programmed at manufacture, yet their address slugs are described as chosen at claim time — which model applies? → A: The tag stores an opaque unique tag ID; the system resolves it to the bound vehicle and component and redirects to the readable address. Unbound IDs route to claim.
- Q: What form does the "lightweight one-time authentication at first tag claim" take? → A: Email one-time code / magic link, with the session persisting indefinitely on the device; recovery and additional devices repeat the same flow.
- Q: How are conflicting offline edits or deletes of the same existing entry resolved across devices? → A: Entries are immutable once synced — an edit writes a superseding revision and a delete writes a tombstone, the full chain is retained, and only the latest revision is displayed, so no conflict can arise.
- Q: How does a guest gain access to a shared vehicle passport? → A: Enabling sharing mints a separate unguessable share link; the readable vehicle address stays owner-only. Revoking invalidates that link, and a fresh one can be minted.
- Q: What are the attachment size limits, and how do attachments behave offline? → A: 10 MB per file and 5 files per entry, images compressed on-device before queueing and PDFs passed through, queued offline and uploaded with the entry on any connection.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tap a tag, see the exact part's service card (Priority: P1)

An owner slides under their truck with a wrench in one hand, taps their phone to the tag zip-tied beside the front differential, and the phone immediately opens a card for *that differential on that truck* — not a home screen, not a vehicle list, not a login form. Before they crack the drain plug they can already read the socket sizes, the torque values, the exact fluid and capacity, and what was last done to this part and when.

**Why this priority**: This is the entire product promise. Without instant tag-to-part context resolution the product is just another maintenance spreadsheet. Every other story is an extension of this one.

**Independent Test**: With a pre-seeded vehicle, component, and history, open the component address directly on a phone and confirm the correct part card renders with correct specs and history and requires zero navigation or sign-in interaction.

**Acceptance Scenarios**:

1. **Given** a claimed tag bound to a vehicle and component, **When** the owner taps the tag, **Then** the Component Service Card for that exact vehicle+component renders with vehicle identity, current odometer, tag location name, mechanics HUD, quick actions, and history timeline.
2. **Given** the owner has previously used the app on this device, **When** they tap the tag, **Then** no sign-in step is presented and the card is usable immediately.
3. **Given** a component that has a recorded aftermarket upgrade with overriding specs, **When** the card renders, **Then** the HUD shows the overriding custom spec as the effective value, visibly flagged as a non-factory override, with the factory value still readable.
4. **Given** a component with a defined service interval and prior service history, **When** the card renders, **Then** a next-due indicator shows remaining distance and/or time, or an overdue state.
5. **Given** a component that has no history yet, **When** the card renders, **Then** the HUD still shows the component's specs and the timeline shows an empty state inviting the first log.

---

### User Story 2 - Log the work in the right category (Priority: P2)

Having drained and refilled the differential, the owner taps "Log Service" and records the work. The form asks only for what that kind of work needs: a fluid change asks about fluid, capacity, filter part number, and torque; a leak fix asks about symptom and root cause; a part swap asks about old/new part numbers and warranty; an aftermarket install asks about brand, install notes, and any spec that now overrides the factory numbers.

**Why this priority**: Capturing structured, category-correct history is what makes the card valuable on every subsequent tap. It is the write half of the core loop.

**Independent Test**: From a rendered component card, create one log of each of the four categories, then reload the card and confirm each appears correctly categorized in the timeline with its category-specific fields preserved.

**Acceptance Scenarios**:

1. **Given** the log entry view is open, **When** the user picks a category, **Then** the visible fields change to that category's field set and no other category's fields are shown.
2. **Given** the "Modified / Upgrade" category is selected, **When** the user enters a custom torque, capacity, fluid, or part number, **Then** that value is recorded as an override for the component and appears on the HUD on the next card view.
3. **Given** the "Repair" category is selected, **When** the user sets a re-check reminder of 50 miles, **Then** the reminder is recorded against the component and surfaces on the card once the vehicle's odometer passes that threshold.
4. **Given** the "Replace" category is selected, **When** the user records old and new part numbers, supplier, warranty expiry, and attaches a receipt image, **Then** all values including the attachment are retrievable from the timeline entry.
5. **Given** an odometer value lower than the last recorded value, **When** the user attempts to save, **Then** the system warns about the inconsistency and requires explicit confirmation before saving.
6. **Given** a completed entry, **When** the user saves, **Then** the entry appears at the top of the component timeline without a full page reload.

---

### User Story 3 - Claim an unconfigured tag (Priority: P3)

A new customer peels the backing off a fresh tag, sticks it on the oil filter housing, and taps it. Because the tag has never been claimed, they are taken to a short setup flow that binds the tag to one of their vehicles and to a named component, then drops them straight onto the newly-created card.

**Why this priority**: Required for real-world onboarding, but the value of the product can be demonstrated and tested with pre-seeded tags, so it follows the core read/write loop.

**Independent Test**: Open the claim address with an unclaimed tag identifier and complete the flow; confirm a subsequent tap of the same tag lands directly on the created component card.

**Acceptance Scenarios**:

1. **Given** a tag identifier not yet bound to any vehicle, **When** it is opened, **Then** the user is routed to the claim flow with the tag identifier preserved.
2. **Given** the user is in the claim flow, **When** they select an existing vehicle and a component, **Then** the tag is bound and they land on that component's card.
3. **Given** the user has no vehicles yet, **When** they enter the claim flow, **Then** they can create a vehicle within the same flow without losing the pending tag identifier.
4. **Given** a tag already claimed by another account, **When** a different user opens it, **Then** they are not permitted to re-bind it and are shown the public passport view or an access message rather than the claim flow.
5. **Given** a component is chosen from the component library, **When** the card is created, **Then** it is pre-populated with that component type's default specs so the HUD is useful before any manual data entry.

---

### User Story 4 - Log a fuel-up or a charging session (Priority: P4)

Standing at the pump with the nozzle running, the owner taps the tag inside the fuel door and gets a purpose-built energy screen — odometer, gallons, price, octane — and sees the resulting economy for that tank immediately. An EV owner taps the charge port tag and instead records start and end state of charge, energy delivered, where they charged, and cost, and sees efficiency and cost per mile.

**Why this priority**: A distinct high-frequency use case with its own tag placements and its own math; valuable but separable from component service history.

**Independent Test**: Tap a fuel-door component on a gasoline vehicle and a charge-port component on an electric vehicle, record one session each, and confirm the correct mode renders and the derived metrics match hand calculation.

**Acceptance Scenarios**:

1. **Given** a tag bound to a fuel-door component on a gasoline vehicle, **When** it is opened, **Then** the fuel logging view renders rather than the standard component card.
2. **Given** a tag bound to a charge-port component on an electric vehicle, **When** it is opened, **Then** the charging session view renders.
3. **Given** a vehicle that is both gasoline and electric, **When** an energy tag is opened, **Then** both modes are available and the user can choose.
4. **Given** a prior fuel entry exists and the user records odometer and gallons for a full fill, **When** the entry is saved, **Then** distance-per-gallon since the previous fill and cost per mile are calculated and shown.
5. **Given** the user enters any two of gallons, price per unit, and total cost, **When** the third is left blank, **Then** it is derived automatically and remains editable.
6. **Given** a fill marked as partial, **When** economy is calculated, **Then** that interval is excluded from economy figures but the cost is still counted.
7. **Given** a charging session with start and end state of charge, energy delivered, and cost, **When** it is saved, **Then** distance per unit of energy, energy per distance, and cost per mile are calculated and shown.
8. **Given** several prior sessions, **When** the energy view renders, **Then** a running economy trend across recent sessions is visible.

---

### User Story 5 - Work with no signal and sync later (Priority: P5)

The owner is in a steel-sided garage or at a trailhead with no bars. Tapping the tag still opens the card they viewed before, they still log the work, and when the phone reconnects hours later the entries upload on their own without the owner thinking about it.

**Why this priority**: Garages and remote locations are dead zones; losing an entry destroys trust in the log. It is a robustness layer over the already-working core loop.

**Independent Test**: Load a card while connected, disconnect the network, reload the card and create logs, reconnect, and confirm all entries reach the server exactly once with no duplicates or data loss.

**Acceptance Scenarios**:

1. **Given** a card previously viewed on this device, **When** it is opened with no connectivity, **Then** the card renders from local data with a clear indicator that data may be stale.
2. **Given** no connectivity, **When** the user saves any log entry, **Then** the entry is stored locally, appears immediately in the timeline, and is marked as pending sync.
3. **Given** pending entries exist, **When** connectivity returns, **Then** they upload automatically and their pending markers clear without user action.
4. **Given** an upload is retried after an ambiguous failure, **When** it completes, **Then** exactly one copy of the entry exists on the server.
5. **Given** an entry cannot sync after repeated attempts, **When** the user views the app, **Then** the failure is visible and the entry is retained locally rather than discarded.
6. **Given** the user visits the app on a supported mobile browser, **When** they choose to install it, **Then** it installs to the home screen and launches without browser chrome.

---

### User Story 6 - Share a read-only vehicle passport (Priority: P6)

The owner is selling the truck. They turn on passport sharing and send a link; the buyer sees a clean, read-only record of every service, repair, replacement, and modification, which substantiates the asking price. Nothing the buyer sees can be edited, and the owner can revoke the link after the sale.

**Why this priority**: Strong differentiator and resale value driver, but not required for the daily-use core loop.

**Independent Test**: Enable sharing on a vehicle with history, open the resulting link in a session with no owner identity, confirm full history is readable and every write control is absent, then revoke and confirm access is denied.

**Acceptance Scenarios**:

1. **Given** a vehicle with sharing disabled, **When** a non-owner opens any address for that vehicle, **Then** no service history is disclosed.
2. **Given** the owner enables sharing, **When** a non-owner opens the passport link, **Then** the vehicle's service history and specifications are readable and no logging, editing, or claiming control is present or functional.
3. **Given** a shared passport, **When** it is viewed by a non-owner, **Then** owner identity details and purchase cost figures are excluded unless the owner has explicitly chosen to include costs.
4. **Given** the owner revokes sharing, **When** the previously working link is opened, **Then** access is refused.

---

### Edge Cases

- A tag identifier is unknown, malformed, or corresponds to a vehicle or component that has been deleted.
- A readable vehicle or component identifier is renamed after links to it were bookmarked or shared.
- Two vehicles or two components on one vehicle are given the same readable identifier at claim time.
- A tag is opened by someone who is neither the owner nor holding a valid share link.
- A tag is physically moved to a different component or a different vehicle and must be re-bound.
- Two devices signed in as the same owner both log entries offline for the same component and sync later.
- Two devices offline both edit, or one edits while the other deletes, the same existing entry.
- A device edits an entry offline that another device has already tombstoned.
- An upgrade log carrying a specification override is tombstoned, requiring the effective spec to fall back to the factory value or an older override.
- The first claim is attempted with no connectivity, making the emailed sign-in code unreachable.
- An owner signs out, or their session is invalidated, while entries are still pending synchronization.
- An owner loses access to the email inbox that anchors their account.
- A sign-in link is opened in a different browser than the one that requested it.
- The same entry is submitted twice because of a tap on a flaky connection.
- The odometer entered is lower than the last known value (instrument cluster replacement, unit confusion, or typo).
- The odometer jumps implausibly high (extra digit typo).
- Two service events on the same day at the same odometer reading.
- A fuel entry follows a missed fill-up, making the computed economy meaningless.
- Gallons or energy delivered is entered as zero, or state of charge ends lower than it started.
- Ending state of charge exceeds 100% or a negative value is entered.
- An upgrade log defines a custom spec and is later deleted or superseded by a newer upgrade defining a different value for the same spec.
- Two active upgrade logs define conflicting overrides for the same specification.
- A component's factory specs are unknown because the component was created ad hoc rather than from the library.
- Local device storage is full or the browser evicts stored data between visits.
- The device clock is wrong, producing out-of-order timestamps.
- An attachment is larger than the allowed size or is an unsupported file type, or a sixth file is added to an entry.
- A photo is still large after on-device compression, or compression fails on the device.
- An entry syncs successfully but one of its attachments fails to upload.
- A shared passport link is revoked while a guest currently has the page open.
- A share link is forwarded beyond the intended recipient, or pasted somewhere a crawler or messaging link-preview fetcher can reach it.
- A share link is opened for a vehicle whose sharing was enabled, revoked, and re-enabled with a new link.
- An electric-only vehicle's tag is bound to a fuel door, or a gasoline vehicle's tag to a charge port.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Tag Resolution & Routing

- **FR-001**: Each physical tag MUST carry a single opaque, unique tag identifier that is fixed at manufacture and carries no vehicle or component meaning of its own.
- **FR-001a**: The system MUST resolve a scanned tag identifier to the vehicle and component currently bound to it and deliver the user to that exact component view, with no intermediate menu, list, or landing screen.
- **FR-001b**: The canonical, shareable address of a component MUST be a readable form composed of a vehicle identifier and a component identifier, assigned at claim time; a tag scan MUST arrive at that readable address so the resulting address can be bookmarked and shared.
- **FR-001c**: Tag identifiers MUST be unguessable, so that an unclaimed tag cannot be located and claimed by anyone who does not physically hold it.
- **FR-001d**: Readable vehicle and component identifiers MUST be unique within their scope, and the system MUST resolve a collision at claim time rather than rejecting the claim.
- **FR-002**: The system MUST route a tag identifier that is not yet bound to a vehicle to a claim flow, preserving the scanned tag identifier through that flow.
- **FR-003**: The system MUST show an unambiguous, recoverable error state for unknown, malformed, or deleted tag targets, offering the claim flow where appropriate.
- **FR-004**: The system MUST render the energy logging view instead of the standard component card when the bound component is a fuel filler or a charge port.
- **FR-005**: The system MUST allow a returning owner on a previously used device to reach a service card without performing a sign-in step.
- **FR-006**: The system MUST make every primary action on the landing view reachable without navigating away from it.

#### Component Service Card

- **FR-007**: The card MUST display vehicle identity (year, make, model, and owner nickname where set), the current best-known odometer, and the tag's component location name.
- **FR-008**: The card MUST display a mechanics reference panel containing required tools and fastener sizes, torque specifications with units, fluid type and capacity with units, and relevant part numbers.
- **FR-009**: The reference panel MUST present the effective specification for the component, where a value defined by an active modification log supersedes the factory value, is visually distinguished as a non-factory override, and links to the log that introduced it while keeping the factory value readable.
- **FR-010**: When multiple active modification logs define the same specification, the system MUST treat the most recent one as effective and MUST indicate that an earlier override was superseded.
- **FR-011**: The card MUST present quick log actions for Maintenance, Repair, and Modification, with all four categories reachable from the log entry view.
- **FR-012**: The card MUST display the component's history newest-first, each entry showing date, odometer, category, and a summary, with categories visually distinguished from one another by more than color alone.
- **FR-013**: The card MUST display a next-due indicator for components that have a defined service interval, expressed in remaining distance and/or remaining time, and MUST display an overdue state when the interval has elapsed.
- **FR-014**: All interactive controls MUST present a touch target of at least 48 by 48 device-independent pixels.
- **FR-015**: The interface MUST default to a high-contrast dark presentation, with text and essential controls meeting at least a 4.5:1 contrast ratio against their background.

#### Logging Engine

- **FR-016**: The system MUST record every service entry as exactly one of four categories: Maintenance, Repair, Replace, or Modified/Upgrade.
- **FR-017**: The system MUST show only the selected category's fields in the entry view and MUST change the field set immediately when the category changes, preserving values for fields common to both categories.
- **FR-018**: Every service entry MUST capture a date, an odometer reading, and free-text notes; the odometer MUST be pre-filled with the best-known current value and remain editable.
- **FR-019**: A Maintenance entry MUST additionally capture fluid or consumable type, quantity used with units, filter or consumable part number, applied torque values, and the interval to next service.
- **FR-020**: A Repair entry MUST additionally capture the observed symptom, the diagnosis or root cause, the action taken, and an optional re-check reminder expressed as a distance and/or time offset.
- **FR-021**: A Replace entry MUST additionally capture the removed part number, the installed part number, brand and supplier, cost, warranty expiration, and an optional receipt attachment.
- **FR-022**: A Modified/Upgrade entry MUST additionally capture the aftermarket brand and product name, installation notes, an optional reference link to an installation manual or guide, and zero or more specification overrides, each naming the specification, its new value with units, and the superseded factory value.
- **FR-023**: The system MUST surface a re-check reminder created by a Repair entry on the component card once the recorded distance or time offset has been reached, and MUST allow the owner to dismiss it as completed.
- **FR-024**: The system MUST warn when an entered odometer value is lower than the latest known reading for that vehicle, or implausibly higher, and MUST require explicit confirmation before saving.
- **FR-025**: The system MUST update the vehicle's current odometer from the highest confirmed reading across all entry types.
- **FR-026**: The system MUST allow the owner to attach up to 5 files to any service entry, each no larger than 10 MB after processing, accepting common photo formats and PDF documents, and MUST reject oversized, over-count, or unsupported files with a message naming the specific limit that was exceeded.
- **FR-026a**: The system MUST compress and downscale attached photographs on the device before storing or queueing them, targeting the smallest size at which printed part numbers and receipt line items remain legible, and MUST store PDF documents unmodified.
- **FR-026b**: The system MUST accept attachments on entries created without connectivity, MUST queue them alongside their entry, and MUST upload them on any connection type once connectivity returns.
- **FR-026c**: An entry whose attachments are still uploading MUST be usable and visible in the timeline, with its attachments individually marked as pending.
- **FR-027**: The system MUST treat a synchronized entry as immutable. An owner's edit MUST be recorded as a new revision that supersedes the previous one, and a deletion MUST be recorded as a tombstone revision; neither MUST overwrite or remove the superseded revision.
- **FR-027a**: The system MUST display only the latest revision of an entry, MUST mark an entry that has more than one revision as edited, and MUST omit tombstoned entries from timelines and from all derived calculations.
- **FR-027b**: The system MUST retain the full revision chain of every entry, with each revision carrying who made it and when, and MUST make an entry's prior revisions viewable by its owner.
- **FR-027c**: The system MUST recompute effective specifications, next-due indicators, and energy economy figures from the latest non-tombstoned revisions whenever an entry is superseded or tombstoned.
- **FR-028**: The system MUST allow a complete Maintenance entry to be saved with no more than five interactions beyond typing field values, counted from the component card.

#### Energy & Fuel Tracking

- **FR-029**: The system MUST record a vehicle's power source as gasoline/diesel, electric, or both, and MUST offer only the applicable energy modes, offering a mode choice for vehicles that are both.
- **FR-030**: A fuel entry MUST capture odometer, volume dispensed, price per unit and/or total cost, fuel grade, an optional station or location label, and a full-versus-partial fill marker.
- **FR-031**: The system MUST derive the third of volume, price per unit, and total cost whenever the other two are supplied, and MUST leave the derived value editable.
- **FR-032**: The system MUST calculate and display distance per unit volume for the interval since the previous full fill, cost per mile, and a running economy trend across recent entries.
- **FR-033**: The system MUST exclude intervals containing a partial fill or a flagged missed fill from economy calculations while still counting their cost, and MUST indicate why an entry has no economy figure.
- **FR-034**: A charging entry MUST capture odometer, starting and ending state of charge as percentages, energy delivered, charging location type (home, work, or public fast charging), an optional location label, and total session cost.
- **FR-035**: The system MUST calculate and display distance per unit energy, energy per unit distance, cost per unit energy, and cost per mile for each charging session, and a running efficiency trend across recent sessions.
- **FR-036**: The system MUST validate that state of charge values fall between 0 and 100 percent, that the ending value is not lower than the starting value, and that energy delivered and volume dispensed are greater than zero.
- **FR-037**: The system MUST record energy entries against the vehicle rather than only the component, so that economy is continuous across fuel-door and charge-port tags.

#### Offline Operation & Sync

- **FR-038**: The system MUST render any previously visited component card, its history, and its specifications while the device has no network connectivity, with a visible stale-data indicator showing when the data was last refreshed.
- **FR-039**: The system MUST accept and locally persist any log entry created while offline, display it immediately in the relevant timeline, and mark it as pending synchronization.
- **FR-040**: The system MUST synchronize pending entries automatically when connectivity is restored, without requiring the user to open a specific screen or press a button.
- **FR-041**: The system MUST guarantee that a retried submission results in exactly one stored entry.
- **FR-042**: The system MUST never discard an unsynchronized entry; entries that repeatedly fail to sync MUST remain locally available and be surfaced to the user with their failure state.
- **FR-043**: The system MUST treat service and energy entries and their revisions as additive, so that everything created independently on multiple devices survives synchronization and no offline edit or delete can discard another device's work.
- **FR-043a**: When two devices independently supersede the same entry, the system MUST retain both revisions in the chain and MUST resolve which one displays by server receipt order rather than by device clock.
- **FR-043b**: For mutable vehicle and component settings that are not entries — nickname, sharing state, component specifications, service intervals — the system MUST apply the change received last by the server and MUST NOT trust device clocks for ordering.
- **FR-044**: The system MUST be installable to a mobile device home screen and MUST launch into the same experience when opened from that icon.

#### Identity, Claiming & Sharing

- **FR-045**: The system MUST bind each tag identifier to exactly one vehicle and one component, owned by exactly one account.
- **FR-046**: The system MUST prevent a claimed tag from being re-bound by anyone other than its current owner, and MUST allow the owner to re-bind a tag identifier to a different component or vehicle without replacing the physical tag.
- **FR-047**: The system MUST authenticate an owner by sending a one-time code or sign-in link to an email address they supply, and MUST NOT require a password at any point.
- **FR-047a**: The system MUST persist the owner's identity on a device across sessions and browser restarts so that repeat scans require no re-authentication, and MUST prompt for authentication only at the first claim performed on that device.
- **FR-047b**: The system MUST allow the same owner to authenticate on additional devices by repeating the email code flow, after which all of their vehicles and history are available on that device.
- **FR-047c**: The system MUST allow an owner to sign out of a device, after which that device MUST retain no readable vehicle data and MUST NOT permit new entries against that owner's vehicles.
- **FR-047d**: The system MUST refuse to sign out while unsynchronized entries are pending, or MUST require explicit confirmation that those entries will be discarded.
- **FR-048**: The system MUST restrict creating, editing, and deleting a vehicle's data to that vehicle's owner.
- **FR-049**: The system MUST default every vehicle's public passport to disabled, and MUST require an explicit owner action to enable it.
- **FR-049a**: Enabling sharing MUST mint a distinct, unguessable share link that is the only address through which a non-owner can read the vehicle, and MUST require no account or sign-in from the guest who opens it.
- **FR-049b**: The vehicle's readable owner-facing address MUST never grant access to a non-owner, whether or not sharing is enabled.
- **FR-050**: A shared passport MUST be strictly read-only, MUST exclude owner identity details, and MUST exclude cost figures unless the owner has explicitly chosen to include them.
- **FR-051**: The system MUST allow the owner to revoke passport sharing at any time, after which the previously issued share link MUST immediately stop granting access and MUST never be reissued.
- **FR-051a**: The system MUST allow the owner to mint a fresh share link after revoking, without affecting any vehicle data.
- **FR-051b**: The system MUST prevent shared passport pages from being indexed by search engines or expanded into link previews that disclose vehicle history.
- **FR-052**: The system MUST support multiple vehicles and multiple tagged components per vehicle under a single account.

#### Component & Vehicle Data

- **FR-053**: The system MUST provide a library of common component types (for example: engine oil system, front and rear differentials, transfer case, transmission, brakes by corner, coolant system, battery, fuel filler, charge port) whose default specification fields pre-populate a newly claimed component.
- **FR-054**: The system MUST allow the owner to create a component that is not in the library and to edit any pre-populated specification.
- **FR-055**: The system MUST store measurements with explicit units and MUST display units alongside every numeric specification and derived metric.

### Key Entities

- **Account**: The person who owns one or more vehicles; holds all write authority over their vehicles' data.
- **Vehicle**: A single vehicle — year, make, model, trim, nickname, identifying number, power source (gasoline/diesel, electric, or both), current odometer, and passport sharing state. Owned by one Account.
- **Component**: A serviceable part or location on a vehicle — display name, component type from the library, and its factory specification set. Belongs to one Vehicle.
- **Component Specification**: A single named, unit-bearing value on a component — a torque figure, a fluid type, a capacity, a tool size, or a part number — with an origin of factory or override.
- **Tag**: A physical NFC tag carrying one opaque, unguessable identifier fixed at manufacture, bound to one Vehicle and one Component, or unbound and awaiting claim. The binding is re-assignable by the owner; the identifier never changes.
- **Service Log**: One recorded event against a Component, of exactly one category (Maintenance, Repair, Replace, Modified/Upgrade), always carrying date, odometer, and notes, plus that category's own fields. Records that supersede a component's factory specifications carry Specification Overrides. A log is expressed as an ordered chain of Revisions; the entry's current state is its latest non-superseded revision.
- **Revision**: One immutable version of a Service Log, Fuel Entry, or Charge Entry, carrying the full field values at that point, its author, when it was written, when the server received it, and whether it is a tombstone marking the entry deleted.
- **Specification Override**: A custom value introduced by a Modified/Upgrade log that supersedes a factory Component Specification, retaining the superseded value for reference.
- **Reminder**: A follow-up obligation — either a re-check created by a Repair log or a next-due derived from a Maintenance interval — expressed in distance and/or time, with an outstanding or completed state.
- **Fuel Entry**: One liquid-fuel fill against a Vehicle — odometer, volume, price, grade, location, and full/partial marker — from which economy and cost per distance are derived.
- **Charge Entry**: One charging session against a Vehicle — odometer, start and end state of charge, energy delivered, charging location type, and cost — from which efficiency and cost per distance are derived.
- **Attachment**: A photo or PDF document (receipt, invoice, manual) associated with a Service Log, carrying its original filename, type, processed size, and upload state. Photos are stored in a compressed form; PDFs are stored as supplied.
- **Passport Share**: A revocable, unguessable link that grants read-only access to one Vehicle's history without requiring the guest to hold an account. Carries whether cost figures are included, when it was minted, and whether it has been revoked. At most one share link is active per Vehicle at a time.
- **Pending Change**: A locally captured entry awaiting synchronization, carrying enough identity to be applied exactly once.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a mid-range phone over a typical mobile connection, tapping a claimed tag presents a fully readable component card — vehicle identity, specifications, and history — within 1 second in 95% of scans.
- **SC-002**: On a repeat visit with no network connectivity, the same card is fully readable within 1 second in 95% of scans.
- **SC-003**: A user wearing mechanic's gloves can record a complete Maintenance entry from tag tap to saved confirmation in under 45 seconds.
- **SC-004**: 95% of first-time users successfully claim a tag and reach a working component card on their first attempt without external instructions.
- **SC-005**: 100% of entries created while offline are present on the server after the device is reconnected for five minutes, with zero duplicates and zero losses across a 100-entry test.
- **SC-006**: Every derived figure — distance per gallon, distance per unit energy, energy per distance, cost per mile — matches hand calculation to within one displayed decimal place across a fixture set covering full fills, partial fills, missed fills, and charging sessions.
- **SC-007**: On a component with an active specification override, 90% of users correctly identify the effective value and recognize it as non-factory in an unprompted comprehension test.
- **SC-008**: All text and essential controls meet a 4.5:1 contrast ratio, and 100% of interactive controls measure at least 48 by 48 device-independent pixels.
- **SC-009**: No service history for a vehicle with sharing disabled is retrievable by any non-owner, verified across every published address for that vehicle.
- **SC-010**: A component card remains readable and usable, with no horizontal scrolling, on screens from 320 to 430 device-independent pixels wide.
- **SC-011**: The application is installable to the home screen and passes standard installability checks on current mobile browsers.
- **SC-012**: An odometer entry that is lower than the last known value is flagged before saving in 100% of cases.
- **SC-013**: Across a test in which two offline devices concurrently edit and delete the same entries, 100% of revisions are retained and every device converges on the same displayed entry state after sync.
- **SC-014**: A receipt photographed with a current phone camera stays legible — its line items and any printed part number readable — after on-device compression, in 95% of a fixture set of receipts and part labels.
- **SC-015**: An entry with five attached photos, captured entirely offline, completes upload within 60 seconds of reconnecting on a typical mobile connection.

---

## Out of Scope (this feature)

- Writing NFC tags from within the application; tags are assumed to be pre-programmed with their addresses.
- Granting edit access to second drivers, family members, or independent shops.
- Transferring vehicle ownership between accounts at point of sale.
- Automatic odometer, diagnostic trouble code, or telematics ingestion from vehicle interfaces.
- Parts catalog lookups, price comparison, or purchasing.
- Shop or dealer-facing multi-customer management.
- Metric-unit presentation and unit conversion.
- Push notifications for reminders; reminders surface in-app only.
- Battery state-of-health estimation beyond the raw session record.
- Native mobile applications distributed through app stores.

---

## Assumptions

- **Users and units**: Primary users are vehicle owners and enthusiasts in the United States. Distances are miles, liquid volume gallons, energy kilowatt-hours, torque foot-pounds, and currency US dollars. Metric presentation is deferred.
- **Identity**: Authentication is a one-time emailed code or sign-in link at the first claim performed on a device, after which the session persists indefinitely on that device. This satisfies both "zero friction" and per-owner data isolation: there is no password to recall while lying under a truck, every scan after the first requires no credential entry, and a lost phone is recovered by repeating the same email flow on a new one. An owner's email address is therefore the account's recovery anchor, and losing access to that inbox means losing account access.
- **Privacy default**: Public passport sharing is off by default and opt-in per vehicle, because a service history exposed by a guessable address would leak an owner's location patterns, spending, and vehicle identity. Sharing is granted through a separate unguessable link rather than by opening up the owner's own readable address, so that revoking after a sale falls through cleanly and the owner's address is never the thing that leaked. Guests need no account, since a buyer inspecting a vehicle at the curb will not sign up. Cost figures are excluded from shared passports unless explicitly included.
- **Tag addresses**: A tag carries only an opaque, unguessable identifier fixed at manufacture, so stock tags can ship uncustomized and any tag can be re-bound if it is peeled off and moved to another component or vehicle. Scanning resolves that identifier and lands the user on a readable vehicle-plus-component address assigned at claim time. Because those readable addresses are human-guessable by design, access control — not address secrecy — is what keeps a vehicle's data private.
- **Component defaults**: Factory specifications come from an editable seeded library of common component types. The system does not claim authoritative manufacturer data; owners may correct any value, and displayed specs are a convenience reference, not a substitute for the service manual.
- **History integrity**: Service and energy entries are strictly append-only. Editing writes a superseding revision and deleting writes a tombstone, so nothing is ever overwritten or erased. This removes the whole class of offline edit conflicts without adjudicating them, and it means a buyer reading a shared passport is looking at a record that cannot be quietly rewritten. The cost is that storage grows with edits and every read resolves the latest revision.
- **Offline scope**: Offline reading is limited to cards the device has previously loaded. Discovering an unvisited card for the first time requires connectivity.
- **Attachments**: Photos and PDF documents are supported, capped at 10 MB per file and 5 files per entry. Photos are compressed on-device before being stored or queued, because an uncompressed phone photo is roughly a hundred times the size of the entry it belongs to and would stall a sync attempted while walking out of a garage. PDFs are passed through unmodified so manuals stay searchable. Attachments created offline queue alongside their entry and upload on any connection type rather than waiting for Wi-Fi.
- **Interval definitions**: Service intervals are owner-configurable per component, seeded with common defaults from the component library.
- **Technology**: The requester has pre-selected the implementation stack and platform. Those choices are deliberately excluded from this specification and are recorded in the implementation plan.

### Dependencies

- A hosted data store with per-owner access enforcement, capable of serving a component card and its history in a single round trip.
- File storage for attachments, with owner-scoped access matching the vehicle's access rules.
- Physical NFC tags pre-programmed at manufacture with an opaque unique identifier, and mobile operating systems that open the tag's address on tap without an installed application.
- Device-local persistent storage sufficient to hold visited cards and pending entries between sessions.
