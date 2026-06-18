import { describe, expect, it } from 'vitest';
import {
  attack,
  claimTerritory,
  createRoom,
  endTurn,
  isDraftComplete,
  joinRoom,
  reinforce,
  resetGame,
  selectTerritory,
  startGame
} from './engine';
import type { PlayerState } from './types';

const host: PlayerState = { id: 'player1', socketId: 'socket-a', name: 'Host' };
const guest: PlayerState = { id: 'player2', socketId: 'socket-b', name: 'Guest' };

// Draft order for the 12-territory map.
// player1 ends up with: frost-peaks, thunder-mesa, bone-ridge, red-gorge, river-delta, amber-plains
// player2 ends up with: wolf-den, ochre-bluffs, great-rift, ash-marsh, ember-steppe, salt-flat
function createStartedGame() {
  let state = createRoom('PRISM', host);
  state = joinRoom(state, guest);
  state = claimTerritory(state, 'player1', 'frost-peaks');
  state = claimTerritory(state, 'player2', 'wolf-den');
  state = claimTerritory(state, 'player1', 'thunder-mesa');
  state = claimTerritory(state, 'player2', 'ochre-bluffs');
  state = claimTerritory(state, 'player1', 'bone-ridge');
  state = claimTerritory(state, 'player2', 'great-rift');
  state = claimTerritory(state, 'player1', 'red-gorge');
  state = claimTerritory(state, 'player2', 'ash-marsh');
  state = claimTerritory(state, 'player1', 'river-delta');
  state = claimTerritory(state, 'player2', 'ember-steppe');
  state = claimTerritory(state, 'player1', 'amber-plains');
  state = claimTerritory(state, 'player2', 'salt-flat');
  return startGame(state, host.socketId);
}

describe('game engine', () => {
  it('lets the server resolve a deterministic conquest', () => {
    let state = createStartedGame();
    state = {
      ...state,
      territories: {
        ...state.territories,
        'frost-peaks': { ...state.territories['frost-peaks'], units: 4 },
        'wolf-den': { ...state.territories['wolf-den'], units: 1 }
      }
    };

    // 3 attacker dice roll 6, 1 defender die rolls 1 → guaranteed conquest
    const rolls = [0.99, 0.99, 0.99, 0.0];
    state = attack(state, 'player1', 'frost-peaks', 'wolf-den', () => rolls.shift() ?? 0.5);

    expect(state.territories['wolf-den'].ownerId).toBe('player1');
    expect(state.lastAttack?.conquered).toBe(true);
  });

  it('sets winner and finished phase when one player conquers all territories', () => {
    let state = createStartedGame();
    // Give player1 all territories except wolf-den (player2 owns wolf-den, 1 unit).
    const allIds = Object.keys(state.territories) as Array<keyof typeof state.territories>;
    const overrides = Object.fromEntries(
      allIds.map((id) => [
        id,
        id === 'wolf-den'
          ? { ...state.territories[id], ownerId: 'player2' as const, units: 1 }
          : { ...state.territories[id], ownerId: 'player1' as const, units: 3 }
      ])
    ) as typeof state.territories;

    state = { ...state, territories: overrides };

    // 2 attacker dice roll 6, 1 defender die rolls 1 → guaranteed conquest
    const rolls = [0.99, 0.99, 0.0];
    state = attack(state, 'player1', 'frost-peaks', 'wolf-den', () => rolls.shift() ?? 0.5);

    expect(state.winnerId).toBe('player1');
    expect(state.phase).toBe('finished');
  });

  it('does not allow the game to start before the draft is complete', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);
    state = claimTerritory(state, 'player1', 'frost-peaks');

    expect(() => startGame(state, host.socketId)).toThrow('All territories must be claimed first.');
  });

  it('tracks draft completion', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);

    expect(isDraftComplete(state)).toBe(false);

    state = claimTerritory(state, 'player1', 'frost-peaks');
    state = claimTerritory(state, 'player2', 'wolf-den');
    state = claimTerritory(state, 'player1', 'thunder-mesa');
    state = claimTerritory(state, 'player2', 'ochre-bluffs');
    state = claimTerritory(state, 'player1', 'bone-ridge');
    state = claimTerritory(state, 'player2', 'great-rift');
    state = claimTerritory(state, 'player1', 'red-gorge');
    state = claimTerritory(state, 'player2', 'ash-marsh');
    state = claimTerritory(state, 'player1', 'river-delta');
    state = claimTerritory(state, 'player2', 'ember-steppe');
    state = claimTerritory(state, 'player1', 'amber-plains');
    state = claimTerritory(state, 'player2', 'salt-flat');

    expect(isDraftComplete(state)).toBe(true);
  });

  it('prevents selecting territories outside the active phase', () => {
    let state = createRoom('PRISM', host);
    state = joinRoom(state, guest);

    expect(() => selectTerritory(state, 'player1', 'frost-peaks')).toThrow(
      'You can only select territories during an active match.'
    );
  });

  it('resets reinforcements for the next player when ending a turn', () => {
    let state = createStartedGame();
    state = reinforce(state, 'player1', 'frost-peaks');
    state = endTurn(state, 'player1');

    expect(state.currentTurn).toBe('player2');
    expect(state.reinforcementsRemaining).toBe(1);
  });

  it('rejects non-adjacent attacks', () => {
    const state = createStartedGame();

    // frost-peaks (player1) is not adjacent to ochre-bluffs (player2)
    expect(() => attack(state, 'player1', 'frost-peaks', 'ochre-bluffs')).toThrow(
      'Territories are not adjacent.'
    );
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
    expect(() => claimTerritory(state, 'player2', 'frost-peaks')).toThrow('It is not your draft turn.');
  });

  it('rejects startGame from a non-host', () => {
    const state = createStartedGame();
    // Finished game; resetGame from guest should be blocked.
    const finished = { ...state, phase: 'finished' as const };
    expect(() => resetGame(finished, guest.socketId)).toThrow('Only the host can reset the game.');
  });

  it('resets the board for a rematch', () => {
    let state = createStartedGame();
    state = { ...state, phase: 'finished', winnerId: 'player1' };

    state = resetGame(state, host.socketId);

    expect(state.phase).toBe('draft');
    expect(state.winnerId).toBeNull();
    expect(Object.values(state.territories).every((t) => t.ownerId === null)).toBe(true);
    expect(state.events.at(-1)?.type).toBe('reset');
  });

  it('appends events for draft, start, attack, turn end, and win', () => {
    let state = createStartedGame();

    // Start event should be present
    expect(state.events.some((e) => e.type === 'start')).toBe(true);
    // 12 claim events from the draft
    expect(state.events.filter((e) => e.type === 'claim').length).toBe(12);

    state = reinforce(state, 'player1', 'frost-peaks');
    expect(state.events.at(-1)?.type).toBe('reinforce');

    state = endTurn(state, 'player1');
    expect(state.events.at(-1)?.type).toBe('end-turn');
  });
});
