# Prism Roadmap

Prism ships in layers.

The rule for every version:

`state in -> action validated -> result emitted -> world updated`

## Scope Constraints Through v1.0.0

Two players only. Three or more player support is post-1.0.

All match actions are server-authoritative through every milestone. Client never decides combat, ownership, or turn order.

## Versioning Rules

Use pre-1.0 versions with simple intent:

- Minor versions (`0.x.0`) mark a meaningful product step
- Patch versions (`0.x.y`) mark fixes, cleanup, tuning, or small additions inside that step

Examples:

- `0.1.1`: fix combat edge cases
- `0.1.2`: improve room error handling
- `0.2.1`: add rematch polish without changing the `0.2.0` goal
- `0.3.1`: tune dominance thresholds after playtesting

Patch version triggers:

- Bug fixes
- Small UX improvements
- Test coverage additions
- Balance tuning
- Small protocol-safe features that do not change the milestone goal

Minor version triggers:

- New milestone scope
- New system layer
- New rule model
- New multiplayer capability
- New era or content tier that changes the roadmap stage

## v0.1.0 - Protocol Spine

Goal: prove the game loop works with a server-authoritative core.

Status: **Complete**

Scope:

- SvelteKit client
- Socket.io authoritative server
- Create one room
- Join one room
- Two players only
- One Stone Age map
- Click territory
- Claim ownership
- Start turns
- Reinforce
- Attack adjacent territory
- Roll dice on the server
- Broadcast results
- Update board state
- End turn
- Win by full conquest

Exit criteria:

- Two browser clients can finish a full match
- No client decides combat or ownership
- Server remains source of truth for every action

## v0.2.0 - Match Quality

Goal: make the first loop stable, readable, and replayable without developer intervention.

Status: **Complete**

Scope:

- Rematch and game reset flow without reloading the page
- Clear feedback on turn, phase, and action errors — every invalid action has a visible reason
- Minimal disconnect recovery: room state is held open briefly after a player drops so they can rejoin by room code without losing the match
- Copyable invite link: room code is shareable as a URL parameter so players do not need to type it manually
- Expanded Stone Age map: target 12 territories with regional clusters and meaningful choke points
- Basic event log: running feed of attacks, conquests, and turn changes in the sidebar
- Improved board readability: whose turn it is, which territories are selectable, unit count changes
- Server-side tests: turn order enforcement, attack validation, win condition, disconnect and rejoin

Exit criteria:

- A match can be started, finished, and restarted without manual cleanup or page reload
- Invalid actions always fail with a clear, human-readable message
- A player who briefly disconnects can rejoin the existing room before it expires
- Stone Age map feels legible and strategic to a new player without explanation
- Players can share a link and join directly from it

## v0.3.0 - Short-Form Ruleset

Goal: define what makes Prism a distinct game, then implement it. This milestone requires settling game design before writing code.

Status: **Complete**

Design questions to answer before scope is finalized:

- What does the dominance score track — territory count, unit presence, controlled choke points, or a combination?
- What is the round cap target for a 15–25 minute match?
- What is the reinforcement formula — territory-count scaling, flat rate, or controlled-region bonus?
- Does a capital territory mechanic exist, and if so, what does losing your capital mean?
- Can a player attack multiple times per turn, and if so, are there restrictions?
- What happens to units when a territory is conquered — do some transfer to the attacker?

Scope (implemented once design decisions are made):

- Dominance score calculated at each turn end and visible to both players
- Round counter displayed throughout the match
- Match ends on conquest or round cap, whichever comes first
- If the round cap is reached, the player with the higher dominance score wins
- Reinforcement formula based on territories controlled rather than a flat +1
- Configurable match length presets: short and standard
- First balance pass after initial playtesting sessions
- Stalemate conditions identified and addressed in the ruleset

Exit criteria:

- Average match length targets 15–25 minutes
- Stalemates are rare under the new rules
- Both aggressive and positional play styles have viable paths to victory
- Round cap creates end-game urgency without feeling arbitrary
- Players understand the win condition on first play without reading documentation

## v0.4.0 - Multiplayer Foundation

Goal: make online play durable enough for real playtesting from here forward.

This milestone moves earlier than originally planned because every milestone from v0.4.0 onward requires stable real-player sessions to validate. Fragile disconnect behavior makes playtesting across multiple milestones too painful to sustain.

Scope:

- Full session persistence: active match state survives a server restart (Redis or equivalent store)
- Reconnect and resume: a player can re-enter a match in progress by room code within a configurable window
- Lobby flow: waiting room with ready state before the match starts
- Multiple concurrent rooms at stable scale
- Spectator role: view-only mode with no game actions, clearly separated from player state
- Socket session token: prevents a reconnecting socket from accidentally or deliberately taking a different player's slot
- Basic stress test: two clients completing full matches under simulated packet loss or delay

Exit criteria:

- Disconnects do not kill a match in progress; the room holds for the reconnect window
- A player who disconnects mid-match can resume without losing their state
- A socket reconnecting with the wrong identity cannot hijack a player slot
- A spectator can join and observe a match without affecting game state
- Multiple rooms run concurrently without interference

## v0.5.0 - Simulation Identity

Goal: give Prism its own visual and audio language before content and factions are layered on top.

This milestone lands after the multiplayer foundation is stable because the visual system needs to accommodate faction colors and era theming without being rebuilt.

Scope:

- Simulation-terminal aesthetic: dark palette, structured data panels, clear hierarchy
- Faction color system: territory ownership reads unambiguously at a glance for all planned factions
- Event feed: human-readable description of each game event — attacks, losses, conquests, turn changes
- Era framing: map header, phase labels, and territory flavor text scoped per era
- Map overlay system: region boundaries, choke points, and control zones visible on the board
- Territory state indicators: selected, attackable, contested, reinforced, at-risk
- Sound cues for state transitions: conquest, turn change, loss, win — present but not decorative
- Motion only where it clarifies a state change, not for atmosphere

Exit criteria:

- Prism no longer reads as a generic board prototype
- Players understand phase, ownership, and threat at a glance without reading labels
- The visual system accommodates faction colors and era changes without structural changes
- Sound cues help players track events without demanding attention

## v0.6.0 - Factions

Goal: introduce asymmetry once the core loop, multiplayer, and visual system are stable.

Design questions to answer before scope is finalized:

- How many factions ship at v0.6.0? Target is 2–4.
- What is each faction's identity and role — aggressive, defensive, economic, disruption?
- What is each faction's one power: trigger condition, effect, any cost, and server-side validation rule?
- Is faction selection pre-match or part of a draft order?
- How does faction power availability display in the UI?

Scope (implemented once faction designs are settled):

- Faction selection in lobby before match start
- Each faction power implemented as a new validated client action and server event
- Faction-specific UI state showing power availability, cooldown if any, and trigger condition
- Faction identity visible in the event feed and on the board
- Balance pass against the base ruleset after initial playtesting
- Factions documented in-game so a new player can understand their power before the match starts

Exit criteria:

- Each faction creates a meaningfully different play style
- Every faction action is server-validated the same way combat is
- No faction power makes the match unwinnable for the opponent
- Players can identify their faction's advantage within the first two turns
- No faction wins significantly more often than others in early playtesting

## v0.7.0 - AI Opponent

Goal: let a single player complete a full match without a second client.

Without an AI, solo testing requires two browser windows forever. At launch, players also need a way to play without finding an opponent online at the same time.

Scope:

- Bot player runs server-side with no client connection required
- Minimum viable bot: legal-move selection with consistent, non-random priority
- Difficulty modes: at minimum passive (prefers reinforce and defend) and aggressive (prefers expand and attack)
- Bot participates in draft, active phase, and handles game end correctly
- Configurable bot think delay to avoid instant moves that feel inhuman
- Solo mode: host can start a match against the bot without waiting for a second player
- Bot behavior is deterministic or seeded so playtesting issues can be reproduced

Exit criteria:

- Solo player can start and finish a full match against the bot from the normal lobby
- Bot never makes an illegal move or causes a server error
- Passive and aggressive modes produce observably different play styles and win rates
- Bot loses to a competent player at passive difficulty and wins at aggressive difficulty at a meaningful rate
- Bot matches complete in reasonable time without requiring intervention

## v0.8.0 - Era Expansion

Goal: prove Prism's protocol carries cleanly across multiple maps and time periods, and give the game enough content variety to sustain replayability.

Scope:

- Data-driven map loader: maps defined as configuration files, not hardcoded in engine
- Stone Age map reviewed and finalized: territory count, adjacency graph, and choke points confirmed for the final version
- Bronze Age map: target 14–18 territories, distinct topology from Stone Age, introduces a new structural pattern (island clusters, river crossings, or narrow passes)
- Medieval map: target 18–22 territories, regional clusters, higher choke point density, distinct opening dynamics from both earlier eras
- Era-specific territory names, labels, and UI flavor text per map
- Map selection in lobby: host picks era before match starts
- Era setup pipeline: adding a new map requires only a config file and artwork — no engine changes
- Map balance pass: no era should have an obvious dominant opening position

Exit criteria:

- Swapping eras requires no changes to the game engine
- All three eras have distinct board topology and produce different strategic patterns
- Adding a new era is a content task, not an engine task
- No era has a known dominant opening that experienced players exploit every game
- Medieval era feels structurally different from Stone Age, not just reskinned

## v0.9.0 - Beta Hardening

Goal: prepare Prism for outside testers who know nothing about the codebase and are playing on their own device.

Scope:

- Tutorial or in-game guide: a new player can understand the loop before and during their first match
- Onboarding flow: first-time player is walked through creating or joining a room, the draft phase, and their first turn
- Mobile pass: all primary game actions work with touch input, layout adapts to small screens, no action requires hover
- Accessibility baseline: keyboard navigation for all game actions, ARIA labels on interactive elements, color-blind mode for territory ownership (pattern or label fallback beyond color)
- UX cleanup: room flow, draft flow, turn flow, and match-end state are all polished and consistent
- Automated test coverage expanded: engine, server, disconnect and rejoin, bot behavior, and win conditions
- Load and performance testing: multiple concurrent rooms under simulated traffic, no memory leaks across match resets
- Telemetry and admin logging: track match starts, completions, errors, and disconnects without storing personal data
- Deployment configuration: environment variables, secrets management, production build, health check endpoint
- Error boundary handling: server crash does not lose all active match state; client shows a recoverable error state

Exit criteria:

- A new player with no prior knowledge can complete their first match without external help
- The game is fully playable on a mid-range mobile device
- Core game actions meet WCAG 2.1 AA for keyboard access and color contrast
- Regressions in engine, server, and bot behavior are caught by automated tests before release
- Hosting, monitoring, and rollout are fully resolved before v1.0.0 is tagged
- The game handles real testers without constant manual intervention from the developer

## v1.0.0 - First Public Release

Goal: ship the first complete public version of Prism.

Scope:

- Stable short-form conquest loop with dominance scoring and round cap
- All three era maps: Stone Age, Bronze Age, Medieval
- Faction powers (2–4 factions, balanced)
- Bot opponent for solo play
- Polished simulation UI with faction colors and era framing
- Full event log
- Mobile playable
- Accessible at baseline
- Production deploy with monitoring and error tracking

Exit criteria:

- Prism feels coherent as its own game, not a Risk clone
- The protocol loop is stable under real play conditions
- A solo player can enjoy the game without needing a friend online at the same time
- A new player can complete their first match without documentation
- The release is worth sharing publicly, not just internally

## Build Order

When priorities compete, use this order:

1. Server authority
2. Match completion
3. Multiplayer resilience
4. Rule clarity
5. Replayability
6. Player accessibility (AI opponent, onboarding, mobile)
7. Identity
8. Content breadth
9. Polish

## Pre-1.0 Summary

- `0.1.0`: protocol spine — **complete**
- `0.1.x`: stabilize the protocol spine
- `0.2.0`: match quality — **complete**
- `0.2.x`: refine match quality
- `0.3.0`: short-form ruleset — **complete**
- `0.3.x`: tune the ruleset
- `0.4.0`: multiplayer foundation
- `0.4.x`: harden multiplayer
- `0.5.0`: simulation identity
- `0.5.x`: polish simulation identity
- `0.6.0`: factions
- `0.6.x`: balance faction play
- `0.7.0`: AI opponent
- `0.7.x`: improve AI and difficulty
- `0.8.0`: era expansion
- `0.8.x`: refine multi-era support
- `0.9.0`: beta hardening
- `0.9.x`: prepare for public release
