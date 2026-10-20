// aiInput.js - AI 对话浮窗（多轮；测算在主进程 agent tools）
const $ = (id) => document.getElementById(id);
const queryEl = $('query');
const submitBtn = $('submit');
const closeBtn = $('close');
const resetBtn = $('reset');
const statusEl = $('status');
const messagesEl = $('messages');

let busy = false;

function setStatus(kind, text) {
  statusEl.className = 'ai-status ' + (kind || '');
  statusEl.textContent = text || '';
}

function setBusy(b) {
  busy = b;
  submitBtn.disabled = b;
  queryEl.disabled = b;
  resetBtn.disabled = b;
  if (b) setStatus('info', '✨ 思考中…');
}

function scrollToEnd() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMsg(role, content) {
  const empty = messagesEl.querySelector('.ai-empty');
  if (empty) empty.remove();
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = content;
  messagesEl.appendChild(el);
  scrollToEnd();
}

function renderHistory(list) {
  messagesEl.innerHTML = '';
  if (!list || list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ai-empty';
    empty.textContent = '可以连续问。需要测算时我会去查黄历、时辰、个人命理或精灵加持。';
    messagesEl.appendChild(empty);
    return;
  }
  for (const m of list) {
    if (!m || !m.content) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    appendMsg(m.role, m.content);
  }
}

closeBtn.addEventListener('click', () => {
  window.api.closeAiInput();
});

resetBtn.addEventListener('click', async () => {
  if (busy) return;
  await window.api.resetAgentChat();
  renderHistory([]);
  setStatus('', '');
  queryEl.focus();
  window.logger.info('aiInput.reset', 'new chat');
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
  queryEl.value = '';
  appendMsg('user', q);
  setBusy(true);
  window.logger.info('aiInput.submit', `query length=${q.length}`);
  try {
    const result = await window.api.aiInterpretAsk({ query: q });
    if (!result.ok) {
      window.logger.warn('aiInput.submit', `failed: ${result.error}`);
    } else if (result.text) {
      appendMsg('assistant', result.text);
      setStatus('', '');
      window.logger.info('aiInput.submit', 'done');
    }
  } catch (e) {
    setStatus('error', '请求失败：' + (e.message || e));
    window.logger.error('aiInput.submit', `exception: ${e.message}`);
  } finally {
    setBusy(false);
    queryEl.focus();
  }
}

window.api.onAiInputFocus((data) => {
  window.logger.info('aiInput.event', 'focused');
  queryEl.value = '';
  queryEl.focus();
  setStatus('', '');
  renderHistory(data && data.messages);
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

window.api.onAgentProgress((info) => {
  const label = (info && (info.label || info.tool)) || '测算';
  setStatus('info', '✨ ' + label + '…');
});
