import type { EraId, TerritoryDefinition, TerritoryId, TierSize } from './types';

export interface MapConfig {
  era: EraId;
  tier: TierSize;
  label: string;
  territories: TerritoryDefinition[];
  chokePoints: TerritoryId[];
  regionLabels: Array<{ label: string; x: number; y: number }>;
}

// ── Stone Age — Small (12 territories) ──────────────────────────────────────
// Three horizontal belts connected by two choke points.

const STONE_AGE_SMALL: MapConfig = {
  era: 'stone-age',
  tier: 'small',
  label: 'Stone Age — Small',
  chokePoints: ['bone-ridge', 'great-rift'],
  regionLabels: [
    { label: 'North',   x: 1, y: 2  },
    { label: 'Central', x: 1, y: 33 },
    { label: 'South',   x: 1, y: 58 }
  ],
  territories: [
    // North belt
    { id: 'frost-peaks',   label: 'Frost Peaks',   x: 12, y: 12, adjacent: ['wolf-den', 'bone-ridge'] },
    { id: 'wolf-den',      label: 'Wolf Den',       x: 36, y:  8, adjacent: ['frost-peaks', 'thunder-mesa', 'bone-ridge'] },
    { id: 'thunder-mesa',  label: 'Thunder Mesa',   x: 62, y: 10, adjacent: ['wolf-den', 'ochre-bluffs', 'great-rift'] },
    { id: 'ochre-bluffs',  label: 'Ochre Bluffs',   x: 84, y: 18, adjacent: ['thunder-mesa', 'red-gorge'] },
    // Central belt — choke points
    { id: 'bone-ridge',    label: 'Bone Ridge',     x: 22, y: 40, adjacent: ['frost-peaks', 'wolf-den', 'great-rift', 'ash-marsh', 'river-delta'] },
    { id: 'great-rift',    label: 'Great Rift',     x: 50, y: 42, adjacent: ['thunder-mesa', 'bone-ridge', 'red-gorge', 'river-delta', 'ember-steppe'] },
    { id: 'red-gorge',     label: 'Red Gorge',      x: 76, y: 38, adjacent: ['ochre-bluffs', 'great-rift', 'amber-plains'] },
    // South belt
    { id: 'ash-marsh',     label: 'Ash Marsh',      x: 10, y: 65, adjacent: ['bone-ridge', 'river-delta'] },
    { id: 'river-delta',   label: 'River Delta',    x: 34, y: 68, adjacent: ['ash-marsh', 'bone-ridge', 'great-rift', 'ember-steppe', 'salt-flat'] },
    { id: 'ember-steppe',  label: 'Ember Steppe',   x: 60, y: 65, adjacent: ['great-rift', 'river-delta', 'salt-flat', 'amber-plains'] },
    { id: 'amber-plains',  label: 'Amber Plains',   x: 84, y: 62, adjacent: ['red-gorge', 'ember-steppe'] },
    { id: 'salt-flat',     label: 'Salt Flat',      x: 46, y: 85, adjacent: ['river-delta', 'ember-steppe'] }
  ]
};

// ── Stone Age — Medium (18 territories) ─────────────────────────────────────
// North Arc + Highlands form the main continent. Three choke passes separate
// them from the south. Granite Pass is the sole gateway to the western
// peninsula (mud-shore → silt-reach dead-end). Sea Gate is the sole bridge to
// the eastern island cluster (amber-isle / coral-shelf / drift-shallows).

const STONE_AGE_MEDIUM: MapConfig = {
  era: 'stone-age',
  tier: 'medium',
  label: 'Stone Age — Medium',
  chokePoints: ['granite-pass', 'great-rift', 'sea-gate'],
  regionLabels: [
    { label: 'North',     x: 1, y: 2  },
    { label: 'Highlands', x: 1, y: 20 },
    { label: 'The Pass',  x: 1, y: 41 },
    { label: 'Lowlands',  x: 1, y: 60 }
  ],
  territories: [
    // North Arc (4)
    { id: 'frost-spire',    label: 'Frost Spire',    x: 10, y:  8, adjacent: ['iron-tundra', 'bone-canyon'] },
    { id: 'iron-tundra',    label: 'Iron Tundra',    x: 30, y:  7, adjacent: ['frost-spire', 'storm-ridge', 'bone-canyon', 'cave-falls'] },
    { id: 'storm-ridge',    label: 'Storm Ridge',    x: 58, y:  7, adjacent: ['iron-tundra', 'wolf-run', 'cave-falls', 'sapphire-peaks'] },
    { id: 'wolf-run',       label: 'Wolf Run',       x: 82, y:  9, adjacent: ['storm-ridge', 'sapphire-peaks', 'ochre-bluff'] },
    // Highlands (4)
    { id: 'bone-canyon',    label: 'Bone Canyon',    x: 14, y: 26, adjacent: ['frost-spire', 'iron-tundra', 'cave-falls', 'granite-pass'] },
    { id: 'cave-falls',     label: 'Cave Falls',     x: 40, y: 25, adjacent: ['iron-tundra', 'storm-ridge', 'bone-canyon', 'sapphire-peaks', 'great-rift'] },
    { id: 'sapphire-peaks', label: 'Sapphire Peaks', x: 64, y: 24, adjacent: ['storm-ridge', 'wolf-run', 'cave-falls', 'ochre-bluff', 'great-rift', 'sea-gate'] },
    { id: 'ochre-bluff',    label: 'Ochre Bluff',    x: 86, y: 26, adjacent: ['wolf-run', 'sapphire-peaks', 'sea-gate'] },
    // The Pass — choke points (3)
    { id: 'granite-pass',   label: 'Granite Pass',   x: 22, y: 47, adjacent: ['bone-canyon', 'great-rift', 'mud-shore', 'tar-pits'] },
    { id: 'great-rift',     label: 'Great Rift',     x: 52, y: 45, adjacent: ['cave-falls', 'sapphire-peaks', 'granite-pass', 'sea-gate', 'tar-pits', 'salt-flat'] },
    { id: 'sea-gate',       label: 'Sea Gate',       x: 80, y: 46, adjacent: ['sapphire-peaks', 'ochre-bluff', 'great-rift', 'amber-isle'] },
    // Lowlands (2)
    { id: 'tar-pits',       label: 'Tar Pits',       x: 34, y: 68, adjacent: ['granite-pass', 'great-rift', 'salt-flat'] },
    { id: 'salt-flat',      label: 'Salt Flat',      x: 56, y: 66, adjacent: ['great-rift', 'tar-pits'] },
    // West Peninsula (2) — sole entry: granite-pass
    { id: 'mud-shore',      label: 'Mud Shore',      x:  8, y: 68, adjacent: ['granite-pass', 'silt-reach'] },
    { id: 'silt-reach',     label: 'Silt Reach',     x:  8, y: 84, adjacent: ['mud-shore'] },
    // East Island (3) — sole bridge: sea-gate
    { id: 'amber-isle',     label: 'Amber Isle',     x: 76, y: 63, adjacent: ['sea-gate', 'coral-shelf', 'drift-shallows'] },
    { id: 'coral-shelf',    label: 'Coral Shelf',    x: 90, y: 66, adjacent: ['amber-isle', 'drift-shallows'] },
    { id: 'drift-shallows', label: 'Drift Shallows', x: 84, y: 82, adjacent: ['amber-isle', 'coral-shelf'] }
  ]
};

// ── Stone Age — Large (24 territories) ──────────────────────────────────────
// Two separate continents: Northwest Reach (6) and Northeast Crest (6).
// They share NO direct connection — the only crossing is through the four
// choke passes that span the middle of the map in a chain.
// Below the passes: a contested southern mainland (3) plus two dead-end island
// pairs (west: mist-key/storm-key via granite-pass; east: drift-isle/pearl-bar
// via iron-ford) and a solitary central atoll whose sole connection is grey-silt.

const STONE_AGE_LARGE: MapConfig = {
  era: 'stone-age',
  tier: 'large',
  label: 'Stone Age — Large',
  chokePoints: ['granite-pass', 'bone-arch', 'great-breach', 'iron-ford'],
  regionLabels: [
    { label: 'North',     x: 1, y: 2  },
    { label: 'Highlands', x: 1, y: 17 },
    { label: 'The Pass',  x: 1, y: 35 },
    { label: 'South',     x: 1, y: 54 }
  ],
  territories: [
    // Northwest Reach (6) ─────────────────────────────────────────────────────
    { id: 'frost-crown',  label: 'Frost Crown',  x:  8, y:  7, adjacent: ['iron-shelf', 'chalk-hollow'] },
    { id: 'iron-shelf',   label: 'Iron Shelf',   x: 20, y:  6, adjacent: ['frost-crown', 'wolf-ridge', 'chalk-hollow', 'bone-mire'] },
    { id: 'wolf-ridge',   label: 'Wolf Ridge',   x: 34, y:  8, adjacent: ['iron-shelf', 'bone-mire', 'tide-hold'] },
    { id: 'chalk-hollow', label: 'Chalk Hollow', x:  8, y: 24, adjacent: ['frost-crown', 'iron-shelf', 'bone-mire', 'granite-pass'] },
    { id: 'bone-mire',    label: 'Bone Mire',    x: 20, y: 22, adjacent: ['iron-shelf', 'wolf-ridge', 'chalk-hollow', 'tide-hold', 'granite-pass', 'bone-arch'] },
    { id: 'tide-hold',    label: 'Tide Hold',    x: 34, y: 24, adjacent: ['wolf-ridge', 'bone-mire', 'bone-arch'] },
    // Northeast Crest (6) ─────────────────────────────────────────────────────
    { id: 'storm-peak',   label: 'Storm Peak',   x: 58, y:  8, adjacent: ['thunder-way', 'sapphire-run'] },
    { id: 'thunder-way',  label: 'Thunder Way',  x: 72, y:  6, adjacent: ['storm-peak', 'ember-crag', 'sapphire-run', 'ochre-gate'] },
    { id: 'ember-crag',   label: 'Ember Crag',   x: 86, y:  7, adjacent: ['thunder-way', 'ochre-gate', 'red-spire'] },
    { id: 'sapphire-run', label: 'Sapphire Run', x: 58, y: 22, adjacent: ['storm-peak', 'thunder-way', 'ochre-gate', 'great-breach'] },
    { id: 'ochre-gate',   label: 'Ochre Gate',   x: 72, y: 24, adjacent: ['thunder-way', 'ember-crag', 'sapphire-run', 'red-spire', 'great-breach', 'iron-ford'] },
    { id: 'red-spire',    label: 'Red Spire',    x: 86, y: 22, adjacent: ['ember-crag', 'ochre-gate', 'iron-ford'] },
    // The Pass — choke chain (4) ──────────────────────────────────────────────
    // Sole crossing between the two continents. Forms a linked chain west→east.
    { id: 'granite-pass', label: 'Granite Pass', x: 14, y: 42, adjacent: ['chalk-hollow', 'bone-mire', 'bone-arch', 'tar-flats', 'mist-key'] },
    { id: 'bone-arch',    label: 'Bone Arch',    x: 34, y: 40, adjacent: ['bone-mire', 'tide-hold', 'granite-pass', 'great-breach', 'tar-flats', 'grey-silt'] },
    { id: 'great-breach', label: 'Great Breach', x: 58, y: 40, adjacent: ['sapphire-run', 'ochre-gate', 'bone-arch', 'iron-ford', 'grey-silt', 'amber-shore'] },
    { id: 'iron-ford',    label: 'Iron Ford',    x: 78, y: 42, adjacent: ['ochre-gate', 'red-spire', 'great-breach', 'amber-shore', 'drift-isle'] },
    // South Mainland (3) ──────────────────────────────────────────────────────
    { id: 'tar-flats',    label: 'Tar Flats',    x: 22, y: 62, adjacent: ['granite-pass', 'bone-arch', 'grey-silt'] },
    { id: 'grey-silt',    label: 'Grey Silt',    x: 46, y: 60, adjacent: ['bone-arch', 'great-breach', 'tar-flats', 'amber-shore', 'sunken-atoll'] },
    { id: 'amber-shore',  label: 'Amber Shore',  x: 68, y: 62, adjacent: ['great-breach', 'iron-ford', 'grey-silt'] },
    // West Island (2) — sole bridge: granite-pass ─────────────────────────────
    { id: 'mist-key',     label: 'Mist Key',     x:  8, y: 64, adjacent: ['granite-pass', 'storm-key'] },
    { id: 'storm-key',    label: 'Storm Key',    x:  8, y: 80, adjacent: ['mist-key'] },
    // East Island (2) — sole bridge: iron-ford ───────────────────────────────
    { id: 'drift-isle',   label: 'Drift Isle',   x: 88, y: 64, adjacent: ['iron-ford', 'pearl-bar'] },
    { id: 'pearl-bar',    label: 'Pearl Bar',    x: 88, y: 80, adjacent: ['drift-isle'] },
    // Central Atoll (1) — sole connection: grey-silt ─────────────────────────
    { id: 'sunken-atoll', label: 'Sunken Atoll', x: 46, y: 80, adjacent: ['grey-silt'] }
  ]
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const ALL_MAPS: MapConfig[] = [STONE_AGE_SMALL, STONE_AGE_MEDIUM, STONE_AGE_LARGE];

export function getMapConfig(era: EraId, tier: TierSize): MapConfig {
  const config = ALL_MAPS.find((m) => m.era === era && m.tier === tier);
  if (!config) throw new Error(`Map not found: ${era} ${tier}`);
  return config;
}

export function isAvailable(era: EraId, tier: TierSize): boolean {
  return ALL_MAPS.some((m) => m.era === era && m.tier === tier);
}
