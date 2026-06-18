export type PlayerId = 'player1' | 'player2';

export type BotDifficulty = 'passive' | 'aggressive';

export type FactionId = 'warband' | 'bastion' | 'merchant';

export type Phase = 'lobby' | 'draft' | 'active' | 'finished';

export type TerritoryId = string;

export type EraId = 'stone-age';

export type TierSize = 'small' | 'medium' | 'large';

export interface TerritoryState {
  id: TerritoryId;
  ownerId: PlayerId | null;
  units: number;
}

export interface TerritoryDefinition {
  id: TerritoryId;
  label: string;
  x: number;
  y: number;
  adjacent: TerritoryId[];
}

export interface PlayerState {
  id: PlayerId;
  socketId: string;
  name: string;
}

export interface AttackResult {
  attacker: TerritoryId;
  defender: TerritoryId;
  attackRolls: number[];
  defendRolls: number[];
  attackLosses: number;
  defendLosses: number;
  conquered: boolean;
  winnerId: PlayerId | null;
}

export type GameEvent =
  | { type: 'claim'; playerId: PlayerId; territoryId: TerritoryId }
  | { type: 'start' }
  | { type: 'reinforce'; playerId: PlayerId; territoryId: TerritoryId }
  | { type: 'attack'; attacker: PlayerId; from: TerritoryId; to: TerritoryId; conquered: boolean }
  | { type: 'end-turn'; playerId: PlayerId }
  | { type: 'win'; winnerId: PlayerId }
  | { type: 'draw' }
  | { type: 'reset' }
  | { type: 'faction-select'; playerId: PlayerId; factionId: FactionId };

export interface GameState {
  roomCode: string;
  hostSocketId: string;
  phase: Phase;
  currentTurn: PlayerId | null;
  winnerId: PlayerId | null;
  players: PlayerState[];
  territories: Record<TerritoryId, TerritoryState>;
  draftTurn: PlayerId | null;
  reinforcementsRemaining: number;
  lastAttack: AttackResult | null;
  selectedTerritoryId: TerritoryId | null;
  events: GameEvent[];
  round: number;
  roundCap: number;
  // Map
  era: EraId;
  tier: TierSize;
  chokePoints: TerritoryId[];
  // Faction system
  factions: Record<PlayerId, FactionId | null>;
  targetTerritories: Record<PlayerId, TerritoryId | null>;
  factionCooldowns: Record<PlayerId, number>;
  fortifiedTerritoryId: TerritoryId | null;
}

export interface RoomSnapshot {
  state: GameState;
  viewerSocketId: string | null;
  viewerToken: string | null;
  isSpectator: boolean;
  spectatorCount: number;
}

export type ClientEvent =
  | { type: 'create-room'; playerName: string; era: EraId; tier: TierSize }
  | { type: 'join-room'; roomCode: string; playerName: string; token?: string }
  | { type: 'add-bot'; difficulty: BotDifficulty }
  | { type: 'select-faction'; factionId: FactionId }
  | { type: 'claim-territory'; territoryId: TerritoryId }
  | { type: 'start-game'; roundCap: number }
  | { type: 'reset-game' }
  | { type: 'select-territory'; territoryId: TerritoryId }
  | { type: 'reinforce'; territoryId: TerritoryId }
  | { type: 'attack'; from: TerritoryId; to: TerritoryId }
  | { type: 'end-turn' };

export type ServerMessage =
  | {
      type: 'room:update';
      payload: RoomSnapshot;
    }
  | {
      type: 'room:error';
      payload: { message: string };
    };
