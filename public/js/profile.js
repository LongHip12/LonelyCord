import { api } from './api.js';
import { socketClient } from './socket.js';
import { escapeHtml } from './markdown.js';

export const ProfileController = {
  selectedStatusIcon: 'smile',

  async openMyProfile() {
    window.LonelyApp.settings.openSettingsModal('profile');
  },

  selectStatusIcon(iconName) {
    this.selectedStatusIcon = iconName;
    const options = document.querySelectorAll('.status-icon-option');
    options.forEach(opt => {
      if (opt.dataset.icon === iconName) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  },

  async saveProfileChanges() {
    const displayName = document.getElementById('setting-display-input')?.value.trim();
    const bio = document.getElementById('setting-bio-input')?.value.trim();

    const payload = { displayName, bio };

    try {
      const res = await api.users.updateProfile(payload);
      if (res.user) {
        window.LonelyApp.currentUser = res.user;
        window.LonelyApp.updateUserDock();
      }

      const statusText = document.getElementById('setting-status-text-input')?.value.trim() || '';
      await api.users.setCustomStatus({
        icon: this.selectedStatusIcon,
        text: statusText
      });

      socketClient.emit('set_custom_status', {
        icon: this.selectedStatusIcon,
        text: statusText
      });

      window.LonelyApp.showToast('Đã lưu hồ sơ thành công', 'success');
    } catch (err) {
      window.LonelyApp.showToast(err.message || 'Lỗi lưu hồ sơ', 'error');
    }
  },

  async uploadAvatar(file, type = 'avatar') {
    try {
      const uploadRes = await api.uploads.uploadFile(file);
      if (!uploadRes.url) return;
      const updates = type === 'voiceAvatar' 
        ? { voiceAvatar: uploadRes.url }
        : { avatar: uploadRes.url };
      
      const res = await api.users.updateProfile(updates);
      window.LonelyApp.currentUser = res.user;
      window.LonelyApp.updateUserDock();
      window.LonelyApp.settings.renderProfileTab();
      window.LonelyApp.showToast('Đã cập nhật ảnh đại diện', 'success');
    } catch {
      window.LonelyApp.showToast('Không thể tải ảnh lên', 'error');
    }
  },

  async openUserProfile(userId) {
    if (!userId || userId === 'webhook') return;
    const currentUser = window.LonelyApp.currentUser;
    if (currentUser && userId === currentUser.id) {
      this.openMyProfile();
      return;
    }

    try {
      const res = await api.users.getProfile(userId);
      const targetUser = res.user;
      const modal = document.getElementById('user-profile-modal');
      if (!modal) return;

      document.getElementById('user-profile-name').textContent = targetUser.displayName || targetUser.username;
      document.getElementById('user-profile-username').textContent = `@${targetUser.username}`;
      document.getElementById('user-profile-bio').textContent = targetUser.bio || 'Chưa có tiểu sử';

      const joinedStr = new Date(targetUser.joinedAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      document.getElementById('user-profile-joined').textContent = `Gia nhập từ ${joinedStr}`;

      const avatarEl = document.getElementById('user-profile-avatar-img');
      if (avatarEl) {
        if (targetUser.avatar) {
          avatarEl.src = targetUser.avatar;
          avatarEl.style.display = 'block';
        } else {
          avatarEl.style.display = 'none';
        }
      }

      const noteInput = document.getElementById('user-profile-note-input');
      if (noteInput) {
        noteInput.value = res.note || '';
        noteInput.onchange = async () => {
          await api.users.setNote(targetUser.id, noteInput.value);
        };
      }

      const actionsRow = document.getElementById('user-profile-actions');
      if (actionsRow) {
        const isFriend = res.relation?.status === 'accepted';
        actionsRow.innerHTML = `
          <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.openDmWith('${targetUser.id}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            Nhắn tin
          </button>
          ${!isFriend ? `
            <button class="btn btn-secondary btn-sm" onclick="window.LonelyApp.sendFriendRequest('${targetUser.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              Kết bạn
            </button>
          ` : `
            <button class="btn btn-danger btn-sm" onclick="window.LonelyApp.removeFriend('${targetUser.id}')">
              Hủy bạn bè
            </button>
          `}
        `;
      }

      modal.classList.add('active');
    } catch {
      window.LonelyApp.showToast('Không thể tải thông tin người dùng', 'error');
    }
  },

  async openUserProfileByName(username) {
    const res = await api.users.search(username);
    const exact = res.results?.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (exact) {
      this.openUserProfile(exact.id);
    } else {
      window.LonelyApp.showToast('Không tìm thấy người dùng', 'warning');
    }
  }
};
