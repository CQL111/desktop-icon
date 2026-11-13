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

// 典籍出处：小标签列表，点击展开原文
function renderCitations(list) {
  if (!Array.isArray(list) || !list.length) return;
  const box = document.createElement('div');
  box.className = 'citations';
  const title = document.createElement('div');
  title.className = 'citations-title';
  title.textContent = '📚 典籍出处';
  box.appendChild(title);
  for (const c of list) {
    const item = document.createElement('details');
    item.className = 'citation';
    const sum = document.createElement('summary');
    sum.textContent = `《${c.ref.replace('·', '·')}》`;
    const body = document.createElement('p');
    body.textContent = c.text || '';
    item.appendChild(sum);
    item.appendChild(body);
    box.appendChild(item);
  }
  messagesEl.appendChild(box);
  scrollToEnd();
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
      // 主进程通常已经通过 onAiInputError 推送了具体原因；
      // 这里补一个兜底，避免浮窗看起来像卡住
      setStatus('error', friendlyInputError(result.error));
    } else if (result.text) {
      appendMsg('assistant', result.text);
      renderCitations(result.citations);
      if (result.notice) setStatus('info', '⚠️ ' + result.notice);
      else setStatus('', '');
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

function friendlyInputError(raw) {
  const code = String(raw || '');
  const MAP = {
    NO_TOKEN: '尚未配置 API Key，请先在设置里填写',
    AUTH_FAILED: 'API Key 无效或已过期，请到设置里更新',
    INSUFFICIENT_BALANCE: 'AI 额度已用尽，请充值或在设置里换用自己的 Key',
    RATE_LIMITED: '调用太频繁，请稍后再试',
    TIMEOUT: '网络有点慢，稍后再试',
    NETWORK: '网络似乎不太稳定',
    UPSTREAM_ERROR: '模型服务返回错误，稍后再试',
    BAD_JSON: '模型返回格式异常，稍后重试',
    EMPTY_QUERY: '请输入想问的内容',
    EMPTY_RESPONSE: '模型没有返回内容',
    AGENT_MAX_STEPS: '这轮调用太长，请换个说法再问',
  };
  // 错误可能是 "HTTP_400: 余额不足"，先按前缀取主码
  const main = code.split(':')[0].trim();
  if (MAP[main]) return MAP[main];
  if (/余额不足|insufficient/i.test(code)) return 'AI 额度已用尽，请充值或在设置里换用自己的 Key';
  if (/invalid_api_key|Incorrect API key/i.test(code)) return 'API Key 无效，请到设置里更新';
  if (/model_not_found|does not exist/i.test(code)) return '模型名不可用，请在设置里修改模型名';
  return '请求失败：' + (code || '未知错误');
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
