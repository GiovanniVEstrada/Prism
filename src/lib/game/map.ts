import type { TerritoryDefinition, TerritoryId } from './types';

// 12-territory Stone Age map.
// Three horizontal belts (north / central / south) connected by choke points.
// Bone Ridge and Great Rift are the central choke territories.
// Corners (Frost Peaks, Ochre Bluffs, Ash Marsh, Amber Plains, Salt Flat) are
// defensible but hard to break out from, rewarding early central control.
export const STONE_AGE_MAP: TerritoryDefinition[] = [
  // ── North belt ───────────────────────────────────────────────────────────
  {
    id: 'frost-peaks',
    label: 'Frost Peaks',
    x: 12,
    y: 12,
    adjacent: ['wolf-den', 'bone-ridge']
  },
  {
    id: 'wolf-den',
    label: 'Wolf Den',
    x: 36,
    y: 8,
    adjacent: ['frost-peaks', 'thunder-mesa', 'bone-ridge']
  },
  {
    id: 'thunder-mesa',
    label: 'Thunder Mesa',
    x: 62,
    y: 10,
    adjacent: ['wolf-den', 'ochre-bluffs', 'great-rift']
  },
  {
    id: 'ochre-bluffs',
    label: 'Ochre Bluffs',
    x: 84,
    y: 18,
    adjacent: ['thunder-mesa', 'red-gorge']
  },
  // ── Central belt (choke points) ──────────────────────────────────────────
  {
    id: 'bone-ridge',
    label: 'Bone Ridge',
    x: 22,
    y: 40,
    adjacent: ['frost-peaks', 'wolf-den', 'great-rift', 'ash-marsh', 'river-delta']
  },
  {
    id: 'great-rift',
    label: 'Great Rift',
    x: 50,
    y: 42,
    adjacent: ['thunder-mesa', 'bone-ridge', 'red-gorge', 'river-delta', 'ember-steppe']
  },
  {
    id: 'red-gorge',
    label: 'Red Gorge',
    x: 76,
    y: 38,
    adjacent: ['ochre-bluffs', 'great-rift', 'amber-plains']
  },
  // ── South belt ───────────────────────────────────────────────────────────
  {
    id: 'ash-marsh',
    label: 'Ash Marsh',
    x: 10,
    y: 65,
    adjacent: ['bone-ridge', 'river-delta']
  },
  {
    id: 'river-delta',
    label: 'River Delta',
    x: 34,
    y: 68,
    adjacent: ['ash-marsh', 'bone-ridge', 'great-rift', 'ember-steppe', 'salt-flat']
  },
  {
    id: 'ember-steppe',
    label: 'Ember Steppe',
    x: 60,
    y: 65,
    adjacent: ['great-rift', 'river-delta', 'salt-flat', 'amber-plains']
  },
  {
    id: 'amber-plains',
    label: 'Amber Plains',
    x: 84,
    y: 62,
    adjacent: ['red-gorge', 'ember-steppe']
  },
  {
    id: 'salt-flat',
    label: 'Salt Flat',
    x: 46,
    y: 85,
    adjacent: ['river-delta', 'ember-steppe']
  }
];

export const STONE_AGE_TERRITORIES = STONE_AGE_MAP.map((territory) => territory.id);

export function isAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  const territory = STONE_AGE_MAP.find((entry) => entry.id === a);
  return territory?.adjacent.includes(b) ?? false;
}
