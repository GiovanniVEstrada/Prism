import { io, type Socket } from 'socket.io-client';
import type { ClientEvent, ServerMessage } from '$lib/game/types';

let socket: Socket | null = null;

export function connectSocket(onMessage: (message: ServerMessage) => void): Socket {
  if (socket) {
    return socket;
  }

  socket = io({
    transports: ['websocket']
  });

  socket.on('server:message', onMessage);
  return socket;
}

export function emitAction(action: ClientEvent) {
  if (!socket) {
    throw new Error('Socket not connected.');
  }

  socket.emit('client:action', action);
}

