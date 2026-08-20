-- Seeds the component template library so a newly claimed tag has a useful mechanics HUD before any manual data entry (FR-053).
--
-- These are convenience defaults, not authoritative manufacturer data. Owners can
-- correct any value (FR-054), and the specs are COPIED into component_specs at
-- claim time so a later correction here never rewrites an owner's own record.

insert into public.component_templates
  (key, display_name, default_interval_miles, default_interval_days, is_energy_port, energy_mode_hint, sort_order, default_specs)
values
  ('engine-oil', 'Engine Oil & Filter', 5000, 180, false, null, 10, '[
     {"spec_key":"drain_plug_tool",   "kind":"tool",        "label":"Drain plug",      "value":"15mm socket",           "unit":null,     "sort_order":1},
     {"spec_key":"drain_plug_torque", "kind":"torque",      "label":"Drain plug torque","value":"25",                   "unit":"ft-lbs", "sort_order":2},
     {"spec_key":"filter_tool",       "kind":"tool",        "label":"Filter housing",  "value":"36mm cap wrench",       "unit":null,     "sort_order":3},
     {"spec_key":"fluid",             "kind":"fluid",       "label":"Oil",             "value":"5W-20 Full Synthetic",  "unit":null,     "sort_order":4},
     {"spec_key":"capacity",          "kind":"capacity",    "label":"Capacity",        "value":"6.0",                   "unit":"qt",     "sort_order":5},
     {"spec_key":"filter_part",       "kind":"part_number", "label":"Filter part #",   "value":"FL-500S",               "unit":null,     "sort_order":6}
   ]'::jsonb),

  ('front-differential', 'Front Differential', 30000, 730, false, null, 20, '[
     {"spec_key":"drain_plug_tool",   "kind":"tool",     "label":"Drain plug", "value":"3/8\" square drive",       "unit":null,     "sort_order":1},
     {"spec_key":"drain_plug_torque", "kind":"torque",   "label":"Drain torque","value":"24",                      "unit":"ft-lbs", "sort_order":2},
     {"spec_key":"fill_plug_tool",    "kind":"tool",     "label":"Fill plug",  "value":"13mm socket",              "unit":null,     "sort_order":3},
     {"spec_key":"fill_plug_torque",  "kind":"torque",   "label":"Fill torque","value":"24",                       "unit":"ft-lbs", "sort_order":4},
     {"spec_key":"fluid",             "kind":"fluid",    "label":"Fluid",      "value":"75W-90 Synthetic Gear Oil", "unit":null,     "sort_order":5},
     {"spec_key":"capacity",          "kind":"capacity", "label":"Capacity",   "value":"2.1",                       "unit":"qt",     "sort_order":6}
   ]'::jsonb),

  ('rear-differential', 'Rear Differential', 30000, 730, false, null, 30, '[
     {"spec_key":"drain_plug_tool",   "kind":"tool",     "label":"Drain plug", "value":"1/2\" square drive",        "unit":null,     "sort_order":1},
     {"spec_key":"drain_plug_torque", "kind":"torque",   "label":"Drain torque","value":"30",                       "unit":"ft-lbs", "sort_order":2},
     {"spec_key":"fluid",             "kind":"fluid",    "label":"Fluid",      "value":"75W-140 Synthetic Gear Oil","unit":null,     "sort_order":3},
     {"spec_key":"capacity",          "kind":"capacity", "label":"Capacity",   "value":"3.5",                        "unit":"qt",     "sort_order":4}
   ]'::jsonb),

  ('transfer-case', 'Transfer Case', 60000, 1095, false, null, 40, '[
     {"spec_key":"fill_plug_tool", "kind":"tool",     "label":"Fill plug", "value":"3/8\" square drive", "unit":null, "sort_order":1},
     {"spec_key":"fluid",          "kind":"fluid",    "label":"Fluid",     "value":"ATF MERCON LV",      "unit":null, "sort_order":2},
     {"spec_key":"capacity",       "kind":"capacity", "label":"Capacity",  "value":"1.5",                "unit":"qt", "sort_order":3}
   ]'::jsonb),

  ('transmission', 'Transmission', 60000, 1095, false, null, 50, '[
     {"spec_key":"fluid",    "kind":"fluid",    "label":"Fluid",    "value":"MERCON LV ATF", "unit":null, "sort_order":1},
     {"spec_key":"capacity", "kind":"capacity", "label":"Capacity", "value":"13.1",          "unit":"qt", "sort_order":2}
   ]'::jsonb),

  ('brakes-front-left', 'Brakes — Front Left', 25000, 730, false, null, 60, '[
     {"spec_key":"caliper_tool",   "kind":"tool",        "label":"Caliper bolts",  "value":"21mm socket", "unit":null,     "sort_order":1},
     {"spec_key":"caliper_torque", "kind":"torque",      "label":"Caliper torque", "value":"85",          "unit":"ft-lbs", "sort_order":2},
     {"spec_key":"lug_torque",     "kind":"torque",      "label":"Lug nut torque", "value":"150",         "unit":"ft-lbs", "sort_order":3},
     {"spec_key":"pad_part",       "kind":"part_number", "label":"Pad set part #", "value":"—",           "unit":null,     "sort_order":4}
   ]'::jsonb),

  ('brakes-front-right', 'Brakes — Front Right', 25000, 730, false, null, 61, '[
     {"spec_key":"caliper_torque", "kind":"torque", "label":"Caliper torque", "value":"85",  "unit":"ft-lbs", "sort_order":1},
     {"spec_key":"lug_torque",     "kind":"torque", "label":"Lug nut torque", "value":"150", "unit":"ft-lbs", "sort_order":2}
   ]'::jsonb),

  ('brakes-rear-left', 'Brakes — Rear Left', 25000, 730, false, null, 62, '[
     {"spec_key":"caliper_torque", "kind":"torque", "label":"Caliper torque", "value":"65",  "unit":"ft-lbs", "sort_order":1},
     {"spec_key":"lug_torque",     "kind":"torque", "label":"Lug nut torque", "value":"150", "unit":"ft-lbs", "sort_order":2}
   ]'::jsonb),

  ('brakes-rear-right', 'Brakes — Rear Right', 25000, 730, false, null, 63, '[
     {"spec_key":"caliper_torque", "kind":"torque", "label":"Caliper torque", "value":"65",  "unit":"ft-lbs", "sort_order":1},
     {"spec_key":"lug_torque",     "kind":"torque", "label":"Lug nut torque", "value":"150", "unit":"ft-lbs", "sort_order":2}
   ]'::jsonb),

  ('coolant', 'Cooling System', 60000, 1825, false, null, 70, '[
     {"spec_key":"fluid",    "kind":"fluid",    "label":"Coolant",  "value":"Orange OAT (Motorcraft VC-3)", "unit":null, "sort_order":1},
     {"spec_key":"capacity", "kind":"capacity", "label":"Capacity", "value":"18.0",                          "unit":"qt", "sort_order":2}
   ]'::jsonb),

  ('battery', '12V Battery', null, 1460, false, null, 80, '[
     {"spec_key":"terminal_tool",   "kind":"tool",        "label":"Terminals",     "value":"10mm socket", "unit":null,     "sort_order":1},
     {"spec_key":"hold_down_torque","kind":"torque",      "label":"Hold-down",     "value":"9",           "unit":"ft-lbs", "sort_order":2},
     {"spec_key":"group_size",      "kind":"part_number", "label":"Group size",    "value":"H7 / 94R",    "unit":null,     "sort_order":3}
   ]'::jsonb),

  ('fuel-door', 'Fuel Filler', null, null, true, 'fuel', 90, '[
     {"spec_key":"fuel_grade",  "kind":"fluid",    "label":"Recommended grade", "value":"91 Octane", "unit":null,  "sort_order":1},
     {"spec_key":"tank_capacity","kind":"capacity","label":"Tank capacity",     "value":"36.0",      "unit":"gal", "sort_order":2}
   ]'::jsonb),

  ('charge-port', 'EV Charge Port', null, null, true, 'charge', 91, '[
     {"spec_key":"connector",     "kind":"part_number", "label":"Connector",      "value":"NACS",  "unit":null, "sort_order":1},
     {"spec_key":"pack_capacity", "kind":"capacity",    "label":"Usable capacity","value":"98.0",  "unit":"kWh","sort_order":2},
     {"spec_key":"max_ac_rate",   "kind":"capacity",    "label":"Max AC rate",    "value":"11.5",  "unit":"kW", "sort_order":3}
   ]'::jsonb)
on conflict (key) do nothing;
