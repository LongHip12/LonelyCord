import crypto from 'node:crypto';

export const COOKIE_AES_KEY = 'YTsgDdGYCWxNujvcqjcT9TrKBf6hzdcTgNUI9SNLZnFsJ7QXw6phC4Cf4X981BTrzqCMDdnZa0Ro6jfZloiyDjgtQWaXGnLe4v3g4mFMS8lKIqtBhrCdXmGKU5E7eqR9tqIvPuLYjNLJ4CG9NMRwttngX7YvYhlHbaWwEa33sJf3klop5KN5zZRyWcvyNg1eG0WYyyiy';
export const VAPID_PRIVATE_KEY = 'QY1N9FwBZWZtsKV3XvVHl_vPtiGd7Uteua_JdEV3Wlg';
export const VAPID_PUBLIC_KEY = 'BFulqK3doUq0JAKtRQ-zF1ahfpQ25IGlewGwwUKeZr4a37lOA0rJIOWEU-c4jCerrjcoGdS1rrRVwUxBhoh90Q4';
export const VAPID_SUBJECT = 'mailto:admin@lonelychat.local';

export const PORT = process.env.PORT || 3000;
export const HOST = process.env.HOST || '0.0.0.0';
