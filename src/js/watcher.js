// watcher.js - log tailer
// 监控 logger 输出的文件，新行触发 detector → AI 诊断 + 系统通知
// 节流：5 分钟内同一 category 只诊断一次

const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const detector = require('./detector');

class LogWatcher {
  constructor() {
    this.offset = 0;
    this.lastFile = null;
    this.pollTimer = null;
    this.cooldownByCategory = new Map(); // category -> ts
    this.onDiagnose = null; // (result, ctx) => {}
    this.onNotify = null;   // (result, ctx) => {}
    this.COOLDOWN_MS = 5 * 60 * 1000;
  }

  start({ onDiagnose, onNotify } = {}) {
    if (onDiagnose) this.onDiagnose = onDiagnose;
    if (onNotify) this.onNotify = onNotify;
    this.bootstrap();
    // 1 秒轮询一次（避免 fs.watch 在 Windows 上不稳）
    this.pollTimer = setInterval(() => this.poll(), 1000);
    logger.info('watcher', 'started');
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  bootstrap() {
    // 启动时读全部历史，建立 offset
    const content = logger.readTodayLog();
    this.offset = content.split('\n').length - 1; // -1 因为末尾通常有 ''
    this.lastFile = path.getLogDir ? path.getLogDir() : '';
  }

  poll() {
    try {
      const content = logger.readTodayLog();
      const lines = content.split('\n');
      // 如果行数没增长，啥都不做
      if (lines.length <= this.offset) {
        this.offset = Math.max(0, lines.length - 1);
        return;
      }
      // 处理 [offset, lines.length-1) 区间的新行
      const newLines = lines.slice(this.offset, lines.length - 1);
      this.offset = lines.length - 1;
      for (const line of newLines) {
        if (!line.trim()) continue;
        this.processLine(line);
      }
    } catch (e) {
      // watcher 自身不能崩
      // 用 console 因为 logger 可能递归
      console.error('[watcher] poll failed:', e.message);
    }
  }

  processLine(line) {
    const level = detector.parseLevel(line);
    if (!level) return;
    if (level !== 'error' && level !== 'critical') return;

    // 提取 meta（行末的 JSON 段）
    const metaMatch = line.match(/\s(\{.*\})\s*$/);
    let meta = {};
    if (metaMatch) {
      try { meta = JSON.parse(metaMatch[1]); } catch {}
    }

    const cls = detector.classify(line, meta);
    if (!cls.matched) return;

    // 冷却：同 category 5 分钟内只触发一次
    const lastTs = this.cooldownByCategory.get(cls.category) || 0;
    if (Date.now() - lastTs < this.COOLDOWN_MS) return;
    this.cooldownByCategory.set(cls.category, Date.now());

    const ctx = {
      line,
      level,
      category: cls.category,
      pattern: cls.pattern,
      hint: cls.hint,
      meta,
      recentLines: logger.tailSince(Math.max(0, this.offset - 50)).filter((l) => l.trim()),
    };

    logger.info('watcher', `detected ${cls.pattern} level=${level}`, { category: cls.category });

    // 异步触发诊断 + 通知
    Promise.resolve()
      .then(() => this.onDiagnose && this.onDiagnose(ctx))
      .catch((e) => logger.warn('watcher', 'onDiagnose failed', { error: e.message }));

    if (level === 'critical' && this.onNotify) {
      Promise.resolve()
        .then(() => this.onNotify(ctx))
        .catch((e) => logger.warn('watcher', 'onNotify failed', { error: e.message }));
    }
  }
}

module.exports = LogWatcher;