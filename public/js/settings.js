import { api } from './api.js';
import { escapeHtml } from './markdown.js';

export const SettingsController = {
  currentTab: 'account',

  async openSettingsModal(tab = 'account') {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    this.switchTab(tab);
    modal.classList.add('active');
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    const btns = document.querySelectorAll('.settings-sidebar-tab');
    btns.forEach(b => {
      if (b.dataset.tab === tabName) b.classList.add('active');
      else b.classList.remove('active');
    });

    const user = window.LonelyApp.currentUser;
    const container = document.getElementById('settings-tab-content');
    if (!container || !user) return;

    if (tabName === 'account') {
      this.renderAccountTab(container, user);
    } else if (tabName === 'profile') {
      this.renderProfileTab(container, user);
    } else if (tabName === 'appearance') {
      this.renderAppearanceTab(container, user);
    } else if (tabName === 'voice') {
      this.renderVoiceTab(container, user);
    } else if (tabName === 'notifications') {
      this.renderNotificationsTab(container, user);
    }
  },

  renderAccountTab(container, user) {
    container.innerHTML = `
      <h3 class="settings-section-title">TÀI KHOẢN CỦA TÔI</h3>
      <div style="background:#1e1f22;padding:18px;border-radius:12px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <div style="display:flex;align-items:center;gap:14px;">
            <div class="user-dock-avatar" style="width:52px;height:52px;font-size:22px;">
              ${user.avatar ? `<img src="${user.avatar}"/>` : (user.displayName || user.username).slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div style="font-size:16px;font-weight:800;color:var(--text-header);">${escapeHtml(user.displayName || user.username)}</div>
              <div style="font-size:12px;color:var(--text-muted);">@${escapeHtml(user.username)}</div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.settings.switchTab('profile')">Chỉnh sửa hồ sơ</button>
        </div>
      </div>

      <h4 style="font-size:14px;font-weight:800;color:var(--text-header);margin-bottom:12px;">ĐỔI MẬT KHẨU</h4>
      <div style="background:#1e1f22;padding:18px;border-radius:12px;margin-bottom:20px;border:1px solid rgba(255,255,255,0.06);">
        <div class="form-group">
          <label class="form-label">Mật khẩu hiện tại</label>
          <input id="setting-old-password" class="input-field" type="password" placeholder="Nhập mật khẩu hiện tại..." />
        </div>
        <div class="form-group">
          <label class="form-label">Mật khẩu mới</label>
          <input id="setting-new-password" class="input-field" type="password" placeholder="Nhập mật khẩu mới (từ 6 ký tự)..." />
        </div>
        <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.settings.changePassword()">Cập nhật mật khẩu</button>
      </div>

      <h4 style="font-size:14px;font-weight:800;color:var(--danger);margin-bottom:12px;">VÙNG NGUY HIỂM</h4>
      <div style="background:#1e1f22;padding:18px;border-radius:12px;border:1px solid rgba(242,63,67,0.2);display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-weight:700;font-size:14px;color:var(--text-header);">Xóa tài khoản vĩnh viễn</div>
          <div style="font-size:12px;color:var(--text-muted);">Thao tác này không thể hoàn tác.</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="window.LonelyApp.deleteAccount()">Xóa tài khoản</button>
      </div>
    `;
  },

  async changePassword() {
    const oldPassword = document.getElementById('setting-old-password')?.value;
    const newPassword = document.getElementById('setting-new-password')?.value;
    if (!oldPassword || !newPassword) {
      window.LonelyApp.showToast('Vui lòng nhập đầy đủ mật khẩu cũ và mới', 'warning');
      return;
    }
    try {
      await api.users.updateProfile({ oldPassword, newPassword });
      document.getElementById('setting-old-password').value = '';
      document.getElementById('setting-new-password').value = '';
      window.LonelyApp.showToast('Đã đổi mật khẩu thành công', 'success');
    } catch (err) {
      window.LonelyApp.showToast(err.message || 'Lỗi đổi mật khẩu', 'error');
    }
  },

  renderProfileTab(container, user) {
    container.innerHTML = `
      <h3 class="settings-section-title">HỒ SƠ NGƯỜI DÙNG</h3>
      <div class="profile-card" style="margin-bottom:20px;">
        <div class="profile-banner"></div>
        <div class="profile-avatar-row">
          <div class="profile-avatar-large">
            <img id="setting-avatar-preview" src="${user.avatar || ''}" style="${user.avatar ? 'display:block;' : 'display:none;'}"/>
            ${!user.avatar ? (user.displayName || user.username).slice(0, 1).toUpperCase() : ''}
          </div>
          <div style="display:flex;gap:8px;">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
              Đổi Avatar Profile
              <input type="file" style="display:none;" onchange="window.LonelyApp.profile.uploadAvatar(this.files[0], 'avatar')" />
            </label>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
              Avatar Voice
              <input type="file" style="display:none;" onchange="window.LonelyApp.profile.uploadAvatar(this.files[0], 'voiceAvatar')" />
            </label>
          </div>
        </div>
        <div class="profile-info-body">
          <div class="form-group">
            <label class="form-label">Tên hiển thị</label>
            <input id="setting-display-input" class="input-field" value="${escapeHtml(user.displayName || '')}" />
          </div>

          <div class="form-group">
            <label class="form-label">Tiểu sử</label>
            <textarea id="setting-bio-input" class="input-field" rows="3">${escapeHtml(user.bio || '')}</textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Trạng thái tùy chỉnh</label>
            <div class="status-icon-picker">
              <div class="status-icon-option ${user.customStatus?.icon === 'smile' ? 'selected' : ''}" data-icon="smile" onclick="window.LonelyApp.profile.selectStatusIcon('smile')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
              </div>
              <div class="status-icon-option ${user.customStatus?.icon === 'zap' ? 'selected' : ''}" data-icon="zap" onclick="window.LonelyApp.profile.selectStatusIcon('zap')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              </div>
              <div class="status-icon-option ${user.customStatus?.icon === 'heart' ? 'selected' : ''}" data-icon="heart" onclick="window.LonelyApp.profile.selectStatusIcon('heart')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
              </div>
              <div class="status-icon-option ${user.customStatus?.icon === 'coffee' ? 'selected' : ''}" data-icon="coffee" onclick="window.LonelyApp.profile.selectStatusIcon('coffee')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 8h1a4 4 0 1 1 0 8h-1"></path><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>
              </div>
              <div class="status-icon-option ${user.customStatus?.icon === 'code' ? 'selected' : ''}" data-icon="code" onclick="window.LonelyApp.profile.selectStatusIcon('code')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
              </div>
            </div>
            <input id="setting-status-text-input" class="input-field" style="margin-top:8px;" placeholder="Bạn đang nghĩ gì?..." value="${escapeHtml(user.customStatus?.text || '')}" />
          </div>

          <button class="btn btn-primary" onclick="window.LonelyApp.profile.saveProfileChanges()">Lưu thay đổi hồ sơ</button>
        </div>
      </div>
    `;
  },

  renderAppearanceTab(container, user) {
    const currentBg = localStorage.getItem('lonely_custom_bg') || 'default';
    container.innerHTML = `
      <h3 class="settings-section-title">GIAO DIỆN & MÀU NỀN ỨNG DỤNG</h3>
      
      <h4 style="font-size:14px;font-weight:700;color:var(--text-header);margin-bottom:12px;">BỘ MÀU CHỦ ĐỀ CÓ SẴN</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:12px;margin-bottom:20px;">
        <div class="theme-preset-card ${currentBg === 'default' ? 'active' : ''}" onclick="window.LonelyApp.settings.setThemeBackground('default')" style="background:#1e1f22;border:2px solid ${currentBg === 'default' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;cursor:pointer;text-align:center;">
          <div style="height:36px;border-radius:6px;background:#313338;margin-bottom:8px;"></div>
          <span style="font-size:12px;font-weight:700;">Mặc định Dark</span>
        </div>
        <div class="theme-preset-card ${currentBg === 'midnight' ? 'active' : ''}" onclick="window.LonelyApp.settings.setThemeBackground('midnight')" style="background:#0f111a;border:2px solid ${currentBg === 'midnight' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;cursor:pointer;text-align:center;">
          <div style="height:36px;border-radius:6px;background:linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);margin-bottom:8px;"></div>
          <span style="font-size:12px;font-weight:700;">Midnight Galaxy</span>
        </div>
        <div class="theme-preset-card ${currentBg === 'cyberpunk' ? 'active' : ''}" onclick="window.LonelyApp.settings.setThemeBackground('cyberpunk')" style="background:#180d28;border:2px solid ${currentBg === 'cyberpunk' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;cursor:pointer;text-align:center;">
          <div style="height:36px;border-radius:6px;background:linear-gradient(135deg, #3b0764 0%, #831843 100%);margin-bottom:8px;"></div>
          <span style="font-size:12px;font-weight:700;">Neon Sunset</span>
        </div>
        <div class="theme-preset-card ${currentBg === 'emerald' ? 'active' : ''}" onclick="window.LonelyApp.settings.setThemeBackground('emerald')" style="background:#061a14;border:2px solid ${currentBg === 'emerald' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;cursor:pointer;text-align:center;">
          <div style="height:36px;border-radius:6px;background:linear-gradient(135deg, #064e3b 0%, #042f2e 100%);margin-bottom:8px;"></div>
          <span style="font-size:12px;font-weight:700;">Emerald Matrix</span>
        </div>
        <div class="theme-preset-card ${currentBg === 'amoled' ? 'active' : ''}" onclick="window.LonelyApp.settings.setThemeBackground('amoled')" style="background:#000000;border:2px solid ${currentBg === 'amoled' ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;cursor:pointer;text-align:center;">
          <div style="height:36px;border-radius:6px;background:#050505;margin-bottom:8px;border:1px solid #222;"></div>
          <span style="font-size:12px;font-weight:700;">Pure AMOLED</span>
        </div>
      </div>

      <h4 style="font-size:14px;font-weight:700;color:var(--text-header);margin-bottom:10px;">BỘ TỰ TẠO GRADIENT THỦ CÔNG</h4>
      <div style="background:#1e1f22;padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label class="form-label">Màu 1</label>
            <input id="grad-color-1" type="color" value="#1e1b4b" style="width:50px;height:38px;border:none;background:none;cursor:pointer;" oninput="window.LonelyApp.settings.updateGradientPreview()" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            <label class="form-label">Màu 2</label>
            <input id="grad-color-2" type="color" value="#4c1d95" style="width:50px;height:38px;border:none;background:none;cursor:pointer;" oninput="window.LonelyApp.settings.updateGradientPreview()" />
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
            <div style="display:flex;justify-content:space-between;">
              <label class="form-label">Góc xoay</label>
              <span id="grad-deg-label" style="font-size:12px;color:var(--text-muted);">135°</span>
            </div>
            <input id="grad-deg-slider" type="range" min="0" max="360" value="135" style="width:100%;accent-color:var(--accent);" oninput="window.LonelyApp.settings.updateGradientPreview()" />
          </div>
        </div>
        <div id="grad-preview-box" style="height:44px;border-radius:8px;background:linear-gradient(135deg, #1e1b4b 0%, #4c1d95 100%);margin-bottom:12px;border:1px solid rgba(255,255,255,0.1);"></div>
        <button class="btn btn-primary btn-sm" onclick="window.LonelyApp.settings.applyBuiltGradient()">Áp dụng Gradient này</button>
      </div>

      <div class="settings-row">
        <div class="settings-row-text">
          <span class="settings-row-title">Tô màu cú pháp Code Block (Syntax Highlight)</span>
          <span class="settings-row-desc">Hiển thị highlight từ khóa, hàm, kiểu dữ liệu, comment chuẩn theo từng ngôn ngữ</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-syntax-toggle" ${user.settings?.syntaxHighlight !== false ? 'checked' : ''} onchange="window.LonelyApp.settings.toggleSyntaxHighlight(this.checked)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  },

  updateGradientPreview() {
    const c1 = document.getElementById('grad-color-1')?.value || '#1e1b4b';
    const c2 = document.getElementById('grad-color-2')?.value || '#4c1d95';
    const deg = document.getElementById('grad-deg-slider')?.value || 135;
    const label = document.getElementById('grad-deg-label');
    if (label) label.textContent = `${deg}°`;
    const box = document.getElementById('grad-preview-box');
    if (box) box.style.background = `linear-gradient(${deg}deg, ${c1} 0%, ${c2} 100%)`;
  },

  applyBuiltGradient() {
    const c1 = document.getElementById('grad-color-1')?.value || '#1e1b4b';
    const c2 = document.getElementById('grad-color-2')?.value || '#4c1d95';
    const deg = document.getElementById('grad-deg-slider')?.value || 135;
    const gradStr = `custom:linear-gradient(${deg}deg, ${c1} 0%, ${c2} 100%)`;
    localStorage.setItem('lonely_custom_bg', gradStr);
    this.applyThemeStyle(gradStr);
    window.LonelyApp.showToast('Đã áp dụng Gradient mới', 'success');
  },

  setThemeBackground(themeName) {
    localStorage.setItem('lonely_custom_bg', themeName);
    this.applyThemeStyle(themeName);
    if (this.currentTab === 'appearance') {
      this.renderAppearanceTab(document.getElementById('settings-tab-content'), window.LonelyApp.currentUser);
    }
    window.LonelyApp.showToast('Đã áp dụng hình nền giao diện', 'success');
  },

  applyThemeStyle(themeName) {
    const appEl = document.getElementById('app');
    const bodyEl = document.body;
    if (!appEl || !bodyEl) return;

    let bgVal = '';
    if (themeName === 'midnight') {
      bgVal = 'linear-gradient(135deg, #0b0f19 0%, #1e1b4b 50%, #0f172a 100%)';
    } else if (themeName === 'cyberpunk') {
      bgVal = 'linear-gradient(135deg, #2e0854 0%, #581c87 50%, #831843 100%)';
    } else if (themeName === 'emerald') {
      bgVal = 'linear-gradient(135deg, #022c22 0%, #064e3b 50%, #042f2e 100%)';
    } else if (themeName === 'amoled') {
      bgVal = '#000000';
    } else if (themeName.startsWith('custom:')) {
      const raw = themeName.replace('custom:', '');
      if (raw.startsWith('http')) {
        bgVal = `url("${raw}") center/cover no-repeat fixed`;
      } else {
        bgVal = raw;
      }
    } else {
      bgVal = 'radial-gradient(circle at 10% 20%, rgba(88, 101, 242, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(133, 71, 255, 0.04) 0%, transparent 40%)';
    }

    appEl.style.background = bgVal;
    bodyEl.style.background = bgVal;
  },

  renderVoiceTab(container, user) {
    container.innerHTML = `
      <h3 class="settings-section-title">GIỌNG NÓI & VIDEO</h3>
      <div style="background:#1e1f22;padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px;">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">KIỂM TRA MICROPHONE & PHÁT HIỆN GIỌNG NÓI (VAD)</h4>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <button class="btn btn-secondary btn-sm" onclick="window.LonelyApp.settings.testMic()">Kiểm tra Mic</button>
          <div style="flex:1;height:8px;background:#404249;border-radius:4px;overflow:hidden;">
            <div id="mic-test-bar" style="width:0%;height:100%;background:var(--success);transition:width 0.05s linear;"></div>
          </div>
        </div>
      </div>

      <h4 style="font-size:14px;font-weight:700;color:var(--text-header);margin-bottom:12px;">MẶC ĐỊNH CHIA SẺ MÀN HÌNH</h4>
      <div style="background:#1e1f22;padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);">
        <div class="form-group">
          <label class="form-label">Độ phân giải mặc định</label>
          <select id="setting-res-select" class="input-field">
            <option value="720p">720p (Tiêu chuẩn)</option>
            <option value="1080p">1080p (Sắc nét Full HD)</option>
            <option value="480p">480p (Tiết kiệm băng thông)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tốc độ khung hình (FPS)</label>
          <select id="setting-fps-select" class="input-field">
            <option value="30">30 FPS</option>
            <option value="60">60 FPS (Mượt mà nhất)</option>
            <option value="15">15 FPS</option>
          </select>
        </div>
      </div>
    `;
  },

  async testMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 32;
      src.connect(analyser);

      const bar = document.getElementById('mic-test-bar');
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (bar) {
          bar.style.width = `${Math.min(100, (avg / 128) * 100)}%`;
        }
        requestAnimationFrame(loop);
      };
      loop();
      window.LonelyApp.showToast('Đang kiểm tra Mic...', 'info');
    } catch {
      window.LonelyApp.showToast('Không thể kết nối Microphone', 'error');
    }
  },

  renderNotificationsTab(container, user) {
    container.innerHTML = `
      <h3 class="settings-section-title">THÔNG BÁO WEB PUSH & ÂM THANH</h3>
      <div class="settings-row">
        <div class="settings-row-text">
          <span class="settings-row-title">Thông báo Web Push qua Service Worker</span>
          <span class="settings-row-desc">Gửi thông báo đến thiết bị khi có tin nhắn mới ngay cả khi tab đóng</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-notif-toggle" ${user.settings?.notifications !== false ? 'checked' : ''} onchange="window.LonelyApp.settings.togglePushNotifications(this.checked)" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  },

  async toggleSyntaxHighlight(checked) {
    const user = window.LonelyApp.currentUser;
    if (!user) return;
    if (!user.settings) user.settings = {};
    user.settings.syntaxHighlight = checked;
    await api.settings.update({ syntaxHighlight: checked });
    window.LonelyApp.chat.renderMessages();
    window.LonelyApp.showToast('Đã cập nhật cài đặt cú pháp', 'success');
  },

  async togglePushNotifications(checked) {
    const user = window.LonelyApp.currentUser;
    if (!user) return;

    if (checked) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        const notifToggle = document.getElementById('setting-notif-toggle');
        if (notifToggle) notifToggle.checked = false;
        window.LonelyApp.showToast('Vui lòng cấp quyền thông báo trong trình duyệt', 'warning');
        return;
      }

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.register('/sw.js');
          const keyRes = await api.settings.getVapidKey();
          const pubKey = keyRes.publicKey;

          const convertedKey = this.urlBase64ToUint8Array(pubKey);
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
          });

          await api.settings.subscribePush(sub);
          user.settings.notifications = true;
          await api.settings.update({ notifications: true });
          window.LonelyApp.showToast('Đã bật thông báo Web Push thành công', 'success');
        }
      } catch {
        window.LonelyApp.showToast('Lỗi khi đăng ký nhận thông báo', 'error');
      }
    } else {
      await api.settings.unsubscribePush();
      user.settings.notifications = false;
      await api.settings.update({ notifications: false });
      window.LonelyApp.showToast('Đã tắt thông báo', 'info');
    }
  },

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
};
