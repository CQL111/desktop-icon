// localLLM.js - 本地模型支持（Ollama）
// 用户本机装 Ollama + `ollama pull qwen2.5:7b`，App 通过 localhost:11434 调用
// 探测 + 缓存：本地可用 → 本地优先，不可用 → 线上 fallback（用户无感知）

const { net } = require('electron');
const logger = require('./logger');

const LOCAL_BASE_URL = 'http://localhost:11434/v1';
const LOCAL_MODEL = 'qwen2.5:7b';
const LOCAL_TOKEN = 'ollama'; // 占位，Ollama 的 OpenAI 兼容端点忽略 Authorization

// 探测本地 Ollama 是否可用（GET /api/tags，短超时）
async function isLocalAvailable(timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await net.fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(timer);
    return resp.ok;
  } catch {
    clearTimeout(timer);
    return false; // 连接拒绝 / 超时 / 未装 Ollama
  }
}

// 缓存 60s，避免每次调用都探测 localhost
let cachedAvailable = null;
let cachedAt = 0;
const TTL = 60000;

async function checkLocal(force = false) {
  if (!force && cachedAvailable !== null && Date.now() - cachedAt < TTL) {
    return cachedAvailable;
  }
  const ok = await isLocalAvailable();
  cachedAvailable = ok;
  cachedAt = Date.now();
  logger.info('localLLM', `available=${ok}`);
  return ok;
}

// 列出 Ollama 已装模型
async function listModels() {
  try {
    const resp = await net.fetch('http://localhost:11434/api/tags');
    if (!resp.ok) return { available: false, models: [] };
    const json = await resp.json();
    const models = (json.models || []).map((m) => ({
      name: m.name || '',
      size: m.size || 0,
      sizeLabel: formatSize(m.size),
    }));
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + ' GB';
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + ' MB';
}

// 下载模型（Ollama pull，长操作）
async function pullModel(name) {
  if (!name || !name.trim()) return { ok: false, error: 'EMPTY_NAME' };
  try {
    const resp = await net.fetch('http://localhost:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    return { ok: resp.ok, error: resp.ok ? null : `HTTP_${resp.status}` };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = {
  LOCAL_BASE_URL,
  LOCAL_MODEL,
  LOCAL_TOKEN,
  isLocalAvailable,
  checkLocal,
  listModels,
  pullModel,
};