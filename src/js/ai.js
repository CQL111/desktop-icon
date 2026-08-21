// ai.js - MiniMax LLM 调用封装（主进程侧）
// 用 Electron 内置 net.fetch，无需第三方依赖
// 所有调用失败都 throw，由调用方决定降级（卡片不显示 AI 区）
//
// 支持两种端点（按 baseUrl 自动识别）：
//   1. Anthropic 兼容（官方推荐）：  POST /anthropic/v1/messages
//      Header: Authorization: Bearer <MINIMAX_API_KEY>
//      Body:   { model, max_tokens, system?, messages: [{role,content}], temperature? }
//      Resp:   { content: [{type:'text', text:'...'}, ...], usage, model }
//   2. OpenAI 兼容：                  POST /v1/chat/completions
//      Header: Authorization: Bearer <MINIMAX_API_KEY>
//      Body:   { model, messages, temperature?, max_tokens, response_format? }
//      Resp:   { choices:[{message:{content:'...'}}], usage, model }

const { net } = require('electron');
const logger = require('./logger');

// 运势场景推荐：M2-her（官方文档说"专为对话场景设计，支持角色扮演和多轮对话"）
const DEFAULT_MODEL = 'MiniMax-M2-her';
const FALLBACK_MODEL = 'MiniMax-M2.7';

// 探测端点：根据 baseUrl 形态返回 { kind, url }
function detectEndpoint(baseUrl) {
  // 先去掉 trailing slash
  let u = String(baseUrl || '').trim().replace(/\/+$/, '');

  // 用户明确填了 Anthropic 路径 → 走 Anthropic 协议
  if (u.endsWith('/anthropic')) {
    return { kind: 'anthropic', url: u + '/v1/messages' };
  }
  // 旧格式兜底（如果用户填了带 anthropic_api 字样的）
  if (u.includes('anthropic_api') || u.includes('anthropic-api')) {
    logger.warn('ai.endpoint', `fallback path: ${baseUrl}`);
    return { kind: 'anthropic', url: u };
  }

  // OpenAI 路径：去掉末尾 /v\d+（如有），拼 /v1/chat/completions
  u = u.replace(/\/v\d+$/, '');
  return { kind: 'openai', url: u + '/v1/chat/completions' };
}

// ---------- System Prompts ----------
const SYSTEM_PROMPTS = {
  traditional:
    '你是一位温和的中文占卜师，擅长用古典意象解释运势。语气含蓄、有诗意，但不神神叨叨。' +
    '请基于给定的传统中式运势结果（生肖、五行、宜忌），用 2-4 句中文给用户一段温暖的今日解读，' +
    '不超过 120 字。不要复述宜忌清单，直接给出共鸣感。',
  modern:
    '你是一位理性的生活教练，用现代视角解读运势。语气温和务实，不玄学。' +
    '请基于给定的多维度评分（感情/事业/财运/健康），用 2-4 句中文指出今日最值得关注的维度，' +
    '并给一句小建议，不超过 120 字。',
  lots:
    '你是街边签馆老先生，说话口语、接地气、带点俏皮。' +
    '请基于抽到的签（等级 + 签文 + 解签），用 2-4 句白话中文告诉用户今天该怎么过，' +
    '不超过 120 字。可以调侃，但不要负能量。',
  tarot:
    '你是塔罗解读师，神秘但不神神叨叨。' +
    '请基于抽到的塔罗牌（名称 + 正逆位），用 2-4 句中文告诉用户这张牌的今日启示，' +
    '不超过 120 字。逆位时点出需要警惕的方面，但不恐吓。',
  personalized:
    '你是用户的私人运势助手，熟悉他最近的状态。' +
    '请基于混合的运势片段，用 2-4 句中文给出今日整体建议，语气像老朋友，' +
    '不超过 120 字。',
  ask:
    '你是一位温和、理性的中文占卜师。用户会问你一个具体的问题，' +
    '请结合中国传统命理意象和现代生活经验，给出 2-4 句中肯的回答，' +
    '不超过 150 字。不要使用"一定"、"必定"等绝对化措辞。',
};

// ---------- Token 区域辅助 ----------
function normalizeBaseUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '');
  // 官方推荐：Anthropic 兼容用 minimaxi.com/anthropic
  if (!url) return 'https://api.minimaxi.com/anthropic';
  // 如果是 anthropic 端点路径，不要强行加 /v1
  if (url.endsWith('/anthropic') || url.includes('anthropic_api') || url.includes('anthropic-api')) {
    return url;
  }
  if (!/\/v\d+$/.test(url)) url += '/v1';
  return url;
}

function chatCompletionsUrl(baseUrl) {
  // 兼容两种：用户可能填到 /v1 或更深，自动拼到 chatcompletion_v2
  const u = normalizeBaseUrl(baseUrl);
  if (u.endsWith('/chatcompletion_v2')) return u;
  return `${u}/text/chatcompletion_v2`;
}

// ---------- 核心：callLLM ----------
/**
 * 调用 MiniMax chat completions（自动按 OpenAI / Anthropic 兼容协议）。
 * @param {Object} opts
 * @param {string} opts.baseUrl    - 如 "https://api.minimaxi.chat/v1" 或 ".../anthropic"
 * @param {string} opts.token      - 明文 token
 * @param {Array}  opts.messages   - [{role, content}, ...]  支持 'system' / 'user' / 'assistant'
 * @param {string} [opts.model]
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{content:string, usage:object, model:string}>}
 */
async function callLLM({
  baseUrl,
  token,
  messages,
  model = DEFAULT_MODEL,
  temperature = 0.7,
  maxTokens = 600,
  timeoutMs = 12000,
}) {
  if (!token) throw new Error('NO_TOKEN');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('NO_MESSAGES');

  const ep = detectEndpoint(baseUrl);

  // 拆 system / 其余 messages（Anthropic 协议要求 system 在顶级字段）
  let systemText = '';
  let chatMessages = messages;
  if (ep.kind === 'anthropic') {
    const sysIdx = messages.findIndex((m) => m.role === 'system');
    if (sysIdx >= 0) {
      systemText = String(messages[sysIdx].content || '');
      chatMessages = messages.filter((_, i) => i !== sysIdx);
    }
  }

  let body;
  if (ep.kind === 'anthropic') {
    // Anthropic Messages API 兼容
    body = {
      model,
      system: systemText,
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature,
    };
  } else {
    // OpenAI 兼容
    body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await net.fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 国内 Anthropic 兼容端点用 Bearer，国内 OpenAI 兼容也用 Bearer
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('TIMEOUT');
    throw new Error(`NETWORK: ${e.message || e}`);
  }
  clearTimeout(timer);

  const status = resp.status;
  let json;
  try {
    json = await resp.json();
  } catch (e) {
    throw new Error(`BAD_JSON: status=${status}`);
  }

  if (status === 401 || status === 403) throw new Error('AUTH_FAILED');
  if (status === 429) throw new Error('RATE_LIMITED');
  if (status >= 500) throw new Error(`SERVER_${status}`);

  if (!resp.ok) {
    const msg = (json && (json.error?.message || json.error_message || json.message)) || `HTTP_${status}`;
    throw new Error(`HTTP_${status}: ${msg}`);
  }

  let content;
  let normalizedUsage;
  if (ep.kind === 'anthropic') {
    // Anthropic 格式：content: [{type:'thinking', thinking:'...'}, {type:'text', text:'...'}]
    // 我们只要 text，跳过 thinking（避免 thinking 内容混入解读）
    const blocks = Array.isArray(json?.content) ? json.content : [];
    content = blocks
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text || '')
      .join('');
    // Anthropic usage 是 input_tokens / output_tokens，没有 total_tokens
    normalizedUsage = json?.usage
      ? {
          prompt_tokens: json.usage.input_tokens || 0,
          completion_tokens: json.usage.output_tokens || 0,
          total_tokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
        }
      : {};
  } else {
    // OpenAI 格式：choices[0].message.content
    content = json?.choices?.[0]?.message?.content;
    normalizedUsage = json?.usage || {};
  }

  if (!content) throw new Error('EMPTY_RESPONSE');

  return {
    content,
    usage: normalizedUsage,
    model: json.model || model,
  };
}

// ---------- 把模型的 JSON 输出解析为字符串 ----------
function extractText(content) {
  // 模型返回 JSON 字符串：{ "text": "...", "summary": "..." } 或裸字符串
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj.text === 'string') return obj.text;
    if (obj && typeof obj.summary === 'string') return obj.summary;
    if (obj && typeof obj.interpretation === 'string') return obj.interpretation;
    return JSON.stringify(obj);
  } catch {
    // 不是 JSON：直接当文本返回
    return trimmed;
  }
}

// ---------- 用户上下文构造 ----------
function buildUserContext(ctx = {}) {
  const parts = [];
  if (ctx.dateKey) parts.push(`日期：${ctx.dateKey}`);
  if (ctx.zodiac) parts.push(`星座：${ctx.zodiac}`);
  if (Array.isArray(ctx.recentMoods) && ctx.recentMoods.length) {
    parts.push(`最近心情：${ctx.recentMoods.join(' / ')}`);
  }
  return parts.length ? parts.join('\n') : '';
}

// ---------- 解读：当次抽签结果 ----------
async function interpretFortune({
  style,
  fortuneData,
  userQuery = '',
  ctx = {},
  aiConfig,
}) {
  if (!aiConfig || !aiConfig.token) throw new Error('NO_TOKEN');
  const sysKey = SYSTEM_PROMPTS[style] ? style : 'personalized';
  const systemPrompt = SYSTEM_PROMPTS[sysKey];

  const ctxBlock = buildUserContext(ctx);
  const fortuneBlock = JSON.stringify(fortuneData || {}, null, 2).slice(0, 1800);
  const userPrompt =
    `【运势数据】\n${fortuneBlock}\n\n` +
    (ctxBlock ? `【用户背景】\n${ctxBlock}\n\n` : '') +
    (userQuery ? `【用户提问】${userQuery}\n\n` : '') +
    `请返回 JSON：{"text": "你的解读，2-4 句中文，不超过 120 字"}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await callLLM({
    baseUrl: aiConfig.baseUrl,
    token: aiConfig.token,
    messages,
    temperature: 0.75,
    maxTokens: 500,
    timeoutMs: 12000,
  });

  const text = extractText(result.content);
  if (!text) throw new Error('EMPTY_TEXT');
  return { text, usage: result.usage, model: result.model };
}

// ---------- 解读：用户主动提问（右键浮窗） ----------
async function interpretAsk({ userQuery, ctx = {}, aiConfig }) {
  if (!aiConfig || !aiConfig.token) throw new Error('NO_TOKEN');
  if (!userQuery || !userQuery.trim()) throw new Error('EMPTY_QUERY');

  const ctxBlock = buildUserContext(ctx);
  const userPrompt =
    (ctxBlock ? `【用户背景】\n${ctxBlock}\n\n` : '') +
    `【用户问题】${userQuery.trim()}\n\n` +
    `请返回 JSON：{"text": "你的回答，2-4 句中文，不超过 150 字"}`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS.ask },
    { role: 'user', content: userPrompt },
  ];

  const result = await callLLM({
    baseUrl: aiConfig.baseUrl,
    token: aiConfig.token,
    messages,
    temperature: 0.7,
    maxTokens: 500,
    timeoutMs: 12000,
  });

  const text = extractText(result.content);
  if (!text) throw new Error('EMPTY_TEXT');
  return { text, usage: result.usage, model: result.model };
}

// ---------- 探测：测试连接 ----------
async function testConnection({ baseUrl, token }) {
  if (!token) return { ok: false, error: 'NO_TOKEN' };
  try {
    const result = await callLLM({
      baseUrl,
      token,
      messages: [
        { role: 'system', content: '你是一个测试助手。' },
        { role: 'user', content: '请返回 {"text":"ok"}' },
      ],
      model: DEFAULT_MODEL,
      temperature: 0.1,
      maxTokens: 32,
      timeoutMs: 8000,
    });
    return { ok: true, model: result.model };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// ---------- AI 自动诊断 ----------
const DIAGNOSE_SYSTEM =
  '你是一位资深 Electron 桌面应用工程师，专门负责快速定位错误并给出可执行的修复建议。' +
  '用户会贴最近 50 行日志 + 一条关键错误 + 触发上下文，请你：' +
  '1) 给出最可能的根因（1-2 句中文）' +
  '2) 给出具体修复步骤（1-3 步，不要超过 100 字）' +
  '3) 给信心分（0-1 之间的小数）' +
  '请严格按 JSON 返回：{"rootCause":"...","fix":"...","confidence":0.X}';

async function diagnose({ line, recentLines = [], meta = {}, aiConfig, ctx = {} }) {
  if (!aiConfig || !aiConfig.token) throw new Error('NO_TOKEN');

  // 限制最近日志长度，避免爆 token
  const tailLines = (recentLines || []).slice(-50).join('\n').slice(0, 4000);
  const userPrompt =
    `【错误】\n${line}\n\n` +
    `【最近 50 行日志】\n${tailLines || '(空)'}\n\n` +
    `【触发上下文】\n${JSON.stringify({ ...ctx, meta }, null, 0).slice(0, 800)}\n\n` +
    '请返回 JSON：{"rootCause":"...","fix":"...","confidence":0.X}';

  const messages = [
    { role: 'system', content: DIAGNOSE_SYSTEM },
    { role: 'user', content: userPrompt },
  ];

  const result = await callLLM({
    baseUrl: aiConfig.baseUrl,
    token: aiConfig.token,
    messages,
    temperature: 0.3,
    maxTokens: 400,
    timeoutMs: 15000,
  });

  let parsed;
  try {
    parsed = JSON.parse(String(result.content || '').trim());
  } catch {
    // 不是 JSON：尝试简单正则提取
    const m = String(result.content || '').match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch {}
    }
  }
  if (!parsed || typeof parsed.rootCause !== 'string') {
    throw new Error('EMPTY_TEXT');
  }

  return {
    rootCause: String(parsed.rootCause || '').slice(0, 200),
    fix: String(parsed.fix || '').slice(0, 300),
    confidence: typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5,
    model: result.model,
    usage: result.usage,
  };
}

module.exports = {
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  normalizeBaseUrl,
  detectEndpoint,
  callLLM,
  interpretFortune,
  interpretAsk,
  testConnection,
  diagnose,
};