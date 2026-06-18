import { getMapConfig } from './map';
import type {
  AttackResult,
  EraId,
  FactionId,
  GameEvent,
  GameState,
  PlayerId,
  PlayerState,
  TerritoryId,
  TerritoryState,
  TierSize
} from './types';

const DEFAULT_ROUND_CAP = 12;

// ── Faction definitions ───────────────────────────────────────────────────────

export const FACTIONS: Record<
  FactionId,
  { id: FactionId; name: string; role: string; power: string; description: string; defaultCooldown: number }
> = {
  warband: {
    id: 'warband',
    name: 'Warband',
    role: 'Aggressive',
    power: 'Overwhelm',
    description: 'When active, your attacks force the defender to roll 1 die instead of 2.',
    defaultCooldown: 2
  },
  bastion: {
    id: 'bastion',
    name: 'Bastion',
    role: 'Defensive',
    power: 'Fortify',
    description: 'When active, your highest-unit territory defends with 3 dice instead of 2.',
    defaultCooldown: 1
  },
  merchant: {
    id: 'merchant',
    name: 'Merchant Tribe',
    role: 'Economic',
    power: 'Surplus',
    description: 'When active, gain +1 bonus reinforcement this turn.',
    defaultCooldown: 1
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTerritories(era: EraId, tier: TierSize): Record<TerritoryId, TerritoryState> {
  return getMapConfig(era, tier).territories.reduce(
    (acc, t) => {
      acc[t.id] = { id: t.id, ownerId: null, units: 0 };
      return acc;
    },
    {} as Record<TerritoryId, TerritoryState>
  );
}

function reinforcementsFor(state: GameState, playerId: PlayerId): number {
  const owned = Object.values(state.territories).filter((t) => t.ownerId === playerId).length;
  return Math.max(2, Math.floor(owned / 3));
}

// Whether a player currently holds their assigned target territory.
function holdsTarget(state: GameState, playerId: PlayerId): boolean {
  const targetId = state.targetTerritories[playerId];
  return !!targetId && state.territories[targetId].ownerId === playerId;
}

// Update a player's cooldown at the end of their turn.
function nextCooldown(state: GameState, playerId: PlayerId): number {
  if (holdsTarget(state, playerId)) return 0;
  const faction = state.factions[playerId];
  if (!faction) return 0;
  if (state.factionCooldowns[playerId] === 0) return FACTIONS[faction].defaultCooldown;
  return state.factionCooldowns[playerId] - 1;
}

// Find the territory owned by a player with the highest unit count.
function strongestTerritory(state: GameState, playerId: PlayerId): TerritoryId | null {
  const owned = Object.values(state.territories).filter((t) => t.ownerId === playerId);
  if (owned.length === 0) return null;
  return owned.reduce((max, t) => (t.units > max.units ? t : max)).id;
}

// ── Exported read helpers ─────────────────────────────────────────────────────

export function dominanceScore(state: GameState, playerId: PlayerId): number {
  const owned = Object.values(state.territories).filter((t) => t.ownerId === playerId);
  const units = owned.reduce((sum, t) => sum + t.units, 0);
  return owned.length + Math.floor(units / 4);
}

function winnerByDominance(state: GameState): PlayerId | null {
  const p1 = dominanceScore(state, 'player1');
  const p2 = dominanceScore(state, 'player2');
  if (p1 > p2) return 'player1';
  if (p2 > p1) return 'player2';
  return null;
}

export function isDraftComplete(state: GameState): boolean {
  return Object.values(state.territories).every((territory) => territory.ownerId !== null);
}

export function nextPlayerId(playerId: PlayerId): PlayerId {
  return playerId === 'player1' ? 'player2' : 'player1';
}

// ── Room lifecycle ────────────────────────────────────────────────────────────

export function createRoom(
  roomCode: string,
  host: PlayerState,
  era: EraId = 'stone-age',
  tier: TierSize = 'small'
): GameState {
  const { chokePoints } = getMapConfig(era, tier);
  return {
    roomCode,
    hostSocketId: host.socketId,
    phase: 'lobby',
    currentTurn: null,
    winnerId: null,
    players: [host],
    territories: createTerritories(era, tier),
    draftTurn: null,
    reinforcementsRemaining: 0,
    lastAttack: null,
    selectedTerritoryId: null,
    events: [],
    round: 0,
    roundCap: DEFAULT_ROUND_CAP,
    era,
    tier,
    chokePoints,
    factions: { player1: null, player2: null },
    targetTerritories: { player1: null, player2: null },
    factionCooldowns: { player1: 0, player2: 0 },
    fortifiedTerritoryId: null
  };
}

export function joinRoom(state: GameState, player: PlayerState): GameState {
  if (state.players.length >= 2) {
    throw new Error('Room is full.');
  }

  if (state.phase !== 'lobby') {
    throw new Error('Game already started.');
  }

  const nextPlayers = [...state.players, player];
  return {
    ...state,
    players: nextPlayers,
    phase: 'draft',
    draftTurn: nextPlayers[0].id
  };
}

// ── Faction selection ─────────────────────────────────────────────────────────

export function selectFaction(state: GameState, actorId: PlayerId, factionId: FactionId): GameState {
  if (state.phase !== 'draft') {
    throw new Error('Factions can only be selected before the match starts.');
  }

  const event: GameEvent = { type: 'faction-select', playerId: actorId, factionId };
  return {
    ...state,
    factions: { ...state.factions, [actorId]: factionId },
    events: [...state.events, event]
  };
}

// ── Draft ─────────────────────────────────────────────────────────────────────

export function claimTerritory(state: GameState, actorId: PlayerId, territoryId: TerritoryId): GameState {
  if (state.phase !== 'draft') {
    throw new Error('Draft is not active.');
  }

  if (state.draftTurn !== actorId) {
    throw new Error('It is not your draft turn.');
  }

  if (!state.factions.player1 || !state.factions.player2) {
    throw new Error('Both players must select a faction before the draft begins.');
  }

  const territory = state.territories[territoryId];
  if (territory.ownerId) {
    throw new Error('Territory already claimed.');
  }

  const nextTerritories = {
    ...state.territories,
    [territoryId]: { ...territory, ownerId: actorId, units: 3 }
  };

  const claimedCount = Object.values(nextTerritories).filter((t) => t.ownerId).length;
  const allClaimed = claimedCount === Object.keys(state.territories).length;
  const event: GameEvent = { type: 'claim', playerId: actorId, territoryId };

  return {
    ...state,
    territories: nextTerritories,
    draftTurn: allClaimed ? null : nextPlayerId(actorId),
    selectedTerritoryId: null,
    events: [...state.events, event]
  };
}

// ── Match start ───────────────────────────────────────────────────────────────

export function startGame(
  state: GameState,
  actorSocketId: string,
  roundCap: number = DEFAULT_ROUND_CAP,
  rng: () => number = Math.random
): GameState {
  if (state.hostSocketId !== actorSocketId) {
    throw new Error('Only the host can start the game.');
  }

  if (state.phase !== 'draft') {
    throw new Error('Draft must be complete before starting.');
  }

  if (!roomReady(state)) {
    throw new Error('Two players are required to start.');
  }

  if (!isDraftComplete(state)) {
    throw new Error('All territories must be claimed first.');
  }

  // Assign target territories: each player must capture one of the opponent's current territories.
  const allIds = Object.keys(state.territories);
  const p1Owned = allIds.filter((id) => state.territories[id].ownerId === 'player1');
  const p2Owned = allIds.filter((id) => state.territories[id].ownerId === 'player2');
  const targetTerritories = {
    player1: p2Owned[Math.floor(rng() * p2Owned.length)],
    player2: p1Owned[Math.floor(rng() * p1Owned.length)]
  };

  // All cooldowns start at 0 (power ready from turn 1).
  const factionCooldowns = { player1: 0, player2: 0 };

  // Apply first-turn effects for player1.
  const p1Faction = state.factions.player1;
  let reinforcementsRemaining = reinforcementsFor(state, 'player1');
  if (p1Faction === 'merchant') reinforcementsRemaining += 1;

  let fortifiedTerritoryId: TerritoryId | null = null;
  if (p1Faction === 'bastion') fortifiedTerritoryId = strongestTerritory(state, 'player1');

  return {
    ...state,
    phase: 'active',
    currentTurn: 'player1',
    reinforcementsRemaining,
    round: 1,
    roundCap,
    lastAttack: null,
    targetTerritories,
    factionCooldowns,
    fortifiedTerritoryId,
    events: [...state.events, { type: 'start' }]
  };
}

export function resetGame(state: GameState, actorSocketId: string): GameState {
  if (state.hostSocketId !== actorSocketId) {
    throw new Error('Only the host can reset the game.');
  }

  if (state.phase !== 'finished') {
    throw new Error('Game must be finished before resetting.');
  }

  return {
    ...state,
    phase: 'draft',
    currentTurn: null,
    winnerId: null,
    territories: createTerritories(state.era, state.tier),
    draftTurn: state.players[0].id,
    reinforcementsRemaining: 0,
    round: 0,
    lastAttack: null,
    selectedTerritoryId: null,
    // Reset faction selections — players pick fresh for the rematch.
    factions: { player1: null, player2: null },
    targetTerritories: { player1: null, player2: null },
    factionCooldowns: { player1: 0, player2: 0 },
    fortifiedTerritoryId: null,
    events: [{ type: 'reset' }]
  };
}

// ── Active phase ──────────────────────────────────────────────────────────────

export function selectTerritory(state: GameState, actorId: PlayerId, territoryId: TerritoryId): GameState {
  if (state.phase !== 'active') {
    throw new Error('You can only select territories during an active match.');
  }

  const territory = state.territories[territoryId];
  if (territory.ownerId !== actorId) {
    throw new Error('You can only select your own territory.');
  }

  return { ...state, selectedTerritoryId: territoryId };
}

export function reinforce(state: GameState, actorId: PlayerId, territoryId: TerritoryId): GameState {
  if (state.phase !== 'active' || state.currentTurn !== actorId) {
    throw new Error('It is not your turn.');
  }

  if (state.reinforcementsRemaining <= 0) {
    throw new Error('No reinforcements remaining.');
  }

  const territory = state.territories[territoryId];
  if (territory.ownerId !== actorId) {
    throw new Error('You can only reinforce your own territory.');
  }

  const event: GameEvent = { type: 'reinforce', playerId: actorId, territoryId };

  return {
    ...state,
    territories: {
      ...state.territories,
      [territoryId]: { ...territory, units: territory.units + 1 }
    },
    reinforcementsRemaining: state.reinforcementsRemaining - 1,
    selectedTerritoryId: territoryId,
    events: [...state.events, event]
  };
}

function compareRolls(attackRolls: number[], defendRolls: number[]) {
  let attackLosses = 0;
  let defendLosses = 0;

  for (let i = 0; i < Math.min(attackRolls.length, defendRolls.length); i += 1) {
    if (attackRolls[i] > defendRolls[i]) {
      defendLosses += 1;
    } else {
      attackLosses += 1;
    }
  }

  return { attackLosses, defendLosses };
}

function winnerFromState(territories: Record<TerritoryId, TerritoryState>): PlayerId | null {
  const owners = new Set(
    Object.values(territories)
      .map((t) => t.ownerId)
      .filter((id): id is PlayerId => id !== null)
  );

  return owners.size === 1 ? [...owners][0] : null;
}

export function attack(
  state: GameState,
  actorId: PlayerId,
  from: TerritoryId,
  to: TerritoryId,
  rng: () => number = Math.random
): GameState {
  if (state.phase !== 'active' || state.currentTurn !== actorId) {
    throw new Error('It is not your turn.');
  }

  const attacker = state.territories[from];
  const defender = state.territories[to];

  if (attacker.ownerId !== actorId) {
    throw new Error('You can only attack from your own territory.');
  }

  if (defender.ownerId === actorId || defender.ownerId === null) {
    throw new Error('You must attack an enemy territory.');
  }

  const fromDef = getMapConfig(state.era, state.tier).territories.find((t) => t.id === from);
  if (!fromDef?.adjacent.includes(to)) {
    throw new Error('Territories are not adjacent.');
  }

  if (attacker.units < 2) {
    throw new Error('You need at least 2 units to attack.');
  }

  const powerReady = state.factionCooldowns[actorId] === 0;
  const faction = state.factions[actorId];

  const attackDice = Math.min(3, attacker.units - 1);
  // Warband: defender rolls 1 die instead of 2 when power is active.
  const defendDice = faction === 'warband' && powerReady
    ? Math.min(1, defender.units)
    : Math.min(2, defender.units);

  const attackRolls = Array.from({ length: attackDice }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => b - a);
  const defendRolls = Array.from({ length: defendDice }, () => 1 + Math.floor(rng() * 6)).sort((a, b) => b - a);

  const { attackLosses, defendLosses } = compareRolls(attackRolls, defendRolls);
  const nextAttackerUnits = attacker.units - attackLosses;
  const nextDefenderUnits = defender.units - defendLosses;
  const conquered = nextDefenderUnits <= 0;

  const nextTerritories = {
    ...state.territories,
    [from]: {
      ...attacker,
      units: conquered ? nextAttackerUnits - attackDice : nextAttackerUnits
    },
    [to]: conquered
      ? { ...defender, ownerId: actorId, units: attackDice }
      : { ...defender, units: nextDefenderUnits }
  };

  const winnerId = winnerFromState(nextTerritories);
  const lastAttack: AttackResult = {
    attacker: from,
    defender: to,
    attackRolls,
    defendRolls,
    attackLosses,
    defendLosses,
    conquered,
    winnerId
  };

  const attackEvent: GameEvent = { type: 'attack', attacker: actorId, from, to, conquered };
  const nextEvents = winnerId
    ? [...state.events, attackEvent, { type: 'win' as const, winnerId }]
    : [...state.events, attackEvent];

  return {
    ...state,
    territories: nextTerritories,
    winnerId,
    phase: winnerId ? 'finished' : state.phase,
    lastAttack,
    selectedTerritoryId: from,
    events: nextEvents
  };
}

export function endTurn(state: GameState, actorId: PlayerId): GameState {
  if (state.phase !== 'active' || state.currentTurn !== actorId) {
    throw new Error('It is not your turn.');
  }

  const nextTurn = nextPlayerId(actorId);
  const nextRound = actorId === 'player2' ? state.round + 1 : state.round;
  const endTurnEvent: GameEvent = { type: 'end-turn', playerId: actorId };

  // Update current player's cooldown.
  const updatedCooldowns: Record<PlayerId, number> = {
    ...state.factionCooldowns,
    [actorId]: nextCooldown(state, actorId)
  };

  // Round cap: game ends after player2 completes the final round.
  if (actorId === 'player2' && nextRound > state.roundCap) {
    const winnerId = winnerByDominance(state);
    const endEvent: GameEvent = winnerId ? { type: 'win', winnerId } : { type: 'draw' };
    return {
      ...state,
      phase: 'finished',
      currentTurn: null,
      winnerId,
      round: nextRound,
      reinforcementsRemaining: 0,
      lastAttack: null,
      selectedTerritoryId: null,
      factionCooldowns: updatedCooldowns,
      fortifiedTerritoryId: null,
      events: [...state.events, endTurnEvent, endEvent]
    };
  }

  // Set up the next player's turn with faction power effects.
  const nextFaction = state.factions[nextTurn];
  const nextPowerReady = updatedCooldowns[nextTurn] === 0;

  let reinforcementsRemaining = reinforcementsFor(state, nextTurn);
  // Merchant Tribe: +1 bonus reinforcement when power is active.
  if (nextFaction === 'merchant' && nextPowerReady) reinforcementsRemaining += 1;

  // Bastion: fortify the strongest territory when power is active.
  let fortifiedTerritoryId: TerritoryId | null = null;
  if (nextFaction === 'bastion' && nextPowerReady) {
    fortifiedTerritoryId = strongestTerritory(state, nextTurn);
  }

  return {
    ...state,
    currentTurn: nextTurn,
    reinforcementsRemaining,
    round: nextRound,
    lastAttack: null,
    selectedTerritoryId: null,
    factionCooldowns: updatedCooldowns,
    fortifiedTerritoryId,
    events: [...state.events, endTurnEvent]
  };
}

// ── Utility exports ───────────────────────────────────────────────────────────

export function getPlayerIdBySocket(state: GameState, socketId: string): PlayerId | null {
  return state.players.find((player) => player.socketId === socketId)?.id ?? null;
}

export function roomReady(state: GameState): boolean {
  return state.players.length === 2;
}

export function territoryLabel(state: GameState, territoryId: TerritoryId): string {
  return getMapConfig(state.era, state.tier).territories.find((t) => t.id === territoryId)?.label ?? territoryId;
}
