-- 138: 用户签名持久化表
-- 存储用户的手写签名（base64 data URL），供跨表单签名控件自动填充
-- =====================================================

CREATE TABLE IF NOT EXISTS user_signatures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);
