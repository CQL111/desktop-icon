// onlineConfig.js - 线上模型配置
// 默认从本地 .env 读；设置面板里填的 store.aiConfig 覆盖空白项以外的字段
const fs = require('fs');
const path = require('path');

function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

// 构建时内置的 Key：打包后位于 resources/bundled-ai.json（见 electron-builder.key.yml）
function loadBundled() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'bundled-ai.json'));
  // 开发态也允许用本地 build/ 验证「内置 Key」流程
  candidates.push(path.join(__dirname, '..', '..', 'build', 'bundled-ai.json'));
  for (const f of candidates) {
    try {
      if (!fs.existsSync(f)) continue;
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j && typeof j.token === 'string' && j.token.trim()) {
        return {
          baseUrl: String(j.baseUrl || '').trim(),
          token: j.token.trim(),
          model: String(j.model || '').trim(),
        };
      }
    } catch {}
  }
  return null;
}

function loadLocalEnv() {
  const files = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  if (process.resourcesPath) {
    // 打包后安装目录里通常没有 .env；留一个可选的随身配置位置
    files.push(path.join(process.resourcesPath, '.env'));
  }
  for (const f of files) {
    try {
      if (fs.existsSync(f)) return parseEnv(fs.readFileSync(f, 'utf8'));
    } catch {}
  }
  return {};
}

// 用户显式设置的键优先，其次 .env；空字符串视为未设置。
// 注意：不要把整个 process.env 混进来——机器上无关的 DEEPSEEK_* 环境变量会让 "未配置" 判断失效
function fromEnv() {
  const fileEnv = loadLocalEnv();
  const rawBundled = loadBundled();
  // 内置文件的键名是 baseUrl/token/model，统一映射成 .env 的键名再参与优先级比较
  const bundled = rawBundled
    ? {
      DEEPSEEK_BASE_URL: rawBundled.baseUrl || '',
      DEEPSEEK_API_KEY: rawBundled.token || '',
      DEEPSEEK_MODEL: rawBundled.model || '',
    }
    : {};
  const pick = (key, fallback) => {
    const fromFile = typeof fileEnv[key] === 'string' ? fileEnv[key].trim() : '';
    const fromProcess = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
    return fromFile || fromProcess || (bundled[key] || '') || fallback;
  };
  return {
    baseUrl: pick('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
    token: pick('DEEPSEEK_API_KEY', ''),
    model: pick('DEEPSEEK_MODEL', 'deepseek-chat'),
    // 来源：dev(.env) | bundled(构建时内置) | none
    tokenSource: (() => {
      const fromFile = typeof fileEnv.DEEPSEEK_API_KEY === 'string' && fileEnv.DEEPSEEK_API_KEY.trim();
      const fromProcess = typeof process.env.DEEPSEEK_API_KEY === 'string' && process.env.DEEPSEEK_API_KEY.trim();
      if (fromFile || fromProcess) return 'env';
      if (bundled.DEEPSEEK_API_KEY) return 'bundled';
      return 'none';
    })(),
  };
}

const envCfg = fromEnv();

/**
 * 解析最终生效的线上配置
 * @param {object} saved 设置面板保存的 aiConfig
 * @param {{preferEnv?: boolean}} opts preferEnv=true（开发模式）：本机 .env 优先于已保存的 Key
 *   默认（发布版）：设置面板 > .env / 内置 Key
 */
function resolve(saved, opts = {}) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const hasUser = (k) => typeof s[k] === 'string' && s[k].trim();
  const envToken = envCfg.token || '';
  const preferEnv = opts.preferEnv === true && !!envToken;
  const pick = (key) => {
    // 开发模式：token 以 .env 为准，避免旧的本机 Key 盖住新配置
    if (preferEnv && key === 'token') return envToken;
    return hasUser(key) ? s[key].trim() : envCfg[key] || '';
  };
  return {
    baseUrl: pick('baseUrl'),
    token: pick('token'),
    model: pick('model') || 'deepseek-chat',
    // user | env | bundled | none（开发模式且 .env 有 Key 时标记 env）
    tokenSource: preferEnv ? envCfg.tokenSource : (hasUser('token') ? 'user' : envCfg.tokenSource),
  };
}

function maskToken(token) {
  const t = String(token || '');
  if (!t) return '';
  if (t.length <= 8) return '••••';
  return t.slice(0, 3) + '••••' + t.slice(-4);
}

module.exports = {
  ...envCfg,
  resolve,
  maskToken,
  loadBundled,
};
