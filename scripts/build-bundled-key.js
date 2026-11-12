// scripts/build-bundled-key.js
// 把本地 .env 里的线上模型配置打包进应用（构建时内置 Key）。
// 生成 build/bundled-ai.json（已被 gitignore），打包时由 electron-builder.key.yml 复制到 resources/。
// 用法：
//   npm run build:key        # 生成 + 构建安装包（内置 Key）
//   node scripts/build-bundled-key.js --check   # 只检查 .env 是否可用
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV = path.join(ROOT, '.env');
const OUT_DIR = path.join(ROOT, 'build');
const OUT = path.join(OUT_DIR, 'bundled-ai.json');

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

function main() {
  const checkOnly = process.argv.includes('--check');
  if (!fs.existsSync(ENV)) {
    console.error('❌ 找不到 .env。请先复制 .env.example 为 .env 并填入 DEEPSEEK_API_KEY。');
    process.exit(1);
  }
  const env = parseEnv(fs.readFileSync(ENV, 'utf8'));
  const token = String(env.DEEPSEEK_API_KEY || '').trim();
  if (!token) {
    console.error('❌ .env 里 DEEPSEEK_API_KEY 为空。');
    process.exit(1);
  }
  if (!/^sk-[A-Za-z0-9_\-]{10,}$/.test(token)) {
    console.error(`❌ DEEPSEEK_API_KEY 格式不像 OpenAI 兼容 Key（应以 sk- 开头，当前长度 ${token.length}）。`);
    process.exit(1);
  }
  const cfg = {
    baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    token,
    builtAt: new Date().toISOString(),
    note: 'build-time bundled key; do not commit',
  };
  if (checkOnly) {
    console.log('✅ .env 可用：', cfg.baseUrl, cfg.model, `key len=${token.length}`);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(cfg, null, 2), 'utf8');
  console.log('✅ 已生成', path.relative(ROOT, OUT), `(key len=${token.length})`);
  console.log('   该文件已被 .gitignore 忽略，只会在打包时复制进安装包。');
}

main();
