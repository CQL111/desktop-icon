// onlineConfig.js - 线上模型配置（token 只从本地 .env 读，不进 git）
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

function loadLocalEnv() {
  const files = [
    path.join(__dirname, '..', '..', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  for (const f of files) {
    try {
      if (fs.existsSync(f)) return parseEnv(fs.readFileSync(f, 'utf8'));
    } catch {}
  }
  return {};
}

const env = { ...loadLocalEnv(), ...process.env };

module.exports = {
  baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  token: env.DEEPSEEK_API_KEY || '',
  model: env.DEEPSEEK_MODEL || 'deepseek-chat',
};
