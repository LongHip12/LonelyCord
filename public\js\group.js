import { api } from './api.js';
import { escapeHtml } from './markdown.js';

export const GroupController = {
  currentGroup: null,
  activeChannel: null,

  async loadUserGroups() {
    const res = await api.groups.list();
    const list = res.groups || [];
    this.renderGuildsNav(list);
    return list;
  },

  renderGuildsNav(groups) {
    const nav = document.getElementById('guilds-nav-list');
    if (!nav) return;
    nav.innerHTML = `
      <div class="guild-item ${!this.currentGroup ? 'active' : ''}" onclick="window.LonelyApp.openDmHome()" title="Tin nhắn trực tiếp">
        <div class="guild-pill"></div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </div>
      <div class="guild-divider"></div>
    `;

    for (const g of groups) {
      const item = document.createElement('div');
      item.className = `guild-item ${this.currentGroup?.id === g.id ? 'active' : ''}`;
      item.title = escapeHtml(g.name);
      item.onclick = () => this.selectGroup(g.id);

      const nameInitial = (g.name || 'S').slice(0, 1).toUpperCase();
      item.innerHTML = `
        <div class="guild-pill"></div>
        ${g.icon ? `<img src="${g.icon}" alt="${escapeHtml(g.name)}"/>` : `<span>${nameInitial}</span>`}
      `;
      nav.appendChild(item);
    }

    const addBtn = document.createElement('div');
    addBtn.className = 'guild-item';
    addBtn.title = 'Tạo máy chủ mới';
    addBtn.onclick = () => window.LonelyApp.openCreateGroupModal();
    addBtn.innerHTML = `
      <div class="guild-pill"></div>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    `;
    nav.appendChild(addBtn);

    const joinBtn = document.createElement('div');
    joinBtn.className = 'guild-item';
    joinBtn.title = 'Tham gia máy chủ bằng mã mời';
    joinBtn.onclick = () => window.LonelyApp.group.openJoinServerModal();
    joinBtn.innerHTML = `
      <div class="guild-pill"></div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
    `;
    nav.appendChild(joinBtn);
  },

  async selectGroup(groupId) {
    const res = await api.groups.get(groupId);
    this.currentGroup = res.group;
    this.renderChannels();
    this.renderMembers();

    const textChannel = this.currentGroup.channels?.find(c => c.type === 'text') || this.currentGroup.channels?.[0];
    if (textChannel) {
      this.selectChannel(textChannel);
    }
    this.loadUserGroups();
  },

  renderChannels() {
    const header = document.getElementById('sidebar-header-title');
    if (header) {
      header.textContent = this.currentGroup?.name || 'LonelyChat';
    }

    const container = document.getElementById('channels-container');
    if (!container || !this.currentGroup) return;

    container.innerHTML = '';
    const categories = this.currentGroup.categories || [{ id: 'default', name: 'KÊNH CHAT & VOICE' }];
    const channels = this.currentGroup.channels || [];

    for (const cat of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'channel-category';
      catEl.innerHTML = `
        <span>${escapeHtml(cat.name)}</span>
        <button class="icon-btn-sm" style="width:20px;height:20px;" title="Tạo kênh mới" onclick="event.stopPropagation();window.LonelyApp.group.openCreateChannelModal('${cat.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      `;
      container.appendChild(catEl);

      const catChannels = channels.filter(c => c.categoryId === cat.id || (!c.categoryId && cat.id === 'default'));
      for (const ch of catChannels) {
        const item = document.createElement('div');
        item.className = `channel-item ${this.activeChannel?.id === ch.id ? 'active' : ''}`;
        item.onclick = () => this.selectChannel(ch);

        let iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>';
        if (ch.type === 'voice') {
          iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
        } else if (ch.type === 'stage') {
          iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v4"></path><path d="M8 23h8"></path></svg>';
        }

        item.innerHTML = `
          ${iconSvg}
          <span style="flex:1;">${escapeHtml(ch.name)}</span>
          ${this.currentGroup.ownerId === window.LonelyApp.currentUser?.id ? `
            <button class="icon-btn-sm" style="width:20px;height:20px;display:none;" onclick="event.stopPropagation();window.LonelyApp.group.deleteChannel('${ch.id}')" title="Xóa kênh">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          ` : ''}
        `;
        item.onmouseenter = () => {
          const btn = item.querySelector('button');
          if (btn) btn.style.display = 'flex';
        };
        item.onmouseleave = () => {
          const btn = item.querySelector('button');
          if (btn) btn.style.display = 'none';
        };
        container.appendChild(item);

        if ((ch.type === 'voice' || ch.type === 'stage') && window.LonelyApp.voice.currentChannelId === ch.id) {
          const voiceUsersDiv = document.createElement('div');
          voiceUsersDiv.style.cssText = 'display:flex;flex-direction:column;gap:3px;margin-left:26px;margin-bottom:6px;';
          const list = [];
          if (window.LonelyApp.voice.selfParticipant) {
            list.push({ ...window.LonelyApp.voice.selfParticipant, peerId: 'self', isSelf: true });
          }
          for (const [, p] of window.LonelyApp.voice.participants) {
            list.push(p);
          }

          for (const u of list) {
            const userRow = document.createElement('div');
            userRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:4px;';
            const uName = escapeHtml(u.displayName || u.username);
            const isSpeaking = u.isSelf ? window.LonelyApp.voice.isSpeakingLocally : u.isSpeaking;
            userRow.innerHTML = `
              <div id="sidebar-voice-user-${u.peerId}" class="user-dock-avatar ${isSpeaking ? 'user-speaking-ring' : ''}" style="width:24px;height:24px;font-size:10px;">
                ${u.voiceAvatar || u.avatar ? `<img src="${u.voiceAvatar || u.avatar}"/>` : uName.slice(0, 1).toUpperCase()}
              </div>
              <span style="font-size:12.5px;font-weight:600;color:var(--text-header);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${uName}</span>
              ${u.micMuted ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>' : ''}
            `;
            voiceUsersDiv.appendChild(userRow);
          }
          container.appendChild(voiceUsersDiv);
        }
      }
    }
  },

  selectChannel(channel) {
    this.activeChannel = channel;
    this.renderChannels();

    const titleEl = document.getElementById('chat-header-name');
    if (titleEl) {
      titleEl.textContent = channel.name;
    }

    if (channel.type === 'text') {
      document.getElementById('chat-messages-container').style.display = 'flex';
      document.getElementById('voice-room-container').style.display = 'none';
      window.LonelyApp.chat.loadChannel(channel);
    } else if (channel.type === 'voice' || channel.type === 'stage') {
      document.getElementById('chat-messages-container').style.display = 'none';
      document.getElementById('voice-room-container').style.display = 'flex';
      window.LonelyApp.voice.joinVoice(channel.id);
    }
  },

  renderMembers() {
    const container = document.getElementById('members-list-container');
    if (!container || !this.currentGroup) return;

    container.innerHTML = `
      <div class="channel-category">THÀNH VIÊN — ${this.currentGroup.members.length}</div>
    `;

    for (const m of this.currentGroup.members) {
      const item = document.createElement('div');
      item.className = 'channel-item';
      item.style.padding = '6px 8px';
      item.onclick = () => window.LonelyApp.openUserProfile(m.userId);

      const avatarUrl = m.avatar || '';
      const name = escapeHtml(m.displayName || m.username);
      const isOwner = this.currentGroup.ownerId === m.userId;

      let roleColor = '';
      if (m.roles && m.roles.length > 0) {
        const role = this.currentGroup.roles?.find(r => r.id === m.roles[0]);
        if (role?.color) roleColor = `color: ${role.color};`;
      }

      item.innerHTML = `
        <div class="user-dock-avatar" style="width:32px;height:32px;font-size:12px;">
          ${avatarUrl ? `<img src="${avatarUrl}"/>` : name.slice(0, 1).toUpperCase()}
          <div class="status-dot ${m.customStatus ? 'online' : 'offline'}"></div>
        </div>
        <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
          <span style="font-size:13.5px;font-weight:700;${roleColor}">${name}</span>
          ${isOwner ? '<span style="font-size:10px;font-weight:700;color:var(--warning)">Owner</span>' : ''}
          ${m.customStatus?.text ? `<span style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.customStatus.text)}</span>` : ''}
        </div>
      `;
      container.appendChild(item);
    }
  },

  openServerDropdownMenu(event) {
    if (!this.currentGroup) return;
    const menu = document.getElementById('server-dropdown-menu');
    if (!menu) return;

    const isOwner = this.currentGroup.ownerId === window.LonelyApp.currentUser?.id;
    menu.innerHTML = `
      <div class="dropdown-item" onclick="window.LonelyApp.group.openInviteModal()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        Mời mọi người
      </div>
      <div class="dropdown-item" onclick="window.LonelyApp.group.openGroupSettings()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Cài đặt máy chủ
      </div>
      <div class="dropdown-item" onclick="window.LonelyApp.group.openCreateChannelModal()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Tạo kênh
      </div>
      <div class="dropdown-item" onclick="window.LonelyApp.group.openCreateCategoryModal()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        Tạo danh mục
      </div>
      <div class="dropdown-item" onclick="window.LonelyApp.openWebhooksModal()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
        Tích hợp Webhook
      </div>
      ${isOwner ? `
        <div class="dropdown-item danger" onclick="window.LonelyApp.group.deleteServer()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Xóa máy chủ
        </div>
      ` : `
        <div class="dropdown-item danger" onclick="window.LonelyApp.group.leaveServer()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          Rời máy chủ
        </div>
      `}
    `;

    menu.style.top = '52px';
    menu.style.left = '80px';
    menu.classList.toggle('active');
  },

  async openInviteModal() {
    if (!this.currentGroup) return;
    const modal = document.getElementById('invite-server-modal');
    if (!modal) return;
    try {
      const res = await api.groups.createInvite(this.currentGroup.id);
      const code = res.invite?.code || this.currentGroup.invites?.[0]?.code || '7xCode9';
      const input = document.getElementById('server-invite-url-input');
      if (input) {
        input.value = `${window.location.origin}/invite/${code}`;
      }
      modal.classList.add('active');
    } catch {
      window.LonelyApp.showToast('Lỗi tạo liên kết mời', 'error');
    }
  },

  openJoinServerModal() {
    const modal = document.getElementById('join-server-modal');
    if (modal) modal.classList.add('active');
  },

  async submitJoinServer() {
    const input = document.getElementById('join-server-code-input');
    let code = input ? input.value.trim() : '';
    if (!code) return;
    if (code.includes('/invite/')) {
      code = code.split('/invite/').pop().trim();
    }

    try {
      const res = await api.groups.joinByInvite(code);
      if (res.group) {
        document.getElementById('join-server-modal').classList.remove('active');
        input.value = '';
        await this.loadUserGroups();
        this.selectGroup(res.group.id);
        window.LonelyApp.showToast('Đã tham gia máy chủ thành công!', 'success');
      }
    } catch (err) {
      window.LonelyApp.showToast(err.message || 'Mã mời không hợp lệ', 'error');
    }
  },

  async openGroupSettings() {
    if (!this.currentGroup) return;
    const modal = document.getElementById('group-settings-modal');
    if (!modal) return;

    document.getElementById('group-settings-name-input').value = this.currentGroup.name || '';
    const logoImg = document.getElementById('group-logo-preview-img');
    if (logoImg) {
      if (this.currentGroup.icon) {
        logoImg.src = this.currentGroup.icon;
        logoImg.style.display = 'block';
      } else {
        logoImg.style.display = 'none';
      }
    }

    this.renderRolesTab();
    this.renderMembersTab();
    modal.classList.add('active');
  },

  async uploadServerIcon(file) {
    if (!this.currentGroup) return;
    try {
      const res = await api.uploads.uploadFile(file);
      if (res?.url) {
        await api.groups.update(this.currentGroup.id, { icon: res.url });
        this.currentGroup.icon = res.url;
        this.openGroupSettings();
        await this.loadUserGroups();
        window.LonelyApp.showToast('Đã cập nhật logo máy chủ', 'success');
      }
    } catch {
      window.LonelyApp.showToast('Lỗi khi tải logo máy chủ lên', 'error');
    }
  },

  async saveGroupGeneralSettings() {
    if (!this.currentGroup) return;
    const name = document.getElementById('group-settings-name-input').value.trim();
    if (!name) return;
    await api.groups.update(this.currentGroup.id, { name });
    this.currentGroup.name = name;
    this.renderChannels();
    await this.loadUserGroups();
    window.LonelyApp.showToast('Đã lưu cài đặt máy chủ', 'success');
  },

  openCreateChannelModal(defaultCatId = null) {
    const modal = document.getElementById('create-channel-modal');
    if (!modal || !this.currentGroup) return;

    const select = document.getElementById('channel-category-select');
    if (select) {
      select.innerHTML = (this.currentGroup.categories || []).map(c => `
        <option value="${c.id}" ${c.id === defaultCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
      `).join('');
    }
    modal.classList.add('active');
  },

  async submitCreateChannel() {
    if (!this.currentGroup) return;
    const name = document.getElementById('create-channel-name-input').value.trim();
    const type = document.getElementById('create-channel-type-select').value;
    const categoryId = document.getElementById('channel-category-select').value;
    if (!name) return;

    try {
      const res = await api.groups.addChannel(this.currentGroup.id, { name, type, categoryId });
      if (res.channel) {
        const fullGroup = await api.groups.get(this.currentGroup.id);
        this.currentGroup = fullGroup.group;
        this.renderChannels();
        document.getElementById('create-channel-modal').classList.remove('active');
        document.getElementById('create-channel-name-input').value = '';
        window.LonelyApp.showToast('Đã tạo kênh mới thành công', 'success');
      }
    } catch {
      window.LonelyApp.showToast('Lỗi tạo kênh', 'error');
    }
  },

  async deleteChannel(channelId) {
    if (!this.currentGroup) return;
    if (confirm('Bạn có chắc chắn muốn xóa kênh này?')) {
      await api.groups.deleteChannel(this.currentGroup.id, channelId);
      const fullGroup = await api.groups.get(this.currentGroup.id);
      this.currentGroup = fullGroup.group;
      this.renderChannels();
      window.LonelyApp.showToast('Đã xóa kênh', 'info');
    }
  },

  openCreateCategoryModal() {
    const modal = document.getElementById('create-category-modal');
    if (modal) modal.classList.add('active');
  },

  async submitCreateCategory() {
    if (!this.currentGroup) return;
    const name = document.getElementById('create-category-name-input').value.trim();
    if (!name) return;

    try {
      await api.groups.addCategory(this.currentGroup.id, name);
      const fullGroup = await api.groups.get(this.currentGroup.id);
      this.currentGroup = fullGroup.group;
      this.renderChannels();
      document.getElementById('create-category-modal').classList.remove('active');
      document.getElementById('create-category-name-input').value = '';
      window.LonelyApp.showToast('Đã tạo danh mục mới', 'success');
    } catch {
      window.LonelyApp.showToast('Lỗi tạo danh mục', 'error');
    }
  },

  async deleteServer() {
    if (!this.currentGroup) return;
    if (confirm('Bạn có chắc chắn muốn xóa vĩnh viễn máy chủ này?')) {
      await api.groups.delete(this.currentGroup.id);
      this.currentGroup = null;
      await this.loadUserGroups();
      window.LonelyApp.openDmHome();
      window.LonelyApp.showToast('Đã xóa máy chủ', 'info');
    }
  },

  async leaveServer() {
    if (!this.currentGroup) return;
    if (confirm('Bạn có chắc chắn muốn rời máy chủ này?')) {
      await api.groups.removeMember(this.currentGroup.id, window.LonelyApp.currentUser.id);
      this.currentGroup = null;
      await this.loadUserGroups();
      window.LonelyApp.openDmHome();
      window.LonelyApp.showToast('Đã rời máy chủ', 'info');
    }
  },

  renderRolesTab() {
    const listCol = document.getElementById('roles-list-column');
    if (!listCol || !this.currentGroup) return;

    listCol.innerHTML = '';
    const roles = this.currentGroup.roles || [];
    for (const r of roles) {
      const item = document.createElement('div');
      item.className = 'settings-tab-btn';
      item.innerHTML = `
        <span style="width:12px;height:12px;border-radius:50%;background-color:${r.color};display:inline-block;"></span>
        <span>${escapeHtml(r.name)}</span>
      `;
      item.onclick = () => this.selectRoleForEdit(r);
      listCol.appendChild(item);
    }

    if (roles.length > 0) {
      this.selectRoleForEdit(roles[0]);
    }
  },

  selectRoleForEdit(role) {
    const editCol = document.getElementById('role-edit-column');
    if (!editCol) return;

    editCol.innerHTML = `
      <div class="form-group">
        <label class="form-label">Tên vai trò</label>
        <input id="role-name-input" class="input-field" value="${escapeHtml(role.name)}" />
      </div>
      <div class="form-group">
        <label class="form-label">Màu sắc vai trò</label>
        <input id="role-color-input" type="color" value="${role.color || '#5865f2'}" style="width:60px;height:36px;border:none;background:none;cursor:pointer;" />
      </div>
      <div class="form-group">
        <label class="form-label">Quyền hạn</label>
        <label class="permission-checkbox-row">
          <span>Quản lý máy chủ</span>
          <input type="checkbox" id="perm-manage-group" ${role.permissions?.manageGroup ? 'checked' : ''} />
        </label>
        <label class="permission-checkbox-row">
          <span>Quản lý vai trò</span>
          <input type="checkbox" id="perm-manage-roles" ${role.permissions?.manageRoles ? 'checked' : ''} />
        </label>
        <label class="permission-checkbox-row">
          <span>Quản lý kênh</span>
          <input type="checkbox" id="perm-manage-channels" ${role.permissions?.manageChannels ? 'checked' : ''} />
        </label>
        <label class="permission-checkbox-row">
          <span>Quản lý tin nhắn</span>
          <input type="checkbox" id="perm-manage-messages" ${role.permissions?.manageMessages ? 'checked' : ''} />
        </label>
        <label class="permission-checkbox-row">
          <span>Kick thành viên</span>
          <input type="checkbox" id="perm-kick-members" ${role.permissions?.kickMembers ? 'checked' : ''} />
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.group.saveRole('${role.id}')">Lưu Role</button>
        <button class="btn btn-danger btn-sm" onclick="window.LonelyApp.group.deleteRole('${role.id}')">Xóa Role</button>
      </div>
    `;
  },

  async saveRole(roleId) {
    const name = document.getElementById('role-name-input').value.trim();
    const color = document.getElementById('role-color-input').value;
    const permissions = {
      manageGroup: document.getElementById('perm-manage-group').checked,
      manageRoles: document.getElementById('perm-manage-roles').checked,
      manageChannels: document.getElementById('perm-manage-channels').checked,
      manageMessages: document.getElementById('perm-manage-messages').checked,
      kickMembers: document.getElementById('perm-kick-members').checked
    };

    await api.groups.updateRole(this.currentGroup.id, roleId, { name, color, permissions });
    const res = await api.groups.get(this.currentGroup.id);
    this.currentGroup = res.group;
    this.renderRolesTab();
    window.LonelyApp.showToast('Đã lưu vai trò thành công', 'success');
  },

  async createNewRole() {
    if (!this.currentGroup) return;
    await api.groups.createRole(this.currentGroup.id, {
      name: 'Vai trò mới',
      color: '#5865f2',
      permissions: {}
    });
    const res = await api.groups.get(this.currentGroup.id);
    this.currentGroup = res.group;
    this.renderRolesTab();
  },

  async deleteRole(roleId) {
    if (!this.currentGroup) return;
    await api.groups.deleteRole(this.currentGroup.id, roleId);
    const res = await api.groups.get(this.currentGroup.id);
    this.currentGroup = res.group;
    this.renderRolesTab();
    window.LonelyApp.showToast('Đã xóa vai trò', 'info');
  },

  renderMembersTab() {
    const container = document.getElementById('group-members-tab-list');
    if (!container || !this.currentGroup) return;
    container.innerHTML = '';

    for (const m of this.currentGroup.members) {
      const row = document.createElement('div');
      row.className = 'settings-row';
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="user-dock-avatar" style="width:34px;height:34px;">
            ${m.avatar ? `<img src="${m.avatar}"/>` : (m.displayName || m.username).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:700;font-size:13.5px;color:var(--text-header);">${escapeHtml(m.displayName || m.username)}</div>
            <div style="font-size:11px;color:var(--text-muted);">@${escapeHtml(m.username)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <select class="input-field" style="width:130px;padding:6px;" onchange="window.LonelyApp.group.assignMemberRole('${m.userId}', this.value)">
            <option value="">Không có role</option>
            ${(this.currentGroup.roles || []).map(r => `<option value="${r.id}" ${m.roles?.includes(r.id) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="window.LonelyApp.group.kickMember('${m.userId}')" title="Kick">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
          </button>
        </div>
      `;
      container.appendChild(row);
    }
  },

  async assignMemberRole(userId, roleId) {
    if (!this.currentGroup) return;
    const roleIds = roleId ? [roleId] : [];
    await api.groups.setMemberRoles(this.currentGroup.id, userId, roleIds);
    window.LonelyApp.showToast('Đã gán vai trò', 'success');
  },

  async kickMember(userId) {
    if (!this.currentGroup) return;
    await api.groups.removeMember(this.currentGroup.id, userId);
    const res = await api.groups.get(this.currentGroup.id);
    this.currentGroup = res.group;
    this.renderMembersTab();
    this.renderMembers();
    window.LonelyApp.showToast('Đã xóa thành viên khỏi máy chủ', 'info');
  }
};
