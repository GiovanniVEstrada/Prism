import { STONE_AGE_MAP, STONE_AGE_TERRITORIES, isAdjacent } from './map';
import type {
  AttackResult,
  GameState,
  PlayerId,
  PlayerState,
  TerritoryId,
  TerritoryState
} from './types';

const INITIAL_DRAFT_UNITS = 3;
const TURN_REINFORCEMENTS = 1;

function createTerritories(): Record<TerritoryId, TerritoryState> {
  return STONE_AGE_TERRITORIES.reduce(
    (territories, id) => {
      territories[id] = { id, ownerId: null, units: 0 };
      return territories;
    },
    {} as Record<TerritoryId, TerritoryState>
  );
}

export function isDraftComplete(state: GameState): boolean {
  return Object.values(state.territories).every((territory) => territory.ownerId !== null);
}

export function nextPlayerId(playerId: PlayerId): PlayerId {
  return playerId === 'player1' ? 'player2' : 'player1';
}

export function createRoom(roomCode: string, host: PlayerState): GameState {
  return {
    roomCode,
    hostSocketId: host.socketId,
    phase: 'lobby',
    currentTurn: null,
    winnerId: null,
    players: [host],
    territories: createTerritories(),
    draftTurn: null,
    reinforcementsRemaining: 0,
    lastAttack: null,
    selectedTerritoryId: null
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

export function claimTerritory(state: GameState, actorId: PlayerId, territoryId: TerritoryId): GameState {
  if (state.phase !== 'draft') {
    throw new Error('Draft is not active.');
  }

  if (state.draftTurn !== actorId) {
    throw new Error('It is not your draft turn.');
  }

  const territory = state.territories[territoryId];
  if (territory.ownerId) {
    throw new Error('Territory already claimed.');
  }

  const nextTerritories = {
    ...state.territories,
    [territoryId]: {
      ...territory,
      ownerId: actorId,
      units: INITIAL_DRAFT_UNITS
    }
  };

  const claimedCount = Object.values(nextTerritories).filter((entry) => entry.ownerId).length;
  const allClaimed = claimedCount === STONE_AGE_TERRITORIES.length;
  const nextDraftTurn = nextPlayerId(actorId);

  return {
    ...state,
    territories: nextTerritories,
    draftTurn: allClaimed ? null : nextDraftTurn,
    selectedTerritoryId: territoryId
  };
}

export function startGame(state: GameState, actorSocketId: string): GameState {
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

  return {
    ...state,
    phase: 'active',
    currentTurn: 'player1',
    reinforcementsRemaining: TURN_REINFORCEMENTS,
    lastAttack: null
  };
}

export function selectTerritory(state: GameState, actorId: PlayerId, territoryId: TerritoryId): GameState {
  if (state.phase !== 'active') {
    throw new Error('You can only select territories during an active match.');
  }

  const territory = state.territories[territoryId];
  if (territory.ownerId !== actorId) {
    throw new Error('You can only select your own territory.');
  }

  return {
    ...state,
    selectedTerritoryId: territoryId
  };
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

  return {
    ...state,
    territories: {
      ...state.territories,
      [territoryId]: {
        ...territory,
        units: territory.units + 1
      }
    },
    reinforcementsRemaining: state.reinforcementsRemaining - 1,
    selectedTerritoryId: territoryId
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
      .map((territory) => territory.ownerId)
      .filter((ownerId): ownerId is PlayerId => ownerId !== null)
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

  if (!isAdjacent(from, to)) {
    throw new Error('Territories are not adjacent.');
  }

  if (attacker.units < 2) {
    throw new Error('You need at least 2 units to attack.');
  }

  const attackDice = Math.min(3, attacker.units - 1);
  const defendDice = Math.min(2, defender.units);
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
      units: conquered ? nextAttackerUnits - 1 : nextAttackerUnits
    },
    [to]: conquered
      ? {
          ...defender,
          ownerId: actorId,
          units: 1
        }
      : {
          ...defender,
          units: nextDefenderUnits
        }
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

  return {
    ...state,
    territories: nextTerritories,
    winnerId,
    phase: winnerId ? 'finished' : state.phase,
    lastAttack,
    selectedTerritoryId: from
  };
}

export function endTurn(state: GameState, actorId: PlayerId): GameState {
  if (state.phase !== 'active' || state.currentTurn !== actorId) {
    throw new Error('It is not your turn.');
  }

  const nextTurn = nextPlayerId(actorId);

  return {
    ...state,
    currentTurn: nextTurn,
    reinforcementsRemaining: TURN_REINFORCEMENTS,
    lastAttack: null,
    selectedTerritoryId: null
  };
}

export function getPlayerIdBySocket(state: GameState, socketId: string): PlayerId | null {
  return state.players.find((player) => player.socketId === socketId)?.id ?? null;
}

export function roomReady(state: GameState): boolean {
  return state.players.length === 2;
}

export function territoryLabel(territoryId: TerritoryId): string {
  return STONE_AGE_MAP.find((territory) => territory.id === territoryId)?.label ?? territoryId;
}
