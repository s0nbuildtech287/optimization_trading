import { authFetch } from './authFetch';

/**
 * GET /api/chat/models — 5 model mới nhất từ OpenAI
 */
export async function getChatModels() {
  const res = await authFetch('/api/chat/models');
  if (!res.ok) throw new Error('Failed to load models');
  return res.json();
}

/**
 * POST /api/chat/send
 * @param {string} message
 * @param {Array|null} history - [{role, content}]
 * @param {string} model
 * @param {Object|null} pageContext - context từ trang hiện tại (filters, data...)
 */
export async function sendChatMessage(message, history = null, model = 'gpt-4o', pageContext = null) {
  const res = await authFetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: history || [], model, pageContext })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to send message');
  }

  return res.json();
}
