// aiInput.js - AI 输入浮窗逻辑
const $ = (id) => document.getElementById(id);
const queryEl = $('query');
const submitBtn = $('submit');
const closeBtn = $('close');
const statusEl = $('status');

let busy = false;

function setStatus(kind, text) {
  statusEl.className = 'ai-status ' + (kind || '');
  statusEl.textContent = text || '';
}

function setBusy(b) {
  busy = b;
  submitBtn.disabled = b;
  queryEl.disabled = b;
  if (b) setStatus('info', '✨ 解读中…');
}

closeBtn.addEventListener('click', () => {
  window.api.closeAiInput();
});

submitBtn.addEventListener('click', submit);
queryEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submit();
  } else if (e.key === 'Escape') {
    window.api.closeAiInput();
  }
});

async function submit() {
  if (busy) return;
  const q = queryEl.value.trim();
  if (!q) {
    setStatus('error', '请输入想问的内容');
    return;
  }
  setBusy(true);
  window.logger.info('aiInput.submit', `query length=${q.length}`);
  try {
    const result = await window.api.aiInterpretAsk({ query: q });
    if (!result.ok) {
      window.logger.warn('aiInput.submit', `failed: ${result.error}`);
      // 错误已通过 IPC 推到 status 显示
    } else {
      window.logger.info('aiInput.submit', 'done');
    }
  } catch (e) {
    setStatus('error', '请求失败：' + (e.message || e));
    window.logger.error('aiInput.submit', `exception: ${e.message}`);
  } finally {
    setBusy(false);
  }
}

// 主进程 IPC 钩子
window.api.onAiInputFocus(() => {
  window.logger.info('aiInput.event', 'focused');
  queryEl.value = '';
  queryEl.focus();
  setStatus('', '');
});

window.api.onAiInputLoading((loading) => {
  window.logger.info('aiInput.event', `loading=${!!loading}`);
  setBusy(!!loading);
});

window.api.onAiInputError((err) => {
  window.logger.warn('aiInput.event', `error kind=${err.kind || 'unknown'}`);
  setStatus('error', err.text || '出错了');
  setBusy(false);
  queryEl.focus();
});