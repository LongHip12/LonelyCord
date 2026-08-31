import { socketClient } from './socket.js';
import { escapeHtml } from './markdown.js';

class VoiceController {
  constructor() {
    this.currentChannelId = null;
    this.currentChannelName = '';
    this.participants = new Map();
    this.selfParticipant = null;
    this.localStream = null;
    this.screenStream = null;
    this.peerConnections = new Map();
    this.remoteAudioElements = new Map();
    this.micMuted = false;
    this.camEnabled = false;
    this.screenSharing = false;
    this.previewInterval = null;
    this.expandedPeerId = null;
    this.watchingStreams = new Set();
    this.currentDmCall = null;
    this.dmPeerConnection = null;
    this.ringtoneInterval = null;
    this.speakingDetectorInterval = null;
    this.vadAnalyser = null;
    this.isSpeakingLocally = false;
    this.audioContext = null;
  }

  init() {
    socketClient.on('voice_room_joined', async ({ channelId, participants, self }) => {
      this.currentChannelId = channelId;
      this.selfParticipant = self;
      this.participants.clear();
      for (const p of participants) {
        this.participants.set(p.peerId, p);
      }
      this.renderVoiceRoom();
      this.renderVoiceConnectedBar();
      window.LonelyApp.group.renderChannels();
      await this.initiateMeshConnections();
    });

    socketClient.on('voice_participant_joined', async (participant) => {
      this.participants.set(participant.peerId, participant);
      this.renderVoiceRoom();
      window.LonelyApp.group.renderChannels();
      await this.createPeerConnection(participant.peerId, true);
    });

    socketClient.on('voice_participant_left', ({ peerId }) => {
      this.participants.delete(peerId);
      this.closePeerConnection(peerId);
      if (this.expandedPeerId === peerId) {
        this.expandedPeerId = null;
      }
      this.renderVoiceRoom();
      window.LonelyApp.group.renderChannels();
    });

    socketClient.on('voice_participant_updated', ({ peerId, updates }) => {
      const p = this.participants.get(peerId);
      if (p) {
        Object.assign(p, updates);
        this.renderVoiceRoom();
        window.LonelyApp.group.renderChannels();
      }
    });

    socketClient.on('voice_speaking_status', ({ peerId, isSpeaking }) => {
      const p = this.participants.get(peerId);
      if (p) {
        p.isSpeaking = isSpeaking;
        this.updateSpeakingVisuals(peerId, isSpeaking);
      }
    });

    socketClient.on('voice_soundboard_played', ({ soundId, username }) => {
      this.playSoundEffect(soundId);
      window.LonelyApp.showToast(`${username} vừa phát âm thanh Soundboard!`, 'info');
    });

    socketClient.on('voice_screen_preview_update', ({ peerId, screenPreview }) => {
      const p = this.participants.get(peerId);
      if (p) {
        p.screenPreview = screenPreview;
        const img = document.getElementById(`preview-img-${peerId}`);
        if (img) img.src = screenPreview;
      }
    });

    socketClient.on('webrtc_signal', async ({ senderPeerId, signal }) => {
      let pc = this.peerConnections.get(senderPeerId) || this.dmPeerConnection;
      if (!pc && this.currentChannelId) {
        pc = await this.createPeerConnection(senderPeerId, false);
      }
      if (!pc) return;

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketClient.emit('webrtc_signal', {
            targetPeerId: senderPeerId,
            signal: { sdp: pc.localDescription }
          });
        }
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch {}
      }
    });

    socketClient.on('dm_incoming_call', (data) => {
      this.showIncomingCallModal(data);
    });

    socketClient.on('dm_call_response_received', async ({ responderSocketId, accepted }) => {
      this.stopRingtone();
      if (accepted) {
        this.updateDmCallUI('connected');
        await this.startDmWebRtc(responderSocketId, true);
      } else {
        window.LonelyApp.showToast('Cuộc gọi đã bị từ chối', 'info');
        this.endDmCall(false);
      }
    });

    socketClient.on('dm_call_ended', () => {
      this.stopRingtone();
      this.endDmCall(false);
      window.LonelyApp.showToast('Cuộc gọi đã kết thúc', 'info');
    });
  }

  updateSpeakingVisuals(peerId, isSpeaking) {
    const tile = document.getElementById(`tile-${peerId}`);
    if (tile) {
      const av = tile.querySelector('.voice-avatar-square');
      if (av) {
        if (isSpeaking) av.classList.add('user-speaking-ring');
        else av.classList.remove('user-speaking-ring');
      }
    }
    const sideAv = document.getElementById(`sidebar-voice-user-${peerId}`);
    if (sideAv) {
      if (isSpeaking) sideAv.classList.add('user-speaking-ring');
      else sideAv.classList.remove('user-speaking-ring');
    }
  }

  async joinVoice(channelId) {
    if (this.currentChannelId === channelId) return;
    if (this.currentChannelId) {
      this.leaveVoice();
    }

    const group = window.LonelyApp.group.currentGroup;
    const ch = group?.channels?.find(c => c.id === channelId);
    this.currentChannelName = ch?.name || 'Phòng thoại';

    await this.initLocalStream();

    socketClient.emit('join_voice_channel', { channelId });
  }

  leaveVoice() {
    if (!this.currentChannelId) return;
    socketClient.emit('leave_voice_channel');
    this.stopAllLocalTracks();
    this.stopSpeakingDetector();
    for (const [peerId] of this.peerConnections) {
      this.closePeerConnection(peerId);
    }
    this.peerConnections.clear();
    this.participants.clear();
    this.selfParticipant = null;
    this.currentChannelId = null;
    this.expandedPeerId = null;

    const overlay = document.getElementById('voice-room-container');
    if (overlay) overlay.style.display = 'none';

    const bar = document.getElementById('voice-connected-bar');
    if (bar) bar.style.display = 'none';

    window.LonelyApp.group.renderChannels();
  }

  renderVoiceConnectedBar() {
    let bar = document.getElementById('voice-connected-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'voice-connected-bar';
      bar.className = 'voice-connected-bar';
      const dock = document.querySelector('.user-dock');
      if (dock && dock.parentNode) {
        dock.parentNode.insertBefore(bar, dock);
      }
    }

    bar.style.display = 'flex';
    bar.innerHTML = `
      <div class="voice-conn-info" onclick="window.LonelyApp.voice.showVoiceOverlay()">
        <div class="voice-conn-status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          <span>Đã kết nối giọng nói</span>
        </div>
        <div class="voice-conn-channel">${escapeHtml(this.currentChannelName)} / ${escapeHtml(window.LonelyApp.group.currentGroup?.name || '')}</div>
      </div>
      <button class="voice-disconnect-btn" onclick="window.LonelyApp.voice.leaveVoice()" title="Ngắt kết nối">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
      </button>
    `;
  }

  showVoiceOverlay() {
    if (!this.currentChannelId) return;
    document.getElementById('chat-messages-container').style.display = 'none';
    const overlay = document.getElementById('voice-room-container');
    if (overlay) overlay.style.display = 'flex';
  }

  async toggleMic() {
    this.micMuted = !this.micMuted;
    if (!this.localStream) {
      await this.initLocalStream();
    }
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = !this.micMuted;
      });
      if (!this.micMuted) {
        this.startSpeakingDetector();
      } else {
        this.stopSpeakingDetector();
      }
    }
    socketClient.emit('voice_update_media', { micMuted: this.micMuted });
    this.renderVoiceRoom();
    if (this.currentDmCall) {
      this.updateDmCallUI();
    }
  }

  startSpeakingDetector() {
    if (!this.localStream || this.speakingDetectorInterval) return;
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const src = this.audioContext.createMediaStreamSource(this.localStream);
      this.vadAnalyser = this.audioContext.createAnalyser();
      this.vadAnalyser.fftSize = 64;
      src.connect(this.vadAnalyser);

      const data = new Uint8Array(this.vadAnalyser.frequencyBinCount);
      this.speakingDetectorInterval = setInterval(() => {
        if (this.micMuted || !this.vadAnalyser) return;
        this.vadAnalyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeaking = avg > 15;

        if (isSpeaking !== this.isSpeakingLocally) {
          this.isSpeakingLocally = isSpeaking;
          socketClient.emit('voice_speaking', { isSpeaking });
          this.updateSpeakingVisuals('self', isSpeaking);
        }
      }, 100);
    } catch {}
  }

  stopSpeakingDetector() {
    clearInterval(this.speakingDetectorInterval);
    this.speakingDetectorInterval = null;
    if (this.isSpeakingLocally) {
      this.isSpeakingLocally = false;
      socketClient.emit('voice_speaking', { isSpeaking: false });
      this.updateSpeakingVisuals('self', false);
    }
  }

  async toggleCam() {
    this.camEnabled = !this.camEnabled;
    if (this.camEnabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !this.micMuted });
        const videoTrack = stream.getVideoTracks()[0];
        if (this.localStream) {
          this.localStream.addTrack(videoTrack);
        } else {
          this.localStream = stream;
        }
        for (const [, pc] of this.peerConnections) {
          pc.addTrack(videoTrack, this.localStream);
        }
        if (this.dmPeerConnection) {
          this.dmPeerConnection.addTrack(videoTrack, this.localStream);
        }
      } catch {
        this.camEnabled = false;
        window.LonelyApp.showToast('Không thể mở Camera', 'error');
      }
    } else {
      if (this.localStream) {
        this.localStream.getVideoTracks().forEach(t => {
          t.stop();
          this.localStream.removeTrack(t);
        });
      }
    }
    socketClient.emit('voice_update_media', { camEnabled: this.camEnabled });
    this.renderVoiceRoom();
    if (this.currentDmCall) {
      this.updateDmCallUI();
    }
  }

  startScreenShareFlow() {
    if (this.screenSharing) {
      this.stopScreenShare();
      return;
    }
    const savedConfig = window.LonelyApp.getCookie('screen_share_config');
    if (savedConfig) {
      try {
        const conf = JSON.parse(savedConfig);
        this.executeScreenShare(conf.resolution, conf.fps);
        return;
      } catch {}
    }
    window.LonelyApp.openScreenShareModal();
  }

  async executeScreenShare(resolution = '720p', fps = 30) {
    let width = 1280;
    let height = 720;
    if (resolution === '1080p') { width = 1920; height = 1080; }
    if (resolution === '480p') { width = 854; height = 480; }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { max: width },
          height: { max: height },
          frameRate: { max: fps }
        },
        audio: true
      });

      this.screenSharing = true;
      const screenTrack = this.screenStream.getVideoTracks()[0];
      screenTrack.onended = () => this.stopScreenShare();

      for (const [, pc] of this.peerConnections) {
        pc.addTrack(screenTrack, this.screenStream);
      }

      this.startScreenPreviewCapture();
      socketClient.emit('voice_update_media', {
        screenSharing: true,
        resolution,
        fps
      });
      this.renderVoiceRoom();
    } catch {
      this.screenSharing = false;
      window.LonelyApp.showToast('Không thể chia sẻ màn hình', 'error');
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    this.screenSharing = false;
    clearInterval(this.previewInterval);
    socketClient.emit('voice_update_media', { screenSharing: false, screenPreview: '' });
    this.renderVoiceRoom();
  }

  startScreenPreviewCapture() {
    const video = document.createElement('video');
    video.srcObject = this.screenStream;
    video.play();
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');

    this.previewInterval = setInterval(() => {
      if (!this.screenSharing || !video.videoWidth) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      socketClient.emit('voice_screen_preview', { previewDataUrl: dataUrl });
    }, 3000);
  }

  async initLocalStream() {
    if (this.localStream) return this.localStream;
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.camEnabled
      });
      this.micMuted = false;
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = true;
      });
      this.startSpeakingDetector();
      return this.localStream;
    } catch {
      window.LonelyApp.showToast('Không thể truy cập Microphone', 'warning');
      return null;
    }
  }

  async initiateMeshConnections() {
    for (const [peerId] of this.participants) {
      await this.createPeerConnection(peerId, true);
    }
  }

  async createPeerConnection(targetPeerId, isInitiator) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.peerConnections.set(targetPeerId, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => pc.addTrack(t, this.screenStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketClient.emit('webrtc_signal', {
          targetPeerId,
          signal: { candidate: event.candidate }
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (event.track.kind === 'audio') {
        let audioEl = this.remoteAudioElements.get(targetPeerId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = `remote-audio-${targetPeerId}`;
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          document.body.appendChild(audioEl);
          this.remoteAudioElements.set(targetPeerId, audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch(() => {});
      }

      if (event.track.kind === 'video') {
        const videoEl = document.getElementById(`video-${targetPeerId}`);
        if (videoEl && stream) {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {});
        }
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketClient.emit('webrtc_signal', {
          targetPeerId,
          signal: { sdp: pc.localDescription }
        });
      } catch {}
    }

    return pc;
  }

  closePeerConnection(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    const audio = this.remoteAudioElements.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.remoteAudioElements.delete(peerId);
    }
  }

  stopAllLocalTracks() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
    }
    clearInterval(this.previewInterval);
  }

  watchStream(peerId) {
    this.watchingStreams.add(peerId);
    this.renderVoiceRoom();
  }

  toggleExpand(peerId) {
    if (this.expandedPeerId === peerId) {
      this.expandedPeerId = null;
    } else {
      this.expandedPeerId = peerId;
    }
    this.renderVoiceRoom();
  }

  renderVoiceRoom() {
    const overlay = document.getElementById('voice-room-container');
    if (!overlay) return;
    if (!this.currentChannelId) {
      overlay.style.display = 'none';
      return;
    }
    overlay.style.display = 'flex';

    if (this.expandedPeerId) {
      this.renderExpandedView(overlay);
    } else {
      this.renderGridView(overlay);
    }
  }

  renderGridView(container) {
    const allList = [];
    if (this.selfParticipant) {
      allList.push({ ...this.selfParticipant, isSelf: true, peerId: 'self' });
    }
    for (const [, p] of this.participants) {
      allList.push({ ...p, isSelf: false });
    }

    let gridHtml = '<div class="voice-grid">';
    for (const p of allList) {
      const name = escapeHtml(p.displayName || p.username);
      const avatarUrl = p.voiceAvatar || p.avatar || '';

      let contentHtml = '';
      if (p.isSelf) {
        if (this.screenSharing) {
          contentHtml = `
            <div class="screen-share-self-banner">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
              <span>Bạn đang chia sẻ màn hình</span>
            </div>
          `;
        } else if (this.camEnabled && this.localStream) {
          contentHtml = `<video id="video-self" class="voice-video-element" autoplay muted playsinline></video>`;
        } else {
          contentHtml = `
            <div class="voice-avatar-square ${this.isSpeakingLocally ? 'user-speaking-ring' : ''}">
              ${avatarUrl ? `<img src="${avatarUrl}"/>` : name.slice(0, 1).toUpperCase()}
            </div>
          `;
        }
      } else {
        if (p.screenSharing && !this.watchingStreams.has(p.peerId)) {
          contentHtml = `
            <div class="screen-preview-container">
              <img id="preview-img-${p.peerId}" src="${p.screenPreview || ''}" class="screen-preview-img"/>
              <div class="screen-watch-overlay">
                <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.voice.watchStream('${p.peerId}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                  Xem Stream
                </button>
              </div>
            </div>
          `;
        } else if (p.camEnabled || (p.screenSharing && this.watchingStreams.has(p.peerId))) {
          contentHtml = `<video id="video-${p.peerId}" class="voice-video-element" autoplay playsinline></video>`;
        } else {
          contentHtml = `
            <div class="voice-avatar-square ${p.isSpeaking ? 'user-speaking-ring' : ''}">
              ${avatarUrl ? `<img src="${avatarUrl}"/>` : name.slice(0, 1).toUpperCase()}
            </div>
          `;
        }
      }

      gridHtml += `
        <div class="voice-tile" id="tile-${p.peerId}">
          ${contentHtml}
          <div class="voice-name-tag">
            <span>${name}</span>
            ${p.micMuted ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>' : ''}
          </div>
          <div class="voice-tile-actions">
            <button class="voice-action-btn" title="Phóng to" onclick="window.LonelyApp.voice.toggleExpand('${p.peerId}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            </button>
          </div>
        </div>
      `;
    }
    gridHtml += '</div>';

    container.innerHTML = `
      ${gridHtml}
      ${this.getControlsDockHtml()}
    `;

    if (this.camEnabled && this.localStream) {
      const selfVid = document.getElementById('video-self');
      if (selfVid) selfVid.srcObject = this.localStream;
    }
  }

  renderExpandedView(container) {
    const allList = [];
    if (this.selfParticipant) {
      allList.push({ ...this.selfParticipant, isSelf: true, peerId: 'self' });
    }
    for (const [, p] of this.participants) {
      allList.push({ ...p, isSelf: false });
    }

    const mainPeer = allList.find(p => p.peerId === this.expandedPeerId) || allList[0];
    const mainName = escapeHtml(mainPeer?.displayName || mainPeer?.username);

    let carouselHtml = '<div class="expanded-bottom-carousel">';
    for (const p of allList) {
      const name = escapeHtml(p.displayName || p.username);
      const avatarUrl = p.voiceAvatar || p.avatar || '';
      carouselHtml += `
        <div class="carousel-tile ${p.peerId === this.expandedPeerId ? 'active' : ''}" onclick="window.LonelyApp.voice.toggleExpand('${p.peerId}')">
          <div class="voice-avatar-square" style="width:42px;height:42px;border-radius:10px;font-size:16px;">
            ${avatarUrl ? `<img src="${avatarUrl}"/>` : name.slice(0, 1).toUpperCase()}
          </div>
          <span style="font-size:12px;font-weight:700;margin-left:8px;color:#fff;">${name}</span>
        </div>
      `;
    }
    carouselHtml += '</div>';

    container.innerHTML = `
      <div class="voice-overlay-expanded">
        <div class="expanded-main-stage">
          <video id="expanded-video-player" autoplay playsinline></video>
          <div class="voice-name-tag" style="bottom:18px;left:18px;font-size:14.5px;">
            <span>${mainName}</span>
          </div>
          <button class="voice-action-btn" style="position:absolute;top:18px;right:18px;width:40px;height:40px;" onclick="window.LonelyApp.voice.toggleExpand(null)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          </button>
        </div>
        ${carouselHtml}
        ${this.getControlsDockHtml()}
      </div>
    `;

    const expPlayer = document.getElementById('expanded-video-player');
    if (expPlayer) {
      if (mainPeer.isSelf) {
        if (this.screenStream) expPlayer.srcObject = this.screenStream;
        else if (this.localStream) expPlayer.srcObject = this.localStream;
      }
    }
  }

  getControlsDockHtml() {
    return `
      <div class="voice-controls-dock">
        <button class="voice-ctrl-btn ${!this.micMuted ? 'active' : ''}" onclick="window.LonelyApp.voice.toggleMic()" title="Microphone">
          ${!this.micMuted 
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>'}
        </button>
        <button class="voice-ctrl-btn ${this.camEnabled ? 'active' : ''}" onclick="window.LonelyApp.voice.toggleCam()" title="Camera">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        </button>
        <button class="voice-ctrl-btn ${this.screenSharing ? 'active' : ''}" onclick="window.LonelyApp.voice.startScreenShareFlow()" title="Chia sẻ màn hình">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
        </button>
        <button class="voice-ctrl-btn" onclick="window.LonelyApp.voice.openSoundboardModal()" title="Soundboard">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        </button>
        <button class="voice-ctrl-btn danger" onclick="window.LonelyApp.voice.leaveVoice()" title="Ngắt kết nối">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
        </button>
      </div>
    `;
  }

  openSoundboardModal() {
    const modal = document.getElementById('soundboard-modal');
    if (modal) modal.classList.add('active');
  }

  playAndBroadcastSound(soundId) {
    this.playSoundEffect(soundId);
    socketClient.emit('voice_soundboard_play', { soundId });
    const modal = document.getElementById('soundboard-modal');
    if (modal) modal.classList.remove('active');
  }

  playSoundEffect(soundId) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      const now = this.audioContext.currentTime;

      if (soundId === 'airhorn') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(466, now);
        osc.frequency.setValueAtTime(466, now + 0.15);
        osc.frequency.setValueAtTime(520, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (soundId === 'tada') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.1);
        osc.frequency.setValueAtTime(783, now + 0.2);
        osc.frequency.setValueAtTime(1046, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (soundId === 'bell') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch {}
  }

  startDmCall(targetUserId) {
    this.currentDmCall = { targetUserId, isCaller: true, status: 'calling' };
    socketClient.emit('dm_call_initiate', { targetUserId });
    this.playRingtone();
    this.renderDmCallScreen();
  }

  playRingtone() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this.ringtoneInterval = setInterval(() => {
        if (!this.currentDmCall) {
          clearInterval(this.ringtoneInterval);
          return;
        }
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        const now = this.audioContext.currentTime;
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(480, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      }, 2500);
    } catch {}
  }

  stopRingtone() {
    clearInterval(this.ringtoneInterval);
    this.ringtoneInterval = null;
  }

  renderDmCallScreen() {
    let callOverlay = document.getElementById('dm-call-top-overlay');
    if (!callOverlay) {
      callOverlay = document.createElement('div');
      callOverlay.id = 'dm-call-top-overlay';
      callOverlay.style.cssText = 'height:240px;background:#17181b;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;border-bottom:1px solid rgba(255,255,255,0.08);box-shadow:0 8px 24px rgba(0,0,0,0.4);';
      const col = document.querySelector('.chat-column');
      if (col) col.insertBefore(callOverlay, col.children[1]);
    }
    callOverlay.style.display = 'flex';
    this.updateDmCallUI(this.currentDmCall?.status || 'calling');
  }

  updateDmCallUI(status = 'calling') {
    const callOverlay = document.getElementById('dm-call-top-overlay');
    if (!callOverlay || !this.currentDmCall) return;

    const user = window.LonelyApp.currentUser;
    const targetName = window.LonelyApp.chat.currentDmUser?.displayName || window.LonelyApp.chat.currentDmUser?.username || 'Người nhận';
    const statusText = status === 'connected' ? 'Đã kết nối' : 'Đang đổ chuông...';

    callOverlay.innerHTML = `
      <div style="display:flex;align-items:center;gap:36px;margin-bottom:18px;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div class="user-dock-avatar ${this.isSpeakingLocally ? 'user-speaking-ring' : ''}" style="width:72px;height:72px;font-size:28px;">
            ${user?.avatar ? `<img src="${user.avatar}"/>` : (user?.displayName || 'T').slice(0, 1).toUpperCase()}
          </div>
          <span style="font-weight:700;font-size:13.5px;color:#fff;">${escapeHtml(user?.displayName || 'Bạn')}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <span style="font-size:14px;font-weight:700;color:var(--text-header);">${statusText}</span>
          <span style="font-size:12px;color:var(--text-muted);">Cuộc gọi thoại 1-1</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
          <div class="user-dock-avatar" style="width:72px;height:72px;font-size:28px;">
            ${window.LonelyApp.chat.currentDmUser?.avatar ? `<img src="${window.LonelyApp.chat.currentDmUser.avatar}"/>` : targetName.slice(0, 1).toUpperCase()}
          </div>
          <span style="font-weight:700;font-size:13.5px;color:#fff;">${escapeHtml(targetName)}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <button class="voice-ctrl-btn ${!this.micMuted ? 'active' : ''}" onclick="window.LonelyApp.voice.toggleMic()" title="Mic">
          ${!this.micMuted ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>'}
        </button>
        <button class="voice-ctrl-btn ${this.camEnabled ? 'active' : ''}" onclick="window.LonelyApp.voice.toggleCam()" title="Camera">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        </button>
        <button class="voice-ctrl-btn danger" onclick="window.LonelyApp.voice.endDmCall(true)" title="Kết thúc">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
        </button>
      </div>
    `;
  }

  showIncomingCallModal(data) {
    this.currentDmCall = { callerSocketId: data.callerSocketId, callerId: data.callerId, isCaller: false };
    this.playRingtone();
    const modal = document.getElementById('incoming-call-modal');
    if (!modal) return;
    const callerName = document.getElementById('incoming-caller-name');
    if (callerName) callerName.textContent = data.callerName;
    modal.classList.add('active');
  }

  async acceptDmCall() {
    this.stopRingtone();
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.classList.remove('active');
    if (this.currentDmCall?.callerSocketId) {
      socketClient.emit('dm_call_response', {
        callerSocketId: this.currentDmCall.callerSocketId,
        accepted: true
      });
      this.renderDmCallScreen();
      this.updateDmCallUI('connected');
      await this.startDmWebRtc(this.currentDmCall.callerSocketId, false);
    }
  }

  rejectDmCall() {
    this.stopRingtone();
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.classList.remove('active');
    if (this.currentDmCall?.callerSocketId) {
      socketClient.emit('dm_call_response', {
        callerSocketId: this.currentDmCall.callerSocketId,
        accepted: false
      });
    }
    this.currentDmCall = null;
  }

  async startDmWebRtc(targetSocketId, isInitiator) {
    await this.initLocalStream();
    this.dmPeerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => this.dmPeerConnection.addTrack(t, this.localStream));
    }

    let audioEl = document.getElementById('dm-remote-audio');
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = 'dm-remote-audio';
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      document.body.appendChild(audioEl);
    }

    this.dmPeerConnection.ontrack = (e) => {
      audioEl.srcObject = e.streams[0];
      audioEl.play().catch(() => {});
    };

    this.dmPeerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        socketClient.emit('webrtc_signal', {
          targetPeerId: targetSocketId,
          signal: { candidate: e.candidate }
        });
      }
    };

    if (isInitiator) {
      const offer = await this.dmPeerConnection.createOffer();
      await this.dmPeerConnection.setLocalDescription(offer);
      socketClient.emit('webrtc_signal', {
        targetPeerId: targetSocketId,
        signal: { sdp: this.dmPeerConnection.localDescription }
      });
    }
    window.LonelyApp.showToast('Cuộc gọi thoại 1-1 đã kết nối', 'success');
  }

  endDmCall(notifyServer = true) {
    this.stopRingtone();
    if (notifyServer && this.currentDmCall) {
      socketClient.emit('dm_call_end', {
        targetUserId: this.currentDmCall.targetUserId,
        targetSocketId: this.currentDmCall.callerSocketId
      });
    }
    if (this.dmPeerConnection) {
      this.dmPeerConnection.close();
      this.dmPeerConnection = null;
    }
    const audioEl = document.getElementById('dm-remote-audio');
    if (audioEl) {
      audioEl.srcObject = null;
      audioEl.remove();
    }
    this.stopAllLocalTracks();
    this.currentDmCall = null;
    const modal = document.getElementById('incoming-call-modal');
    if (modal) modal.classList.remove('active');
    const callOverlay = document.getElementById('dm-call-top-overlay');
    if (callOverlay) callOverlay.style.display = 'none';
  }
}

export const voiceController = new VoiceController();
