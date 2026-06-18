import { describe, expect, it } from 'vitest';
import {
  attack,
  claimTerritory,
  createRoom,
  endTurn,
  isDraftComplete,
  joinRoom,
  reinforce,
  selectTerritory,
  startGame
} from './engine';
import type { PlayerState } from './types';

const host: PlayerState = { id: 'player1', socketId: 'socket-a', name: 'Host' };
const guest: PlayerState = { id: 'player2', socketId: 'socket-b', name: 'Guest' };

function createStartedGame() {
  let state = createRoom('PRISM', host);
  state = joinRoom(state, guest);
  state = claimTerritory(state, 'player1', 'cave-of-echoes');
  state = claimTerritory(state, 'player2', 'river-plain');
  state = claimTerritory(state, 'player1', 'obsidian-ridge');
  state = claimTerritory(state, 'player2', 'mammoth-steppe');
  state = claimTerritory(state, 'player1', 'sun-basin');
  state = claimTerritory(state, 'player2', 'ember-forest');
  return startGame(state, host.socketId);
}

describe('game engine', () => {
  it('lets the server resolve a deterministic conquest', () => {
    let state = createStartedGame();
    state = {
      ...state,
      territories: {
        ...state.territories,
        'cave-of-echoes': { ...state.territories['cave-of-echoes'], units: 4 },
        'river-plain': { ...state.territories['river-plain'], units: 1 }
      }
    };

    const rng = (() => {
      const values = [0.99, 0.9, 0.8, 0.1];
      return () => values.shift() ?? 0.1;
    })();

    state = attack(state, 'player1', 'cave-of-echoes', 'river-plain', rng);

    expect(state.territories['river-plain'].ownerId).toBe('player1');
    expect(state.lastAttack?.conquered).toBe(true);
  });

  it('does not allow the game to start before the draft is complete', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);
    state = claimTerritory(state, 'player1', 'cave-of-echoes');

    expect(() => startGame(state, host.socketId)).toThrow('All territories must be claimed first.');
  });

  it('tracks draft completion', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);

    expect(isDraftComplete(state)).toBe(false);

    state = claimTerritory(state, 'player1', 'cave-of-echoes');
    state = claimTerritory(state, 'player2', 'river-plain');
    state = claimTerritory(state, 'player1', 'obsidian-ridge');
    state = claimTerritory(state, 'player2', 'mammoth-steppe');
    state = claimTerritory(state, 'player1', 'sun-basin');
    state = claimTerritory(state, 'player2', 'ember-forest');

    expect(isDraftComplete(state)).toBe(true);
  });

  it('prevents selecting territories outside the active phase', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);

    expect(() => selectTerritory(state, 'player1', 'cave-of-echoes')).toThrow(
      'You can only select territories during an active match.'
    );
  });

  it('resets reinforcements for the next player when ending a turn', () => {
    let state = createStartedGame();
    state = reinforce(state, 'player1', 'cave-of-echoes');
    state = endTurn(state, 'player1');

    expect(state.currentTurn).toBe('player2');
    expect(state.reinforcementsRemaining).toBe(1);
  });

  it('rejects non-adjacent attacks', () => {
    const state = createStartedGame();

    expect(() => attack(state, 'player1', 'cave-of-echoes', 'mammoth-steppe')).toThrow(
      'Territories are not adjacent.'
    );
  });

  it('sets winner and finished phase when one player conquers all territories', () => {
    let state = createStartedGame();
    state = {
      ...state,
      territories: {
        ...state.territories,
        'cave-of-echoes': { ...state.territories['cave-of-echoes'], ownerId: 'player1', units: 3 },
        'river-plain': { ...state.territories['river-plain'], ownerId: 'player1', units: 3 },
        'obsidian-ridge': { ...state.territories['obsidian-ridge'], ownerId: 'player1', units: 4 },
        'mammoth-steppe': { ...state.territories['mammoth-steppe'], ownerId: 'player1', units: 3 },
        'ember-forest': { ...state.territories['ember-forest'], ownerId: 'player1', units: 3 },
        'sun-basin': { ...state.territories['sun-basin'], ownerId: 'player2', units: 1 }
      }
    };

    // 3 attacker dice roll 6, 1 defender die rolls 1 → guaranteed conquest
    const rolls = [0.99, 0.99, 0.99, 0.0];
    state = attack(state, 'player1', 'obsidian-ridge', 'sun-basin', () => rolls.shift() ?? 0.5);

    expect(state.winnerId).toBe('player1');
    expect(state.phase).toBe('finished');
  });

  it('rejects joining a full room', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);
    const overflow: PlayerState = { id: 'player2', socketId: 'socket-c', name: 'Third' };
    expect(() => joinRoom(state, overflow)).toThrow('Room is full.');
  });

  it('rejects claiming a territory out of draft turn', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);
    expect(() => claimTerritory(state, 'player2', 'cave-of-echoes')).toThrow('It is not your draft turn.');
  });

  it('rejects startGame from a non-host', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);
    state = claimTerritory(state, 'player1', 'cave-of-echoes');
    state = claimTerritory(state, 'player2', 'river-plain');
    state = claimTerritory(state, 'player1', 'obsidian-ridge');
    state = claimTerritory(state, 'player2', 'mammoth-steppe');
    state = claimTerritory(state, 'player1', 'sun-basin');
    state = claimTerritory(state, 'player2', 'ember-forest');
    expect(() => startGame(state, guest.socketId)).toThrow('Only the host can start the game.');
  });
});
