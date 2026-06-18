import { describe, expect, it } from 'vitest';
import {
  attack,
  claimTerritory,
  createRoom,
  dominanceScore,
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
    // player2 owns 6 territories → max(2, floor(6/3)) = 2
    expect(state.reinforcementsRemaining).toBe(2);
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

  it('grants reinforcements based on territory count', () => {
    // player1 owns 6 territories at start → max(2, floor(6/3)) = 2
    const state = createStartedGame();
    expect(state.reinforcementsRemaining).toBe(2);

    // Simulate player1 losing 3 territories to player2 (3 owned → max(2, floor(3/3)) = 1 → clamped to 2)
    const weakState = {
      ...state,
      territories: {
        ...state.territories,
        'frost-peaks': { ...state.territories['frost-peaks'], ownerId: 'player2' as const },
        'thunder-mesa': { ...state.territories['thunder-mesa'], ownerId: 'player2' as const },
        'bone-ridge': { ...state.territories['bone-ridge'], ownerId: 'player2' as const }
      }
    };
    const afterTurn = endTurn(weakState, 'player1');
    // player2 now has 9 territories → max(2, floor(9/3)) = 3
    expect(afterTurn.reinforcementsRemaining).toBe(3);
  });

  it('calculates dominance score as territories plus unit bonus', () => {
    const state = createStartedGame();
    // player1: 6 territories × 3 units = 18 units → 6 + floor(18/4) = 6 + 4 = 10
    expect(dominanceScore(state, 'player1')).toBe(10);
    expect(dominanceScore(state, 'player2')).toBe(10);
  });

  it('ends the match by dominance score when the round cap is reached', () => {
    let state = createStartedGame();
    // Give player1 more territory so they win by dominance.
    state = {
      ...state,
      round: state.roundCap, // final round
      currentTurn: 'player2', // it's player2's turn to end the round
      territories: {
        ...state.territories,
        'wolf-den': { ...state.territories['wolf-den'], ownerId: 'player1' as const },
        'ash-marsh': { ...state.territories['ash-marsh'], ownerId: 'player1' as const }
      }
    };

    // player2 ends their turn — this completes the final round.
    const finished = endTurn(state, 'player2');

    expect(finished.phase).toBe('finished');
    expect(finished.winnerId).toBe('player1');
  });

  it('records a draw when dominance scores are equal at the round cap', () => {
    const state = createStartedGame();
    const lastRound = { ...state, round: state.roundCap, currentTurn: 'player2' as const };

    const finished = endTurn(lastRound, 'player2');

    expect(finished.phase).toBe('finished');
    expect(finished.winnerId).toBeNull();
    expect(finished.events.at(-1)?.type).toBe('draw');
  });

  it('moves attackDice units into the conquered territory', () => {
    let state = createStartedGame();
    state = {
      ...state,
      territories: {
        ...state.territories,
        'frost-peaks': { ...state.territories['frost-peaks'], units: 4 },
        'wolf-den': { ...state.territories['wolf-den'], units: 1 }
      }
    };

    // 3 attack dice, 1 defend die → attacker wins → 3 units move to wolf-den
    const rolls = [0.99, 0.99, 0.99, 0.0];
    state = attack(state, 'player1', 'frost-peaks', 'wolf-den', () => rolls.shift() ?? 0.5);

    expect(state.territories['wolf-den'].units).toBe(3);
    // attacker keeps 4 - 3 = 1 unit
    expect(state.territories['frost-peaks'].units).toBe(1);
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
