// selfCheck.js - 自检循环
// 启动后由 main.js 延迟调用一次，检查核心模块是否就绪
// 失败项只写 logger.error，让现有 watcher → detector → ai.diagnose 路径自然接住

const logger = require('./logger');

async function runSelfCheck(deps) {
  // optional: 环境相关、不影响核心功能（未配 Key、没装 Ollama、快捷键被占用）
  const checks = [
    { name: 'logger',       check: () => !!logger.getLogDir() },
    { name: 'watcher',      check: () => !!deps.logWatcher },
    { name: 'online-token', optional: true, check: () => {
      if (typeof deps.getOnlineToken === 'function') return !!deps.getOnlineToken();
      return !!(deps.onlineConfig && deps.onlineConfig.token);
    } },
    { name: 'local-llm',    optional: true, check: async () => {
      // 本地模型可用性仅记录，不可用不算失败（线上是合法降级）
      const ok = deps.localLLM ? await deps.localLLM.checkLocal(true) : false;
      return ok || true;
    } },
    { name: 'tray',         check: () => deps.tray !== null },
    { name: 'ballWindow',   check: () => deps.ballWindow && !deps.ballWindow.isDestroyed() },
    { name: 'shortcut',     optional: true, check: () => {
      // 注册失败通常是快捷键被其他软件占用，不是程序 bug
      try {
        const ok = deps.globalShortcut.isRegistered('CommandOrControl+Alt+F');
        if (!ok) logger.warn('selfCheck', 'shortcut Ctrl+Alt+F not registered (可能被其他应用占用)');
        return ok;
      } catch (e) { throw new Error('shortcut check failed: ' + e.message); }
    } },
  ];

  const results = [];
  for (const c of checks) {
    try {
      const ok = await c.check();
      results.push({ name: c.name, ok, optional: !!c.optional, error: null });
    } catch (e) {
      results.push({ name: c.name, ok: false, optional: !!c.optional, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const hardFailed = failed.filter((r) => !r.optional);
  logger.info('selfCheck', `${results.length - failed.length}/${results.length} passed`,
    { failed: failed.map((f) => f.name) });

  // 核心项失败写 error，交给 watcher 路径自然处理；环境项只记 warn
  for (const f of failed) {
    const write = f.optional ? logger.warn : logger.error;
    write('selfCheck', `failed: ${f.name}${f.optional ? ' (optional)' : ''}`, { error: f.error });
  }

  return results;
}

module.exports = { runSelfCheck };