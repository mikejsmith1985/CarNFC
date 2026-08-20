// Reads the seeded catalogue of parts a vehicle can be given.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComponentTemplateSummary } from '@/lib/claim/compatibility'

export interface ComponentLibraryEntry extends ComponentTemplateSummary {
  /** The order the catalogue is meant to be read in, engine bay outwards. */
  sortOrder: number
}

/**
 * Every part in the seeded library, in catalogue order.
 *
 * Read in one place because three screens now offer parts — the claim wizard,
 * the vehicle page and a zone badge — and a catalogue that differed between
 * them would let the same part be created twice under two names.
 */
export async function loadComponentLibrary(
  supabase: SupabaseClient,
): Promise<ComponentLibraryEntry[]> {
  const { data } = await supabase
    .from('component_templates')
    .select('key, display_name, is_energy_port, energy_mode_hint, sort_order')
    .order('sort_order', { ascending: true })

  return (data ?? []).map((row) => ({
    key: row.key as string,
    displayName: row.display_name as string,
    isEnergyPort: row.is_energy_port as boolean,
    energyModeHint: row.energy_mode_hint as 'fuel' | 'charge' | null,
    sortOrder: row.sort_order as number,
  }))
}
