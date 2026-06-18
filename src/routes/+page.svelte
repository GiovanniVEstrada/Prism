<script lang="ts">
  import { onMount } from 'svelte';
  import { connectSocket, emitAction } from '$lib/client/socket';
  import { STONE_AGE_MAP } from '$lib/game/map';
  import { isDraftComplete } from '$lib/game/engine';
  import type { GameState, PlayerId, TerritoryId } from '$lib/game/types';

  let playerName = '';
  let roomCode = '';
  let currentRoomCode = '';
  let errorMessage = '';
  let connected = false;
  let viewerSocketId: string | null = null;
  let state: GameState | null = null;

  $: me = state?.players.find((player) => player.socketId === viewerSocketId) ?? null;
  $: myPlayerId = (me?.id ?? null) as PlayerId | null;
  $: selected = state?.selectedTerritoryId ? state.territories[state.selectedTerritoryId] : null;
  $: canStart = state?.phase === 'draft' && viewerSocketId === state.hostSocketId && isDraftComplete(state);
  $: isMyDraftTurn = state?.phase === 'draft' && state.draftTurn === myPlayerId;
  $: draftTurnName = state?.players.find((p) => p.id === state?.draftTurn)?.name ?? state?.draftTurn;
  $: winnerName = state?.players.find((p) => p.id === state?.winnerId)?.name ?? state?.winnerId;

  function territoryName(territoryId: TerritoryId) {
    return STONE_AGE_MAP.find((entry) => entry.id === territoryId)?.label ?? territoryId;
  }

  onMount(() => {
    const socket = connectSocket((message) => {
      if (message.type === 'room:error') {
        errorMessage = message.payload.message;
        return;
      }

      state = message.payload.state;
      viewerSocketId = message.payload.viewerSocketId;
      currentRoomCode = message.payload.state.roomCode;
      errorMessage = '';
    });

    connected = socket.connected;
    socket.on('connect', () => {
      connected = true;
      viewerSocketId = socket.id ?? null;
    });
    socket.on('disconnect', () => {
      connected = false;
    });
  });

  function createRoom() {
    emitAction({ type: 'create-room', playerName: playerName || 'Player 1' });
  }

  function joinRoom() {
    emitAction({
      type: 'join-room',
      roomCode,
      playerName: playerName || 'Player 2'
    });
  }

  function territoryAction(territoryId: TerritoryId) {
    if (!state || !myPlayerId) {
      return;
    }

    if (state.phase === 'draft') {
      if (!isMyDraftTurn) {
        return;
      }
      emitAction({ type: 'claim-territory', territoryId });
      return;
    }

    if (state.phase !== 'active' || state.currentTurn !== myPlayerId) {
      return;
    }

    if (state.territories[territoryId].ownerId !== myPlayerId) {
      return;
    }

    emitAction({ type: 'select-territory', territoryId });
  }

  function reinforceSelected() {
    if (!state?.selectedTerritoryId) {
      return;
    }

    emitAction({ type: 'reinforce', territoryId: state.selectedTerritoryId });
  }

  function attackSelected(targetId: TerritoryId) {
    if (!state?.selectedTerritoryId) {
      return;
    }

    emitAction({ type: 'attack', from: state.selectedTerritoryId, to: targetId });
  }
</script>

<svelte:head>
  <title>Prism</title>
  <meta
    name="description"
    content="Authoritative multiplayer prototype for Prism."
  />
</svelte:head>

<div class="shell">
  <section class="sidebar">
    <div class="panel">
      <h1>Prism</h1>
      <p class="muted">One room. One map. Two players.</p>
    </div>

    <div class="panel stack">
      <label>
        <span>Name</span>
        <input bind:value={playerName} maxlength="18" placeholder="Player name" />
      </label>

      <div class="inline">
        <button type="button" on:click={createRoom} disabled={!connected}>Create room</button>
        <input bind:value={roomCode} maxlength="6" placeholder="Room" />
        <button type="button" on:click={joinRoom} disabled={!connected}>Join</button>
      </div>

      <p class="status">{connected ? 'Socket connected' : 'Connecting...'}</p>
      {#if currentRoomCode}
        <p class="room">Room {currentRoomCode}</p>
      {/if}
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
    </div>

    {#if state}
      <div class="panel stack">
        <h2>Match State</h2>
        <p>Phase: <strong>{state.phase}</strong></p>
        <p>Turn: <strong>{state.currentTurn ?? '-'}</strong></p>
        <p>Reinforcements: <strong>{state.reinforcementsRemaining}</strong></p>
        {#if state.phase === 'draft'}
          <p>Draft turn: <strong>{draftTurnName ?? '-'}</strong></p>
          <p>Draft progress: <strong>{Object.values(state.territories).filter((territory) => territory.ownerId).length}/{STONE_AGE_MAP.length}</strong></p>
        {/if}

        <div class="players">
          {#each state.players as player}
            <div class:selected-player={player.socketId === viewerSocketId}>
              <span>{player.name}</span>
              <span class="muted">{player.id}</span>
            </div>
          {/each}
        </div>

        {#if canStart}
          <button type="button" on:click={() => emitAction({ type: 'start-game' })}>Start war</button>
        {:else if state.phase === 'draft' && viewerSocketId === state.hostSocketId}
          <p class="muted">Claim every territory to unlock match start.</p>
        {/if}

        {#if state.phase === 'active' && myPlayerId === state.currentTurn}
          <div class="inline">
            <button
              type="button"
              on:click={reinforceSelected}
              disabled={!state.selectedTerritoryId || state.reinforcementsRemaining === 0}
            >
              Reinforce
            </button>
            <button type="button" on:click={() => emitAction({ type: 'end-turn' })}>End turn</button>
          </div>
        {/if}

        {#if state.phase === 'finished'}
          <div class="game-over">
            <p class="game-over-label">Match over</p>
            <p class="game-over-winner">{winnerName} wins</p>
          </div>
        {/if}
      </div>

      {#if selected}
        <div class="panel stack">
          <h2>{territoryName(selected.id)}</h2>
          <p>Owner: <strong>{selected.ownerId ?? 'neutral'}</strong></p>
          <p>Units: <strong>{selected.units}</strong></p>
          {#if state.phase === 'active' && myPlayerId === state.currentTurn}
            <div class="targets">
              {#each STONE_AGE_MAP.find((entry) => entry.id === selected.id)?.adjacent ?? [] as adjacentId}
                <button
                  type="button"
                  class="ghost"
                  on:click={() => attackSelected(adjacentId)}
                  disabled={state.territories[adjacentId].ownerId === myPlayerId || selected.units < 2}
                >
                  Attack {territoryName(adjacentId)}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if state.lastAttack}
        <div class="panel stack">
          <h2>Last attack</h2>
          <p>{state.lastAttack.attacker} -> {state.lastAttack.defender}</p>
          <p>Attack rolls: {state.lastAttack.attackRolls.join(', ')}</p>
          <p>Defense rolls: {state.lastAttack.defendRolls.join(', ')}</p>
          <p>Losses: attacker {state.lastAttack.attackLosses}, defender {state.lastAttack.defendLosses}</p>
        </div>
      {/if}
    {/if}
  </section>

  <section class="board panel">
    <div class="map">
      {#each STONE_AGE_MAP as territory}
        {@const territoryState = state?.territories[territory.id]}
        <button
          type="button"
          class:owned-by-player1={territoryState?.ownerId === 'player1'}
          class:owned-by-player2={territoryState?.ownerId === 'player2'}
          class:selected-territory={state?.selectedTerritoryId === territory.id}
          class="territory"
          style={`left:${territory.x}%;top:${territory.y}%`}
          on:click={() => territoryAction(territory.id)}
        >
          <span>{territory.label}</span>
          <strong>{territoryState?.units ?? 0}</strong>
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  :global(body) {
    margin: 0;
    font-family: Inter, system-ui, sans-serif;
    background: #101317;
    color: #f4f7fb;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 20px;
    padding: 20px;
    box-sizing: border-box;
  }

  .sidebar,
  .stack {
    display: grid;
    gap: 16px;
  }

  .panel {
    background: #171c22;
    border: 1px solid #2b333d;
    border-radius: 8px;
    padding: 16px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: 1.75rem;
  }

  h2 {
    font-size: 1rem;
  }

  .muted,
  .status,
  .room {
    color: #98a7b8;
  }

  .error {
    color: #ff7d7d;
  }

  label,
  .players > div {
    display: grid;
    gap: 6px;
  }

  input,
  button {
    border-radius: 8px;
    border: 1px solid #364150;
    padding: 10px 12px;
    font: inherit;
  }

  input {
    background: #0f1419;
    color: inherit;
  }

  button {
    background: #d6f36a;
    color: #0e1217;
    cursor: pointer;
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .ghost {
    background: #1b2128;
    color: #f4f7fb;
  }

  .inline {
    display: grid;
    grid-template-columns: 1fr 90px 1fr;
    gap: 10px;
    align-items: end;
  }

  .players {
    display: grid;
    gap: 10px;
  }

  .selected-player {
    outline: 1px solid #d6f36a;
    border-radius: 8px;
    padding: 8px;
  }

  .board {
    min-height: 720px;
    padding: 0;
    overflow: hidden;
  }

  .map {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 720px;
    background:
      radial-gradient(circle at top left, rgba(214, 243, 106, 0.08), transparent 30%),
      linear-gradient(180deg, #1c242d 0%, #0d1116 100%);
  }

  .territory {
    position: absolute;
    width: 180px;
    min-height: 88px;
    display: grid;
    gap: 8px;
    align-content: center;
    justify-items: start;
    transform: translate(-50%, -50%);
    background: #232c35;
    color: #f4f7fb;
    text-align: left;
  }

  .owned-by-player1 {
    background: #365d8d;
  }

  .owned-by-player2 {
    background: #8c4c39;
  }

  .selected-territory {
    outline: 2px solid #d6f36a;
  }

  .targets {
    display: grid;
    gap: 8px;
  }

  .game-over {
    border: 1px solid #d6f36a;
    border-radius: 8px;
    padding: 12px 16px;
    display: grid;
    gap: 4px;
  }

  .game-over-label {
    font-size: 0.75rem;
    color: #98a7b8;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .game-over-winner {
    font-size: 1.25rem;
    font-weight: 700;
    color: #d6f36a;
  }

  @media (max-width: 960px) {
    .shell {
      grid-template-columns: 1fr;
    }

    .board {
      min-height: 560px;
    }

    .map {
      min-height: 560px;
    }

    .territory {
      width: 140px;
      min-height: 72px;
      font-size: 0.9rem;
    }
  }
</style>
