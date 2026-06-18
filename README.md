# Prism

Prism starts with the protocol:

- one room
- one Stone Age map
- two players
- server-authoritative turns, reinforcement, and attack resolution

## What is in place

- SvelteKit client for room creation, joining, map clicks, and board updates
- Socket.io server that owns room state and validates every action
- One Stone Age map with six connected territories
- Draft claiming, turn start, reinforcement, attack, server-side dice rolls, broadcast updates, win detection

## Roadmap

The versioned roadmap lives in [ROADMAP.md](/home/gio/Prism/ROADMAP.md).

## Intended local workflow

1. Install Node.js 20+
2. Run `npm install`
3. Run `npm run dev`
4. Open the Svelte app on port `5173`
5. Open a second browser window and join the same room

The Vite dev server proxies `/socket.io` traffic to the authoritative server on `3001`.

If port `3001` is already in use, run Prism on another server port:

```bash
PRISM_SERVER_PORT=3002 VITE_PRISM_SERVER_PORT=3002 npm run dev
```
