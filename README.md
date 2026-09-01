# Lonely Cord

Lonely Cord is one fixed room at `/`. Both login buttons enter the same
`Phòng chính`; there is no room picker or room ID in the frontend. The Node.js
server keeps that room's presence and chat in memory and broadcasts updates
over Server-Sent Events (SSE).

The room also broadcasts each participant's microphone, camera, and screen
sharing state. The notification sounds are in `public/sounds/` and can be
toggled independently per browser from Settings.

## Scale architecture for 50–100 participants

The frontend intentionally does not create a full mesh of peer connections.
The production room should connect it to an SFU such as LiveKit, mediasoup, or
Janus:

1. A small signaling service authenticates the room and returns an SFU URL and
   short-lived join token.
2. Each browser publishes only its own camera, microphone, and optional screen
   share to the SFU.
3. The SFU forwards only subscribed layers to each browser. Use simulcast/SVC
   so gallery tiles receive low layers and the focused screen share receives a
   higher layer.
4. Subscribe to a maximum visible gallery page (for example 25–49 tiles).
   Keep off-page participants as presence metadata, not mounted video
   elements.
5. Use the SFU data channel for room chat, presence, reactions, and active
   speaker events. The local UI should optimistically render messages and
   reconcile server timestamps.

The current browser client keeps the local `MediaStream` controls isolated from
the server-synchronized participant metadata. The server's presence/chat/media
state transport can be replaced by an SFU signaling adapter without changing
the entry flow or controls.

## Signaling contract suggestion

Use one WebSocket connection for room signaling:

```text
client -> server: { type: "join", roomId, displayName, capabilities }
server -> client: { type: "joined", roomId, token, sfuUrl, participants }
client -> server: { type: "chat", id, text }
server -> room:   { type: "chat", id, senderId, text, createdAt }
server -> client: { type: "participant-joined|left|updated", participant }
```

Keep the signaling server stateless where possible; store room membership in
the SFU or a short-lived presence store, and never proxy media through the
Express API. In production, add TURN servers for restrictive networks,
server-side rate limits for chat/signaling, token expiry, and reconnect with
exponential backoff.

## Local development

```bash
pnpm --filter @workspace/group-video-call run dev
```

The package has no frontend framework or runtime dependency. Its only files
needed to run are `server.js`, `public/index.html`, `public/styles.css`,
`public/app.js`, and `package.json`.

For a deployed shared room, use a single-instance VM deployment. The in-memory
presence store is intentionally not used with autoscaling, because different
instances would have separate room state.

Camera, microphone, and screen share require a secure browser context. The
preview environment supplies that context; a deployed HTTPS origin is needed
outside it.