export type PlayerId = 'player1' | 'player2';

export type Phase = 'lobby' | 'draft' | 'active' | 'finished';

export type TerritoryId =
  | 'frost-peaks'
  | 'wolf-den'
  | 'thunder-mesa'
  | 'ochre-bluffs'
  | 'bone-ridge'
  | 'great-rift'
  | 'red-gorge'
  | 'ash-marsh'
  | 'river-delta'
  | 'ember-steppe'
  | 'amber-plains'
  | 'salt-flat';

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
  | { type: 'reset' };

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
}

export interface RoomSnapshot {
  state: GameState;
  viewerSocketId: string | null;
}

export type ClientEvent =
  | { type: 'create-room'; playerName: string }
  | { type: 'join-room'; roomCode: string; playerName: string }
  | { type: 'claim-territory'; territoryId: TerritoryId }
  | { type: 'start-game' }
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
