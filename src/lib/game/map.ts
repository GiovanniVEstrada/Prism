import type { TerritoryDefinition, TerritoryId } from './types';

export const STONE_AGE_MAP: TerritoryDefinition[] = [
  {
    id: 'cave-of-echoes',
    label: 'Cave of Echoes',
    x: 8,
    y: 20,
    adjacent: ['river-plain', 'obsidian-ridge']
  },
  {
    id: 'river-plain',
    label: 'River Plain',
    x: 36,
    y: 18,
    adjacent: ['cave-of-echoes', 'obsidian-ridge', 'mammoth-steppe']
  },
  {
    id: 'obsidian-ridge',
    label: 'Obsidian Ridge',
    x: 23,
    y: 42,
    adjacent: ['cave-of-echoes', 'river-plain', 'ember-forest', 'sun-basin']
  },
  {
    id: 'mammoth-steppe',
    label: 'Mammoth Steppe',
    x: 63,
    y: 22,
    adjacent: ['river-plain', 'ember-forest']
  },
  {
    id: 'ember-forest',
    label: 'Ember Forest',
    x: 56,
    y: 56,
    adjacent: ['mammoth-steppe', 'obsidian-ridge', 'sun-basin']
  },
  {
    id: 'sun-basin',
    label: 'Sun Basin',
    x: 29,
    y: 72,
    adjacent: ['obsidian-ridge', 'ember-forest']
  }
];

export const STONE_AGE_TERRITORIES = STONE_AGE_MAP.map((territory) => territory.id);

export function isAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  const territory = STONE_AGE_MAP.find((entry) => entry.id === a);
  return territory?.adjacent.includes(b) ?? false;
}

