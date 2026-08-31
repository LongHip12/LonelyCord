import { api } from './api.js';
import { socketClient } from './socket.js';
import { chatController } from './chat.js';
import { voiceController } from './voice.js';
import { ProfileController } from './profile.js';
import { GroupController } from './group.js';
import { SettingsController } from './settings.js';
import { escapeHtml } from './markdown.js';

class LonelyApp {
  constructor() {
    this.currentUser = null;
    this.authTab = 'login';
    this.chat = chatController;
    this.voice = voiceController;
    this.profile = ProfileController;
    this.group = GroupController;
    this.settings = SettingsController;
    this.currentPlayingAudio = null;
    this.currentPlayingBtn = null;
    this.audioCtx = null;
  }

  async init() {
    this.chat.init();
    this.voice.init();
    this.attachGlobalEvents();

    const savedBg = localStorage.getItem('lonely_custom_bg') || 'default';
    this.settings.applyThemeStyle(savedBg);

    try {
      const res = await api.auth.session();
      if (res?.user) {
        this.onLoginSuccess(res.user);
      } else {
        this.showAuthModal();
      }
    } catch {
      this.showAuthModal();
    }

    if (window.location.pathname.startsWith('/invite/')) {
      const inviteCode = window.location.pathname.split('/invite/')[1];
      if (inviteCode) {
        setTimeout(() => {
          const input = document.getElementById('join-server-code-input');
          if (input) input.value = inviteCode;
          this.group.openJoinServerModal();
        }, 800);
      }
    }
  }

  onLoginSuccess(user) {
    this.currentUser = user;
    this.hideAuthModal();
    this.updateUserDock();
    socketClient.connect();
    this.group.loadUserGroups();
    this.openDmHome();
  }

  showAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('active');
    this.switchAuthTab(this.authTab || 'login');
  }

  hideAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.remove('active');
  }

  updateUserDock() {
    const user = this.currentUser;
    if (!user) return;

    const displayEl = document.getElementById('dock-display-name');
    const usernameEl = document.getElementById('dock-username');
    const avatarEl = document.getElementById('dock-avatar-img');
    const statusDot = document.getElementById('dock-status-dot');

    if (displayEl) displayEl.textContent = user.displayName || user.username;
    if (usernameEl) usernameEl.textContent = `@${user.username}`;
    if (avatarEl) {
      if (user.avatar) {
        avatarEl.src = user.avatar;
        avatarEl.style.display = 'block';
      } else {
        avatarEl.style.display = 'none';
      }
    }
    if (statusDot) {
      statusDot.className = `status-dot online`;
    }

    const bubbleEl = document.getElementById('dock-thought-bubble');
    if (bubbleEl) {
      if (user.customStatus?.text) {
        bubbleEl.style.display = 'flex';
        bubbleEl.innerHTML = `<span>${escapeHtml(user.customStatus.text)}</span>`;
      } else {
        bubbleEl.style.display = 'none';
      }
    }
  }

  async openDmHome() {
    this.group.currentGroup = null;
    this.group.activeChannel = null;

    const header = document.getElementById('sidebar-header-title');
    if (header) header.textContent = 'Trang chính';

    const container = document.getElementById('channels-container');
    if (!container) return;

    container.innerHTML = `
      <div class="channel-item active" onclick="window.LonelyApp.renderFriendsTab('all')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        <span>Bạn bè</span>
      </div>
      <div class="channel-category">TIN NHẮN TRỰC TIẾP</div>
      <div id="dm-list-subcontainer"></div>
    `;

    const membersSidebar = document.getElementById('members-list-container');
    if (membersSidebar) membersSidebar.innerHTML = '';

    const list = await api.groups.list().then(r => r.groups || []).catch(() => []);
    this.group.renderGuildsNav(list);
    this.loadDmList();
    this.renderFriendsTab('all');
  }

  async loadDmList() {
    const sub = document.getElementById('dm-list-subcontainer');
    if (!sub) return;
    const res = await api.friends.dmConversations();
    const convs = res.conversations || [];

    sub.innerHTML = '';
    for (const c of convs) {
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.onclick = () => this.openDmWithUser(c.otherUser);

      const avatarUrl = c.otherUser.avatar || '';
      const name = escapeHtml(c.otherUser.displayName || c.otherUser.username);

      item.innerHTML = `
        <div class="user-dock-avatar" style="width:28px;height:28px;font-size:11px;">
          ${avatarUrl ? `<img src="${avatarUrl}"/>` : name.slice(0, 1).toUpperCase()}
        </div>
        <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
          <span style="font-size:13px;font-weight:600;">${name}</span>
          ${c.isPendingMessage ? '<span style="font-size:10px;color:var(--warning)">Đang chờ</span>' : ''}
        </div>
      `;
      sub.appendChild(item);
    }
  }

  async renderFriendsTab(tab = 'all') {
    const titleEl = document.getElementById('chat-header-name');
    if (titleEl) titleEl.textContent = 'Bạn bè';

    document.getElementById('chat-messages-container').style.display = 'none';
    document.getElementById('voice-room-container').style.display = 'none';

    let view = document.getElementById('friends-view-panel');
    if (!view) {
      view = document.createElement('div');
      view.id = 'friends-view-panel';
      view.style.cssText = 'flex:1;display:flex;flex-direction:column;padding:20px;overflow-y:auto;';
      document.querySelector('.chat-column').appendChild(view);
    }
    view.style.display = 'flex';

    const res = await api.friends.list();
    const friends = res.friends || [];
    const incoming = res.pendingIncoming || [];
    const blocked = res.blocked || [];

    let countText = '';
    let currentList = [];
    if (tab === 'all') { countText = `TẤT CẢ BẠN BÈ — ${friends.length}`; currentList = friends; }
    if (tab === 'pending') { countText = `YÊU CẦU ĐANG CHỜ — ${incoming.length}`; currentList = incoming; }
    if (tab === 'blocked') { countText = `DANH SÁCH ĐÃ CHẶN — ${blocked.length}`; currentList = blocked; }

    view.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:14px;margin-bottom:16px;">
        <button class="btn ${tab === 'all' ? 'btn-secondary' : 'btn-ghost'} btn-sm" onclick="window.LonelyApp.renderFriendsTab('all')">Tất cả (${friends.length})</button>
        <button class="btn ${tab === 'pending' ? 'btn-secondary' : 'btn-ghost'} btn-sm" onclick="window.LonelyApp.renderFriendsTab('pending')">Đang chờ (${incoming.length})</button>
        <button class="btn ${tab === 'blocked' ? 'btn-secondary' : 'btn-ghost'} btn-sm" onclick="window.LonelyApp.renderFriendsTab('blocked')">Đã chặn (${blocked.length})</button>
        <button class="btn ${tab === 'add' ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="window.LonelyApp.renderFriendsTab('add')">Thêm bạn</button>
      </div>
    `;

    if (tab === 'add') {
      view.innerHTML += `
        <div style="max-width:520px;background:#2b2d31;padding:20px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);">
          <h3 style="margin-bottom:6px;font-size:16px;font-weight:800;color:var(--text-header);">THÊM BẠN BÈ</h3>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">Bạn có thể tìm kiếm và kết nối bằng tên người dùng chính xác.</p>
          <div style="display:flex;gap:10px;">
            <input id="add-friend-input" class="input-field" placeholder="Nhập tên người dùng..." />
            <button class="btn btn-primary" onclick="window.LonelyApp.submitAddFriend()">Gửi lời mời</button>
          </div>
        </div>
      `;
      return;
    }

    view.innerHTML += `<div class="channel-category" style="margin-bottom:8px;">${countText}</div>`;
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    if (currentList.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:14px;">
          Không có người dùng nào trong danh sách này.
        </div>
      `;
    }

    for (const u of currentList) {
      const row = document.createElement('div');
      row.className = 'channel-item';
      row.style.cssText = 'padding:10px 14px;justify-content:space-between;border-radius:var(--radius-md);background:rgba(255,255,255,0.02);';

      const avatarUrl = u.avatar || '';
      const name = escapeHtml(u.displayName || u.username);

      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;cursor:pointer;" onclick="window.LonelyApp.openUserProfile('${u.id}')">
          <div class="user-dock-avatar" style="width:40px;height:40px;">
            ${avatarUrl ? `<img src="${avatarUrl}"/>` : name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:700;font-size:14.5px;color:var(--text-header);">${name}</div>
            <div style="font-size:12px;color:var(--text-muted);">@${escapeHtml(u.username)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${tab === 'all' ? `
            <button class="icon-btn-sm" title="Nhắn tin" onclick="window.LonelyApp.openDmWith('${u.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            </button>
            <button class="icon-btn-sm" title="Gọi thoại" onclick="window.LonelyApp.voice.startDmCall('${u.id}')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            </button>
          ` : ''}
          ${tab === 'pending' ? `
            <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.acceptFriendRequest('${u.id}')">Chấp nhận</button>
            <button class="btn btn-secondary btn-sm" onclick="window.LonelyApp.rejectFriendRequest('${u.id}')">Từ chối</button>
          ` : ''}
          ${tab === 'blocked' ? `
            <button class="btn btn-secondary btn-sm" onclick="window.LonelyApp.unblockUser('${u.id}')">Bỏ chặn</button>
          ` : ''}
        </div>
      `;
      listContainer.appendChild(row);
    }
    view.appendChild(listContainer);
  }

  async submitAddFriend() {
    const input = document.getElementById('add-friend-input');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    try {
      await api.friends.sendRequest({ username: val });
      this.showToast('Đã gửi yêu cầu kết bạn thành công', 'success');
      input.value = '';
    } catch (err) {
      this.showToast(err.message || 'Lỗi gửi yêu cầu', 'error');
    }
  }

  async sendFriendRequest(targetUserId) {
    try {
      await api.friends.sendRequest({ userId: targetUserId });
      this.showToast('Đã gửi yêu cầu kết bạn thành công', 'success');
    } catch (err) {
      this.showToast(err.message || 'Lỗi gửi yêu cầu', 'error');
    }
  }

  async acceptFriendRequest(targetUserId) {
    await api.friends.accept(targetUserId);
    this.renderFriendsTab('pending');
    this.showToast('Đã chấp nhận kết bạn', 'success');
  }

  async rejectFriendRequest(targetUserId) {
    await api.friends.reject(targetUserId);
    this.renderFriendsTab('pending');
    this.showToast('Đã từ chối yêu cầu', 'info');
  }

  async removeFriend(targetUserId) {
    await api.friends.remove(targetUserId);
    this.renderFriendsTab('all');
    this.showToast('Đã hủy bạn bè', 'info');
  }

  async unblockUser(targetUserId) {
    await api.friends.unblock(targetUserId);
    this.renderFriendsTab('blocked');
    this.showToast('Đã bỏ chặn người dùng', 'success');
  }

  async openDmWith(userId) {
    const res = await api.users.getProfile(userId);
    if (res.user) {
      this.openDmWithUser(res.user);
    }
  }

  openDmWithUser(user) {
    const friendsView = document.getElementById('friends-view-panel');
    if (friendsView) friendsView.style.display = 'none';

    document.getElementById('chat-messages-container').style.display = 'flex';
    document.getElementById('voice-room-container').style.display = 'none';

    const titleEl = document.getElementById('chat-header-name');
    if (titleEl) titleEl.textContent = `@${user.displayName || user.username}`;

    this.chat.loadDm(user);
  }

  openUserProfile(userId) {
    this.profile.openUserProfile(userId);
  }

  openUserProfileByName(username) {
    this.profile.openUserProfileByName(username);
  }

  openCreateGroupModal() {
    const modal = document.getElementById('create-group-modal');
    if (modal) modal.classList.add('active');
  }

  async submitCreateGroup() {
    const input = document.getElementById('create-group-name-input');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    try {
      const res = await api.groups.create({ name });
      if (res.group) {
        document.getElementById('create-group-modal').classList.remove('active');
        input.value = '';
        await this.group.loadUserGroups();
        this.group.selectGroup(res.group.id);
        this.showToast('Đã tạo máy chủ thành công', 'success');
      }
    } catch {
      this.showToast('Lỗi tạo máy chủ', 'error');
    }
  }

  openScreenShareModal() {
    const modal = document.getElementById('screen-share-modal');
    if (modal) modal.classList.add('active');
  }

  saveScreenShareConfigAndStart() {
    const resSel = document.getElementById('screen-res-select').value;
    const fpsSel = parseInt(document.getElementById('screen-fps-select').value, 10);
    const remember = document.getElementById('screen-remember-toggle').checked;

    if (remember) {
      this.setCookie('screen_share_config', JSON.stringify({ resolution: resSel, fps: fpsSel }), 30);
    }

    document.getElementById('screen-share-modal').classList.remove('active');
    this.voice.executeScreenShare(resSel, fpsSel);
  }

  toggleAudioPlay(url, btn) {
    if (this.currentPlayingAudio && this.currentPlayingAudio.src.includes(url)) {
      if (this.currentPlayingAudio.paused) {
        this.currentPlayingAudio.play();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      } else {
        this.currentPlayingAudio.pause();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      }
      return;
    }

    if (this.currentPlayingAudio) {
      this.currentPlayingAudio.pause();
      if (this.currentPlayingBtn) {
        this.currentPlayingBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      }
    }

    const audio = new Audio(url);
    this.currentPlayingAudio = audio;
    this.currentPlayingBtn = btn;

    audio.play();
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

    const fillBar = btn.nextElementSibling?.querySelector('.voice-progress-fill');
    audio.ontimeupdate = () => {
      if (fillBar && audio.duration) {
        fillBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      }
    };

    audio.onended = () => {
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      if (fillBar) fillBar.style.width = '0%';
    };
  }

  seekAudio(event, bar) {
    if (!this.currentPlayingAudio) return;
    const rect = bar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    this.currentPlayingAudio.currentTime = pos * this.currentPlayingAudio.duration;
  }

  copyMessageText(msgId) {
    const msg = this.chat.messages.find(m => m.id === msgId);
    if (msg?.content) {
      navigator.clipboard.writeText(msg.content);
      this.showToast('Đã sao chép tin nhắn', 'info');
    }
  }

  replyToMessage(msgId) {
    this.chat.setReplyMessage(msgId);
  }

  openMessageMenu(event, msgId, isSelf) {
    const menu = document.getElementById('message-context-menu');
    if (!menu) return;

    const msg = this.chat.messages.find(m => m.id === msgId);
    const isPinned = Boolean(msg?.isPinned);

    menu.innerHTML = `
      <div class="dropdown-item" onclick="window.LonelyApp.copyMessageText('${msgId}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        Sao chép
      </div>
      <div class="dropdown-item" onclick="window.LonelyApp.replyToMessage('${msgId}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
        Trả lời
      </div>
      <div class="dropdown-item" onclick="window.LonelyApp.chat.togglePinMessage('${msgId}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
        ${isPinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
      </div>
      <div class="dropdown-item danger" onclick="window.LonelyApp.deleteMessageForMe('${msgId}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Xóa ở phía tôi
      </div>
      ${isSelf ? `
        <div class="dropdown-item danger" onclick="window.LonelyApp.deleteMessageForEveryone('${msgId}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Xóa cho mọi người
        </div>
      ` : ''}
    `;

    menu.style.top = `${event.clientY + 5}px`;
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
    menu.classList.add('active');
  }

  async deleteMessageForMe(msgId) {
    await api.messages.deleteForMe(msgId);
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.remove();
    this.chat.messages = this.chat.messages.filter(m => m.id !== msgId);
    this.showToast('Đã xóa tin nhắn', 'info');
  }

  async deleteMessageForEveryone(msgId) {
    socketClient.emit('delete_message_for_everyone', {
      messageId: msgId,
      targetId: this.chat.currentTarget
    });
  }

  playChime(type) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      if (type === 'error') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(240, now + 0.1);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
      } else {
        osc.frequency.setValueAtTime(440, now);
      }

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  showToast(message, type = 'info', title = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    this.playChime(type);

    const card = document.createElement('div');
    card.className = `toast-card ${type}`;

    let iconSvg = '';
    let displayTitle = title;

    if (type === 'success') {
      displayTitle = displayTitle || 'Thành công';
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
      displayTitle = displayTitle || 'Thông báo lỗi';
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else if (type === 'warning') {
      displayTitle = displayTitle || 'Cảnh báo';
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    } else {
      displayTitle = displayTitle || 'Thông tin';
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    card.innerHTML = `
      <div class="toast-header">
        <div class="toast-title-row">
          ${iconSvg}
          <span>${displayTitle}</span>
        </div>
        <button class="toast-close-btn" onclick="this.closest('.toast-card').remove()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="toast-body-text">${escapeHtml(message)}</div>
      <div class="toast-progress" style="animation-duration: 3.5s;"></div>
    `;

    container.appendChild(card);
    setTimeout(() => {
      card.classList.add('removing');
      setTimeout(() => card.remove(), 250);
    }, 3500);
  }

  switchAuthTab(tab) {
    this.authTab = tab;
    const isLogin = tab === 'login';
    document.getElementById('auth-tab-login').className = `btn ${isLogin ? 'btn-primary' : 'btn-secondary'} btn-sm`;
    document.getElementById('auth-tab-register').className = `btn ${!isLogin ? 'btn-primary' : 'btn-secondary'} btn-sm`;
    document.getElementById('auth-modal-title').textContent = isLogin ? 'Chào mừng trở lại!' : 'Tạo tài khoản mới';
    document.getElementById('auth-display-group').style.display = isLogin ? 'none' : 'flex';
  }

  async submitAuth() {
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const displayName = document.getElementById('auth-displayname')?.value.trim();
    const remember30 = document.getElementById('auth-remember-30').checked;

    if (!username || !password) {
      this.showToast('Vui lòng điền tên người dùng và mật khẩu', 'warning');
      return;
    }

    try {
      if (this.authTab === 'register') {
        const res = await api.auth.register({ username, displayName, password, remember30 });
        if (res.user) {
          this.onLoginSuccess(res.user);
          this.showToast('Đăng ký tài khoản thành công! Chào mừng bạn.', 'success');
        }
      } else {
        const res = await api.auth.login({ username, password, remember30 });
        if (res.user) {
          this.onLoginSuccess(res.user);
          this.showToast('Đăng nhập thành công!', 'success');
        }
      }
    } catch (err) {
      if (err.data?.error === 'USERNAME_EXISTS') {
        this.showToast('Tên người dùng này đã có người đăng ký. Vui lòng chọn tên khác hoặc đăng nhập.', 'error', 'Tên đã tồn tại');
      } else {
        this.showToast(err.message || 'Lỗi xác thực', 'error');
      }
    }
  }

  showGroupTab(tab) {
    const isGeneral = tab === 'general';
    const isRoles = tab === 'roles';
    const isMembers = tab === 'members';

    document.getElementById('group-tab-general').style.display = isGeneral ? 'block' : 'none';
    document.getElementById('group-tab-roles').style.display = isRoles ? 'grid' : 'none';
    document.getElementById('group-tab-members').style.display = isMembers ? 'block' : 'none';

    const btns = document.querySelectorAll('#group-settings-modal .settings-sidebar .settings-tab-btn');
    if (btns.length >= 3) {
      btns[0].className = `settings-tab-btn ${isGeneral ? 'active' : ''}`;
      btns[1].className = `settings-tab-btn ${isRoles ? 'active' : ''}`;
      btns[2].className = `settings-tab-btn ${isMembers ? 'active' : ''}`;
    }
  }

  async addMemberToGroup() {
    if (!this.group.currentGroup) return;
    const input = document.getElementById('add-member-input');
    const username = input ? input.value.trim() : '';
    if (!username) return;

    try {
      await api.groups.addMember(this.group.currentGroup.id, username);
      const res = await api.groups.get(this.group.currentGroup.id);
      this.group.currentGroup = res.group;
      this.group.renderMembersTab();
      this.group.renderMembers();
      input.value = '';
      this.showToast('Đã thêm thành viên vào máy chủ', 'success');
    } catch (err) {
      this.showToast(err.message || 'Lỗi thêm thành viên', 'error');
    }
  }

  async openWebhooksModal() {
    if (!this.group.activeChannel) {
      this.showToast('Vui lòng chọn một kênh chat để quản lý Webhook', 'warning');
      return;
    }
    const modal = document.getElementById('webhooks-modal');
    if (!modal) return;
    this.renderWebhooksList();
    modal.classList.add('active');
  }

  async renderWebhooksList() {
    const container = document.getElementById('webhooks-list-container');
    if (!container || !this.group.activeChannel) return;

    const res = await api.webhooks.list(this.group.activeChannel.id);
    const webhooks = res.webhooks || [];
    container.innerHTML = '';

    for (const w of webhooks) {
      const url = `${window.location.origin}/api/webhooks/${w.id}/${w.token}`;
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.style.cssText = 'padding:10px 14px;justify-content:space-between;border-radius:var(--radius-md);background:rgba(255,255,255,0.02);';
      item.innerHTML = `
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--text-header);">${escapeHtml(w.name)}</div>
          <div style="font-size:11px;color:var(--text-muted);font-family:monospace;">${w.id}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${url}');window.LonelyApp.showToast('Đã sao chép Webhook URL', 'info');">Sao chép URL</button>
          <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.testExecuteWebhook('${w.id}', '${w.token}')">Test Post</button>
          <button class="btn btn-ghost btn-sm" onclick="window.LonelyApp.deleteWebhook('${w.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
      `;
      container.appendChild(item);
    }
  }

  async createWebhook() {
    if (!this.group.activeChannel) return;
    const input = document.getElementById('webhook-name-input');
    const name = input ? input.value.trim() : '';
    if (!name) return;

    await api.webhooks.create(this.group.activeChannel.id, { name });
    input.value = '';
    this.renderWebhooksList();
    this.showToast('Đã tạo Webhook thành công', 'success');
  }

  async deleteWebhook(id) {
    await api.webhooks.delete(id);
    this.renderWebhooksList();
    this.showToast('Đã xóa Webhook', 'info');
  }

  async testExecuteWebhook(id, token) {
    await api.webhooks.execute(id, token, {
      content: 'Chào mừng! Đây là tin nhắn thử nghiệm từ Webhook embed theo định dạng hiện đại',
      embeds: [
        {
          title: 'LonelyChat Webhook Service',
          description: 'Hệ thống hỗ trợ gửi tin nhắn tự động có **Markdown**, màu sắc `#5865F2` và embed phong phú.',
          color: '#5865F2'
        }
      ]
    });
    this.showToast('Đã gửi tin nhắn Webhook test!', 'success');
  }

  async deleteAccount() {
    if (confirm('Bạn có chắc chắn muốn xóa tài khoản này vĩnh viễn?')) {
      await api.users.deleteAccount();
      window.location.reload();
    }
  }

  setCookie(name, value, days) {
    let expires = '';
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = `; expires=${date.toUTCString()}`;
    }
    document.cookie = `${name}=${value || ''}${expires}; path=/; SameSite=Lax`;
  }

  getCookie(name) {
    const nameEQ = `${name}=`;
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  async logout() {
    await api.auth.logout();
    socketClient.disconnect();
    window.location.reload();
  }

  attachGlobalEvents() {
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('message-context-menu');
      if (menu && !menu.contains(e.target)) {
        menu.classList.remove('active');
      }
      const srvMenu = document.getElementById('server-dropdown-menu');
      if (srvMenu && !srvMenu.contains(e.target) && !e.target.closest('.sidebar-header')) {
        srvMenu.classList.remove('active');
      }
    });

    const textarea = document.getElementById('chat-input-textarea');
    if (textarea) {
      textarea.addEventListener('input', () => {
        this.chat.handleTyping();
      });
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = textarea.value;
          textarea.value = '';
          this.chat.sendMessage(text);
        }
      });
    }

    const fileInput = document.getElementById('chat-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', async () => {
        if (fileInput.files?.length) {
          const file = fileInput.files[0];
          try {
            const res = await api.uploads.uploadFile(file);
            if (res?.url) {
              this.chat.sendMessage('', [res]);
            }
          } catch {
            this.showToast('Lỗi khi tải tệp lên', 'error');
          }
          fileInput.value = '';
        }
      });
    }
  }
}

window.LonelyApp = new LonelyApp();
window.addEventListener('DOMContentLoaded', () => {
  window.LonelyApp.init();
});
