<script lang="ts">
  import { onMount } from 'svelte';
  import { connectSocket, emitAction } from '$lib/client/socket';
  import { getMapConfig } from '$lib/game/map';
  import { isDraftComplete, dominanceScore, FACTIONS } from '$lib/game/engine';
  import { playTurnStart, playConquest, playTerritoryLost, playWin, playLoss } from '$lib/client/audio';
  import type { EraId, FactionId, GameEvent, GameState, PlayerId, TerritoryId, TierSize } from '$lib/game/types';

  let selectedEra: EraId = 'stone-age';
  let selectedTier: TierSize = 'small';
  let selectedRoundCap = 12;
  let botDifficulty: 'passive' | 'aggressive' = 'passive';

  let playerName = '';
  let roomCode = '';
  let currentRoomCode = '';
  let errorMessage = '';
  let connected = false;
  let viewerSocketId: string | null = null;
  let isSpectator = false;
  let spectatorCount = 0;
  let state: GameState | null = null;

  $: currentMap = getMapConfig(state?.era ?? selectedEra, state?.tier ?? selectedTier);
  $: currentMapTerritories = currentMap.territories;
  $: mapEdges = (() => {
    const seen = new Set<string>();
    const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const t of currentMapTerritories) {
      for (const adjId of t.adjacent) {
        const key = [t.id, adjId].sort().join('--');
        if (!seen.has(key)) {
          seen.add(key);
          const adj = currentMapTerritories.find((m) => m.id === adjId)!;
          edges.push({ x1: t.x, y1: t.y, x2: adj.x, y2: adj.y });
        }
      }
    }
    return edges;
  })();
  $: chokePointsSet = new Set<TerritoryId>(state?.chokePoints ?? []);

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
      ? (currentMapTerritories.find((t) => t.id === state!.selectedTerritoryId)?.adjacent ?? []).filter(
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
            const def = currentMapTerritories.find((m) => m.id === t.id);
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
    return currentMapTerritories.find((t) => t.id === id)?.label ?? id;
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
    emitAction({ type: 'create-room', playerName: playerName || 'Player 1', era: selectedEra, tier: selectedTier });
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
    <div class="panel logo-panel">
      <h1>Prism</h1>
      <p class="logo-sub">Stone Age · Dominion</p>
    </div>

    <div class="panel stack">
      <label>
        <span>Name</span>
        <input bind:value={playerName} maxlength="18" placeholder="Player name" />
      </label>

      {#if !state}
        <div class="map-selector">
          <span class="muted small">Era</span>
          <div class="round-cap-options">
            <label class="cap-option" class:cap-selected={selectedEra === 'stone-age'}>
              <input type="radio" bind:group={selectedEra} value="stone-age" />
              Stone Age
            </label>
            <label class="cap-option cap-disabled" title="Coming soon">Bronze Age</label>
            <label class="cap-option cap-disabled" title="Coming soon">Medieval</label>
          </div>
          <span class="muted small">Tier</span>
          <div class="round-cap-options">
            <label class="cap-option" class:cap-selected={selectedTier === 'small'}>
              <input type="radio" bind:group={selectedTier} value="small" />
              Small
            </label>
            <label class="cap-option" class:cap-selected={selectedTier === 'medium'}>
              <input type="radio" bind:group={selectedTier} value="medium" />
              Medium
            </label>
            <label class="cap-option" class:cap-selected={selectedTier === 'large'}>
              <input type="radio" bind:group={selectedTier} value="large" />
              Large
            </label>
          </div>
        </div>
      {/if}

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

    {#if state && state.phase === 'lobby' && state.players.length === 1 && viewerSocketId === state.hostSocketId}
      <div class="panel stack">
        <h2>Solo mode</h2>
        <div class="round-cap-options">
          {#each [['passive', 'Warden'], ['aggressive', 'Aggressor']] as [val, label]}
            <label class="cap-option" class:cap-selected={botDifficulty === val}>
              <input type="radio" bind:group={botDifficulty} value={val} />
              {label}
            </label>
          {/each}
        </div>
        <button type="button" on:click={() => emitAction({ type: 'add-bot', difficulty: botDifficulty })}>
          Add bot opponent
        </button>
      </div>
    {/if}

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
          <p class="muted small">Draft: {Object.values(state.territories).filter((t) => t.ownerId).length}/{currentMapTerritories.length} claimed</p>

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
            {@const isBot = player.socketId === 'bot'}
            <div
              class="player-row"
              class:viewer={player.socketId === viewerSocketId}
              class:active-player={state.currentTurn === player.id && state.phase === 'active'}
            >
              <span class="player-name">{player.name}{#if isBot}<span class="bot-tag">AI</span>{/if}</span>
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
      <span class="era-name">{currentMap.label}</span>
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
        {#each mapEdges as edge}
          <line x1="{edge.x1}" y1="{edge.y1}" x2="{edge.x2}" y2="{edge.y2}" />
        {/each}
      </svg>

      <!-- Region labels -->
      {#each currentMap.regionLabels as rl}
        <span class="region-label" style="left:{rl.x}%;top:{rl.y}%">{rl.label}</span>
      {/each}

      {#each currentMapTerritories as territory}
        {@const ts = state?.territories[territory.id]}
        {@const isSelectable = selectableIds.includes(territory.id)}
        {@const isAttackable = attackableIds.includes(territory.id)}
        {@const isAtRisk = atRiskIds.includes(territory.id)}
        {@const isContested = contestedIds.includes(territory.id)}
        {@const isChoke = chokePointsSet.has(territory.id)}
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
    font-family: Inter, system-ui, -apple-system, sans-serif;
    background: #07090d;
    color: #b4c8d8;
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
  }

  .shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 292px 1fr;
    gap: 10px;
    padding: 10px;
    box-sizing: border-box;
  }

  .sidebar,
  .stack {
    display: grid;
    gap: 8px;
    align-content: start;
  }

  .panel {
    background: #0c1118;
    border: 1px solid #182030;
    border-radius: 4px;
    padding: 12px 14px;
  }

  .logo-panel {
    padding: 14px;
    border-color: #1c2a3c;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-size: 1.15rem;
    font-weight: 900;
    letter-spacing: 0.26em;
    color: #d6f36a;
    text-transform: uppercase;
  }

  .logo-sub {
    font-size: 0.58rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #4e7090;
    margin-top: 4px;
  }

  h2 {
    font-size: 0.56rem;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #4e6a82;
    border-bottom: 1px solid #111c2a;
    padding-bottom: 7px;
  }

  .muted {
    color: #607e98;
  }

  .small {
    font-size: 0.78rem;
  }

  .status {
    font-size: 0.67rem;
    color: #5a7a90;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    letter-spacing: 0.04em;
  }

  .room {
    font-size: 0.74rem;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    color: #5a7a90;
    letter-spacing: 0.06em;
  }

  .error {
    font-size: 0.74rem;
    color: #d04830;
    background: #160a08;
    border: 1px solid #38160e;
    border-radius: 3px;
    padding: 6px 10px;
  }

  label {
    display: grid;
    gap: 5px;
    font-size: 0.62rem;
    color: #5a7a90;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  input,
  button {
    border-radius: 3px;
    border: 1px solid #1c2f45;
    padding: 8px 12px;
    font: inherit;
    font-size: 0.82rem;
    box-sizing: border-box;
  }

  input {
    background: #060a10;
    color: #b4c8d8;
  }

  input::placeholder {
    color: #304860;
  }

  button {
    background: #d6f36a;
    color: #080b04;
    cursor: pointer;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  button:disabled {
    opacity: 0.22;
    cursor: not-allowed;
  }

  .ghost {
    background: transparent;
    color: #385870;
    font-weight: 400;
    border-color: #182030;
  }

  .inline {
    display: grid;
    grid-template-columns: 1fr 64px 1fr;
    gap: 6px;
    align-items: end;
  }

  .room-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .room-row .room {
    flex: 1;
  }

  /* ── Turn header ─────────────────────────────────────────────────────── */

  .turn-header {
    min-height: 1.25rem;
  }

  .turn-mine {
    font-size: 0.72rem;
    font-weight: 700;
    color: #d6f36a;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .turn-theirs {
    font-size: 0.72rem;
    color: #385870;
    letter-spacing: 0.06em;
  }

  /* ── Players ─────────────────────────────────────────────────────────── */

  .players {
    display: grid;
    gap: 4px;
  }

  .player-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 6px;
    align-items: center;
    padding: 5px 8px;
    border-radius: 3px;
    border: 1px solid transparent;
  }

  .player-row.viewer {
    border-color: #182030;
  }

  .player-row.active-player {
    border-color: #d6f36a1e;
    background: #0b1108;
  }

  .player-name {
    font-size: 0.82rem;
    font-weight: 600;
    color: #b4c8d8;
  }

  .player-id {
    font-size: 0.6rem;
    color: #4a6a82;
    font-family: ui-monospace, monospace;
  }

  .bot-tag {
    display: inline-block;
    margin-left: 5px;
    font-size: 0.52rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #d6f36a;
    background: #1a2208;
    border: 1px solid #d6f36a33;
    border-radius: 2px;
    padding: 1px 4px;
    vertical-align: middle;
  }

  .player-stats {
    font-size: 0.67rem;
    color: #5a7a90;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.02em;
  }

  /* ── Actions ─────────────────────────────────────────────────────────── */

  .action-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .targets {
    display: grid;
    gap: 4px;
  }

  /* ── Last combat ─────────────────────────────────────────────────────── */

  .dice-row {
    display: flex;
    gap: 14px;
    font-size: 0.7rem;
    color: #5a7a90;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.04em;
  }

  .conquest-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: #d6f36a;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  /* ── Game over ───────────────────────────────────────────────────────── */

  .game-over {
    border: 1px solid #d6f36a2a;
    background: #090e06;
    border-radius: 3px;
    padding: 10px 12px;
    display: grid;
    gap: 5px;
  }

  .game-over-label {
    font-size: 0.56rem;
    color: #5a7a90;
    text-transform: uppercase;
    letter-spacing: 0.16em;
  }

  .game-over-winner {
    font-size: 1.3rem;
    font-weight: 900;
    color: #d6f36a;
    letter-spacing: 0.06em;
  }

  .game-over-draw {
    color: #385870;
  }

  /* ── Round counter ───────────────────────────────────────────────────── */

  .round-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .round-value {
    font-weight: 700;
    font-size: 0.85rem;
    font-family: ui-monospace, monospace;
    color: #b4c8d8;
    letter-spacing: 0.04em;
  }

  /* ── Match length picker ─────────────────────────────────────────────── */

  .round-cap-picker {
    display: grid;
    gap: 5px;
  }

  .round-cap-options {
    display: flex;
    gap: 4px;
  }

  .cap-option {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid #182030;
    cursor: pointer;
    font-size: 0.7rem;
    background: #060a10;
    color: #507090;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.04em;
  }

  .cap-option input[type='radio'] {
    display: none;
  }

  .cap-selected {
    border-color: #d6f36a55;
    color: #d6f36a;
    background: #0b1008;
  }

  .cap-disabled {
    opacity: 0.28;
    cursor: not-allowed;
    pointer-events: none;
  }

  .map-selector {
    display: grid;
    gap: 4px;
  }

  /* ── Player stats ────────────────────────────────────────────────────── */

  /* (defined above in .player-stats) */

  /* ── Faction picker ──────────────────────────────────────────────────── */

  .faction-picker {
    display: grid;
    gap: 6px;
  }

  .faction-options {
    display: grid;
    gap: 4px;
  }

  .faction-card {
    display: grid;
    gap: 2px;
    text-align: left;
    padding: 9px 12px;
    background: #060a10;
    border: 1px solid #182030;
    border-radius: 3px;
    color: #b4c8d8;
    cursor: pointer;
    font-weight: 400;
    transition: border-color 80ms;
  }

  .faction-card:hover {
    border-color: #d6f36a44;
  }

  .faction-role {
    font-size: 0.54rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: #4a6a82;
  }

  .faction-name {
    font-size: 0.82rem;
    font-weight: 700;
    color: #b4c8d8;
  }

  .faction-power-name {
    font-size: 0.67rem;
    color: #d6f36a;
    font-weight: 600;
  }

  .faction-desc {
    font-size: 0.64rem;
    color: #507090;
    line-height: 1.5;
  }

  .faction-chosen {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #0a1008;
    border: 1px solid #d6f36a2a;
    border-radius: 3px;
  }

  /* ── Player faction status ───────────────────────────────────────────── */

  .player-faction {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.63rem;
  }

  .faction-chip {
    color: #507090;
    font-family: ui-monospace, monospace;
  }

  .power-ready {
    color: #d6f36a;
    font-weight: 700;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .power-cooldown {
    color: #507090;
    background: #060a10;
    border: 1px solid #182030;
    border-radius: 2px;
    padding: 1px 4px;
    font-size: 0.6rem;
    font-family: ui-monospace, monospace;
  }

  /* ── Spectator ───────────────────────────────────────────────────────── */

  .spectator-notice {
    font-size: 0.6rem;
    color: #507090;
    background: #060a10;
    border: 1px solid #182030;
    border-radius: 3px;
    padding: 4px 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .spectator-badge {
    font-size: 0.6rem;
    color: #507090;
    background: #060a10;
    border: 1px solid #182030;
    border-radius: 2px;
    padding: 1px 5px;
    margin-left: 5px;
    vertical-align: middle;
    font-family: ui-monospace, monospace;
  }

  /* ── Event log ───────────────────────────────────────────────────────── */

  .event-log {
    display: grid;
    gap: 3px;
    max-height: 160px;
    overflow-y: auto;
  }

  .event {
    font-size: 0.67rem;
    color: #4e7090;
    line-height: 1.45;
    font-family: ui-monospace, 'Cascadia Code', monospace;
  }

  .event::before {
    content: '› ';
    color: #182030;
  }

  .event-win {
    color: #d6f36a;
    font-weight: 600;
  }

  .event-win::before {
    color: #6a8030;
  }

  .event-reset {
    color: #2d6090;
  }

  .event-reset::before {
    color: #1a3850;
  }

  /* ── Board ───────────────────────────────────────────────────────────── */

  .board {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .era-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 14px;
    border-bottom: 1px solid #182030;
    flex-shrink: 0;
  }

  .era-name {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: #d6f36a;
  }

  .era-sub {
    font-size: 0.58rem;
    color: #4e7090;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .era-round {
    font-size: 0.6rem;
    color: #4e7090;
    margin-left: auto;
    font-family: ui-monospace, monospace;
    letter-spacing: 0.08em;
  }

  .map {
    position: relative;
    width: 100%;
    flex: 1;
    min-height: 680px;
    background-color: #070a10;
    background-image:
      linear-gradient(rgba(180, 210, 240, 0.022) 1px, transparent 1px),
      linear-gradient(90deg, rgba(180, 210, 240, 0.022) 1px, transparent 1px);
    background-size: 46px 46px;
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
    stroke: rgba(180, 210, 240, 0.065);
    stroke-width: 0.55;
  }

  /* Region labels */
  .region-label {
    position: absolute;
    font-size: 0.52rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(90, 135, 165, 0.6);
    pointer-events: none;
    writing-mode: vertical-lr;
    transform: rotate(180deg);
    user-select: none;
    font-family: ui-monospace, monospace;
  }

  /* Territory status dots */
  .status-dot {
    position: absolute;
    top: 5px;
    width: 4px;
    height: 4px;
    border-radius: 50%;
  }

  .at-risk-dot {
    right: 6px;
    background: #ff7d4d;
  }

  .contested-dot {
    right: 14px;
    background: #d4a020;
  }

  /* Territory tag row */
  .territory-tags {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 0.5rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 1px 3px;
    border-radius: 2px;
  }

  .tag-choke {
    color: rgba(214, 243, 106, 0.32);
    border: 1px solid rgba(214, 243, 106, 0.1);
  }

  .my-target {
    outline: 2px dashed #d6f36a88;
    outline-offset: 1px;
  }

  .opponent-target {
    outline: 2px dashed rgba(255, 125, 77, 0.22);
    outline-offset: 1px;
  }

  .tag-target {
    color: #d6f36a;
    border: 1px solid #d6f36a33;
  }

  .fortified {
    box-shadow: inset 0 0 0 2px rgba(80, 130, 200, 0.32);
  }

  .tag-fortified {
    color: #5a8fd4;
    border: 1px solid #5a8fd433;
  }

  /* ── Territory cards ─────────────────────────────────────────────────── */

  .territory {
    position: absolute;
    width: 148px;
    min-height: 66px;
    display: grid;
    gap: 2px;
    align-content: center;
    justify-items: start;
    transform: translate(-50%, -50%);
    background: #16243a;
    color: #b4c8d8;
    text-align: left;
    padding: 8px 10px 8px 14px;
    transition: outline 60ms;
    border: 1px solid #243550;
    border-radius: 2px;
    cursor: pointer;
  }

  /* Left ownership strip */
  .territory::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    border-radius: 2px 0 0 2px;
    background: #2a3e58;
    transition: background 100ms;
  }

  .owned-by-player1 {
    background: #142440;
    border-color: #204060;
  }

  .owned-by-player1::before {
    background: #2d6ea8;
  }

  .owned-by-player2 {
    background: #2c1210;
    border-color: #4e2018;
  }

  .owned-by-player2::before {
    background: #a8382a;
  }

  .territory-label {
    font-size: 0.68rem;
    color: #5a80a0;
    line-height: 1.2;
    letter-spacing: 0.02em;
  }

  .owned-by-player1 .territory-label {
    color: #4a80b8;
  }

  .owned-by-player2 .territory-label {
    color: #a85050;
  }

  .territory-units {
    font-size: 1.25rem;
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-weight: 700;
    color: #c8dce8;
    line-height: 1;
  }

  .choke-point {
    border-color: rgba(214, 243, 106, 0.18);
  }

  .selected-territory {
    outline: 2px solid #d6f36a;
    outline-offset: 1px;
  }

  .selectable {
    outline: 1px solid #d6f36a50;
  }

  .attackable {
    outline: 2px solid #ff7d4d;
    outline-offset: 1px;
  }

  @media (max-width: 960px) {
    .shell {
      grid-template-columns: 1fr;
    }

    .board,
    .map {
      min-height: 480px;
    }

    .territory {
      width: 118px;
      min-height: 56px;
    }
  }
</style>
