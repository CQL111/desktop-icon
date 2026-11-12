// agent.js - 运势对话 agent（tool calling + 多轮）
// 测算走现有 fortune / spirit / behavior，模型只负责决定调哪个 tool 和解读结果。
// 不依赖 Electron，smoke-test 可直接跑 executeTool。

const fortune = require('./fortune');
const spirit = require('./fortuneSpirit');
const behavior = require('./behavior');
const logger = require('./logger');
const scenes = require('./scenarios/registry');
const canon = require('./canon');

const MAX_STEPS = 6;
const RESULT_MAX = 2400;
const HISTORY_TURNS = 8; // 按用户轮次裁，不是按 raw message 条数

const SYSTEM_PROMPT =
  '你是桌面应用「今日运势」里的运势助手，可以和用户连续对话。' +
  '需要具体测算、黄历、时辰、个人命理、签文/塔罗、精灵加持时，必须先调用对应 tool，再基于返回数据解读。' +
  '不要编造分数、宜忌、签文、塔罗牌或加持值。' +
  '涉及八字格局、十神、五行强弱、易经卦象等命理理论时，先调用 search_canon 检索典籍原文，再引用；' +
  '引用必须是 search_canon 返回的原文，并标注出处（如「《渊海子平·财多身弱》」），不得编造或改写原文当作引文。' +
  '检索不到时如实说明「典籍中没有直接对应」，再给出你的理解。' +
  'bless_spirit 会真正改写用户加持，仅在用户明确要求祈福时调用。' +
  '用中文回答，简洁，一般 2-8 句；可以追问。';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_almanac',
      description: '按日期生成黄历：农历日期、节气、干支年/月/日、建除十二值日、黄黑道、冲煞、彭祖百忌、吉时、宜忌、幸运色和数字。不传 date 则用今天。宜忌为传统规则参考。',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD，默认今天' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hour_fortune',
      description: '此刻个人运势：当前时辰吉言、宜忌、提点。若用户已填生日会带上个人摘要。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_fortune',
      description: '今日运势。style 为 traditional/modern/lots/tarot/personalized；不传则按用户行为偏好自动选。lots=抽签，tarot=塔罗。',
      parameters: {
        type: 'object',
        properties: {
          style: {
            type: 'string',
            enum: ['traditional', 'modern', 'lots', 'tarot', 'personalized'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_personal_chart',
      description: '个人命理档案（需已填生日）。mode: comprehensive=综合，bazi=八字，zodiac=星座。',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['comprehensive', 'bazi', 'zodiac'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_range_fortune',
      description: '明日或本周运势。',
      parameters: {
        type: 'object',
        properties: {
          range: { type: 'string', enum: ['tomorrow', 'week'] },
        },
        required: ['range'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_canon',
      description: '检索命理典籍原文（周易、滴天髓、渊海子平），返回带出处的原文片段。用于八字格局、十神、五行、卦象等理论问题；引用时必须以返回的原文为准并标注出处。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词，如「财多身弱」「伤官见官」「乾卦」' },
          book: { type: 'string', enum: ['zhouyi', 'ditiansui', 'yuanhai'], description: '限定书目，可不填' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spirit_status',
      description: '运势精灵五项加持、今日祈福剩余次数、当前摆位五行。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bless_spirit',
      description: '为指定维度祈福 +1。每日限 3 次，单项上限 3。仅在用户明确要求时调用。',
      parameters: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: spirit.DIMENSIONS },
        },
        required: ['dimension'],
      },
    },
  },
];

const TOOL_LABELS = {
  get_almanac: '查阅黄历',
  get_hour_fortune: '测算此刻',
  get_today_fortune: '测算今日',
  get_personal_chart: '个人命理',
  get_range_fortune: '测算时段',
  search_canon: '查阅典籍',
  get_spirit_status: '查看精灵',
  bless_spirit: '祈福',
};

function compact(obj) {
  try {
    const s = JSON.stringify(obj);
    return s.length <= RESULT_MAX ? s : s.slice(0, RESULT_MAX) + '…';
  } catch {
    return '{"error":"SERIALIZE"}';
  }
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function applyBoost(data, ctx) {
  if (!data || !ctx || !ctx.spirit) return data;
  const boosts = ctx.spirit.boosts || {};
  for (const dim of spirit.DIMENSIONS) {
    const b = boosts[dim] || 0;
    if (b <= 0) continue;
    for (const field of spirit.DIM_FIELDS[dim] || []) {
      if (field === 'score') continue;
      if (data.dims && typeof data.dims[field] === 'number') {
        const cap = data.dims[field] > 100 ? 100 : 5;
        data.dims[field] = Math.min(cap, data.dims[field] + b);
      }
    }
  }
  const total = boosts['综合'] || 0;
  if (total > 0 && typeof data.score === 'number') {
    data.score = Math.min(5, data.score + total);
  }
  return data;
}

function executeTool(name, args, ctx = {}) {
  const todayKey = ctx.todayKey || fortune.getTodayKey();
  const profile = ctx.profile || {};
  try {
    if (name === 'get_almanac') {
      const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(args.date || '') ? args.date : todayKey;
      return fortune.genAlmanac({ dateKey });
    }
    if (name === 'get_hour_fortune') {
      const hourKey = fortune.getCurrentHourKey();
      return applyBoost(
        fortune.genHourFortune({ dateKey: todayKey, hourKey, profile, installId: ctx.installId }),
        ctx,
      );
    }
    if (name === 'get_today_fortune') {
      const style = behavior.STYLES.includes(args.style)
        ? args.style
        : behavior.pickStyle(ctx.behaviorMap || {});
      return applyBoost(
        fortune.generate(style, { dateKey: todayKey, zodiac: ctx.zodiac, installId: ctx.installId }),
        ctx,
      );
    }
    if (name === 'get_personal_chart') {
      if (!profile.birthday) return { error: 'NO_BIRTHDAY', hint: '请先在设置里填写生日' };
      const mode = ['comprehensive', 'bazi', 'zodiac'].includes(args.mode)
        ? args.mode
        : (ctx.profileMode || 'comprehensive');
      return applyBoost(
        fortune.genProfile({ dateKey: todayKey, profile, profileMode: mode }),
        ctx,
      );
    }
    if (name === 'get_range_fortune') {
      if (args.range === 'week') return applyBoost(fortune.genWeekFortune({ dateKey: todayKey, installId: ctx.installId }), ctx);
      if (args.range === 'tomorrow') {
        const tomorrowKey = fortune.getTodayKey(new Date(Date.now() + 86400000));
        return applyBoost(fortune.genTomorrowFortune({ dateKey: tomorrowKey, installId: ctx.installId }), ctx);
      }
      return { error: 'INVALID_RANGE' };
    }
    if (name === 'search_canon') {
      const q = String(args.query || '').trim();
      if (!q) return { ok: false, error: 'EMPTY_QUERY' };
      const r = canon.search(q, { book: args.book, limit: 3 });
      if (!r.ok) return { ok: false, error: r.error || 'NO_HIT', query: q, results: [] };
      return r;
    }
    if (name === 'get_spirit_status') {
      const s = ctx.spirit || spirit.defaultSpirit();
      // 用应用时区算“今天”，和 blessed 时写入的口径保持一致
      const today = fortune.getTodayKey();
      const used = s.lastBlessDate === today ? (s.blessCountToday || 0) : 0;
      return {
        boosts: s.boosts,
        blessRemaining: Math.max(0, spirit.BLESS_DAILY_LIMIT - used),
        positionWuxing: ctx.posWuxing || s.positionWuxing,
        wuxingToDim: spirit.WUXING_TO_DIM,
      };
    }
    if (name === 'bless_spirit') {
      const dim = args.dimension;
      const current = ctx.spirit || spirit.defaultSpirit();
      const result = spirit.bless(current, dim, spirit.getTodayKey());
      if (typeof ctx.saveSpirit === 'function' && !result.error) ctx.saveSpirit(result.spirit);
      if (result.error) return { ok: false, error: result.error, dim };
      return { ok: true, dim, boost: result.boost, remaining: result.remaining, boosts: result.spirit.boosts };
    }
    return scenes.execute(name, args, ctx);
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

function publicHistory(messages) {
  return (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
}

function emptyAgentChat() {
  return { messages: [], scene: '', updatedAt: 0 };
}

function trimByUserTurns(messages, maxTurns = HISTORY_TURNS) {
  const list = Array.isArray(messages) ? messages.filter((m) => m && m.role && m.role !== 'system') : [];
  const userIdx = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].role === 'user') userIdx.push(i);
  }
  if (userIdx.length <= maxTurns) return list;
  return list.slice(userIdx[userIdx.length - maxTurns]);
}

function resolveScene(userQuery, history, currentScene) {
  return scenes.resolveScene(userQuery, history, currentScene);
}

async function runAgent({ history, userQuery, aiConfig, ctx = {}, callLLM, onProgress }) {
  const q = String(userQuery || '').trim();
  if (!q) throw new Error('EMPTY_QUERY');
  if (!aiConfig || !aiConfig.token) throw new Error('NO_TOKEN');

  const scene = resolveScene(q, history, ctx.scene);
  const extraTools = scenes.toolsFor(scene);
  const tools = extraTools.length ? TOOLS.concat(extraTools) : TOOLS;
  const labels = extraTools.length ? { ...TOOL_LABELS, ...scenes.labelsFor(scene) } : TOOL_LABELS;
  const extraPrompt = scenes.promptFor(scene);
  const sys = extraPrompt ? SYSTEM_PROMPT + extraPrompt : SYSTEM_PROMPT;
  if (scene) logger.info('agent.scene', `${scene} on`);

  const messages = [
    { role: 'system', content: sys },
    ...trimByUserTurns(history || []),
    { role: 'user', content: q },
  ];

  const usageTotal = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolsUsed = [];
  const citations = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const result = await callLLM({
      baseUrl: aiConfig.baseUrl,
      token: aiConfig.token,
      model: aiConfig.model,
      messages,
      tools,
      jsonMode: false,
      temperature: 0.7,
      maxTokens: 800,
      timeoutMs: 20000,
    });
    if (result.usage) {
      usageTotal.prompt_tokens += result.usage.prompt_tokens || 0;
      usageTotal.completion_tokens += result.usage.completion_tokens || 0;
      usageTotal.total_tokens += result.usage.total_tokens || 0;
    }

    const calls = result.tool_calls || [];
    if (calls.length === 0) {
      const text = String(result.content || '').trim();
      if (!text) throw new Error('EMPTY_TEXT');
      messages.push({ role: 'assistant', content: text });
      logger.info('agent.run', `done steps=${step + 1} tools=${toolsUsed.join(',') || 'none'}`);
      return {
        text,
        toolsUsed,
        citations: citations.slice(0, 6),
        scene,
        usage: usageTotal,
        history: trimByUserTurns(messages.filter((m) => m.role !== 'system')),
      };
    }

    messages.push({
      role: 'assistant',
      content: result.content || '',
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = call.function?.name || call.name;
      const args = parseArgs(call.function?.arguments || call.arguments);
      const id = call.id || `call_${toolsUsed.length}`;
      logger.info('agent.tool', `name=${name}`);
      if (typeof onProgress === 'function') onProgress({ tool: name, label: labels[name] || name });
      toolsUsed.push(name);
      const out = executeTool(name, args, ctx);
      if (name === 'search_canon' && out && Array.isArray(out.results)) {
        for (const r of out.results) {
          if (!r || !r.ref) continue;
          const exists = citations.find((c) => c.ref === r.ref);
          if (!exists) citations.push({ ref: r.ref, book: r.book, title: r.title, text: r.text, matched: !!r.matched });
        }
      }
      messages.push({
        role: 'tool',
        tool_call_id: id,
        content: compact(out),
      });
    }
  }

  throw new Error('AGENT_MAX_STEPS');
}

module.exports = {
  TOOLS,
  TOOL_LABELS,
  SYSTEM_PROMPT,
  HISTORY_TURNS,
  executeTool,
  runAgent,
  publicHistory,
  parseArgs,
  trimByUserTurns,
  resolveScene,
  emptyAgentChat,
  SCENES: scenes.SCENES,
};
