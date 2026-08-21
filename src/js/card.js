// card.js - 运势卡片渲染器
// 接收主进程的 card-data 事件，按风格分发渲染

const content = document.getElementById('content');
const closeBtn = document.getElementById('close-btn');

let currentStyle = null;

// ---------- 工具 ----------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined) {
      node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

function stars(score, max = 5) {
  const wrap = el('span', { class: 'stars' });
  for (let i = 0; i < max; i++) {
    wrap.appendChild(document.createTextNode(i < score ? '★' : '☆'));
  }
  return wrap;
}

function dimBar(label, score, max = 100) {
  const pct = Math.round((score / max) * 100);
  return el('div', { class: 'dim-row' }, [
    el('span', { class: 'dim-label' }, [label]),
    el('div', { class: 'dim-value' }, [
      el('div', { class: 'dim-bar-bg' }, [
        el('div', { class: 'dim-bar', style: `width: ${pct}%` }),
      ]),
    ]),
    el('span', { class: 'dim-score' }, [String(score)]),
  ]);
}

function roman(n) {
  const map = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let r = '';
  let num = n;
  for (const [v, s] of map) {
    while (num >= v) { r += s; num -= v; }
  }
  return r;
}

// ---------- 5 种风格渲染器 ----------

function renderTraditional(f) {
  const wrap = el('div', { class: 'card-content' });

  wrap.appendChild(el('div', { class: 'style-label' }, ['传统中式']));
  wrap.appendChild(el('div', { class: 'date-label' }, [f.date]));
  wrap.appendChild(el('div', { class: 'title' }, ['今日运势']));
  wrap.appendChild(el('div', {}, [stars(f.score)]));

  // 各维度
  const dimsBox = el('div', { class: 'section' });
  dimsBox.appendChild(el('div', { class: 'section-title' }, ['各维度运势']));
  for (const [k, v] of Object.entries(f.dims)) {
    dimsBox.appendChild(el('div', { class: 'dim-row' }, [
      el('span', { class: 'dim-label' }, [k]),
      el('div', { class: 'dim-value' }, [
        el('span', { class: 'stars' }, [Array(v).fill('★').join('') + Array(5 - v).fill('☆').join('')]),
      ]),
      el('span', { class: 'dim-score' }, [`${v}/5`]),
    ]));
  }
  wrap.appendChild(dimsBox);

  // 幸运信息
  const luckBox = el('div', { class: 'section' });
  luckBox.appendChild(el('div', { class: 'section-title' }, ['今日幸运']));
  const luckRow = el('div', { style: 'display:flex; gap:8px; flex-wrap:wrap;' });
  luckRow.appendChild(el('div', { class: 'tag' }, [`幸运数字 ${f.luckyNum}`]));
  luckRow.appendChild(el('div', { class: 'tag' }, [`生肖 ${f.shengxiao}`]));
  const colorChip = el('div', { class: 'color-chip' }, [
    el('div', { class: 'color-dot', style: `background:${f.luckyColor.hex}` }),
    document.createTextNode(f.luckyColor.name),
  ]);
  luckRow.appendChild(colorChip);
  const wuxingChip = el('div', { class: 'color-chip' }, [
    el('div', { class: 'color-dot', style: `background:${f.wuxingColor.hex}` }),
    document.createTextNode(`${f.wuxingColor.element}行 ${f.wuxingColor.name}`),
  ]);
  luckRow.appendChild(wuxingChip);
  luckBox.appendChild(luckRow);
  wrap.appendChild(luckBox);

  // 宜
  const yiBox = el('div', { class: 'section' });
  yiBox.appendChild(el('div', { class: 'section-title' }, ['宜']));
  const yiList = el('div', { class: 'tag-list' });
  for (const item of f.yi) yiList.appendChild(el('span', { class: 'tag yi' }, [item]));
  yiBox.appendChild(yiList);
  wrap.appendChild(yiBox);

  // 忌
  const jiBox = el('div', { class: 'section' });
  jiBox.appendChild(el('div', { class: 'section-title' }, ['忌']));
  const jiList = el('div', { class: 'tag-list' });
  for (const item of f.ji) jiList.appendChild(el('span', { class: 'tag ji' }, [item]));
  jiBox.appendChild(jiList);
  wrap.appendChild(jiBox);

  return wrap;
}

function renderModern(f) {
  const wrap = el('div', { class: 'card-content' });

  wrap.appendChild(el('div', { class: 'style-label' }, ['现代简洁']));
  wrap.appendChild(el('div', { class: 'date-label' }, [f.date]));
  wrap.appendChild(el('div', { class: 'title' }, ['今日运势']));
  wrap.appendChild(el('div', {}, [stars(f.score)]));

  // 维度进度条
  const dimsBox = el('div', { class: 'section' });
  dimsBox.appendChild(el('div', { class: 'section-title' }, ['四维度评分']));
  for (const [k, v] of Object.entries(f.dims)) {
    dimsBox.appendChild(dimBar(k, v, 100));
    if (f.summaries && f.summaries[k]) {
      dimsBox.appendChild(el('div', { class: 'dim-summary' }, [f.summaries[k]]));
    }
  }
  wrap.appendChild(dimsBox);

  return wrap;
}

function renderLots(f) {
  const wrap = el('div', { class: 'card-content' });

  wrap.appendChild(el('div', { class: 'style-label' }, ['趣味抽签']));
  wrap.appendChild(el('div', { class: 'date-label' }, [f.date]));

  // 签筒 emoji + 动画
  wrap.appendChild(el('div', { class: 'lots-emoji' }, ['🥢']));

  wrap.appendChild(el('div', { class: 'lots-level' }, [f.level]));
  wrap.appendChild(el('div', { class: 'lots-poem' }, [f.poem]));

  wrap.appendChild(el('div', { class: 'section' }, [
    el('div', { class: 'section-title' }, ['解签']),
    el('div', { class: 'lots-interp' }, [f.interpretation]),
  ]));

  return wrap;
}

function renderTarot(f) {
  const wrap = el('div', { class: 'card-content' });

  wrap.appendChild(el('div', { class: 'style-label' }, ['星座塔罗']));
  wrap.appendChild(el('div', { class: 'date-label' }, [`${f.zodiac} · ${f.date}`]));
  wrap.appendChild(el('div', { class: 'title' }, [`${f.cardName} ${f.reversed ? '(逆位)' : '(正位)'}`]));

  const tarotCard = el('div', { class: `tarot-card${f.reversed ? ' reversed' : ''}` }, [
    el('div', { class: 'tarot-position' }, [f.reversed ? 'REVERSED' : 'UPRIGHT']),
    el('div', { class: 'roman' }, [roman(f.cardNum)]),
    el('div', { class: 'cname' }, [f.cardName]),
    el('div', { class: 'cen' }, [f.cardEn]),
  ]);
  wrap.appendChild(tarotCard);

  wrap.appendChild(el('div', { class: 'section' }, [
    el('div', { class: 'section-title' }, ['关键词']),
    el('div', { class: 'section-content' }, [f.cardKeyword]),
  ]));

  wrap.appendChild(el('div', { class: 'section' }, [
    el('div', { class: 'section-title' }, ['今日解读']),
    el('div', { class: 'section-content' }, [f.interpretation]),
  ]));

  wrap.appendChild(el('div', { class: 'section' }, [
    el('div', { class: 'section-title' }, ['你的星座']),
    el('div', { class: 'section-content' }, [`${f.zodiac} · 守护星 ${f.ruler} · ${f.element}象星座`]),
  ]));

  return wrap;
}

function renderPersonalized(f) {
  // 复用对应风格的渲染，但在顶部加 tagline
  let base;
  if (f.level) base = renderLots(f);
  else if (f.cardName) base = renderTarot(f);
  else if (f.yi) base = renderTraditional(f);
  else base = renderModern(f);
  // 顶部插入 tagline
  if (f.tagline) {
    const tag = el('div', { class: 'section', style: 'background:rgba(255, 220, 180, 0.4); margin-top:0;' }, [
      el('div', { class: 'section-content', style: 'font-style:italic; color:#8a4458;' }, [f.tagline]),
    ]);
    const title = base.querySelector('.title');
    if (title && title.nextSibling) {
      base.insertBefore(tag, title.nextSibling);
    } else if (title) {
      base.appendChild(tag);
    } else {
      base.insertBefore(tag, base.firstChild);
    }
  }
  return base;
}

// ---------- 第三阶段：3 个新 scope 渲染器 ----------

function renderMoment(f) {
  const wrap = el('div', { class: 'card-content card-bg-moment' });

  wrap.appendChild(el('div', { class: 'style-label' }, ['此刻运势']));
  wrap.appendChild(el('div', { class: 'date-label' }, [
    el('span', { class: 'hour-badge' }, [`${f.hourIcon || '⏰'} ${f.hourName || f.hour}`]),
    document.createTextNode(` · ${f.hourRange || ''} · ${f.date}`),
  ]));

  // 吉言大字号
  wrap.appendChild(el('div', { class: 'moment-quote' }, [f.luckyWord || '']));
  wrap.appendChild(el('div', { class: 'moment-guidance' }, [f.guidance || '']));

  // 宜 / 忌（简版，每条 1-2 个）
  const yjBox = el('div', { class: 'section moment-yj' });
  yjBox.appendChild(el('div', { class: 'moment-yj-row' }, [
    el('span', { class: 'moment-yi-label' }, ['宜']),
    el('div', { class: 'tag-list' },
      (f.yi || []).map((it) => el('span', { class: 'tag yi' }, [it]))
    ),
  ]));
  yjBox.appendChild(el('div', { class: 'moment-yj-row' }, [
    el('span', { class: 'moment-ji-label' }, ['忌']),
    el('div', { class: 'tag-list' },
      (f.ji || []).map((it) => el('span', { class: 'tag ji' }, [it]))
    ),
  ]));
  wrap.appendChild(yjBox);

  // 幸运色
  if (f.luckyColor) {
    wrap.appendChild(el('div', { class: 'moment-lucky' }, [
      el('div', { class: 'color-dot', style: `background:${f.luckyColor.hex}` }),
      document.createTextNode(`今日幸运色：${f.luckyColor.name}`),
    ]));
  }

  return wrap;
}

function renderTomorrow(f) {
  // 复用 modern 的渲染，但顶部加 tomorrowHint
  const base = renderModern(f);
  if (f.tomorrowHint) {
    const hint = el('div', { class: 'section tomorrow-hint' }, [
      el('div', { class: 'section-content', style: 'font-style:italic; color:#5a4a8a;' }, [f.tomorrowHint]),
    ]);
    const title = base.querySelector('.title');
    if (title && title.nextSibling) {
      base.insertBefore(hint, title.nextSibling);
    } else if (title) {
      base.appendChild(hint);
    } else {
      base.insertBefore(hint, base.firstChild);
    }
  }
  // 把 styleLabel 改成"明日运势"
  const lbl = base.querySelector('.style-label');
  if (lbl) lbl.textContent = '明日运势';
  base.classList.add('card-bg-tomorrow');
  return base;
}

function renderWeek(f) {
  const wrap = el('div', { class: 'card-content card-bg-week' });

  wrap.appendChild(el('div', { class: 'style-label' }, ['本周运势']));
  wrap.appendChild(el('div', { class: 'date-label' }, [`${f.isoWeek || ''} · 起始 ${f.date}`]));
  wrap.appendChild(el('div', { class: 'title' }, ['七天运势一览']));
  wrap.appendChild(el('div', {}, [stars(f.score)]));

  const daysBox = el('div', { class: 'section week-days' });
  for (const d of (f.days || [])) {
    const row = el('div', { class: 'week-day-row' + (d.isToday ? ' today' : '') }, [
      el('span', { class: 'week-day-weekday' }, [d.weekday]),
      el('span', { class: 'week-day-date' }, [d.date]),
      el('span', { class: 'week-day-stars' }, [
        '★'.repeat(d.score) + '☆'.repeat(5 - d.score),
      ]),
      el('span', { class: 'week-day-hint' }, [d.hint]),
    ]);
    daysBox.appendChild(row);
  }
  wrap.appendChild(daysBox);

  if (f.weeklyHint) {
    wrap.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-title' }, ['本周提提示']),
      el('div', { class: 'section-content', style: 'font-style:italic; color:#3a5a8a;' }, [f.weeklyHint]),
    ]));
  }

  return wrap;
}

// ---------- 调度 ----------
const RENDERERS = {
  traditional: renderTraditional,
  modern: renderModern,
  lots: renderLots,
  tarot: renderTarot,
  personalized: renderPersonalized,
  moment: renderMoment,
  tomorrow: renderTomorrow,
  week: renderWeek,
};

function render(style, fortune) {
  content.innerHTML = '';
  // AI 提问卡片走专属渲染
  if (style === 'ai-ask') {
    renderAiAsk(fortune);
    return;
  }
  const renderer = RENDERERS[style] || renderModern;
  try {
    const node = renderer(fortune);
    content.appendChild(node);
    window.logger.info('card.render', `style=${style}`);
  } catch (e) {
    console.error('渲染失败:', e);
    window.logger.error('card.render', `failed style=${style}: ${e.message}`);
    content.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-content' }, [`渲染出错: ${e.message}`]),
    ]));
  }

  // AI 解读占位（异步追加）
  content.appendChild(el('div', { class: 'ai-interpretation', id: 'ai-block', style: 'display:none;' }));

  // 操作栏
  const actions = el('div', { class: 'actions' }, [
    el('button', { class: 'action-btn primary', onclick: handleRedraw }, ['换一种风格']),
    el('button', { class: 'action-btn', onclick: handleClose }, ['关闭']),
  ]);
  content.appendChild(actions);
}

// AI 提问卡片（用户右键球提问的场景）
function renderAiAsk(fortune) {
  window.logger.info('card.renderAiAsk', `query=${(fortune.query || '').slice(0, 30)}`);
  const wrap = el('div', { class: 'card-content' });
  wrap.appendChild(el('div', { class: 'style-label' }, ['AI 解读']));
  wrap.appendChild(el('div', { class: 'date-label' }, [fortune.date || '']));
  wrap.appendChild(el('div', { class: 'title' }, ['你的问题']));
  wrap.appendChild(el('div', { class: 'ai-question' }, [fortune.query || '']));

  wrap.appendChild(el('div', { class: 'section' }, [
    el('div', { class: 'section-title' }, ['解读']),
    el('div', { class: 'section-content', style: 'line-height:1.7;' }, [fortune.text || '']),
  ]));

  content.appendChild(wrap);

  // 操作栏
  const actions = el('div', { class: 'actions' }, [
    el('button', { class: 'action-btn', onclick: handleClose }, ['关闭']),
  ]);
  content.appendChild(actions);
}

async function handleRedraw() {
  window.logger.info('card.redraw', `from=${currentStyle}`);
  // 通知主进程记一次手动切换（每 5 次会临时降权）
  if (currentStyle) {
    await window.api.manualSwitch(currentStyle);
  }
  // 关闭当前卡片，触发重新抽签
  await window.api.closeCard();
  // 通过球点击触发新的抽签：直接调用 draw-fortune IPC 然后重新打开
  const result = await window.api.drawFortune();
  if (result) {
    currentStyle = result.style;
    render(result.style, result.fortune);
  }
}

// AI 解读异步追加
function appendAiInterpretation(text, usage) {
  window.logger.info('card.aiAppend', `tokens=${usage && usage.total_tokens || '?'}`);
  const block = document.getElementById('ai-block');
  if (!block) return;
  block.style.display = '';
  block.innerHTML = '';
  block.appendChild(el('div', { class: 'ai-header' }, [
    el('span', {}, ['🤖']),
    el('span', {}, ['AI 解读']),
    usage && usage.total_tokens ? el('span', { class: 'ai-usage' }, [`${usage.total_tokens} tokens`]) : null,
  ]));
  block.appendChild(el('div', { class: 'ai-text' }, [text]));
  // 淡入
  block.style.opacity = '0';
  block.style.transition = 'opacity 0.4s';
  requestAnimationFrame(() => { block.style.opacity = '1'; });
}

async function handleClose() {
  window.logger.info('card.close', `style=${currentStyle}`);
  await window.api.closeCard();
}

// ---------- 监听主进程 ----------
window.api.onCardData(({ style, fortune: fortuneData }) => {
  window.logger.info('card.onData', `style=${style}`);
  currentStyle = style;
  render(style, fortuneData);
  // 通知主进程卡片打开（用于统计 view_seconds）
  window.api.cardOpened();
});

// 关闭按钮
closeBtn.addEventListener('click', handleClose);

// 卡片隐藏时通知主进程记录 view_seconds
window.addEventListener('beforeunload', () => {
  window.logger.info('card.lifecycle', 'beforeunload');
  if (currentStyle) {
    window.api.cardClosed(currentStyle);
  }
});

// 兜底：用 visibilitychange 也触发一次
document.addEventListener('visibilitychange', () => {
  if (document.hidden && currentStyle) {
    window.logger.info('card.lifecycle', 'visibilitychange hidden');
    window.api.cardClosed(currentStyle);
  }
});

// 监听 AI 解读追加事件
window.api.onAiInterpretationReady((payload) => {
  window.logger.info('card.aiReady', `text length=${(payload.text || '').length}`);
  appendAiInterpretation(payload.text, payload.usage);
});
