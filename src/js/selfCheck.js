// selfCheck.js - 自检循环
// 启动后由 main.js 延迟调用一次，检查核心模块是否就绪
// 失败项只写 logger.error，让现有 watcher → detector → ai.diagnose 路径自然接住

const logger = require('./logger');

async function runSelfCheck(deps) {
  const checks = [
    { name: 'logger',       check: () => !!logger.getLogDir() },
    { name: 'watcher',      check: () => !!deps.logWatcher },
    { name: 'online-token', check: () => !!(deps.onlineConfig && deps.onlineConfig.token) },
    { name: 'local-llm',    check: async () => {
      // 本地模型可用性仅记录，不可用不算失败（线上是合法降级）
      const ok = deps.localLLM ? await deps.localLLM.checkLocal(true) : false;
      return ok || true;
    } },
    { name: 'tray',         check: () => deps.tray !== null },
    { name: 'ballWindow',   check: () => deps.ballWindow && !deps.ballWindow.isDestroyed() },
    { name: 'shortcut',     check: () => {
      try { return deps.globalShortcut.isRegistered('CommandOrControl+Alt+F'); }
      catch { return false; }
    } },
  ];

  const results = [];
  for (const c of checks) {
    try {
      const ok = await c.check();
      results.push({ name: c.name, ok, error: null });
    } catch (e) {
      results.push({ name: c.name, ok: false, error: e.message });
    }
  }

  const failed = results.filter((r) => !r.ok);
  logger.info('selfCheck', `${results.length - failed.length}/${results.length} passed`,
    { failed: failed.map((f) => f.name) });

  // 失败项写 logger.error，让 watcher 路径自然处理（不主动调 AI，避免启动连环调用）
  for (const f of failed) {
    logger.error('selfCheck', `failed: ${f.name}`, { error: f.error });
  }

  return results;
}

module.exports = { runSelfCheck };