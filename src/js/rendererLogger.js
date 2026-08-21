// rendererLogger.js - 渲染端统一日志
// 通过 IPC 发到主进程，统一写入 logs 目录
// 同时安装全局 error 捕获，把 renderer 错误也带到主进程

(function () {
  if (!window.api) return;

  function send(level, scope, msg, meta) {
    try {
      // meta 必须是 plain object；去掉 function / symbol / DOM 节点
      const safeMeta = {};
      if (meta && typeof meta === 'object') {
        for (const k of Object.keys(meta)) {
          const v = meta[k];
          if (v == null) continue;
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            safeMeta[k] = v;
          } else if (Array.isArray(v)) {
            safeMeta[k] = v.slice(0, 10);
          }
        }
      }
      if (level === 'info')        window.api.logInfo(scope, String(msg), safeMeta);
      else if (level === 'warn')   window.api.logWarn(scope, String(msg), safeMeta);
      else if (level === 'error')  window.api.logError(scope, String(msg), safeMeta);
      else if (level === 'critical') window.api.logCritical(scope, String(msg), safeMeta);
    } catch (e) {
      // 最后兜底：不能因日志本身崩溃渲染端
      try { console.error('[rendererLogger] send failed:', e); } catch {}
    }
  }

  window.logger = {
    info:     (scope, msg, meta) => send('info', scope, msg, meta),
    warn:     (scope, msg, meta) => send('warn', scope, msg, meta),
    error:    (scope, msg, meta) => send('error', scope, msg, meta),
    critical: (scope, msg, meta) => send('critical', scope, msg, meta),
  };

  // 全局 error 捕获
  window.addEventListener('error', (e) => {
    send('error', 'renderer.unhandled', e.message || 'unknown', {
      stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1000) : '',
      filename: e.filename || '',
      lineno: e.lineno || 0,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason && (e.reason.message || String(e.reason));
    send('error', 'renderer.unhandledrejection', reason || 'unknown', {
      stack: e.reason && e.reason.stack ? String(e.reason.stack).slice(0, 1000) : '',
    });
  });

  // 给 console 方法加 hook（保留 console.* 但同时转发）
  ['log', 'info', 'warn', 'error'].forEach((m) => {
    const orig = console[m].bind(console);
    console[m] = function (...args) {
      orig.apply(console, args);
      // 只在 error/warn 时转发，避免噪音
      if (m === 'error' || m === 'warn') {
        try {
          const scope = (window.location.pathname || 'renderer').split('/').pop() || 'renderer';
          const msg = args.map((a) => (typeof a === 'string' ? a : (a && a.message) || String(a))).join(' ').slice(0, 500);
          send(m, scope, msg);
        } catch {}
      }
    };
  });

  window.logger.info('renderer', 'logger ready', { url: window.location.href });
})();