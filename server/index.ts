import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  attack,
  claimTerritory,
  createRoom,
  endTurn,
  getPlayerIdBySocket,
  isDraftComplete,
  joinRoom,
  reinforce,
  resetGame,
  roomReady,
  selectTerritory,
  startGame
} from '../src/lib/game/engine';
import type { ClientEvent, GameState, PlayerState, RoomSnapshot } from '../src/lib/game/types';

const PORT = Number(process.env.PRISM_SERVER_PORT ?? process.env.PORT ?? 3001);
const RECONNECT_WINDOW_MS = 45_000;

const roomStates = new Map<string, GameState>();
const socketToRoom = new Map<string, string>();

// Tracks players who disconnected mid-match so they can reclaim their slot.
type ReconnectEntry = {
  player: PlayerState;
  timer: ReturnType<typeof setTimeout>;
};
const pendingReconnects = new Map<string, ReconnectEntry>(); // key: roomCode

const httpServer = createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('Prism socket server is live.\n');
});

const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  do {
    code = '';
    for (let i = 0; i < 6; i += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  } while (roomStates.has(code));

  return code;
}

function removeSocketFromRoom(socketId: string) {
  const roomCode = socketToRoom.get(socketId);
  if (!roomCode) return;

  socketToRoom.delete(socketId);
  const state = roomStates.get(roomCode);
  if (!state) return;

  const remainingPlayers = state.players.filter((player) => player.socketId !== socketId);
  if (remainingPlayers.length === 0) {
    roomStates.delete(roomCode);
    return;
  }

  const disconnectedPlayer = state.players.find((p) => p.socketId === socketId);

  // Hold the room open during an active or draft match so the player can reconnect.
  if (disconnectedPlayer && (state.phase === 'active' || state.phase === 'draft')) {
    const existing = pendingReconnects.get(roomCode);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      pendingReconnects.delete(roomCode);
      const current = roomStates.get(roomCode);
      if (!current) return;

      // Time expired — reset the room to lobby with the remaining player as host.
      const nextState: GameState = {
        ...current,
        hostSocketId: remainingPlayers[0].socketId,
        players: remainingPlayers,
        phase: 'lobby',
        currentTurn: null,
        draftTurn: null,
        reinforcementsRemaining: 0,
        selectedTerritoryId: null,
        lastAttack: null,
        winnerId: null
      };
      roomStates.set(roomCode, nextState);
      emitSnapshot(roomCode);
    }, RECONNECT_WINDOW_MS);

    pendingReconnects.set(roomCode, { player: disconnectedPlayer, timer });

    emitError(
      remainingPlayers[0].socketId,
      `${disconnectedPlayer.name} disconnected. Waiting ${RECONNECT_WINDOW_MS / 1000}s for them to rejoin...`
    );
    return;
  }

  // Outside an active match — reset immediately.
  const nextState: GameState = {
    ...state,
    hostSocketId: remainingPlayers[0].socketId,
    players: remainingPlayers,
    phase: remainingPlayers.length === 2 && isDraftComplete(state) ? state.phase : 'lobby',
    currentTurn: null,
    draftTurn: remainingPlayers.length === 2 ? remainingPlayers[0].id : null,
    reinforcementsRemaining: 0,
    selectedTerritoryId: null,
    lastAttack: null,
    winnerId: null
  };

  roomStates.set(roomCode, nextState);
  emitSnapshot(roomCode);
}

function emitError(socketId: string, message: string) {
  io.to(socketId).emit('server:message', {
    type: 'room:error',
    payload: { message }
  });
}

function emitSnapshot(roomCode: string) {
  const state = roomStates.get(roomCode);
  if (!state) return;

  for (const player of state.players) {
    const snapshot: RoomSnapshot = {
      state,
      viewerSocketId: player.socketId
    };
    io.to(player.socketId).emit('server:message', {
      type: 'room:update',
      payload: snapshot
    });
  }
}

function withRoom(socketId: string): GameState {
  const roomCode = socketToRoom.get(socketId);
  if (!roomCode) throw new Error('You are not in a room.');

  const state = roomStates.get(roomCode);
  if (!state) throw new Error('Room was not found.');

  return state;
}

function applyAction(socketId: string, action: ClientEvent) {
  try {
    if (action.type === 'create-room') {
      removeSocketFromRoom(socketId);
      const roomCode = makeRoomCode();
      const host: PlayerState = {
        id: 'player1',
        socketId,
        name: action.playerName.trim() || 'Player 1'
      };
      const state = createRoom(roomCode, host);
      roomStates.set(roomCode, state);
      socketToRoom.set(socketId, roomCode);
      io.sockets.sockets.get(socketId)?.join(roomCode);
      emitSnapshot(roomCode);
      return;
    }

    if (action.type === 'join-room') {
      removeSocketFromRoom(socketId);
      const roomCode = action.roomCode.trim().toUpperCase();
      const state = roomStates.get(roomCode);
      if (!state) throw new Error('Room does not exist.');

      // Reconnect path: restore the disconnected player's slot with the new socket.
      const reconnect = pendingReconnects.get(roomCode);
      if (reconnect) {
        clearTimeout(reconnect.timer);
        pendingReconnects.delete(roomCode);

        const restoredPlayer: PlayerState = {
          ...reconnect.player,
          socketId
        };
        const nextState: GameState = {
          ...state,
          players: state.players.map((p) =>
            p.id === restoredPlayer.id ? restoredPlayer : p
          )
        };
        roomStates.set(roomCode, nextState);
        socketToRoom.set(socketId, roomCode);
        io.sockets.sockets.get(socketId)?.join(roomCode);
        emitSnapshot(roomCode);
        return;
      }

      const player: PlayerState = {
        id: state.players.some((p) => p.id === 'player1') ? 'player2' : 'player1',
        socketId,
        name: action.playerName.trim() || 'Player 2'
      };
      const nextState = joinRoom(state, player);
      roomStates.set(roomCode, nextState);
      socketToRoom.set(socketId, roomCode);
      io.sockets.sockets.get(socketId)?.join(roomCode);
      emitSnapshot(roomCode);
      return;
    }

    const state = withRoom(socketId);
    const playerId = getPlayerIdBySocket(state, socketId);
    if (!playerId) throw new Error('Player was not found in room.');

    let nextState = state;

    switch (action.type) {
      case 'claim-territory':
        if (!roomReady(state)) throw new Error('Waiting for second player.');
        nextState = claimTerritory(state, playerId, action.territoryId);
        break;
      case 'start-game': {
        const validCaps = [12, 16, 20];
        const cap = validCaps.includes(action.roundCap) ? action.roundCap : 12;
        nextState = startGame(state, socketId, cap);
        break;
      }
      case 'reset-game':
        nextState = resetGame(state, socketId);
        break;
      case 'select-territory':
        nextState = selectTerritory(state, playerId, action.territoryId);
        break;
      case 'reinforce':
        nextState = reinforce(state, playerId, action.territoryId);
        break;
      case 'attack':
        nextState = attack(state, playerId, action.from, action.to);
        break;
      case 'end-turn':
        nextState = endTurn(state, playerId);
        break;
      default:
        break;
    }

    roomStates.set(state.roomCode, nextState);
    emitSnapshot(state.roomCode);
  } catch (error) {
    emitError(socketId, error instanceof Error ? error.message : 'Unknown server error.');
  }
}

io.on('connection', (socket) => {
  socket.on('client:action', (action: ClientEvent) => {
    applyAction(socket.id, action);
  });

  socket.on('disconnect', () => {
    removeSocketFromRoom(socket.id);
  });
});

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Prism socket server could not start because port ${PORT} is already in use. ` +
        `Stop the existing process or run with PRISM_SERVER_PORT=<port>.`
    );
    process.exit(1);
  }

  throw error;
});

httpServer.listen(PORT, () => {
  console.log(`Prism socket server listening on http://localhost:${PORT}`);
});
