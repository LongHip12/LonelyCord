import webpush from 'web-push';
import { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } from '../config/keys.js';
import { UserModel } from '../db/userModel.js';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export const PushService = {
  async sendNotification(userId, { title, body, icon, url, data = {} }) {
    const user = UserModel.findById(userId);
    if (!user || !user.pushSubscription || user.settings?.notifications === false) {
      return false;
    }
    try {
      const payload = JSON.stringify({
        title: title || 'LonelyChat',
        body: body || '',
        icon: icon || '/favicon.svg',
        url: url || '/',
        data
      });
      await webpush.sendNotification(user.pushSubscription, payload);
      return true;
    } catch {
      return false;
    }
  }
};
