const app = document.querySelector("#app");
const hljs = window.hljs;
const markdownParser = window.marked?.marked;
const sanitizeMarkdown = window.DOMPurify?.sanitize;

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
  sounds: {
    join: localStorage.getItem("lonely-cord-sound-join") !== "off",
    leave: localStorage.getItem("lonely-cord-sound-leave") !== "off",
    notification: localStorage.getItem("lonely-cord-sound-notification") !== "off",
  },
  draft: "",
  messages: [],
  remoteParticipants: [],
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  toast: "",
  speaking: false,
  offline: !navigator.onLine,
};

let mediaPromise = null;
let toastTimer = null;
let audioMonitor = null;
let speakingTimer = null;
let eventsSource = null;
let presenceAudioUnlocked = false;
const peerConnections = new Map();
const remoteStreams = new Map();
const presenceAudio = new Map(
  ["join", "leave", "notification"].map((kind) => {
    const audio = new Audio(`/sounds/${kind}.mp3`);
    audio.preload = "auto";
    return [kind, audio];
  }),
);

const heights = { "120p": 120, "240p": 240, "360p": 360, "480p": 480, "720p": 720, "1080p": 1080 };

function icon(name, size = 20) {
  const paths = {
    mic: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    micOff: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8M4 4l16 16"/>',
    camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h8A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 15.5z"/><path d="m16 11 5-3v8l-5-3"/>',
    share: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M8 11h8M12 7v8M9 10l3-3 3 3"/>',
    leave: '<path d="M8 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H8"/>',
    chat: '<path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-4-.9L4 20l1.3-3.6A7.2 7.2 0 0 1 4 12c0-4.1 3.6-7.5 8-7.5s8 3.1 8 7Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    send: '<path d="m21 3-7.2 18-3.5-7.3L3 10.2z"/><path d="M10.3 13.7 21 3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
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
  if (!state.sounds[kind]) return;
  const audio = presenceAudio.get(kind);
  if (!audio) return;
  audio.volume = 0.55;
  audio.currentTime = 0;
  audio.play().catch(() => undefined);
}

function unlockPresenceAudio() {
  if (presenceAudioUnlocked) return;
  presenceAudioUnlocked = true;
  presenceAudio.forEach((audio) => {
    audio.muted = true;
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }).catch(() => { audio.muted = false; });
  });
}

function persistSoundPreference(kind, enabled) {
  state.sounds[kind] = enabled;
  localStorage.setItem(`lonely-cord-sound-${kind}`, enabled ? "on" : "off");
}

function syncMediaState() {
  if (!state.joined) return;
  api("/api/room/media", {
    sessionId: state.sessionId,
    micOn: state.micOn,
    cameraOn: state.cameraOn,
    sharing: Boolean(state.shareStream),
  }).catch(() => undefined);
}

function signalPeer(targetId, type, payload) {
  return api("/api/signal", {
    sessionId: state.sessionId,
    targetId,
    type,
    payload,
  }).catch(() => undefined);
}

function desiredTracks() {
  return [
    ...(state.stream?.getAudioTracks() || []),
    ...(state.stream?.getVideoTracks() || []),
    ...(state.shareStream?.getTracks() || []),
  ];
}

function syncPeerTracks(peer) {
  const tracks = desiredTracks();
  const desired = new Set(tracks);
  for (const sender of peer.pc.getSenders()) {
    if (sender.track && !desired.has(sender.track)) {
      peer.pc.removeTrack(sender);
      peer.localStream.removeTrack(sender.track);
    }
  }
  for (const track of tracks) {
    if (!peer.pc.getSenders().some((sender) => sender.track === track)) {
      peer.localStream.addTrack(track);
      peer.pc.addTrack(track, peer.localStream);
    }
  }
}

function closePeer(remoteId) {
  const peer = peerConnections.get(remoteId);
  if (!peer) return;
  peer.pc.ontrack = null;
  peer.pc.onicecandidate = null;
  peer.pc.close();
  peerConnections.delete(remoteId);
  remoteStreams.delete(remoteId);
}

async function negotiatePeer(peer) {
  if (peer.negotiationInFlight) {
    peer.negotiationQueued = true;
    return;
  }
  if (peer.pc.signalingState !== "stable") {
    peer.negotiationQueued = true;
    return;
  }
  peer.negotiationInFlight = true;
  peer.makingOffer = true;
  try {
    await peer.pc.setLocalDescription();
    if (peer.pc.localDescription) {
      await signalPeer(peer.remoteId, peer.pc.localDescription.type, peer.pc.localDescription);
    }
  } catch {
    peer.negotiationQueued = true;
  } finally {
    peer.makingOffer = false;
    peer.negotiationInFlight = false;
    if (peer.negotiationQueued && peer.pc.signalingState === "stable") {
      peer.negotiationQueued = false;
      queueMicrotask(() => negotiatePeer(peer));
    }
  }
}

function createPeer(remoteId) {
  if (remoteId === state.sessionId || !window.RTCPeerConnection) return null;
  const existing = peerConnections.get(remoteId);
  if (existing) {
    syncPeerTracks(existing);
    return existing;
  }
  const pc = new RTCPeerConnection({ iceServers: state.iceServers });
  const peer = {
    pc,
    remoteId,
    localStream: new MediaStream(),
    remoteStream: new MediaStream(),
    makingOffer: false,
    ignoreOffer: false,
    polite: state.sessionId > remoteId,
    pendingCandidates: [],
    negotiationInFlight: false,
    negotiationQueued: false,
  };
  peerConnections.set(remoteId, peer);
  pc.onicecandidate = (event) => {
    if (event.candidate) signalPeer(remoteId, "candidate", event.candidate);
  };
  pc.ontrack = (event) => {
    const stream = peer.remoteStream;
    const tracks = event.streams[0]?.getTracks() || [event.track];
    tracks.forEach((track) => {
      if (!stream.getTracks().includes(track)) stream.addTrack(track);
    });
    if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track);
    remoteStreams.set(remoteId, stream);
    updateRoom();
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) {
      closePeer(remoteId);
      updateRoom();
    }
  };
  pc.onnegotiationneeded = () => negotiatePeer(peer);
  syncPeerTracks(peer);
  return peer;
}

async function handleRtcSignal(event) {
  const { fromId, type, payload } = JSON.parse(event.data);
  const peer = createPeer(fromId);
  if (!peer) return;
  const description = type === "candidate" ? null : payload;
  try {
    if (type === "candidate" && peer.ignoreOffer) return;
    if (description) {
      const offerCollision =
        description.type === "offer" &&
        (peer.makingOffer || peer.pc.signalingState !== "stable");
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;
      if (description.type === "offer" && peer.pc.signalingState !== "stable") {
        await peer.pc.setLocalDescription({ type: "rollback" });
      }
      await peer.pc.setRemoteDescription(description);
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await peer.pc.addIceCandidate(candidate);
      }
      if (description.type === "offer") {
        await peer.pc.setLocalDescription();
        if (peer.pc.localDescription) {
          await signalPeer(fromId, peer.pc.localDescription.type, peer.pc.localDescription);
        }
      }
      if (peer.negotiationQueued && peer.pc.signalingState === "stable") {
        peer.negotiationQueued = false;
        negotiatePeer(peer);
      }
    } else if (payload) {
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(payload);
      else peer.pendingCandidates.push(payload);
    }
  } catch {
    peer.ignoreOffer = false;
  }
}

function connectRoom() {
  eventsSource?.close();
  const source = new EventSource(`/api/events?sessionId=${encodeURIComponent(state.sessionId)}`);
  eventsSource = source;
  source.addEventListener("room-sync", (event) => {
    const data = JSON.parse(event.data);
    state.iceServers = data.iceServers || state.iceServers;
    state.remoteParticipants = data.participants.filter((participant) => participant.id !== state.sessionId);
    state.messages = data.messages || [];
    state.remoteParticipants.forEach((participant) => createPeer(participant.id));
    updateRoom();
  });
  source.addEventListener("participant-joined", (event) => {
    const participant = JSON.parse(event.data);
    if (participant.id === state.sessionId) return;
    state.remoteParticipants = [...state.remoteParticipants.filter((item) => item.id !== participant.id), participant];
    createPeer(participant.id);
    playPresenceSound("join");
    updateRoom();
  });
  source.addEventListener("participant-updated", (event) => {
    const participant = JSON.parse(event.data);
    if (participant.id === state.sessionId) return;
    state.remoteParticipants = [...state.remoteParticipants.filter((item) => item.id !== participant.id), participant];
    createPeer(participant.id);
    updateRoom();
  });
  source.addEventListener("participant-left", (event) => {
    const participant = JSON.parse(event.data);
    state.remoteParticipants = state.remoteParticipants.filter((item) => item.id !== participant.id);
    closePeer(participant.id);
    playPresenceSound("leave");
    updateRoom();
  });
  source.addEventListener("chat-message", (event) => {
    const message = JSON.parse(event.data);
    if (!state.messages.some((item) => item.id === message.id)) state.messages.push(message);
    playPresenceSound("notification");
    updateRoom();
  });
  source.addEventListener("rtc-signal", handleRtcSignal);
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
    state.iceServers = joined.iceServers || state.iceServers;
    connectRoom();
    syncMediaState();
    state.remoteParticipants.forEach((participant) => createPeer(participant.id));
    updateRoom();
  } catch {}
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
      state.cameraOn = state.stream.getVideoTracks().length > 0;
      syncMediaState();
      if (showQuality && !state.qualityPrompted) openQuality(true);
      updateRoom();
    }
    return state.stream;
  }
  if (mediaPromise) {
    const stream = await mediaPromise;
    if (activate && stream) {
      stream.getVideoTracks().forEach((track) => { track.enabled = true; });
      state.cameraOn = stream.getVideoTracks().length > 0;
      syncMediaState();
      if (showQuality && !state.qualityPrompted) openQuality(true);
      updateRoom();
    }
    return stream;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Trình duyệt này không hỗ trợ truy cập camera.");
    return null;
  }
  mediaPromise = (async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: state.facingMode }, audio: true });
    } catch {
      const tracks = [];
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        tracks.push(...audioOnly.getAudioTracks());
      } catch {}
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: state.facingMode }, audio: false });
        tracks.push(...videoOnly.getVideoTracks());
      } catch {}
      if (!tracks.length) throw new Error("Media permission denied");
      stream = new MediaStream(tracks);
    }
    stream.getTracks().forEach((track) => { track.enabled = activate; });
    state.stream = stream;
    state.cameraOn = activate && stream.getVideoTracks().length > 0;
    state.micOn = activate && stream.getAudioTracks().length > 0;
    mediaPromise = null;
    updateRoom();
    syncMediaState();
    state.remoteParticipants.forEach((participant) => {
      const peer = createPeer(participant.id);
      if (peer) syncPeerTracks(peer);
    });
    if (showQuality && !state.qualityPrompted) openQuality(true);
    if (state.micOn) startAudioMonitor();
    return stream;
  })()
    .catch(() => {
      mediaPromise = null;
      state.cameraOn = false;
      state.micOn = false;
      showToast("Không thể cấp quyền camera hoặc microphone. Bạn vẫn có thể vào phòng rồi thử lại trong Cài đặt trình duyệt.");
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
  if (!state.stream) await ensureMedia(false, false);
  const oldVideo = state.stream?.getVideoTracks()[0];
  try {
    if (oldVideo) {
      try {
        await oldVideo.applyConstraints({ ...constraints(), facingMode: { ideal: nextFacing } });
        const currentFacing = oldVideo.getSettings().facingMode;
        if (!currentFacing || currentFacing === nextFacing) {
          state.facingMode = nextFacing;
          updateRoom();
          return;
        }
      } catch {}
    }
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentDeviceId = oldVideo?.getSettings().deviceId;
    const facingPattern = nextFacing === "environment" ? /back|rear|environment|world/i : /front|user|facetime/i;
    const nextDevice = cameras.find((device) => device.deviceId !== currentDeviceId && facingPattern.test(device.label))
      || cameras.find((device) => device.deviceId !== currentDeviceId);
    const video = nextDevice
      ? { ...constraints(), deviceId: { exact: nextDevice.deviceId } }
      : { ...constraints(), facingMode: { ideal: nextFacing } };
    let nextStream;
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch {
      nextStream = await navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: { ideal: nextFacing } }, audio: false });
    }
    const nextVideo = nextStream.getVideoTracks()[0];
    if (!nextVideo) throw new Error("No video track");
    if (state.stream && oldVideo) {
      state.stream.addTrack(nextVideo);
      oldVideo.stop();
      state.stream.removeTrack(oldVideo);
    } else {
      state.stream = new MediaStream([...(state.stream?.getAudioTracks() || []), nextVideo]);
    }
    nextVideo.enabled = state.cameraOn;
    state.facingMode = nextFacing;
    peerConnections.forEach((peer) => syncPeerTracks(peer));
    updateRoom();
  } catch {
    showToast("Camera trước/sau không khả dụng trên thiết bị này.");
  }
}

async function addVideoTrack() {
  if (state.stream?.getVideoTracks().length) return true;
  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({ video: { ...constraints(), facingMode: { ideal: state.facingMode } }, audio: false });
    const videoTrack = videoStream.getVideoTracks()[0];
    if (!videoTrack) throw new Error("No video track");
    if (!state.stream) state.stream = new MediaStream();
    videoTrack.enabled = state.cameraOn;
    state.stream.addTrack(videoTrack);
    peerConnections.forEach((peer) => syncPeerTracks(peer));
    return true;
  } catch {
    showToast("Không thể mở camera. Hãy kiểm tra quyền camera trong trình duyệt.");
    return false;
  }
}

async function toggleMic() {
  if (!state.stream) await ensureMedia(false, false);
  if (!state.stream) return;
  state.micOn = !state.micOn;
  state.stream.getAudioTracks().forEach((track) => { track.enabled = state.micOn; });
  if (state.micOn) startAudioMonitor(); else stopAudioMonitor();
  syncMediaState();
  updateRoom();
}

async function toggleCamera() {
  if (state.cameraOn && state.stream) {
    state.stream.getVideoTracks().forEach((track) => { track.enabled = false; });
    state.cameraOn = false;
    syncMediaState();
    updateRoom();
    return;
  }
  await ensureMedia(false, true);
  if (state.stream && await addVideoTrack()) {
    state.stream.getVideoTracks().forEach((track) => { track.enabled = true; });
    state.cameraOn = true;
    syncMediaState();
    updateRoom();
  }
}

async function toggleShare() {
  if (state.shareStream) {
    stopStream(state.shareStream);
    state.shareStream = null;
    state.shareFocus = false;
    peerConnections.forEach((peer) => syncPeerTracks(peer));
    syncMediaState();
    updateRoom();
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) { showToast("Trình duyệt này không hỗ trợ chia sẻ màn hình."); return; }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { ...constraints() }, audio: false });
    stream.getVideoTracks()[0].onended = () => {
      state.shareStream = null;
      state.shareFocus = false;
      peerConnections.forEach((peer) => syncPeerTracks(peer));
      syncMediaState();
      updateRoom();
    };
    state.shareStream = stream;
    peerConnections.forEach((peer) => syncPeerTracks(peer));
    if (!state.qualityPrompted) openQuality(true);
    syncMediaState();
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
     <div class="tile-shade"></div><div class="tile-topline"><span class="local-pill">BẠN</span>${!state.micOn ? `<span class="tile-muted">${icon("micOff", 13)}</span>` : ""}</div>
    <div class="tile-label"><span>${escapeHtml(state.displayName)}</span>${cameraVisible ? '<span class="camera-live-dot"></span>' : ""}</div>
  </article>`;
}

function remoteParticipantTileHtml(participant) {
  const micStatus = participant.micOn ? `<span class="media-status live" title="Microphone đang bật">${icon("mic", 13)}</span>` : `<span class="media-status muted" title="Microphone đang tắt">${icon("micOff", 13)}</span>`;
  const cameraStatus = participant.cameraOn ? `<span class="media-status live" title="Camera đang bật">${icon("camera", 13)}</span>` : "";
  const shareStatus = participant.sharing ? `<span class="media-status live" title="Đang chia sẻ màn hình">${icon("share", 13)}</span>` : "";
  const remoteStream = remoteStreams.get(participant.id);
  const cameraVisible = participant.cameraOn && remoteStream?.getVideoTracks().length;
  return `<article class="participant-tile remote-tile ${participant.cameraOn ? "camera-ready" : "camera-off"}" data-participant-id="${escapeHtml(participant.id)}" data-camera="${participant.cameraOn ? "on" : "off"}">
     ${cameraVisible ? videoHtml(`remote:${participant.id}`) : `<div class="avatar-stage"><div class="participant-avatar participant-avatar-large" style="background:#5865f2"><span>${escapeHtml(participant.initials || initials(participant.name))}</span></div></div>`}
     <audio class="remote-audio" data-audio="${escapeHtml(participant.id)}" autoplay></audio>
    <div class="tile-shade"></div><div class="tile-topline"><span class="local-pill" style="background:#404249">ĐANG TRONG PHÒNG</span><div class="media-statuses">${micStatus}${cameraStatus}${shareStatus}</div></div>
    <div class="tile-label"><span>${escapeHtml(participant.name)}</span>${participant.cameraOn ? '<span class="camera-live-dot"></span>' : ""}</div>
  </article>`;
}

const markdownCodeBlocks = new Map();
let nextCodeBlockId = 0;

function safeMarkdownUrl(url) {
  const value = String(url || "").trim();
  if (/^(https?:|mailto:)/i.test(value)) return escapeHtml(value);
  return "#";
}

function highlightCode(code, language) {
  const keywords = {
    javascript: "as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield",
    typescript: "as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield interface type public private protected readonly enum implements namespace",
    python: "and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield",
    ruby: "alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield",
    go: "break default func interface select case defer go map struct chan else goto package switch const fallthrough if range type continue for import return var",
    rust: "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while",
    java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while",
    csharp: "abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while",
    php: "and or xor __FILE__ __LINE__ array as break case class const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final for foreach function global if include include_once instanceof insteadof interface isset list namespace new print private protected public require require_once return static switch throw trait try unset use var while yield",
    sql: "select from where and or not insert into update delete create alter drop table join inner left right full outer on as group by order having limit offset union all distinct values set null is like between exists",
  };
  const aliases = { js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", rs: "rust", cs: "csharp", html: "markup", xml: "markup", sh: "bash", shell: "bash", yml: "yaml", md: "markdown" };
  const lang = aliases[language] || language || "text";
  const keywordSet = new Set((keywords[lang] || "").split(/\s+/).filter(Boolean));
  const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|<!--[\s\S]*?-->|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()|\b[A-Za-z_$][\w$]*\b/g;
  let output = "";
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    output += escapeHtml(code.slice(cursor, index));
    const escaped = escapeHtml(token);
    let type = "plain";
    if (/^(\/\*|\/\/|#|<!--)/.test(token)) type = "comment";
    else if (/^(["'`])/.test(token)) type = "string";
    else if (/^\d/.test(token)) type = "number";
    else if (match[0] && /\($/.test(code.slice(index + token.length, index + token.length + 1))) type = "function";
    else if (keywordSet.has(token)) type = "keyword";
    output += type === "plain" ? escaped : `<span class="tok-${type}">${escaped}</span>`;
    cursor = index + token.length;
  }
  return output + escapeHtml(code.slice(cursor));
}

const languageAliases = { js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript", py: "python", rb: "ruby", rs: "rust", cs: "csharp", html: "xml", sh: "bash", shell: "bash", yml: "yaml", md: "markdown" };

function normalizeLanguage(language) {
  const value = String(language || "").toLowerCase().trim();
  return languageAliases[value] || value;
}

function detectedCodeLanguage(code, language) {
  const normalized = normalizeLanguage(language);
  if (normalized && hljs?.getLanguage(normalized)) return normalized;
  if (/^\s*print\s*\(/m.test(code) && !/[{};]/.test(code)) return "python";
  return hljs?.highlightAuto(code).language || "text";
}

function highlightCodeWithLibrary(code, language) {
  const normalized = detectedCodeLanguage(code, language);
  if (!hljs || normalized === "text" || !hljs.getLanguage(normalized)) return highlightCode(code, language);
  try {
    return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

function codeBlockHtml(code, language) {
  const id = `code-${nextCodeBlockId++}`;
  markdownCodeBlocks.set(id, code);
  const label = detectedCodeLanguage(code, language);
  return `<div class="code-block"><div class="code-toolbar"><span class="code-language">${escapeHtml(label)}</span><button type="button" class="code-copy" data-code-id="${id}">${icon("copy", 14)}<span>Copy</span></button></div><pre><code class="hljs language-${escapeHtml(label)}">${highlightCodeWithLibrary(code, label)}</code></pre></div>`;
}

function renderInlineMarkdown(value) {
  const placeholders = [];
  let output = escapeHtml(value).replace(/`([^`\n]+)`/g, (_, code) => {
    const id = placeholders.push(`<code class="inline-code">${code}</code>`) - 1;
    return `\u0000${id}\u0000`;
  });
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => `<a href="${safeMarkdownUrl(url)}" target="_blank" rel="noreferrer">${label}</a>`);
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/__([^_]+)__/g, "<u>$1</u>");
  output = output.replace(/~~([^~]+)~~|--([^-]+)--/g, (_, strike, dashed) => `<del>${strike || dashed}</del>`);
  output = output.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" tabindex="0" role="button" data-spoiler>$1</span>');
  output = output.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  output = output.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  return output.replace(/\u0000(\d+)\u0000/g, (_, id) => placeholders[Number(id)]);
}

function renderMarkdown(source) {
  if (markdownParser) {
    const spoilers = [];
    const prepared = String(source || "")
      .replace(/--([^-|\n]+?)--/g, "~~$1~~")
      .replace(/\|\|([\s\S]*?)\|\|/g, (_, content) => {
        const id = spoilers.push(content) - 1;
        return `LCSP${id}END`;
      });
    const renderer = new window.marked.Renderer();
    renderer.code = ({ text, lang }) => codeBlockHtml(text, lang || "");
    const rendered = markdownParser.parse(prepared, { renderer, gfm: true, breaks: true });
    const safe = sanitizeMarkdown
      ? sanitizeMarkdown(rendered, { ADD_ATTR: ["target", "rel", "data-code-id", "data-spoiler", "tabindex"], FORBID_TAGS: ["style", "script", "iframe", "object", "embed"] })
      : rendered;
    return safe.replace(/LCSP(\d+)END/g, (_, id) => `<span class="spoiler" tabindex="0" role="button" data-spoiler>${renderInlineMarkdown(spoilers[Number(id)] || "")}</span>`);
  }
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^ {0,3}```\s*([^\s`]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^ {0,3}```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      html.push(codeBlockHtml(code.join("\n"), fence[1].toLowerCase()));
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) { html.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`); index += 1; continue; }
    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) { html.push("<hr>"); index += 1; continue; }
    if (/^ {0,3}>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^ {0,3}>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^ {0,3}>\s?/, ""));
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const listPattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-+*]\s+/;
      const items = [];
      while (index < lines.length && listPattern.test(lines[index])) {
        items.push(lines[index++].replace(listPattern, ""));
      }
      html.push(`<${ordered ? "ol" : "ul"}>${items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])) {
      const cells = (value) => value.replace(/^\s*\||\|\s*$/g, "").split("|").map((cell) => renderInlineMarkdown(cell.trim()));
      const headers = cells(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(cells(lines[index++]));
      html.push(`<table><thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^ {0,3}(#{1,6})\s+/.test(lines[index]) && !/^ {0,3}```/.test(lines[index]) && !/^\s*(?:[-+*]|\d+\.)\s+/.test(lines[index]) && !/^ {0,3}>/.test(lines[index])) paragraph.push(lines[index++]);
    html.push(`<p>${paragraph.map(renderInlineMarkdown).join("<br>")}</p>`);
  }
  return html.join("");
}

function chatHtml() {
  markdownCodeBlocks.clear();
  nextCodeBlockId = 0;
  const messages = state.messages.length
    ? state.messages.map((message) => `<div class="chat-message ${message.senderId === state.sessionId ? "local" : ""}"><div class="message-meta"><strong>${escapeHtml(message.name)}</strong><span>${escapeHtml(message.time)}</span></div><div class="markdown-body">${renderMarkdown(message.text)}</div></div>`).join("")
    : `<div class="chat-empty">${icon("chat", 26)}<p>Chưa có tin nhắn nào.</p><span>Bắt đầu cuộc trò chuyện trong phòng duy nhất này.</span></div>`;
  return `<aside class="chat-panel" aria-label="Trò chuyện trong phòng"><div class="panel-head"><div><span class="panel-kicker">PHÒNG CHAT</span><h2>Tin nhắn</h2></div><button class="icon-button subtle" id="close-chat" aria-label="Đóng chat">${icon("close", 19)}</button></div><div class="chat-list">${messages}</div><form class="chat-compose" id="chat-form"><textarea id="chat-input" rows="2" placeholder="Nhập tin nhắn" aria-label="Tin nhắn">${escapeHtml(state.draft)}</textarea><button type="submit" aria-label="Gửi tin nhắn" ${state.draft.trim() ? "" : "disabled"}>${icon("send", 18)}</button></form></aside>`;
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
       <button class="control-button ${state.micOn ? "" : "off"}" id="toggle-mic" aria-label="${state.micOn ? "Tắt microphone" : "Bật microphone"}">${icon(state.micOn ? "mic" : "micOff", 21)}</button>
      <button class="control-button ${state.cameraOn ? "" : "off"}" id="toggle-camera" aria-label="${state.cameraOn ? "Tắt camera" : "Bật camera"}">${icon("camera", 21)}</button>
       <button class="control-button" id="switch-camera" aria-label="Đổi camera trước sau">${icon("switch", 21)}</button>
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
  const soundOption = (kind, title, description) => `<label class="sound-toggle"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" data-sound-toggle="${kind}" ${state.sounds[kind] ? "checked" : ""}><i aria-hidden="true"></i></label>`;
  return `<div class="modal-backdrop" role="dialog" aria-modal="true"><div class="quality-card rise-in"><div class="quality-head"><div><span class="panel-kicker">${automatic ? "THIẾT LẬP LẦN ĐẦU" : "CÀI ĐẶT MEDIA"}</span><h2>Chất lượng video</h2></div><button class="icon-button subtle" id="close-quality" aria-label="Đóng cài đặt chất lượng">${icon("close", 19)}</button></div>${automatic ? '<p class="quality-intro">Chọn chất lượng khởi đầu cho camera và chia sẻ màn hình. Bạn có thể thay đổi lại trong Cài đặt.</p>' : ""}<div class="quality-options"><div><label class="field-label" for="resolution">Độ phân giải</label><select id="resolution">${Object.keys(heights).map((item) => `<option value="${item}" ${state.resolution === item ? "selected" : ""}>${item}</option>`).join("")}</select></div><div><label class="field-label" for="fps">Tốc độ khung hình</label><select id="fps">${[15, 30, 45, 60].map((item) => `<option value="${item}" ${Number(state.fps) === item ? "selected" : ""}>${item} fps</option>`).join("")}</select></div></div><section class="sound-settings"><div class="sound-settings-head"><span class="panel-kicker">THÔNG BÁO ÂM THANH</span><small>Mỗi trình duyệt tự lưu lựa chọn này.</small></div>${soundOption("join", "Người vào phòng", "Phát khi có người tham gia")}${soundOption("leave", "Người rời phòng", "Phát khi có người rời đi")}${soundOption("notification", "Tin nhắn mới", "Phát khi có tin nhắn")}</section><div class="quality-meter"><span>Đang chọn</span><strong>${state.resolution} · ${state.fps} fps</strong><div class="meter-track"><span style="width:${meter}%"></span></div></div><button class="primary-action" id="apply-quality"><span>${automatic ? "Tiếp tục" : "Lưu cài đặt"}</span>${icon("arrow", 17)}</button></div></div>`;
}

function shareFocusHtml() {
  if (!state.shareFocus || !state.shareStream) return "";
  return `<div class="share-focus" role="dialog" aria-label="Màn hình đang chia sẻ"><div class="share-focus-top"><div class="share-focus-label"><span class="signal-dot"></span> ĐANG CHIA SẺ MÀN HÌNH</div><button class="icon-button light" id="close-share" aria-label="Đóng màn hình chia sẻ">${icon("close", 20)}</button></div><div class="share-focus-content"><video class="tile-video" data-video="share-focus" muted playsinline autoplay></video><div class="share-focus-caption"><strong>Bạn đang chia sẻ màn hình</strong><small>Người khác vẫn có thể xem màn hình của bạn</small></div></div><div class="share-strip"><div class="strip-person">${avatarHtml()}<span>${escapeHtml(state.displayName)}</span></div></div></div>`;
}

function bindVideos() {
  document.querySelectorAll("[data-video]").forEach((video) => {
    const kind = video.dataset.video;
    const stream = kind === "local"
      ? state.stream
      : kind === "share" || kind === "share-focus"
        ? state.shareStream
        : kind?.startsWith("remote:")
          ? remoteStreams.get(kind.slice(7))
          : null;
    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => undefined);
    }
  });
  document.querySelectorAll("[data-audio]").forEach((audio) => {
    const stream = remoteStreams.get(audio.dataset.audio);
    if (stream) {
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.volume = 1;
      audio.play().catch(() => undefined);
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
  state.remoteParticipants.forEach((participant) => createPeer(participant.id));
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
  document.querySelector("#chat-input")?.addEventListener("input", (event) => {
    const input = event.target;
    const sendButton = document.querySelector("#chat-form button[type=\"submit\"]");
    state.draft = input.value;
    if (sendButton) sendButton.disabled = !state.draft.trim();
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });
  document.querySelector("#chat-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      document.querySelector("#chat-form")?.requestSubmit();
    }
  });
  document.querySelector("#close-quality")?.addEventListener("click", closeQuality);
  document.querySelector("#resolution")?.addEventListener("change", (event) => { state.resolution = event.target.value; render(); });
  document.querySelector("#fps")?.addEventListener("change", (event) => { state.fps = event.target.value; render(); });
  document.querySelectorAll("[data-sound-toggle]").forEach((input) => {
    input.addEventListener("change", (event) => persistSoundPreference(event.target.dataset.soundToggle, event.target.checked));
  });
  document.querySelectorAll(".code-copy").forEach((button) => {
    button.addEventListener("click", async () => {
      const code = markdownCodeBlocks.get(button.dataset.codeId) || "";
      try {
        await navigator.clipboard.writeText(code);
      } catch {
        const helper = document.createElement("textarea");
        helper.value = code;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      const label = button.querySelector("span");
      if (label) {
        label.textContent = "Đã copy";
        window.setTimeout(() => { label.textContent = "Copy"; }, 1600);
      }
    });
  });
  document.querySelectorAll("[data-spoiler]").forEach((spoiler) => {
    const reveal = () => spoiler.classList.toggle("revealed");
    spoiler.addEventListener("click", reveal);
    spoiler.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        reveal();
      }
    });
  });
  document.querySelector("#apply-quality")?.addEventListener("click", () => { applyQuality(); closeQuality(); });
}

function updateRoom() {
  if (!state.joined) return;
  const previousChatList = document.querySelector(".chat-list");
  const previousInput = document.querySelector("#chat-input");
  const keepChatAtBottom = previousChatList && previousChatList.scrollHeight - previousChatList.scrollTop - previousChatList.clientHeight < 24;
  const previousScrollTop = previousChatList?.scrollTop || 0;
  const keepInputFocus = document.activeElement === previousInput;
  const caret = keepInputFocus ? previousInput.selectionStart : null;
  render();
  bindVideos();
  const nextChatList = document.querySelector(".chat-list");
  if (nextChatList) nextChatList.scrollTop = keepChatAtBottom ? nextChatList.scrollHeight : previousScrollTop;
  if (keepInputFocus) {
    const nextInput = document.querySelector("#chat-input");
    nextInput?.focus();
    if (caret !== null) nextInput.setSelectionRange(caret, caret);
  }
}

function leaveRoom() {
  playPresenceSound("leave");
  api("/api/room/leave", { sessionId: state.sessionId }, true).catch(() => undefined);
  eventsSource?.close();
  eventsSource = null;
  peerConnections.forEach((peer) => peer.pc.close());
  peerConnections.clear();
  remoteStreams.clear();
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
document.addEventListener("pointerdown", unlockPresenceAudio, { once: true });
document.addEventListener("keydown", unlockPresenceAudio, { once: true });
document.addEventListener("contextmenu", (event) => event.preventDefault());
document.addEventListener("selectstart", (event) => { if (!["INPUT", "TEXTAREA"].includes(event.target.tagName)) event.preventDefault(); });
document.addEventListener("copy", (event) => {
  if (event.target.closest?.(".code-block") || ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;
  event.preventDefault();
});
document.addEventListener("keydown", (event) => {
  const devtoolsShortcut = event.key === "F12" || (event.ctrlKey && event.shiftKey && ["I", "J", "C"].includes(event.key.toUpperCase())) || (event.ctrlKey && event.key.toUpperCase() === "U");
  if (devtoolsShortcut) event.preventDefault();
});

render();