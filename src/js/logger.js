// logger.js - 主进程结构化日志
// 零依赖，纯 Node fs
// 4 个级别：info / warn / error / critical
// 文件：%APPDATA%/fortune-ball/logs/main-YYYY-MM-DD.log
// rotation：单文件 5MB 触发；最多保留 10 个旧文件

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LEVELS = { info: 1, warn: 2, error: 3, critical: 4 };

let currentLevel = LEVELS.info;
let logDir = null;
let currentFile = null;
let currentSize = 0;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 10;

// 敏感字段 redact（写入时）
const REDACT_KEYS = ['token', 'apiKey', 'api_key', 'password', 'Authorization'];
function redact(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = Array.isArray(meta) ? [] : {};
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    if (REDACT_KEYS.some((rk) => k.toLowerCase().includes(rk.toLowerCase()))) {
      out[k] = typeof v === 'string' && v.length > 8
        ? v.slice(0, 4) + '***' + v.slice(-4)
        : '***';
    } else if (v && typeof v === 'object') {
      out[k] = redact(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function getLogDir() {
  if (!logDir) {
    // app 可能未 ready → 兜底用 userData 父目录
    const base = (app && app.getPath) ? app.getPath('userData') : path.join(require('os').homedir(), '.fortune-ball');
    logDir = path.join(base, 'logs');
  }
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

function dateStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLogFile() {
  const today = dateStamp();
  const expected = path.join(getLogDir(), `main-${today}.log`);
  if (currentFile !== expected) {
    currentFile = expected;
    try {
      currentSize = fs.existsSync(currentFile) ? fs.statSync(currentFile).size : 0;
    } catch { currentSize = 0; }
  }
  return currentFile;
}

function rotate() {
  // 把当前文件改名为 .1.log，老的 .1 → .2，最多 MAX_FILES
  const dir = getLogDir();
  const today = dateStamp();
  const cur = path.join(dir, `main-${today}.log`);

  // 老的轮转：max → 删除，max-1 → max
  for (let i = MAX_FILES; i >= 1; i--) {
    const src = path.join(dir, i === 1 ? cur.replace('.log', '.1.log') : `main-${today}.${i}.log`);
    // 简化：每天一个基底文件；轮转时统一加 .N
  }

  // 简洁实现：把所有 main-*.N.log 文件向上挪
  try {
    for (let i = MAX_FILES; i >= 1; i--) {
      const old = path.join(dir, `main-${today}.${i}.log`);
      if (i === MAX_FILES && fs.existsSync(old)) {
        fs.unlinkSync(old);
      } else if (fs.existsSync(old)) {
        const next = path.join(dir, `main-${today}.${i + 1}.log`);
        fs.renameSync(old, next);
      }
    }
    if (fs.existsSync(cur)) {
      fs.renameSync(cur, path.join(dir, `main-${today}.1.log`));
    }
  } catch (e) {
    // rotation 失败不能阻塞主流程
    console.error('[logger] rotation failed:', e.message);
  }
  currentFile = cur;
  currentSize = 0;
}

function formatLine(level, scope, msg, meta) {
  const ts = new Date().toISOString();
  let line = `[${ts}] [${level.toUpperCase()}] [${scope}] ${msg}`;
  const redactedMeta = redact(meta);
  if (redactedMeta && Object.keys(redactedMeta).length > 0) {
    try {
      line += ' ' + JSON.stringify(redactedMeta);
    } catch {
      line += ' [unserializable meta]';
    }
  }
  return line + '\n';
}

function write(level, scope, msg, meta) {
  if (LEVELS[level] < currentLevel) return;
  const line = formatLine(level, scope, msg, meta);

  // console（dev 可见）
  if (level === 'error' || level === 'critical') {
    console.error(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }

  // 写入文件
  try {
    const file = getLogFile();
    if (currentSize + line.length > MAX_FILE_SIZE) {
      rotate();
    }
    fs.appendFileSync(currentFile, line, 'utf8');
    currentSize += Buffer.byteLength(line, 'utf8');
  } catch (e) {
    // 文件写失败不能崩
    console.error('[logger] write failed:', e.message);
  }
}

function setLevel(level) {
  if (LEVELS[level]) {
    currentLevel = LEVELS[level];
    write('info', 'logger', `level set to ${level}`);
  }
}
function getLevel() {
  return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel);
}

// 读取今日日志的所有内容（给 watcher 用）
function readTodayLog() {
  try {
    const file = getLogFile();
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8');
  } catch { return ''; }
}

// 从指定行号起读取增量（给 watcher 用）
function tailSince(fromIndex) {
  const content = readTodayLog();
  return content.split('\n').slice(fromIndex);
}

// 列出 logs 目录所有文件
function listLogFiles() {
  try {
    const dir = getLogDir();
    return fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => path.join(dir, f));
  } catch { return []; }
}

// 清空所有日志（托盘"重置日志"调用）
function clearAll() {
  try {
    const files = listLogFiles();
    for (const f of files) {
      try { fs.unlinkSync(f); } catch {}
    }
    currentSize = 0;
    currentFile = null;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  info:  (scope, msg, meta) => write('info', scope, msg, meta),
  warn:  (scope, msg, meta) => write('warn', scope, msg, meta),
  error: (scope, msg, meta) => write('error', scope, msg, meta),
  critical: (scope, msg, meta) => write('critical', scope, msg, meta),
  log: write,
  setLevel,
  getLevel,
  getLogDir,
  readTodayLog,
  tailSince,
  listLogFiles,
  clearAll,
  LEVELS,
};