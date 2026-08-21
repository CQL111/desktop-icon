// detector.js - 模式识别 + 严重性分级
// 纯规则，不调模型

const PATTERNS = [
  {
    name: 'auth_failed',
    test: (line, meta) => /AUTH_FAILED|HTTP_401|HTTP_403/.test(line) || meta?.status === 401 || meta?.status === 403,
    level: 'critical',
    category: 'auth',
    hint: 'Token 失效或权限不足，请到设置面板更新 API Token',
  },
  {
    name: 'rate_limit',
    test: (line, meta) => /RATE_LIMITED|HTTP_429/.test(line) || meta?.status === 429,
    level: 'error',
    category: 'rate_limit',
    hint: '调用过于频繁，请稍后再试',
  },
  {
    name: 'server_error',
    test: (line, meta) => /SERVER_5|HTTP_5\d\d/.test(line) || (meta?.status >= 500 && meta?.status < 600),
    level: 'critical',
    category: 'server',
    hint: '服务端异常，请稍后重试或检查官方状态页',
  },
  {
    name: 'network',
    test: (line, meta) => /NETWORK|TIMEOUT|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(line),
    level: 'critical',
    category: 'network',
    hint: '网络问题，请检查网络连接或代理设置',
  },
  {
    name: 'bad_response',
    test: (line) => /BAD_JSON|EMPTY_RESPONSE/.test(line),
    level: 'error',
    category: 'response',
    hint: '模型返回异常，可能是临时问题',
  },
  {
    name: 'crypto',
    test: (line) => /safeStorage|encrypt|decrypt/.test(line),
    level: 'error',
    category: 'crypto',
    hint: '加密模块异常，token 可能无法安全保存',
  },
  {
    name: 'window',
    test: (line) => /BrowserWindow|Window.*destroyed|createWindow/.test(line),
    level: 'error',
    category: 'window',
    hint: '窗口创建失败，可能是 GPU 或权限问题',
  },
  {
    name: 'ipc',
    test: (line) => /ipcMain|ipcRenderer|IPC handler/.test(line),
    level: 'error',
    category: 'ipc',
    hint: 'IPC 通信异常，渲染端与主进程可能状态不一致',
  },
];

function classify(line, meta) {
  for (const p of PATTERNS) {
    try {
      if (p.test(line, meta || {})) {
        return {
          matched: true,
          pattern: p.name,
          level: p.level,
          category: p.category,
          hint: p.hint,
        };
      }
    } catch { /* 单条规则出错不影响整体 */ }
  }
  return { matched: false };
}

// 提取日志行里的 level
function parseLevel(line) {
  const m = line.match(/^\[([\d\-T:.Z]+)\] \[(INFO|WARN|ERROR|CRITICAL)\]/);
  return m ? m[2].toLowerCase() : null;
}

module.exports = { classify, parseLevel, PATTERNS };