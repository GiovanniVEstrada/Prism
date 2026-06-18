<script lang="ts">
  import { onMount } from 'svelte';
  import { connectSocket, emitAction } from '$lib/client/socket';
  import { STONE_AGE_MAP } from '$lib/game/map';
  import { isDraftComplete, dominanceScore, FACTIONS } from '$lib/game/engine';
  import { playTurnStart, playConquest, playTerritoryLost, playWin, playLoss } from '$lib/client/audio';
  import type { FactionId, GameEvent, GameState, PlayerId, TerritoryId } from '$lib/game/types';

  // Precomputed adjacency edge list for the SVG overlay (unique pairs only).
  const MAP_EDGES = (() => {
    const seen = new Set<string>();
    const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const t of STONE_AGE_MAP) {
      for (const adjId of t.adjacent) {
        const key = [t.id, adjId].sort().join('--');
        if (!seen.has(key)) {
          seen.add(key);
          const adj = STONE_AGE_MAP.find((m) => m.id === adjId)!;
          edges.push({ x1: t.x, y1: t.y, x2: adj.x, y2: adj.y });
        }
      }
    }
    return edges;
  })();

  const CHOKE_POINTS = new Set<TerritoryId>(['bone-ridge', 'great-rift']);

  let selectedRoundCap = 12;

  let playerName = '';
  let roomCode = '';
  let currentRoomCode = '';
  let errorMessage = '';
  let connected = false;
  let viewerSocketId: string | null = null;
  let isSpectator = false;
  let spectatorCount = 0;
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

  // Faction-related reactive values.
  $: myFaction = myPlayerId ? (state?.factions[myPlayerId] ?? null) : null;
  $: myTarget = myPlayerId ? (state?.targetTerritories[myPlayerId] ?? null) : null;
  $: opponentTarget = myPlayerId
    ? (state?.targetTerritories[myPlayerId === 'player1' ? 'player2' : 'player1'] ?? null)
    : null;
  $: myPowerReady = myPlayerId ? (state?.factionCooldowns[myPlayerId] === 0) : false;
  $: myPowerCooldown = myPlayerId ? (state?.factionCooldowns[myPlayerId] ?? 0) : 0;
  $: bothFactionsSelected = !!(state?.factions.player1 && state?.factions.player2);
  $: myFactionSelected = !!(myPlayerId && state?.factions[myPlayerId]);

  // Territories with only 1 unit — shown as at-risk regardless of owner.
  $: atRiskIds = state
    ? (Object.values(state.territories)
        .filter((t) => t.ownerId !== null && t.units <= 1)
        .map((t) => t.id as TerritoryId))
    : ([] as TerritoryId[]);

  // The viewer's territories that border at least one enemy.
  $: contestedIds =
    state && myPlayerId
      ? (Object.values(state.territories)
          .filter((t) => {
            if (t.ownerId !== myPlayerId) return false;
            const def = STONE_AGE_MAP.find((m) => m.id === t.id);
            return (
              def?.adjacent.some(
                (adjId) =>
                  state!.territories[adjId].ownerId !== null &&
                  state!.territories[adjId].ownerId !== myPlayerId
              ) ?? false
            );
          })
          .map((t) => t.id as TerritoryId))
      : ([] as TerritoryId[]);

  // Sound triggers: compare event log and turn between snapshots.
  let prevEventCount = -1;
  let prevCurrentTurn: string | null = null;

  $: if (state && !isSpectator) {
    if (prevEventCount === -1) {
      // Baseline on first snapshot — don't replay history sounds.
      prevEventCount = state.events.length;
      prevCurrentTurn = state.currentTurn;
    } else {
      for (let i = prevEventCount; i < state.events.length; i++) {
        const event = state.events[i];
        if (event.type === 'attack' && event.conquered && myPlayerId) {
          if (event.attacker === myPlayerId) playConquest();
          else playTerritoryLost();
        }
        if (event.type === 'win' && myPlayerId) {
          if (state.winnerId === myPlayerId) playWin();
          else playLoss();
        }
        if (event.type === 'draw') {
          playLoss();
        }
      }
      if (
        state.phase === 'active' &&
        state.currentTurn === myPlayerId &&
        state.currentTurn !== prevCurrentTurn
      ) {
        playTurnStart();
      }
      prevEventCount = state.events.length;
      prevCurrentTurn = state.currentTurn;
    }
  }

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
      case 'draw':
        return 'Match ended in a draw';
      case 'reset':
        return 'New match started';
      case 'faction-select':
        return `${playerName_(event.playerId)} chose ${FACTIONS[event.factionId].name}`;
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

      const snap = message.payload;
      state = snap.state;
      viewerSocketId = snap.viewerSocketId;
      isSpectator = snap.isSpectator;
      spectatorCount = snap.spectatorCount;
      currentRoomCode = snap.state.roomCode;
      errorMessage = '';

      // Persist the session token so reconnects can reclaim the correct slot.
      if (snap.viewerToken) {
        localStorage.setItem(`prism-token-${currentRoomCode}`, snap.viewerToken);
      }

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
    const code = roomCode.trim().toUpperCase();
    const token = localStorage.getItem(`prism-token-${code}`) ?? undefined;
    emitAction({ type: 'join-room', roomCode: code, playerName: playerName || 'Player 2', token });
  }

  function copyInviteLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoomCode);
    navigator.clipboard.writeText(url.toString());
  }

  function territoryAction(territoryId: TerritoryId) {
    if (!state || !myPlayerId || isSpectator) return;

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
          <p class="room">
            Room {currentRoomCode}
            {#if spectatorCount > 0}
              <span class="spectator-badge">{spectatorCount} watching</span>
            {/if}
          </p>
          <button type="button" class="ghost small" on:click={copyInviteLink}>Copy invite link</button>
        </div>
      {/if}


      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
    </div>

    {#if state}
      <div class="panel stack">
        {#if isSpectator}
          <p class="spectator-notice">Observing — actions disabled</p>
        {/if}

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

        {#if state.phase === 'active' || state.phase === 'finished'}
          <div class="round-row">
            <span class="muted small">Round</span>
            <span class="round-value">{Math.min(state.round, state.roundCap)} / {state.roundCap}</span>
          </div>
        {/if}

        {#if state.phase === 'draft'}
          <p class="muted small">Draft: {Object.values(state.territories).filter((t) => t.ownerId).length}/{STONE_AGE_MAP.length} claimed</p>

          {#if !myFactionSelected && myPlayerId && !isSpectator}
            <div class="faction-picker">
              <p class="muted small">Choose your faction</p>
              <div class="faction-options">
                {#each Object.values(FACTIONS) as faction}
                  <button
                    type="button"
                    class="faction-card"
                    on:click={() => emitAction({ type: 'select-faction', factionId: faction.id as FactionId })}
                  >
                    <span class="faction-role">{faction.role}</span>
                    <span class="faction-name">{faction.name}</span>
                    <span class="faction-power-name">{faction.power}</span>
                    <span class="faction-desc">{faction.description}</span>
                  </button>
                {/each}
              </div>
            </div>
          {:else if myFactionSelected && myFaction}
            <div class="faction-chosen">
              <span class="faction-role">{FACTIONS[myFaction].role}</span>
              <span class="faction-name">{FACTIONS[myFaction].name}</span>
              {#if !bothFactionsSelected}
                <span class="muted small">Waiting for opponent...</span>
              {/if}
            </div>
          {/if}
        {/if}

        {#if state.phase === 'active'}
          <p class="muted small">Reinforcements this turn: <strong>{state.reinforcementsRemaining}</strong></p>
        {/if}

        <div class="players">
          {#each state.players as player}
            {@const score = dominanceScore(state, player.id)}
            {@const territories = Object.values(state.territories).filter((t) => t.ownerId === player.id).length}
            {@const pFaction = state.factions[player.id]}
            {@const pCooldown = state.factionCooldowns[player.id]}
            {@const pPowerReady = pCooldown === 0}
            <div
              class="player-row"
              class:viewer={player.socketId === viewerSocketId}
              class:active-player={state.currentTurn === player.id && state.phase === 'active'}
            >
              <span class="player-name">{player.name}</span>
              <span class="muted player-id">{player.id}</span>
              <span class="player-stats">
                {territories}t
                {#if state.phase === 'active' || state.phase === 'finished'}
                  · {score}pts
                {/if}
              </span>
              {#if pFaction}
                <div class="player-faction">
                  <span class="faction-chip">{FACTIONS[pFaction].name}</span>
                  {#if state.phase === 'active'}
                    {#if pPowerReady}
                      <span class="power-ready">{FACTIONS[pFaction].power} ✦</span>
                    {:else}
                      <span class="power-cooldown">{pCooldown}t</span>
                    {/if}
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if state.phase === 'draft' && viewerSocketId === state.hostSocketId}
          <div class="round-cap-picker">
            <span class="muted small">Match length</span>
            <div class="round-cap-options">
              {#each [12, 16, 20] as cap}
                <label class="cap-option" class:cap-selected={selectedRoundCap === cap}>
                  <input type="radio" bind:group={selectedRoundCap} value={cap} />
                  {cap}r
                </label>
              {/each}
            </div>
          </div>
          {#if canStart}
            <button type="button" on:click={() => emitAction({ type: 'start-game', roundCap: selectedRoundCap })}>
              Start war
            </button>
          {:else}
            <p class="muted">Claim all territories to start.</p>
          {/if}
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
            {#if state.winnerId}
              <p class="game-over-label">
                {state.round > state.roundCap ? 'Round cap — dominance win' : 'Conquest'}
              </p>
              <p class="game-over-winner">{winnerName} wins</p>
            {:else}
              <p class="game-over-label">Round cap reached</p>
              <p class="game-over-winner game-over-draw">Draw</p>
              <p class="muted small">
                {#each state.players as p}
                  {p.name}: {dominanceScore(state, p.id)}pts&nbsp;
                {/each}
              </p>
            {/if}
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
    <div class="era-header">
      <span class="era-name">Stone Age</span>
      <span class="era-sub">Dominion Protocol</span>
      {#if state?.phase === 'active'}
        <span class="era-round">Round {Math.min(state.round, state.roundCap)} / {state.roundCap}</span>
      {:else if state?.phase === 'draft'}
        <span class="era-round">Draft</span>
      {:else if state?.phase === 'finished'}
        <span class="era-round">Finished</span>
      {/if}
    </div>

    <div class="map">
      <!-- Adjacency lines -->
      <svg class="map-edges" viewBox="0 0 100 100" preserveAspectRatio="none">
        {#each MAP_EDGES as edge}
          <line x1="{edge.x1}" y1="{edge.y1}" x2="{edge.x2}" y2="{edge.y2}" />
        {/each}
      </svg>

      <!-- Region labels -->
      <span class="region-label" style="left:1%;top:2%">North</span>
      <span class="region-label" style="left:1%;top:33%">Central</span>
      <span class="region-label" style="left:1%;top:58%">South</span>

      {#each STONE_AGE_MAP as territory}
        {@const ts = state?.territories[territory.id]}
        {@const isSelectable = selectableIds.includes(territory.id)}
        {@const isAttackable = attackableIds.includes(territory.id)}
        {@const isAtRisk = atRiskIds.includes(territory.id)}
        {@const isContested = contestedIds.includes(territory.id)}
        {@const isChoke = CHOKE_POINTS.has(territory.id)}
        {@const isMyTarget = myTarget === territory.id}
        {@const isOpponentTarget = opponentTarget === territory.id}
        {@const isFortified = state?.fortifiedTerritoryId === territory.id}
        <button
          type="button"
          class="territory"
          class:owned-by-player1={ts?.ownerId === 'player1'}
          class:owned-by-player2={ts?.ownerId === 'player2'}
          class:selected-territory={state?.selectedTerritoryId === territory.id}
          class:selectable={isSelectable && !isAttackable}
          class:attackable={isAttackable}
          class:choke-point={isChoke}
          class:my-target={isMyTarget}
          class:opponent-target={isOpponentTarget}
          class:fortified={isFortified}
          style="left:{territory.x}%;top:{territory.y}%"
          on:click={() => territoryAction(territory.id)}
        >
          {#if isAtRisk}
            <span class="status-dot at-risk-dot" title="At risk"></span>
          {/if}
          {#if isContested}
            <span class="status-dot contested-dot" title="Contested"></span>
          {/if}
          <span class="territory-label">{territory.label}</span>
          <strong class="territory-units">{ts?.units ?? 0}</strong>
          <div class="territory-tags">
            {#if isChoke}<span class="tag tag-choke">choke</span>{/if}
            {#if isMyTarget}<span class="tag tag-target">target</span>{/if}
            {#if isFortified}<span class="tag tag-fortified">fortified</span>{/if}
          </div>
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

  .player-id {
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

  .game-over-draw {
    color: #98a7b8;
  }

  /* ── Round counter ───────────────────────────────────────────────────── */

  .round-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .round-value {
    font-weight: 700;
    font-size: 0.9rem;
  }

  /* ── Match length picker ─────────────────────────────────────────────── */

  .round-cap-picker {
    display: grid;
    gap: 6px;
  }

  .round-cap-options {
    display: flex;
    gap: 6px;
  }

  .cap-option {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #364150;
    cursor: pointer;
    font-size: 0.85rem;
    background: #1b2128;
    color: #98a7b8;
  }

  .cap-option input[type='radio'] {
    display: none;
  }

  .cap-selected {
    border-color: #d6f36a;
    color: #d6f36a;
    background: #1e2a15;
  }

  /* ── Player stats ────────────────────────────────────────────────────── */

  .player-stats {
    font-size: 0.78rem;
    color: #98a7b8;
    font-variant-numeric: tabular-nums;
  }

  /* ── Faction picker ──────────────────────────────────────────────────── */

  .faction-picker {
    display: grid;
    gap: 8px;
  }

  .faction-options {
    display: grid;
    gap: 6px;
  }

  .faction-card {
    display: grid;
    gap: 3px;
    text-align: left;
    padding: 10px 12px;
    background: #1b2128;
    border: 1px solid #364150;
    border-radius: 6px;
    color: #f4f7fb;
    cursor: pointer;
    font-weight: 400;
    transition: border-color 120ms;
  }

  .faction-card:hover {
    border-color: #d6f36a;
  }

  .faction-role {
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #98a7b8;
  }

  .faction-name {
    font-size: 0.88rem;
    font-weight: 700;
    color: #f4f7fb;
  }

  .faction-power-name {
    font-size: 0.72rem;
    color: #d6f36a;
    font-weight: 600;
  }

  .faction-desc {
    font-size: 0.72rem;
    color: #98a7b8;
    line-height: 1.4;
  }

  .faction-chosen {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #1e2a15;
    border: 1px solid #d6f36a44;
    border-radius: 6px;
  }

  /* ── Player faction status ───────────────────────────────────────────── */

  .player-faction {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.72rem;
  }

  .faction-chip {
    color: #98a7b8;
  }

  .power-ready {
    color: #d6f36a;
    font-weight: 600;
  }

  .power-cooldown {
    color: #98a7b8;
    background: #1b2128;
    border: 1px solid #364150;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.68rem;
  }

  /* ── Spectator ───────────────────────────────────────────────────────── */

  .spectator-notice {
    font-size: 0.75rem;
    color: #98a7b8;
    background: #1b2128;
    border: 1px solid #2b333d;
    border-radius: 6px;
    padding: 5px 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .spectator-badge {
    font-size: 0.72rem;
    color: #98a7b8;
    background: #1b2128;
    border: 1px solid #2b333d;
    border-radius: 4px;
    padding: 1px 6px;
    margin-left: 6px;
    vertical-align: middle;
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
    display: flex;
    flex-direction: column;
  }

  /* Era header bar at the top of the board */
  .era-header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid #2b333d;
    flex-shrink: 0;
  }

  .era-name {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #d6f36a;
  }

  .era-sub {
    font-size: 0.68rem;
    color: #98a7b8;
    letter-spacing: 0.08em;
  }

  .era-round {
    font-size: 0.68rem;
    color: #98a7b8;
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .map {
    position: relative;
    width: 100%;
    flex: 1;
    min-height: 680px;
    background:
      radial-gradient(circle at top left, rgba(214, 243, 106, 0.06), transparent 35%),
      linear-gradient(180deg, #1c242d 0%, #0d1116 100%);
  }

  /* Adjacency lines SVG overlay */
  .map-edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }

  .map-edges line {
    stroke: rgba(255, 255, 255, 0.07);
    stroke-width: 0.5;
  }

  /* Region labels */
  .region-label {
    position: absolute;
    font-size: 0.55rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(152, 167, 184, 0.3);
    pointer-events: none;
    writing-mode: vertical-lr;
    transform: rotate(180deg);
    user-select: none;
  }

  /* Territory status dots */
  .status-dot {
    position: absolute;
    top: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .at-risk-dot {
    right: 5px;
    background: #ff7d4d;
  }

  .contested-dot {
    right: 14px;
    background: #ffd04d;
  }

  /* Territory tag row */
  .territory-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 0.56rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .tag-choke {
    color: rgba(214, 243, 106, 0.5);
    border: 1px solid rgba(214, 243, 106, 0.15);
  }

  /* Your assigned target territory */
  .my-target {
    outline: 2px dashed #d6f36a;
  }

  /* Opponent's target (territory they need to capture) */
  .opponent-target {
    outline: 2px dashed #ff7d4d44;
  }

  .tag-target {
    color: #d6f36a;
    border: 1px solid #d6f36a44;
  }

  /* Bastion fortified territory */
  .fortified {
    box-shadow: inset 0 0 0 2px rgba(90, 143, 212, 0.5);
  }

  .tag-fortified {
    color: #5a8fd4;
    border: 1px solid #5a8fd444;
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

  .choke-point {
    border-color: rgba(214, 243, 106, 0.2);
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
