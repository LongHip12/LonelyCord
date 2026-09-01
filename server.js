import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const port = Number(process.env.PORT || 3000);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const participants = new Map();
const clients = new Map();
const messages = [];

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function errorPage(response, status, title, message) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(`<!doctype html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${status} · Lonely Cord</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1e1f22;color:#f2f3f5;font:16px Arial,sans-serif}.card{width:min(90%,440px);padding:36px;border-radius:8px;background:#2b2d31;text-align:center;box-shadow:0 12px 32px #0005}.brand{font-weight:700;font-size:18px}.brand i{display:inline-block;width:5px;height:16px;margin-right:8px;border-radius:4px;background:#5865f2;vertical-align:-2px}.code{margin:32px 0 8px;color:#5865f2;font-size:72px;font-weight:800}.card h1{margin:0 0 10px;font-size:24px}.card p{margin:0;color:#b5bac1;line-height:1.5}.card small{display:block;margin-top:28px;color:#949ba4}</style></head><body><main class="card"><div class="brand"><i></i>Lonely Cord</div><div class="code">${status}</div><h1>${title}</h1><p>${message}</p><small>Lonely Cord • Powered by Lonely Hub - LongHip12</small></main></body></html>`);
}

function participantList() {
  return [...participants.values()];
}

function writeEvent(response, type, payload) {
  response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(type, payload, exceptSessionId = "") {
  for (const [sessionId, response] of clients) {
    if (sessionId !== exceptSessionId) writeEvent(response, type, payload);
  }
}

function removeParticipant(sessionId, announce = true) {
  const participant = participants.get(sessionId);
  participants.delete(sessionId);
  clients.get(sessionId)?.end();
  clients.delete(sessionId);
  if (announce && participant) broadcast("participant-left", participant);
  return participant;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) request.destroy(new Error("Request body too large"));
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    request.on("error", reject);
  });
}

async function handleApi(request, response, path) {
  if (path === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, roomId: "main", participantCount: participants.size });
    return true;
  }

  if (path === "/api/room/join" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const sessionId = String(body.sessionId || "").slice(0, 100);
      const name = String(body.name || "").trim().slice(0, 80);
      if (!sessionId || !name) { sendJson(response, 400, { ok: false, error: "Tên và phiên đăng nhập là bắt buộc." }); return true; }
      removeParticipant(sessionId, false);
      const participant = {
        id: sessionId,
        name,
        initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
        hasAvatar: Boolean(body.hasAvatar),
        micOn: false,
        cameraOn: false,
        sharing: false,
        joinedAt: Date.now(),
      };
      participants.set(sessionId, participant);
      broadcast("participant-joined", participant, sessionId);
      sendJson(response, 200, { ok: true, roomId: "main", participant, participants: participantList(), messages });
    } catch { sendJson(response, 400, { ok: false, error: "Không thể tham gia phòng." }); }
    return true;
  }

  if (path === "/api/events" && request.method === "GET") {
    const sessionId = new URL(request.url || "/", "http://localhost").searchParams.get("sessionId") || "";
    if (!participants.has(sessionId)) { sendJson(response, 404, { ok: false, error: "Phiên không tồn tại." }); return true; }
    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    clients.set(sessionId, response);
    writeEvent(response, "room-sync", { roomId: "main", participants: participantList(), messages });
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 20_000);
    request.on("close", () => {
      clearInterval(heartbeat);
      if (clients.get(sessionId) === response) {
        clients.delete(sessionId);
        const participant = participants.get(sessionId);
        participants.delete(sessionId);
        if (participant) broadcast("participant-left", participant);
      }
    });
    return true;
  }

  if (path === "/api/chat" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const sessionId = String(body.sessionId || "");
      const sender = participants.get(sessionId);
      const text = String(body.text || "").trim().slice(0, 2000);
      if (!sender || !text) { sendJson(response, 400, { ok: false, error: "Tin nhắn không hợp lệ." }); return true; }
      const message = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: sender.name, senderId: sender.id, text, time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) };
      messages.push(message);
      if (messages.length > 200) messages.shift();
      broadcast("chat-message", message);
      sendJson(response, 200, { ok: true, message });
    } catch { sendJson(response, 400, { ok: false, error: "Không thể gửi tin nhắn." }); }
    return true;
  }

  if (path === "/api/room/media" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const sessionId = String(body.sessionId || "");
      const participant = participants.get(sessionId);
      if (!participant) { sendJson(response, 404, { ok: false, error: "Phiên không tồn tại." }); return true; }
      participant.micOn = Boolean(body.micOn);
      participant.cameraOn = Boolean(body.cameraOn);
      participant.sharing = Boolean(body.sharing);
      broadcast("participant-updated", participant);
      sendJson(response, 200, { ok: true, participant });
    } catch { sendJson(response, 400, { ok: false, error: "Không thể cập nhật trạng thái media." }); }
    return true;
  }

  if (path === "/api/room/leave" && request.method === "POST") {
    try {
      const body = await readBody(request);
      const participant = removeParticipant(String(body.sessionId || ""));
      sendJson(response, 200, { ok: true, participant });
    } catch { sendJson(response, 400, { ok: false, error: "Không thể rời phòng." }); }
    return true;
  }

  return false;
}

function sendFile(response, filePath) {
  try {
    const file = statSync(filePath);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    errorPage(response, 404, "Không tìm thấy trang", "Đường dẫn này không tồn tại trong Lonely Cord.");
  }
}

const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url || "/", "http://localhost").pathname;
  if (requestPath.startsWith("/api/") && await handleApi(request, response, requestPath)) return;
  if (requestPath === "/403" || requestPath.startsWith("/private")) {
    errorPage(response, 403, "Không được phép truy cập", "Bạn không có quyền truy cập tài nguyên này.");
    return;
  }
  const safePath = normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const requestedFile = join(root, safePath === "/" ? "index.html" : safePath);
  sendFile(response, requestedFile);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Lonely Cord listening on port ${port}`);
});