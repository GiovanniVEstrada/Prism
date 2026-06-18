<script lang="ts">
  import { onMount } from 'svelte';
  import { connectSocket, emitAction } from '$lib/client/socket';
  import { STONE_AGE_MAP } from '$lib/game/map';
  import { isDraftComplete } from '$lib/game/engine';
  import type { GameEvent, GameState, PlayerId, TerritoryId } from '$lib/game/types';

  let playerName = '';
  let roomCode = '';
  let currentRoomCode = '';
  let errorMessage = '';
  let connected = false;
  let viewerSocketId: string | null = null;
  let state: GameState | null = null;

  $: me = state?.players.find((p) => p.socketId === viewerSocketId) ?? null;
  $: myPlayerId = (me?.id ?? null) as PlayerId | null;
  $: selected = state?.selectedTerritoryId ? state.territories[state.selectedTerritoryId] : null;
  $: canStart = state?.phase === 'draft' && viewerSocketId === state.hostSocketId && isDraftComplete(state);
  $: canReset = state?.phase === 'finished' && viewerSocketId === state.hostSocketId;
  $: isMyDraftTurn = state?.phase === 'draft' && state.draftTurn === myPlayerId;
  $: isMyTurn = state?.phase === 'active' && state.currentTurn === myPlayerId;
  $: draftTurnName = state?.players.find((p) => p.id === state?.draftTurn)?.name ?? state?.draftTurn;
  $: winnerName = state?.players.find((p) => p.id === state?.winnerId)?.name ?? state?.winnerId;
  $: currentTurnName = state?.players.find((p) => p.id === state?.currentTurn)?.name ?? state?.currentTurn ?? '';

  // Territories the current player can select on their turn.
  $: selectableIds =
    isMyTurn && state
      ? Object.values(state.territories)
          .filter((t) => t.ownerId === myPlayerId)
          .map((t) => t.id)
      : [];

  // Enemy territories adjacent to the selected territory — click to attack.
  $: attackableIds =
    isMyTurn && state?.selectedTerritoryId
      ? (STONE_AGE_MAP.find((t) => t.id === state!.selectedTerritoryId)?.adjacent ?? []).filter(
          (id) => state!.territories[id].ownerId !== myPlayerId && state!.territories[id].ownerId !== null
        )
      : [];

  function playerName_(id: PlayerId): string {
    return state?.players.find((p) => p.id === id)?.name ?? id;
  }

  function territoryName(id: TerritoryId): string {
    return STONE_AGE_MAP.find((t) => t.id === id)?.label ?? id;
  }

  function formatEvent(event: GameEvent): string {
    switch (event.type) {
      case 'claim':
        return `${playerName_(event.playerId)} claimed ${territoryName(event.territoryId)}`;
      case 'start':
        return 'Match started';
      case 'reinforce':
        return `${playerName_(event.playerId)} reinforced ${territoryName(event.territoryId)}`;
      case 'attack':
        return event.conquered
          ? `${playerName_(event.attacker)} conquered ${territoryName(event.to)} from ${territoryName(event.from)}`
          : `${playerName_(event.attacker)} attacked ${territoryName(event.to)} — no conquest`;
      case 'end-turn':
        return `${playerName_(event.playerId)} ended their turn`;
      case 'win':
        return `${playerName_(event.winnerId)} wins the match`;
      case 'reset':
        return 'New match started';
    }
  }

  onMount(() => {
    // Pre-fill room code from URL param if present.
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) roomCode = urlRoom.toUpperCase();

    const socket = connectSocket((message) => {
      if (message.type === 'room:error') {
        errorMessage = message.payload.message;
        return;
      }

      state = message.payload.state;
      viewerSocketId = message.payload.viewerSocketId;
      currentRoomCode = message.payload.state.roomCode;
      errorMessage = '';

      // Keep the URL in sync with the current room.
      const url = new URL(window.location.href);
      url.searchParams.set('room', currentRoomCode);
      window.history.replaceState({}, '', url.toString());
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

  function handleCreateRoom() {
    emitAction({ type: 'create-room', playerName: playerName || 'Player 1' });
  }

  function handleJoinRoom() {
    emitAction({ type: 'join-room', roomCode, playerName: playerName || 'Player 2' });
  }

  function copyInviteLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoomCode);
    navigator.clipboard.writeText(url.toString());
  }

  function territoryAction(territoryId: TerritoryId) {
    if (!state || !myPlayerId) return;

    if (state.phase === 'draft') {
      if (!isMyDraftTurn) return;
      emitAction({ type: 'claim-territory', territoryId });
      return;
    }

    if (!isMyTurn) return;

    const territory = state.territories[territoryId];

    // Clicking an attackable enemy territory fires an attack immediately.
    if (state.selectedTerritoryId && attackableIds.includes(territoryId)) {
      emitAction({ type: 'attack', from: state.selectedTerritoryId, to: territoryId });
      return;
    }

    // Clicking your own territory selects it.
    if (territory.ownerId === myPlayerId) {
      emitAction({ type: 'select-territory', territoryId });
    }
  }

  function reinforceSelected() {
    if (!state?.selectedTerritoryId) return;
    emitAction({ type: 'reinforce', territoryId: state.selectedTerritoryId });
  }
</script>

<svelte:head>
  <title>Prism</title>
  <meta name="description" content="Authoritative multiplayer prototype for Prism." />
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
        <button type="button" on:click={handleCreateRoom} disabled={!connected}>Create room</button>
        <input bind:value={roomCode} maxlength="6" placeholder="Room" />
        <button type="button" on:click={handleJoinRoom} disabled={!connected}>Join</button>
      </div>

      <p class="status">{connected ? 'Socket connected' : 'Connecting...'}</p>

      {#if currentRoomCode}
        <div class="room-row">
          <p class="room">Room {currentRoomCode}</p>
          <button type="button" class="ghost small" on:click={copyInviteLink}>Copy invite link</button>
        </div>
      {/if}

      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
    </div>

    {#if state}
      <div class="panel stack">
        <div class="turn-header">
          {#if state.phase === 'active'}
            {#if isMyTurn}
              <p class="turn-mine">Your turn</p>
            {:else}
              <p class="turn-theirs">{currentTurnName}'s turn</p>
            {/if}
          {:else if state.phase === 'draft'}
            {#if isMyDraftTurn}
              <p class="turn-mine">Your draft pick</p>
            {:else}
              <p class="turn-theirs">{draftTurnName}'s pick</p>
            {/if}
          {/if}
        </div>

        <p>Phase: <strong>{state.phase}</strong></p>

        {#if state.phase === 'draft'}
          <p>Draft progress: <strong>{Object.values(state.territories).filter((t) => t.ownerId).length}/{STONE_AGE_MAP.length}</strong></p>
        {/if}

        {#if state.phase === 'active'}
          <p>Reinforcements: <strong>{state.reinforcementsRemaining}</strong></p>
        {/if}

        <div class="players">
          {#each state.players as player}
            <div
              class="player-row"
              class:viewer={player.socketId === viewerSocketId}
              class:active-player={state.currentTurn === player.id && state.phase === 'active'}
            >
              <span class="player-name">{player.name}</span>
              <span class="muted player-id">{player.id}</span>
              <span class="territory-count">
                {Object.values(state.territories).filter((t) => t.ownerId === player.id).length} territories
              </span>
            </div>
          {/each}
        </div>

        {#if canStart}
          <button type="button" on:click={() => emitAction({ type: 'start-game' })}>Start war</button>
        {:else if state.phase === 'draft' && viewerSocketId === state.hostSocketId && !isDraftComplete(state)}
          <p class="muted">Claim all territories to start.</p>
        {/if}

        {#if isMyTurn}
          <div class="action-row">
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
            {#if canReset}
              <button type="button" on:click={() => emitAction({ type: 'reset-game' })}>Play again</button>
            {:else}
              <p class="muted">Waiting for host to reset...</p>
            {/if}
          </div>
        {/if}
      </div>

      {#if selected && state.phase === 'active'}
        <div class="panel stack">
          <h2>{territoryName(selected.id)}</h2>
          <p>Owner: <strong>{selected.ownerId ? playerName_(selected.ownerId) : 'neutral'}</strong></p>
          <p>Units: <strong>{selected.units}</strong></p>
          {#if isMyTurn && attackableIds.length > 0}
            <p class="muted small">Click an orange territory on the map to attack, or use these buttons:</p>
            <div class="targets">
              {#each attackableIds as adjacentId}
                <button
                  type="button"
                  class="ghost"
                  on:click={() => emitAction({ type: 'attack', from: selected.id, to: adjacentId })}
                  disabled={selected.units < 2}
                >
                  Attack {territoryName(adjacentId)}
                  ({state.territories[adjacentId].units} units)
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if state.lastAttack}
        <div class="panel stack">
          <h2>Last combat</h2>
          <p>{territoryName(state.lastAttack.attacker)} → {territoryName(state.lastAttack.defender)}</p>
          <div class="dice-row">
            <span>Attack: {state.lastAttack.attackRolls.join(' ')}</span>
            <span>Defense: {state.lastAttack.defendRolls.join(' ')}</span>
          </div>
          <p>Losses — attacker: {state.lastAttack.attackLosses}, defender: {state.lastAttack.defendLosses}</p>
          {#if state.lastAttack.conquered}
            <p class="conquest-label">Territory conquered</p>
          {/if}
        </div>
      {/if}

      {#if state.events.length > 0}
        <div class="panel stack">
          <h2>Event log</h2>
          <div class="event-log">
            {#each [...state.events].reverse().slice(0, 20) as event}
              <p class="event" class:event-win={event.type === 'win'} class:event-reset={event.type === 'reset'}>
                {formatEvent(event)}
              </p>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </section>

  <section class="board panel">
    <div class="map">
      {#each STONE_AGE_MAP as territory}
        {@const ts = state?.territories[territory.id]}
        {@const isSelectable = selectableIds.includes(territory.id)}
        {@const isAttackable = attackableIds.includes(territory.id)}
        <button
          type="button"
          class="territory"
          class:owned-by-player1={ts?.ownerId === 'player1'}
          class:owned-by-player2={ts?.ownerId === 'player2'}
          class:selected-territory={state?.selectedTerritoryId === territory.id}
          class:selectable={isSelectable && !isAttackable}
          class:attackable={isAttackable}
          style="left:{territory.x}%;top:{territory.y}%"
          on:click={() => territoryAction(territory.id)}
        >
          <span class="territory-label">{territory.label}</span>
          <strong class="territory-units">{ts?.units ?? 0}</strong>
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
    grid-template-columns: 320px 1fr;
    gap: 16px;
    padding: 16px;
    box-sizing: border-box;
  }

  .sidebar,
  .stack {
    display: grid;
    gap: 14px;
    align-content: start;
  }

  .panel {
    background: #171c22;
    border: 1px solid #2b333d;
    border-radius: 8px;
    padding: 14px;
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
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #98a7b8;
  }

  .muted {
    color: #98a7b8;
  }

  .small {
    font-size: 0.8rem;
  }

  .status,
  .room {
    color: #98a7b8;
    font-size: 0.85rem;
  }

  .error {
    color: #ff7d7d;
    font-size: 0.85rem;
  }

  label {
    display: grid;
    gap: 6px;
  }

  input,
  button {
    border-radius: 6px;
    border: 1px solid #364150;
    padding: 9px 12px;
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
    opacity: 0.4;
    cursor: not-allowed;
  }

  .ghost {
    background: #1b2128;
    color: #f4f7fb;
    font-weight: 400;
  }

  .inline {
    display: grid;
    grid-template-columns: 1fr 80px 1fr;
    gap: 8px;
    align-items: end;
  }

  .room-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .room-row .room {
    flex: 1;
  }

  /* ── Turn header ─────────────────────────────────────────────────────── */

  .turn-header {
    min-height: 1.4rem;
  }

  .turn-mine {
    color: #d6f36a;
    font-weight: 700;
  }

  .turn-theirs {
    color: #98a7b8;
  }

  /* ── Players ─────────────────────────────────────────────────────────── */

  .players {
    display: grid;
    gap: 8px;
  }

  .player-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
  }

  .player-row.viewer {
    border-color: #2b333d;
  }

  .player-row.active-player {
    border-color: #d6f36a44;
  }

  .player-name {
    font-weight: 600;
  }

  .player-id,
  .territory-count {
    font-size: 0.78rem;
    color: #98a7b8;
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */

  .action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .targets {
    display: grid;
    gap: 6px;
  }

  /* ── Last combat ─────────────────────────────────────────────────────── */

  .dice-row {
    display: flex;
    gap: 16px;
    font-size: 0.85rem;
    color: #98a7b8;
  }

  .conquest-label {
    color: #d6f36a;
    font-weight: 600;
    font-size: 0.85rem;
  }

  /* ── Game over ───────────────────────────────────────────────────────── */

  .game-over {
    border: 1px solid #d6f36a;
    border-radius: 8px;
    padding: 12px 14px;
    display: grid;
    gap: 6px;
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

  /* ── Event log ───────────────────────────────────────────────────────── */

  .event-log {
    display: grid;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
  }

  .event {
    font-size: 0.8rem;
    color: #98a7b8;
    line-height: 1.4;
  }

  .event-win {
    color: #d6f36a;
    font-weight: 600;
  }

  .event-reset {
    color: #5a8fd4;
  }

  /* ── Board ───────────────────────────────────────────────────────────── */

  .board {
    padding: 0;
    overflow: hidden;
  }

  .map {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 720px;
    background:
      radial-gradient(circle at top left, rgba(214, 243, 106, 0.06), transparent 35%),
      linear-gradient(180deg, #1c242d 0%, #0d1116 100%);
  }

  .territory {
    position: absolute;
    width: 160px;
    min-height: 72px;
    display: grid;
    gap: 4px;
    align-content: center;
    justify-items: start;
    transform: translate(-50%, -50%);
    background: #232c35;
    color: #f4f7fb;
    text-align: left;
    padding: 10px 12px;
    transition: outline 80ms;
  }

  .territory-label {
    font-size: 0.78rem;
    color: #98a7b8;
    line-height: 1.2;
  }

  .territory-units {
    font-size: 1.1rem;
  }

  .owned-by-player1 {
    background: #1e3d5c;
  }

  .owned-by-player2 {
    background: #5c2a1e;
  }

  .selected-territory {
    outline: 2px solid #d6f36a;
  }

  /* Territories you can click this turn */
  .selectable {
    outline: 1px solid #d6f36a55;
  }

  /* Adjacent enemy territories you can attack from the selected territory */
  .attackable {
    outline: 2px solid #ff7d4d;
    background: #5c2e1e;
  }

  .owned-by-player1.attackable {
    background: #5c2e1e;
  }

  .owned-by-player2.attackable {
    background: #5c2e1e;
  }

  @media (max-width: 960px) {
    .shell {
      grid-template-columns: 1fr;
    }

    .board {
      min-height: 480px;
    }

    .map {
      min-height: 480px;
    }

    .territory {
      width: 120px;
      min-height: 58px;
      font-size: 0.85rem;
    }
  }
</style>
