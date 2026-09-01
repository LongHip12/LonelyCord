const app = document.querySelector("#app");

const state = {
  joined: false,
  sessionId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  displayName: "",
  avatarUrl: "",
  stream: null,
  shareStream: null,
  cameraOn: false,
  micOn: false,
  facingMode: "user",
  chatOpen: false,
  settingsOpen: false,
  qualityOpen: null,
  shareFocus: false,
  resolution: "720p",
  fps: "45",
  qualityPrompted: false,
  draft: "",
  messages: [],
  remoteParticipants: [],
  toast: "",
  speaking: false,
  offline: !navigator.onLine,
};

let mediaPromise = null;
let toastTimer = null;
let audioMonitor = null;
let speakingTimer = null;
let eventsSource = null;

const heights = { "120p": 120, "240p": 240, "360p": 360, "480p": 480, "720p": 720, "1080p": 1080 };

function icon(name, size = 20) {
  const paths = {
    mic: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h8A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 15.5z"/><path d="m16 11 5-3v8l-5-3"/>',
    share: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M8 11h8M12 7v8M9 10l3-3 3 3"/>',
    leave: '<path d="M8 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H8"/>',
    chat: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-4-.9L4 20l1.3-3.6A7.2 7.2 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    send: '<path d="m21 3-7.2 18-3.5-7.3L3 10.2z"/><path d="M10.3 13.7 21 3"/>',
    settings: '<path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3.1 1.3v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3.1-1.3l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1A1.8 1.8 0 0 0 3.4 12a1.8 1.8 0 0 0 1.2-3l-.1-.1A1.8 1.8 0 0 1 7 6.4l.1.1A1.8 1.8 0 0 0 10.2 5v-.2a1.8 1.8 0 0 1 3.6 0V5a1.8 1.8 0 0 0 3.1 1.5l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1A1.8 1.8 0 0 0 20.6 12a1.8 1.8 0 0 0-1.2 3Z"/>',
    network: '<path d="M4.5 9.5a11 11 0 0 1 15 0M7.5 13a6.8 6.8 0 0 1 9 0M10.5 16.5a2.6 2.6 0 0 1 3 0M12 21h.01"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    switch: '<path d="m7 7 4-4 4 4M11 3v11M17 17l-4 4-4-4M13 21V10"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    eye: '<path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function guestAvatar(size = 80) {
  return `<svg data-testid="img-guest-avatar" width="${size}" height="${size}" viewBox="0 0 96 96" aria-label="Ảnh đại diện khách"><rect width="96" height="96" rx="24" fill="#5865f2"/><circle cx="48" cy="39" r="17" fill="#f2f3f5"/><path d="M20 82c2-16 13-26 28-26s26 10 28 26" fill="#f2f3f5"/></svg>`;
}

function initials(name) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "BẠN";
}

function avatarHtml(large = false) {
  const className = `participant-avatar${large ? " participant-avatar-large" : ""}`;
  return state.avatarUrl
    ? `<div class="${className}"><img src="${state.avatarUrl}" alt="Ảnh đại diện của ${escapeHtml(state.displayName)}"></div>`
    : `<div class="${className}" style="background:#5865f2"><span>${escapeHtml(initials(state.displayName))}</span></div>`;
}

function constraints() {
  const height = heights[state.resolution] || 720;
  return { width: { ideal: Math.round(height * 16 / 9) }, height: { ideal: height }, frameRate: { ideal: Number(state.fps) } };
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { state.toast = ""; render(); }, 4200);
}

function api(path, body, keepalive = false) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Yêu cầu thất bại");
    return data;
  });
}

function playPresenceSound(kind) {
  if (!window.AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const entering = kind === "join";
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(entering ? 620 : 460, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(entering ? 880 : 300, context.currentTime + 0.16);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.24);
  oscillator.addEventListener("ended", () => context.close().catch(() => undefined), { once: true });
}

function connectRoom() {
  eventsSource?.close();
  const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(state.sessionId)}`);
  eventsSource = source;
  source.addEventListener("room-sync", (event) => {
    const data = JSON.parse(event.data);
    state.remoteParticipants = data.participants.filter((participant) => participant.id !== state.sessionId);
    state.messages = data.messages || [];
    updateRoom();
  });
  source.addEventListener("participant-joined", (event) => {
    const participant = JSON.parse(event.data);
    if (participant.id === state.sessionId) return;
    state.remoteParticipants = [...state.remoteParticipants.filter((item) => item.id !== participant.id), participant];
    playPresenceSound("join");
    updateRoom();
  });
  source.addEventListener("participant-left", (event) => {
    const participant = JSON.parse(event.data);
    state.remoteParticipants = state.remoteParticipants.filter((item) => item.id !== participant.id);
    playPresenceSound("leave");
    updateRoom();
  });
  source.addEventListener("chat-message", (event) => {
    const message = JSON.parse(event.data);
    if (!state.messages.some((item) => item.id === message.id)) state.messages.push(message);
    updateRoom();
  });
  source.onerror = () => {
    if (!navigator.onLine) { state.offline = true; render(); }
    else if (state.joined) window.setTimeout(rejoinRoom, 1200);
  };
}

async function rejoinRoom() {
  if (!state.joined || state.offline) return;
  try {
    const joined = await api("/api/room/join", { sessionId: state.sessionId, name: state.displayName, hasAvatar: Boolean(state.avatarUrl) });
    state.remoteParticipants = joined.participants.filter((participant) => participant.id !== state.sessionId);
    state.messages = joined.messages || state.messages;
    connectRoom();
    updateRoom();
  } catch { /* EventSource will retry while the browser is still online. */ }
}

function stopAudioMonitor() {
  if (audioMonitor?.raf) cancelAnimationFrame(audioMonitor.raf);
  audioMonitor?.context?.close().catch(() => undefined);
  audioMonitor = null;
  window.clearTimeout(speakingTimer);
  speakingTimer = null;
  state.speaking = false;
}

function startAudioMonitor() {
  stopAudioMonitor();
  if (!state.stream || !state.micOn || !window.AudioContext) return;
  const context = new AudioContext();
  const source = context.createMediaStreamSource(state.stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const detect = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) { const value = (sample - 128) / 128; sum += value * value; }
    const isLoud = Math.sqrt(sum / data.length) > 0.055;
    if (isLoud) {
      window.clearTimeout(speakingTimer);
      speakingTimer = null;
      if (!state.speaking) { state.speaking = true; updateRoom(); }
    } else if (!speakingTimer) {
      speakingTimer = window.setTimeout(() => { speakingTimer = null; state.speaking = false; updateRoom(); }, 2000);
    }
    audioMonitor.raf = requestAnimationFrame(detect);
  };
  audioMonitor = { context, raf: 0 };
  context.resume().catch(() => undefined);
  detect();
}

async function ensureMedia(activate = false, showQuality = false) {
  if (state.stream) {
    if (activate) {
      state.stream.getVideoTracks().forEach((track) => { track.enabled = true; });
      state.cameraOn = true;
      if (showQuality && !state.qualityPrompted) openQuality(true);
      updateRoom();
    }
    return state.stream;
  }
  if (mediaPromise) {
    const stream = await mediaPromise;
    if (activate && stream) {
      stream.getVideoTracks().forEach((track) => { track.enabled = true; });
      state.cameraOn = true;
      if (showQuality && !state.qualityPrompted) openQuality(true);
      updateRoom();
    }
    return stream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Trình duyệt này không hỗ trợ truy cập camera.");
    return null;
  }
  mediaPromise = navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: state.facingMode }, audio: true })
    .then((stream) => {
      stream.getTracks().forEach((track) => { track.enabled = activate; });
      state.stream = stream;
      state.cameraOn = activate;
      state.micOn = activate;
      mediaPromise = null;
      updateRoom();
      if (showQuality && !state.qualityPrompted) openQuality(true);
      if (state.micOn) startAudioMonitor();
      return stream;
    })
    .catch(() => {
      mediaPromise = null;
      state.cameraOn = false;
      state.micOn = false;
      showToast("Bạn chưa cấp quyền camera hoặc microphone. Bạn vẫn có thể vào phòng với media đang tắt.");
      return null;
    });
  return mediaPromise;
}

function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

async function switchCamera() {
  const nextFacing = state.facingMode === "user" ? "environment" : "user";
  if (!navigator.mediaDevices?.getUserMedia) { showToast("Trình duyệt này không hỗ trợ đổi camera."); return; }
  try {
    let nextStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: { exact: nextFacing } }, audio: false });
    } catch {
      nextStream = await navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: nextFacing }, audio: false });
    }
    const nextVideo = nextStream.getVideoTracks()[0];
    if (!nextVideo) throw new Error("No video track");
    const oldVideo = state.stream?.getVideoTracks()[0];
    if (state.stream && oldVideo) {
      state.stream.removeTrack(oldVideo);
      oldVideo.stop();
      nextVideo.enabled = state.cameraOn;
      state.stream.addTrack(nextVideo);
    } else {
      state.stream = new MediaStream([nextVideo]);
      nextVideo.enabled = false;
    }
    state.facingMode = nextFacing;
    updateRoom();
  } catch {
    showToast("Camera trước/sau không khả dụng trên thiết bị này.");
  }
}

function toggleMic() {
  if (!state.stream) { showToast("Hãy cấp quyền microphone để bật micro."); return; }
  state.micOn = !state.micOn;
  state.stream.getAudioTracks().forEach((track) => { track.enabled = state.micOn; });
  if (state.micOn) startAudioMonitor(); else stopAudioMonitor();
  updateRoom();
}

async function toggleCamera() {
  if (state.cameraOn && state.stream) {
    state.stream.getVideoTracks().forEach((track) => { track.enabled = false; });
    state.cameraOn = false;
    updateRoom();
    return;
  }
  await ensureMedia(true, true);
}

async function toggleShare() {
  if (state.shareStream) {
    stopStream(state.shareStream);
    state.shareStream = null;
    state.shareFocus = false;
    updateRoom();
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) { showToast("Trình duyệt này không hỗ trợ chia sẻ màn hình."); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { ...constraints() }, audio: false });
    stream.getVideoTracks()[0].onended = () => { state.shareStream = null; state.shareFocus = false; updateRoom(); };
    state.shareStream = stream;
    if (!state.qualityPrompted) openQuality(true);
    updateRoom();
  } catch {
    showToast("Bạn đã hủy chia sẻ màn hình.");
  }
}

function applyQuality() {
  const videoConstraints = constraints();
  state.stream?.getVideoTracks().forEach((track) => track.applyConstraints(videoConstraints).catch(() => showToast("Camera không hỗ trợ chất lượng này.")));
  state.shareStream?.getVideoTracks().forEach((track) => track.applyConstraints({ ...videoConstraints, frameRate: { ideal: Number(state.fps), max: Number(state.fps) } }).catch(() => showToast("Màn hình không hỗ trợ chất lượng này.")));
}

function openQuality(automatic = false) {
  state.qualityPrompted = true;
  state.qualityOpen = automatic ? "automatic" : "settings";
  render();
}

function closeQuality() { state.qualityOpen = null; render(); }

function videoHtml(kind) {
  return `<video class="tile-video" data-video="${kind}" muted playsinline autoplay></video>`;
}

function entryHtml() {
  return `<div class="entry-shell"><div class="entry-backdrop"></div><section class="entry-card soft-in" aria-label="Đăng nhập vào phòng gọi">
    <div class="entry-brand"><span class="brand-mark"><span></span><span></span><span></span></span><strong>Lonely Cord</strong></div>
    <div class="entry-copy"><h1>Chào mừng bạn trở lại!</h1><p>Đăng nhập để tham gia cuộc gọi nhóm.</p></div>
    <button class="avatar-upload" id="upload-avatar" aria-label="Tải ảnh đại diện">${state.avatarUrl ? `<img src="${state.avatarUrl}" alt="Ảnh đại diện đã chọn">` : guestAvatar(70)}<span class="avatar-add">${icon("plus", 14)}</span></button>
    <input id="avatar-file" type="file" accept="image/*" hidden>
    <label class="input-label" for="display-name">TÊN HIỂN THỊ</label>
    <input id="display-name" class="entry-input" value="${escapeHtml(state.displayName)}" placeholder="Nhập tên của bạn" autocomplete="name">
    <div class="entry-actions">
      <button class="primary-action" id="login-button"><span>Đăng nhập</span>${icon("arrow", 18)}</button>
      <button class="secondary-action" id="guest-button"><span>Đăng nhập với tư cách khách</span>${icon("arrow", 18)}</button>
    </div>
    <div class="entry-footnote">${icon("network", 15)}<span>Camera và microphone chỉ được sử dụng trong trình duyệt của bạn.</span></div>
  </section><div class="entry-footer">Lonely Cord • Powered by Lonely Hub - LongHip12</div>${state.toast ? `<div class="toast" role="status"><span class="toast-mark">!</span><span>${escapeHtml(state.toast)}</span><button id="dismiss-entry-toast" aria-label="Đóng thông báo">${icon("close", 15)}</button></div>` : ""}</div>`;
}

function participantTileHtml() {
  const cameraVisible = state.cameraOn && state.stream?.getVideoTracks().some((track) => track.enabled);
  return `<article class="participant-tile ${state.speaking ? "is-speaking" : ""}" id="local-tile">
    ${cameraVisible ? videoHtml("local") : `<div class="avatar-stage">${avatarHtml(true)}</div>`}
    <div class="tile-shade"></div><div class="tile-topline"><span class="local-pill">BẠN</span>${!state.micOn ? `<span class="tile-muted">${icon("mic", 13)}</span>` : ""}</div>
    <div class="tile-label"><span>${escapeHtml(state.displayName)}</span>${cameraVisible ? '<span class="camera-live-dot"></span>' : ""}</div>
  </article>`;
}

function remoteParticipantTileHtml(participant) {
  return `<article class="participant-tile" data-participant-id="${escapeHtml(participant.id)}">
    <div class="avatar-stage"><div class="participant-avatar participant-avatar-large" style="background:#5865f2"><span>${escapeHtml(participant.initials || initials(participant.name))}</span></div></div>
    <div class="tile-shade"></div><div class="tile-topline"><span class="local-pill" style="background:#404249">ĐANG TRONG PHÒNG</span><span class="tile-muted">${icon("mic", 13)}</span></div>
    <div class="tile-label"><span>${escapeHtml(participant.name)}</span></div>
  </article>`;
}

function chatHtml() {
  const messages = state.messages.length
    ? state.messages.map((message) => `<div class="chat-message ${message.senderId === state.sessionId ? "local" : ""}"><div class="message-meta"><strong>${escapeHtml(message.name)}</strong><span>${escapeHtml(message.time)}</span></div><p>${escapeHtml(message.text)}</p></div>`).join("")
    : `<div class="chat-empty">${icon("chat", 26)}<p>Chưa có tin nhắn nào.</p><span>Bắt đầu cuộc trò chuyện trong phòng duy nhất này.</span></div>`;
  return `<aside class="chat-panel rise-in" aria-label="Trò chuyện trong phòng"><div class="panel-head"><div><span class="panel-kicker">PHÒNG CHAT</span><h2>Tin nhắn</h2></div><button class="icon-button subtle" id="close-chat" aria-label="Đóng chat">${icon("close", 19)}</button></div><div class="chat-list">${messages}</div><form class="chat-compose" id="chat-form"><input id="chat-input" value="${escapeHtml(state.draft)}" placeholder="Nhập tin nhắn..." aria-label="Tin nhắn"><button type="submit" aria-label="Gửi tin nhắn" ${state.draft.trim() ? "" : "disabled"}>${icon("send", 18)}</button></form></aside>`;
}

function shareTileHtml() {
  if (!state.shareStream || state.shareFocus) return "";
  return `<article class="share-tile"><video class="tile-video" data-video="share" muted playsinline autoplay></video><div class="tile-shade"></div><button class="share-preview-eye" id="open-share" aria-label="Mở màn hình chia sẻ">${icon("eye", 19)}</button><div class="share-self-copy"><strong>Bạn đang chia sẻ màn hình</strong><small>Người khác vẫn có thể xem màn hình của bạn</small></div><div class="share-tile-label"><span class="share-icon">${icon("share", 13)}</span><span>Chia sẻ màn hình</span><button id="expand-share" aria-label="Mở rộng màn hình chia sẻ">${icon("expand", 14)}</button></div></article>`;
}

function roomHtml() {
  return `<div class="room-app"><header class="topbar"><div class="brand-lockup"><span class="brand-mark"><span></span><span></span><span></span></span><strong>Lonely Cord</strong><span class="brand-divider"></span><span class="room-name">Phòng chính</span></div><div class="room-status"><span class="live-indicator"></span> ĐANG TRỰC TUYẾN</div><div class="topbar-actions"><span class="network-badge">${icon("network", 15)}100%</span><button class="icon-button top-setting" id="open-settings" aria-label="Mở cài đặt">${icon("settings", 19)}</button><div class="top-avatar">${avatarHtml()}</div></div></header>
    <main class="room-main"><div class="room-heading"><div><span class="panel-kicker">KÊNH THOẠI</span><h1>Phòng chính</h1></div><div class="room-heading-actions"><span>${icon("users", 15)} ${state.remoteParticipants.length + 1} người</span><span class="quality-chip">${state.resolution} · ${state.fps} fps</span></div></div>
      <div class="room-layout"><section class="stage"><div class="stage-bar"><span>CUỘC GỌI NHÓM</span><span class="stage-hint">Một phòng duy nhất · kết nối trong trình duyệt</span></div><div class="participant-grid">${participantTileHtml()}${state.remoteParticipants.map(remoteParticipantTileHtml).join("")}${shareTileHtml()}</div></section>${state.chatOpen ? chatHtml() : ""}</div>
    </main><footer class="control-dock"><div class="dock-user">${avatarHtml()}<div><strong>${escapeHtml(state.displayName)}</strong><span>Trong phòng</span></div></div><div class="controls">
      <button class="control-button ${state.micOn ? "" : "off"}" id="toggle-mic" aria-label="${state.micOn ? "Tắt microphone" : "Bật microphone"}">${icon("mic", 21)}</button>
      <button class="control-button ${state.cameraOn ? "" : "off"}" id="toggle-camera" aria-label="${state.cameraOn ? "Tắt camera" : "Bật camera"}">${icon("camera", 21)}</button>
      <button class="control-button mobile-only" id="switch-camera" aria-label="Đổi camera trước sau">${icon("switch", 21)}</button>
      <button class="control-button ${state.shareStream ? "active" : ""}" id="toggle-share" aria-label="${state.shareStream ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}">${icon("share", 21)}</button>
      <button class="control-button ${state.chatOpen ? "active" : ""}" id="toggle-chat" aria-label="Mở chat">${icon("chat", 21)}${state.messages.length ? `<b class="unread-count">${state.messages.length}</b>` : ""}</button>
      <button class="control-button" id="open-mobile-settings" aria-label="Mở cài đặt media">${icon("settings", 21)}</button>
    </div><button class="leave-button" id="leave-room" aria-label="Rời cuộc gọi">${icon("leave", 20)}<span>Rời cuộc gọi</span></button></footer>
    ${state.toast ? `<div class="toast" role="status"><span class="toast-mark">!</span><span>${escapeHtml(state.toast)}</span><button id="dismiss-toast" aria-label="Đóng thông báo">${icon("close", 15)}</button></div>` : ""}${qualityHtml()}${shareFocusHtml()}</div>`;
}

function qualityHtml() {
  if (!state.qualityOpen) return "";
  const automatic = state.qualityOpen === "automatic";
  const meter = Math.min(96, Math.max(18, (heights[state.resolution] / 1080) * 100));
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="quality-card rise-in"><div class="quality-head"><div><span class="panel-kicker">${automatic ? "THIẾT LẬP LẦN ĐẦU" : "CÀI ĐẶT MEDIA"}</span><h2>Chất lượng video</h2></div><button class="icon-button subtle" id="close-quality" aria-label="Đóng cài đặt chất lượng">${icon("close", 19)}</button></div>${automatic ? '<p class="quality-intro">Chọn chất lượng khởi đầu cho camera và chia sẻ màn hình. Bạn có thể thay đổi lại trong Cài đặt.</p>' : ""}<div class="quality-options"><div><label class="field-label" for="resolution">Độ phân giải</label><select id="resolution">${Object.keys(heights).map((item) => `<option value="${item}" ${state.resolution === item ? "selected" : ""}>${item}</option>`).join("")}</select></div><div><label class="field-label" for="fps">Tốc độ khung hình</label><select id="fps">${[15, 30, 45, 60].map((item) => `<option value="${item}" ${Number(state.fps) === item ? "selected" : ""}>${item} fps</option>`).join("")}</select></div></div><div class="quality-meter"><span>Đang chọn</span><strong>${state.resolution} · ${state.fps} fps</strong><div class="meter-track"><span style="width:${meter}%"></span></div></div><button class="primary-action" id="apply-quality"><span>${automatic ? "Tiếp tục" : "Lưu cài đặt"}</span>${icon("arrow", 17)}</button></div></div>`;
}

function shareFocusHtml() {
  if (!state.shareFocus || !state.shareStream) return "";
  return `<div class="share-focus" role="dialog" aria-label="Màn hình đang chia sẻ"><div class="share-focus-top"><div class="share-focus-label"><span class="signal-dot"></span> ĐANG CHIA SẺ MÀN HÌNH</div><button class="icon-button light" id="close-share" aria-label="Đóng màn hình chia sẻ">${icon("close", 20)}</button></div><div class="share-focus-content"><video class="tile-video" data-video="share-focus" muted playsinline autoplay></video><div class="share-focus-caption"><strong>Bạn đang chia sẻ màn hình</strong><small>Người khác vẫn có thể xem màn hình của bạn</small></div></div><div class="share-strip"><div class="strip-person">${avatarHtml()}<span>${escapeHtml(state.displayName)}</span></div></div></div>`;
}

function bindVideos() {
  document.querySelectorAll("[data-video]").forEach((video) => {
    const kind = video.dataset.video;
    const stream = kind === "local" ? state.stream : state.shareStream;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  });
}

function bindEntry() {
  const nameInput = document.querySelector("#display-name");
  nameInput.addEventListener("input", (event) => { state.displayName = event.target.value; });
  document.querySelector("#upload-avatar").addEventListener("click", () => document.querySelector("#avatar-file").click());
  document.querySelector("#avatar-file").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { state.avatarUrl = reader.result; render(); };
    reader.readAsDataURL(file);
  });
  document.querySelector("#login-button").addEventListener("click", () => joinRoom(false));
  document.querySelector("#guest-button").addEventListener("click", () => joinRoom(true));
  document.querySelector("#dismiss-entry-toast")?.addEventListener("click", () => { state.toast = ""; render(); });
}

async function joinRoom(asGuest) {
  if (asGuest) state.displayName = `Guest${Math.floor(10000 + Math.random() * 90000)}`;
  if (!state.displayName.trim()) { showToast("Hãy nhập tên hiển thị trước khi đăng nhập."); return; }
  state.displayName = state.displayName.trim();
  state.joined = true;
  render();
  try {
    const joined = await api("/api/room/join", { sessionId: state.sessionId, name: state.displayName, hasAvatar: Boolean(state.avatarUrl) });
    state.remoteParticipants = joined.participants.filter((participant) => participant.id !== state.sessionId);
    state.messages = joined.messages || [];
    connectRoom();
    playPresenceSound("join");
    updateRoom();
  } catch {
    state.joined = false;
    render();
    showToast("Không thể kết nối Phòng chính. Hãy thử lại khi mạng ổn định.");
    return;
  }
  await ensureMedia(false, false);
}

function bindRoom() {
  document.querySelector("#toggle-mic").addEventListener("click", toggleMic);
  document.querySelector("#toggle-camera").addEventListener("click", toggleCamera);
  document.querySelector("#switch-camera").addEventListener("click", switchCamera);
  document.querySelector("#toggle-share").addEventListener("click", toggleShare);
  document.querySelector("#toggle-chat").addEventListener("click", () => { state.chatOpen = !state.chatOpen; render(); });
  document.querySelector("#open-settings").addEventListener("click", () => openQuality(false));
  document.querySelector("#open-mobile-settings").addEventListener("click", () => openQuality(false));
  document.querySelector("#leave-room").addEventListener("click", leaveRoom);
  document.querySelector("#dismiss-toast")?.addEventListener("click", () => { state.toast = ""; render(); });
  document.querySelector("#close-chat")?.addEventListener("click", () => { state.chatOpen = false; render(); });
  document.querySelector("#open-share")?.addEventListener("click", () => { state.shareFocus = true; render(); });
  document.querySelector("#expand-share")?.addEventListener("click", () => { state.shareFocus = true; render(); });
  document.querySelector("#close-share")?.addEventListener("click", () => { state.shareFocus = false; render(); });
  document.querySelector("#chat-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#chat-input");
    const text = input.value.trim();
    if (!text) return;
    api("/api/chat", { sessionId: state.sessionId, text }).then(({ message }) => {
      if (message && !state.messages.some((item) => item.id === message.id)) state.messages.push(message);
      state.draft = "";
      state.chatOpen = true;
      updateRoom();
    }).catch(() => showToast("Không thể gửi tin nhắn khi đang offline."));
  });
  document.querySelector("#chat-input")?.addEventListener("input", (event) => { state.draft = event.target.value; });
  document.querySelector("#close-quality")?.addEventListener("click", closeQuality);
  document.querySelector("#resolution")?.addEventListener("change", (event) => { state.resolution = event.target.value; render(); });
  document.querySelector("#fps")?.addEventListener("change", (event) => { state.fps = event.target.value; render(); });
  document.querySelector("#apply-quality")?.addEventListener("click", () => { applyQuality(); closeQuality(); });
}

function updateRoom() {
  if (state.joined) { render(); bindVideos(); }
}

function leaveRoom() {
  api("/api/room/leave", { sessionId: state.sessionId }, true).catch(() => undefined);
  eventsSource?.close();
  eventsSource = null;
  stopStream(state.stream);
  stopStream(state.shareStream);
  stopAudioMonitor();
  state.stream = null;
  state.shareStream = null;
  state.joined = false;
  state.cameraOn = false;
  state.micOn = false;
  state.chatOpen = false;
  state.remoteParticipants = [];
  state.shareFocus = false;
  state.qualityOpen = null;
  state.displayName = "";
  state.avatarUrl = "";
  render();
}

function render() {
  if (state.offline) {
    app.innerHTML = errorPageHtml("503", "Bạn đang offline", "Lonely Cord cần kết nối mạng để đồng bộ Phòng chính và tin nhắn.");
    document.querySelector("#error-retry")?.addEventListener("click", () => window.location.reload());
    return;
  }
  app.innerHTML = state.joined ? roomHtml() : entryHtml();
  if (state.joined) { bindRoom(); bindVideos(); } else bindEntry();
}

function errorPageHtml(code, title, message) {
  return `<div class="error-shell"><div class="error-card"><div class="entry-brand"><span class="brand-mark"><span></span><span></span><span></span></span><strong>Lonely Cord</strong></div><div class="error-code">${code}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><button class="primary-action" id="error-retry"><span>Thử lại</span>${icon("arrow", 18)}</button><small>Lonely Cord • Powered by Lonely Hub - LongHip12</small></div></div>`;
}

window.addEventListener("offline", () => { state.offline = true; render(); });
window.addEventListener("online", async () => { state.offline = false; render(); if (state.joined) await rejoinRoom(); });
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("selectstart", (event) => { if (!["INPUT", "TEXTAREA"].includes(event.target.tagName)) event.preventDefault(); });
document.addEventListener("copy", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
  const devtoolsShortcut = event.key === "F12" || (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase())) || (event.ctrlKey && event.key.toUpperCase() === "U");
  if (devtoolsShortcut) event.preventDefault();
});

render();