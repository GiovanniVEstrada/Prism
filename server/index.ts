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
  roomReady,
  selectTerritory,
  startGame
} from '../src/lib/game/engine';
import type { ClientEvent, GameState, PlayerState, RoomSnapshot } from '../src/lib/game/types';

const PORT = Number(process.env.PRISM_SERVER_PORT ?? process.env.PORT ?? 3001);
const roomStates = new Map<string, GameState>();
const socketToRoom = new Map<string, string>();

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
  if (!roomCode) {
    return;
  }

  socketToRoom.delete(socketId);
  const state = roomStates.get(roomCode);
  if (!state) {
    return;
  }

  const remainingPlayers = state.players.filter((player) => player.socketId !== socketId);
  if (remainingPlayers.length === 0) {
    roomStates.delete(roomCode);
    return;
  }

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
  if (!state) {
    return;
  }

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
  if (!roomCode) {
    throw new Error('You are not in a room.');
  }

  const state = roomStates.get(roomCode);
  if (!state) {
    throw new Error('Room was not found.');
  }

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
      if (!state) {
        throw new Error('Room does not exist.');
      }

      const player: PlayerState = {
        id: state.players.some((existingPlayer) => existingPlayer.id === 'player1') ? 'player2' : 'player1',
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
    if (!playerId) {
      throw new Error('Player was not found in room.');
    }

    let nextState = state;

    switch (action.type) {
      case 'claim-territory':
        if (!roomReady(state)) {
          throw new Error('Waiting for second player.');
        }
        nextState = claimTerritory(state, playerId, action.territoryId);
        break;
      case 'start-game':
        nextState = startGame(state, socketId);
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
