export const api = {
  async request(url, options = {}) {
    options.credentials = 'include';
    options.headers = options.headers || {};
    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || 'Request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  },

  auth: {
    register: (body) => api.request('/api/auth/register', { method: 'POST', body }),
    login: (body) => api.request('/api/auth/login', { method: 'POST', body }),
    logout: () => api.request('/api/auth/logout', { method: 'POST' }),
    session: () => api.request('/api/auth/session')
  },

  users: {
    me: () => api.request('/api/users/me'),
    updateProfile: (body) => api.request('/api/users/profile', { method: 'POST', body }),
    setCustomStatus: (body) => api.request('/api/users/custom-status', { method: 'POST', body }),
    setNote: (targetUserId, note) => api.request(`/api/users/notes/${targetUserId}`, { method: 'POST', body: { note } }),
    getProfile: (userId) => api.request(`/api/users/${userId}/profile`),
    search: (q) => api.request(`/api/users/search?q=${encodeURIComponent(q)}`),
    deleteAccount: () => api.request('/api/users/account', { method: 'DELETE' })
  },

  groups: {
    list: () => api.request('/api/groups'),
    create: (body) => api.request('/api/groups', { method: 'POST', body }),
    get: (id) => api.request(`/api/groups/${id}`),
    update: (id, body) => api.request(`/api/groups/${id}`, { method: 'PUT', body }),
    delete: (id) => api.request(`/api/groups/${id}`, { method: 'DELETE' }),
    createInvite: (id) => api.request(`/api/groups/${id}/invites`, { method: 'POST' }),
    getInvite: (code) => api.request(`/api/invite/${code}`),
    joinByInvite: (code) => api.request(`/api/invite/${code}/join`, { method: 'POST' }),
    addCategory: (id, name) => api.request(`/api/groups/${id}/categories`, { method: 'POST', body: { name } }),
    deleteCategory: (id, categoryId) => api.request(`/api/groups/${id}/categories/${categoryId}`, { method: 'DELETE' }),
    addChannel: (id, body) => api.request(`/api/groups/${id}/channels`, { method: 'POST', body }),
    deleteChannel: (id, channelId) => api.request(`/api/groups/${id}/channels/${channelId}`, { method: 'DELETE' }),
    addMember: (id, username) => api.request(`/api/groups/${id}/members`, { method: 'POST', body: { username } }),
    removeMember: (id, userId) => api.request(`/api/groups/${id}/members/${userId}`, { method: 'DELETE' }),
    createRole: (id, body) => api.request(`/api/groups/${id}/roles`, { method: 'POST', body }),
    updateRole: (id, roleId, body) => api.request(`/api/groups/${id}/roles/${roleId}`, { method: 'PUT', body }),
    deleteRole: (id, roleId) => api.request(`/api/groups/${id}/roles/${roleId}`, { method: 'DELETE' }),
    setMemberRoles: (id, userId, roleIds) => api.request(`/api/groups/${id}/members/${userId}/roles`, { method: 'PUT', body: { roleIds } })
  },

  friends: {
    list: () => api.request('/api/friends'),
    sendRequest: (body) => api.request('/api/friends/request', { method: 'POST', body }),
    accept: (targetUserId) => api.request('/api/friends/accept', { method: 'POST', body: { targetUserId } }),
    reject: (targetUserId) => api.request('/api/friends/reject', { method: 'POST', body: { targetUserId } }),
    remove: (targetUserId) => api.request('/api/friends/remove', { method: 'POST', body: { targetUserId } }),
    block: (targetUserId) => api.request('/api/friends/block', { method: 'POST', body: { targetUserId } }),
    unblock: (targetUserId) => api.request('/api/friends/unblock', { method: 'POST', body: { targetUserId } }),
    dmConversations: () => api.request('/api/dm/conversations')
  },

  messages: {
    getChannelMessages: (channelId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/api/channels/${channelId}/messages${query ? `?${query}` : ''}`);
    },
    getDmMessages: (userId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/api/dm/${userId}/messages${query ? `?${query}` : ''}`);
    },
    toggleReaction: (id, reaction) => api.request(`/api/messages/${id}/reaction`, { method: 'POST', body: { reaction } }),
    togglePin: (id) => api.request(`/api/messages/${id}/pin`, { method: 'POST' }),
    getPinned: (targetId) => api.request(`/api/messages/pinned/${targetId}`),
    deleteForMe: (id) => api.request(`/api/messages/${id}/for-me`, { method: 'DELETE' }),
    deleteForEveryone: (id) => api.request(`/api/messages/${id}/for-everyone`, { method: 'DELETE' })
  },

  webhooks: {
    list: (channelId) => api.request(`/api/channels/${channelId}/webhooks`),
    create: (channelId, body) => api.request(`/api/channels/${channelId}/webhooks`, { method: 'POST', body }),
    delete: (id) => api.request(`/api/webhooks/${id}`, { method: 'DELETE' }),
    execute: (id, token, body) => api.request(`/api/webhooks/${id}/${token}`, { method: 'POST', body })
  },

  uploads: {
    uploadFile: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.request('/api/uploads', { method: 'POST', body: formData });
    }
  },

  settings: {
    get: () => api.request('/api/settings'),
    update: (body) => api.request('/api/settings', { method: 'POST', body }),
    getVapidKey: () => api.request('/api/push/vapid-public-key'),
    subscribePush: (sub) => api.request('/api/push/subscribe', { method: 'POST', body: sub }),
    unsubscribePush: () => api.request('/api/push/unsubscribe', { method: 'POST' })
  }
};
