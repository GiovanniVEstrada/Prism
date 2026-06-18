import type { BotDifficulty, ClientEvent, FactionId, GameState, PlayerId, TerritoryId } from './types';
import { getMapConfig } from './map';

export type { BotDifficulty };

export const BOT_SOCKET_ID = 'bot';

export function botPickAction(
  state: GameState,
  botId: PlayerId,
  difficulty: BotDifficulty
): ClientEvent | null {
  const opponentId: PlayerId = botId === 'player1' ? 'player2' : 'player1';
  const mapTerritories = getMapConfig(state.era, state.tier).territories;

  // Faction selection — always first move in draft
  if (state.phase === 'draft' && !state.factions[botId]) {
    const factionId: FactionId = difficulty === 'aggressive' ? 'warband' : 'bastion';
    return { type: 'select-faction', factionId };
  }

  // Territory claiming during draft
  if (state.phase === 'draft' && state.draftTurn === botId) {
    const unclaimed = Object.values(state.territories)
      .filter((t) => t.ownerId === null)
      .map((t) => t.id as TerritoryId);

    if (unclaimed.length === 0) return null;

    let pick: TerritoryId;
    if (difficulty === 'aggressive') {
      // Prefer territories adjacent to the opponent's holdings
      const opponentOwned = new Set(
        Object.values(state.territories)
          .filter((t) => t.ownerId === opponentId)
          .map((t) => t.id)
      );
      const contested = unclaimed.filter((id) => {
        const def = mapTerritories.find((t) => t.id === id)!;
        return def.adjacent.some((adjId) => opponentOwned.has(adjId));
      });
      const pool = contested.length > 0 ? contested : unclaimed;
      pick = pool[Math.floor(Math.random() * pool.length)];
    } else {
      pick = unclaimed[Math.floor(Math.random() * unclaimed.length)];
    }

    return { type: 'claim-territory', territoryId: pick };
  }

  // Active phase
  if (state.phase === 'active' && state.currentTurn === botId) {
    // Spend all reinforcements first
    if (state.reinforcementsRemaining > 0) {
      const botTerritories = Object.values(state.territories).filter(
        (t) => t.ownerId === botId
      );
      if (botTerritories.length === 0) return { type: 'end-turn' };

      const frontline = botTerritories.filter((t) => {
        const def = mapTerritories.find((m) => m.id === t.id)!;
        return def.adjacent.some((adjId) => state.territories[adjId].ownerId === opponentId);
      });

      const pool = frontline.length > 0 ? frontline : botTerritories;
      if (difficulty === 'aggressive') {
        // Reinforce the strongest frontline territory to enable attacks
        pool.sort((a, b) => b.units - a.units);
      } else {
        // Shore up the weakest frontline territory
        pool.sort((a, b) => a.units - b.units);
      }

      return { type: 'reinforce', territoryId: pool[0].id };
    }

    // Attack if conditions are favourable
    const attackers = Object.values(state.territories)
      .filter((t) => t.ownerId === botId && t.units >= 2)
      .sort((a, b) => b.units - a.units); // strongest attacker first

    for (const attacker of attackers) {
      const def = mapTerritories.find((m) => m.id === attacker.id)!;
      const targets = def.adjacent
        .filter((adjId) => state.territories[adjId].ownerId === opponentId)
        .sort((a, b) => state.territories[a].units - state.territories[b].units); // weakest defender first

      for (const targetId of targets) {
        const defender = state.territories[targetId];
        const shouldAttack =
          difficulty === 'aggressive'
            ? attacker.units > defender.units
            : attacker.units >= defender.units + 2;

        if (shouldAttack) {
          return { type: 'attack', from: attacker.id, to: targetId };
        }
      }
    }

    return { type: 'end-turn' };
  }

  return null;
}
