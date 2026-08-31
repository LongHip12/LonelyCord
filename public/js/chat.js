import { socketClient } from './socket.js';
import { api } from './api.js';
import { parseMarkdown, escapeHtml } from './markdown.js';

const REACTION_ICONS = {
  heart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#f23f43" stroke="#f23f43" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>',
  fire: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#f0b232" stroke="#f0b232" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>',
  thumbsup: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#5865f2" stroke="#5865f2" stroke-width="2"><path d="M7 10v12"></path><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"></path></svg>',
  laugh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#23a55a" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>',
  party: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8547ff" stroke-width="2.5"><path d="M5.8 11.3 2 22l10.7-3.79"></path><path d="M4 3h.01"></path><path d="M22 8h.01"></path><path d="M15 2h.01"></path><path d="M22 20h.01"></path><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38e-2"></path></svg>'
};

class ChatController {
  constructor() {
    this.currentTarget = null;
    this.currentChannel = null;
    this.currentDmUser = null;
    this.replyMessage = null;
    this.messages = [];
    this.typingTimer = null;
    this.isTyping = false;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecordingVoice = false;
    this.audioStream = null;
    this.analyser = null;
    this.animFrame = null;
  }

  init() {
    socketClient.on('new_message', (message) => {
      if (this.currentTarget && message.targetId === this.currentTarget) {
        this.messages.push(message);
        this.renderSingleMessage(message);
        this.scrollToBottom();
      }
      if (message.targetType === 'dm') {
        window.LonelyApp.loadDmList();
      }
    });

    socketClient.on('message_reaction_updated', ({ messageId, reactions }) => {
      const msg = this.messages.find(m => m.id === messageId);
      if (msg) {
        msg.reactions = reactions;
        this.updateReactionsUI(messageId, reactions);
      }
    });

    socketClient.on('message_pin_updated', ({ messageId, isPinned }) => {
      const msg = this.messages.find(m => m.id === messageId);
      if (msg) {
        msg.isPinned = isPinned;
        const msgEl = document.getElementById(`msg-${messageId}`);
        if (msgEl) {
          const badge = msgEl.querySelector('.pinned-badge');
          if (isPinned && !badge) {
            const wrap = msgEl.querySelector('.message-content-wrapper');
            if (wrap) {
              const b = document.createElement('div');
              b.className = 'pinned-badge';
              b.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg> Đã ghim';
              wrap.prepend(b);
            }
          } else if (!isPinned && badge) {
            badge.remove();
          }
        }
      }
    });

    socketClient.on('message_deleted_for_everyone', ({ messageId, targetId }) => {
      if (this.currentTarget === targetId) {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) el.remove();
        this.messages = this.messages.filter(m => m.id !== messageId);
      }
    });

    socketClient.on('user_typing', ({ targetId, username }) => {
      if (this.currentTarget === targetId) {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.textContent = `${username} đang soạn tin nhắn...`;
      }
    });

    socketClient.on('user_stop_typing', ({ targetId }) => {
      if (this.currentTarget === targetId) {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.textContent = '';
      }
    });
  }

  async loadChannel(channel) {
    this.currentTarget = channel.id;
    this.currentChannel = channel;
    this.currentDmUser = null;
    this.replyMessage = null;
    this.updateReplyBanner();

    socketClient.emit('join_target', channel.id);
    const res = await api.messages.getChannelMessages(channel.id);
    this.messages = res.messages || [];
    this.renderMessages();
  }

  async loadDm(user) {
    this.currentDmUser = user;
    this.currentChannel = null;
    this.replyMessage = null;
    this.updateReplyBanner();

    const res = await api.messages.getDmMessages(user.id);
    this.currentTarget = res.targetId;
    this.messages = res.messages || [];
    socketClient.emit('join_target', res.targetId);
    this.renderMessages();
  }

  renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '';
    for (const msg of this.messages) {
      this.renderSingleMessage(msg, container);
    }
    this.scrollToBottom();
  }

  renderSingleMessage(msg, targetContainer = null) {
    const container = targetContainer || document.getElementById('chat-messages');
    if (!container) return;

    const currentUser = window.LonelyApp.currentUser;
    const isSelf = currentUser && msg.authorId === currentUser.id;
    const isWebhook = Boolean(msg.webhook || msg.author?.isWebhook);

    const msgEl = document.createElement('div');
    msgEl.className = 'message-item';
    msgEl.id = `msg-${msg.id}`;

    const dateStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const authorName = escapeHtml(msg.author?.displayName || msg.author?.username || 'Người dùng');
    const avatarUrl = msg.author?.avatar || '';

    let replyHtml = '';
    if (msg.replyTo) {
      replyHtml = `
        <div class="message-reply-preview">
          <span class="message-reply-author">@${escapeHtml(msg.replyTo.authorName)}</span>
          <span class="message-reply-snippet">${escapeHtml(msg.replyTo.snippet)}</span>
        </div>
      `;
    }

    let pinnedHtml = '';
    if (msg.isPinned) {
      pinnedHtml = `
        <div class="pinned-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
          Đã ghim
        </div>
      `;
    }

    const markdownHtml = parseMarkdown(msg.content, {
      syntaxHighlight: currentUser?.settings?.syntaxHighlight !== false
    });

    let attachmentsHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
      attachmentsHtml = '<div class="message-attachments">';
      for (const att of msg.attachments) {
        if (att.type?.startsWith('image/')) {
          attachmentsHtml += `<img src="${att.url}" alt="${escapeHtml(att.name)}" class="attachment-image" onclick="window.open('${att.url}')"/>`;
        } else if (att.type?.startsWith('audio/')) {
          attachmentsHtml += `
            <div class="voice-note-player" data-audio-url="${att.url}">
              <button class="voice-play-btn" onclick="window.LonelyApp.toggleAudioPlay('${att.url}', this)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
              <div style="display:flex;align-items:center;gap:3px;flex:1;height:24px;cursor:pointer;" onclick="window.LonelyApp.seekAudio(event, this)">
                <div class="voice-progress-bar" style="width:100%;">
                  <div class="voice-progress-fill"></div>
                </div>
              </div>
              <span class="voice-duration">Ghi âm thoại</span>
            </div>
          `;
        } else {
          attachmentsHtml += `
            <a href="${att.url}" download="${escapeHtml(att.name)}" class="btn btn-secondary btn-sm" style="text-decoration:none;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              ${escapeHtml(att.name)}
            </a>
          `;
        }
      }
      attachmentsHtml += '</div>';
    }

    let embedsHtml = '';
    if (msg.embeds && msg.embeds.length > 0) {
      for (const emb of msg.embeds) {
        embedsHtml += `
          <div class="embed-card" style="border-left-color: ${emb.color || '#5865f2'}">
            ${emb.title ? `<div class="embed-title">${escapeHtml(emb.title)}</div>` : ''}
            ${emb.description ? `<div class="embed-description">${parseMarkdown(emb.description)}</div>` : ''}
            ${emb.image ? `<img src="${emb.image.url || emb.image}" class="embed-image" />` : ''}
          </div>
        `;
      }
    }

    const reactionsHtml = this.getReactionsHtml(msg.id, msg.reactions);

    msgEl.innerHTML = `
      <div class="message-avatar" onclick="window.LonelyApp.openUserProfile('${msg.author?.id}')">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${authorName}"/>` : authorName.slice(0, 1).toUpperCase()}
      </div>
      <div class="message-content-wrapper">
        ${pinnedHtml}
        ${replyHtml}
        <div class="message-header">
          <span class="message-author" onclick="window.LonelyApp.openUserProfile('${msg.author?.id}')">${authorName}</span>
          ${isWebhook ? '<span class="webhook-badge">BOT</span>' : ''}
          <span class="message-time">${dateStr}</span>
        </div>
        <div class="message-body">${markdownHtml}</div>
        ${attachmentsHtml}
        ${embedsHtml}
        <div class="reactions-bar" id="reactions-${msg.id}">${reactionsHtml}</div>
      </div>
      <div class="message-actions-bar">
        <button class="action-btn-sm" title="Thả tim" onclick="window.LonelyApp.chat.toggleReaction('${msg.id}', 'heart')">
          ${REACTION_ICONS.heart}
        </button>
        <button class="action-btn-sm" title="Thả lửa" onclick="window.LonelyApp.chat.toggleReaction('${msg.id}', 'fire')">
          ${REACTION_ICONS.fire}
        </button>
        <button class="action-btn-sm" title="Like" onclick="window.LonelyApp.chat.toggleReaction('${msg.id}', 'thumbsup')">
          ${REACTION_ICONS.thumbsup}
        </button>
        <button class="action-btn-sm" title="Trả lời" onclick="window.LonelyApp.replyToMessage('${msg.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
        </button>
        <button class="action-btn-sm" title="Tùy chọn khác" onclick="event.stopPropagation();window.LonelyApp.openMessageMenu(event, '${msg.id}', ${isSelf})">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
        </button>
      </div>
    `;

    container.appendChild(msgEl);
  }

  getReactionsHtml(msgId, reactions) {
    if (!reactions) return '';
    const currentUser = window.LonelyApp.currentUser;
    let html = '';
    for (const [key, users] of Object.entries(reactions)) {
      if (!users || users.length === 0) continue;
      const isUserReacted = currentUser && users.includes(currentUser.id);
      const icon = REACTION_ICONS[key] || '';
      html += `
        <div class="reaction-pill ${isUserReacted ? 'active' : ''}" onclick="window.LonelyApp.chat.toggleReaction('${msgId}', '${key}')">
          ${icon}
          <span>${users.length}</span>
        </div>
      `;
    }
    return html;
  }

  updateReactionsUI(msgId, reactions) {
    const el = document.getElementById(`reactions-${msgId}`);
    if (el) {
      el.innerHTML = this.getReactionsHtml(msgId, reactions);
    }
  }

  async toggleReaction(msgId, reactionKey) {
    try {
      await api.messages.toggleReaction(msgId, reactionKey);
    } catch {}
  }

  async togglePinMessage(msgId) {
    try {
      const res = await api.messages.togglePin(msgId);
      window.LonelyApp.showToast(res.isPinned ? 'Đã ghim tin nhắn' : 'Đã bỏ ghim tin nhắn', 'info');
    } catch {}
  }

  async openPinnedMessagesModal() {
    if (!this.currentTarget) return;
    try {
      const res = await api.messages.getPinned(this.currentTarget);
      const modal = document.getElementById('pinned-messages-modal');
      const list = document.getElementById('pinned-messages-list');
      if (!modal || !list) return;

      const pinned = res.pinnedMessages || [];
      list.innerHTML = '';
      if (pinned.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:13.5px;text-align:center;padding:24px;">Chưa có tin nhắn nào được ghim trong kênh này.</div>';
      } else {
        for (const p of pinned) {
          const item = document.createElement('div');
          item.className = 'settings-row';
          item.innerHTML = `
            <div style="flex:1;">
              <div style="font-weight:700;font-size:13px;color:var(--text-header);margin-bottom:3px;">${escapeHtml(p.author?.displayName || p.author?.username)}</div>
              <div style="font-size:13.5px;color:var(--text-normal);">${parseMarkdown(p.content)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window.LonelyApp.chat.togglePinMessage('${p.id}');this.closest('.settings-row').remove();">Bỏ ghim</button>
          `;
          list.appendChild(item);
        }
      }
      modal.classList.add('active');
    } catch {}
  }

  scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  async sendMessage(content, attachments = []) {
    if (!this.currentTarget) return;
    if (!content.trim() && (!attachments || attachments.length === 0)) return;

    const payload = {
      targetType: this.currentChannel ? 'channel' : 'dm',
      targetId: this.currentTarget,
      content,
      attachments,
      replyTo: this.replyMessage ? {
        id: this.replyMessage.id,
        authorName: this.replyMessage.author?.displayName || this.replyMessage.author?.username,
        snippet: (this.replyMessage.content || 'Đính kèm').slice(0, 50)
      } : null
    };

    this.replyMessage = null;
    this.updateReplyBanner();

    socketClient.emit('send_message', payload, (res) => {
      if (!res?.success) {
        this.renderFailedMessage(payload, res?.error);
      }
    });
  }

  renderFailedMessage(payload, errorReason) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const currentUser = window.LonelyApp.currentUser;
    const msgEl = document.createElement('div');
    msgEl.className = 'message-item failed';

    const authorName = escapeHtml(currentUser?.displayName || currentUser?.username || 'Tôi');
    const avatarUrl = currentUser?.avatar || '';

    msgEl.innerHTML = `
      <div class="message-avatar">
        ${avatarUrl ? `<img src="${avatarUrl}"/>` : authorName.slice(0, 1).toUpperCase()}
      </div>
      <div class="message-content-wrapper">
        <div class="message-header">
          <span class="message-author">${authorName}</span>
          <span class="message-time">Bây giờ</span>
        </div>
        <div class="message-body">${parseMarkdown(payload.content)}</div>
        <div class="message-failed-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          Gửi không thành công ${errorReason === 'RATE_LIMITED' ? '(Quá nhanh, tối đa 5 tin/giây)' : ''}
        </div>
      </div>
    `;

    container.appendChild(msgEl);
    this.scrollToBottom();
  }

  handleTyping() {
    if (!this.currentTarget) return;
    if (!this.isTyping) {
      this.isTyping = true;
      socketClient.emit('typing_start', { targetId: this.currentTarget });
    }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.isTyping = false;
      socketClient.emit('typing_stop', { targetId: this.currentTarget });
    }, 2000);
  }

  setReplyMessage(msgId) {
    const msg = this.messages.find(m => m.id === msgId);
    if (msg) {
      this.replyMessage = msg;
      this.updateReplyBanner();
      const input = document.getElementById('chat-input-textarea');
      if (input) input.focus();
    }
  }

  cancelReply() {
    this.replyMessage = null;
    this.updateReplyBanner();
  }

  updateReplyBanner() {
    const banner = document.getElementById('reply-banner');
    if (!banner) return;
    if (this.replyMessage) {
      const name = escapeHtml(this.replyMessage.author?.displayName || this.replyMessage.author?.username);
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span>Đang trả lời <strong>@${name}</strong></span>
        <button class="btn-ghost btn-sm" onclick="window.LonelyApp.chat.cancelReply()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
  }

  async startVoiceRecording() {
    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(this.audioStream);
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 32;
      source.connect(this.analyser);

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.audioStream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.mediaRecorder.onstop = async () => {
        cancelAnimationFrame(this.animFrame);
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        if (this.audioStream) {
          this.audioStream.getTracks().forEach(t => t.stop());
          this.audioStream = null;
        }
        const res = await api.uploads.uploadFile(file);
        if (res?.url) {
          this.sendMessage('', [{ url: res.url, type: 'audio/webm', name: 'Ghi âm thoại', size: res.size }]);
        }
      };
      this.mediaRecorder.start();
      this.isRecordingVoice = true;
      this.showRecordingWaveformUI(true);
      this.animateWaveform();
    } catch {
      window.LonelyApp.showToast('Không thể truy cập Microphone để ghi âm', 'error');
    }
  }

  animateWaveform() {
    if (!this.isRecordingVoice || !this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    const bars = document.querySelectorAll('.live-waveform-bar');
    if (bars.length) {
      for (let i = 0; i < bars.length; i++) {
        const val = dataArray[i % dataArray.length] || 10;
        const height = Math.max(4, Math.min(22, (val / 255) * 22));
        bars[i].style.height = `${height}px`;
      }
    }
    this.animFrame = requestAnimationFrame(() => this.animateWaveform());
  }

  stopVoiceRecording(shouldSend = true) {
    if (this.mediaRecorder && this.isRecordingVoice) {
      this.isRecordingVoice = false;
      cancelAnimationFrame(this.animFrame);
      if (!shouldSend) {
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onstop = null;
      }
      this.mediaRecorder.stop();
      this.showRecordingWaveformUI(false);
    }
  }

  showRecordingWaveformUI(recording) {
    const btn = document.getElementById('voice-record-btn');
    const textarea = document.getElementById('chat-input-textarea');
    let waveContainer = document.getElementById('chat-waveform-indicator');

    if (recording) {
      if (btn) btn.style.color = 'var(--danger)';
      if (textarea) textarea.style.display = 'none';
      if (!waveContainer) {
        waveContainer = document.createElement('div');
        waveContainer.id = 'chat-waveform-indicator';
        waveContainer.style.cssText = 'flex:1;display:flex;align-items:center;gap:3px;height:36px;padding:0 8px;';
        let barsHtml = '<span style="font-size:12px;font-weight:700;color:var(--danger);margin-right:8px;">Đang ghi âm</span>';
        for (let i = 0; i < 20; i++) {
          barsHtml += `<div class="live-waveform-bar" style="width:3px;height:6px;background:var(--danger);border-radius:2px;transition:height 0.05s ease;"></div>`;
        }
        waveContainer.innerHTML = barsHtml;
        const box = document.querySelector('.chat-input-box');
        if (box) box.insertBefore(waveContainer, btn);
      }
      if (waveContainer) waveContainer.style.display = 'flex';
    } else {
      if (btn) btn.style.color = 'var(--text-muted)';
      if (textarea) textarea.style.display = 'block';
      if (waveContainer) waveContainer.style.display = 'none';
    }
  }
}

export const chatController = new ChatController();
