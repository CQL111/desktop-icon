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
  if (f.luckyColor && f.luckyColor.hex) {
    luckRow.appendChild(el('div', { class: 'color-chip' }, [
      el('div', { class: 'color-dot', style: `background:${f.luckyColor.hex}` }),
      document.createTextNode(f.luckyColor.name || ''),
    ]));
  }
  if (f.wuxingColor && f.wuxingColor.hex) {
    luckRow.appendChild(el('div', { class: 'color-chip' }, [
      el('div', { class: 'color-dot', style: `background:${f.wuxingColor.hex}` }),
      document.createTextNode(`${f.wuxingColor.element || ''}行 ${f.wuxingColor.name || ''}`),
    ]));
  }
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
    const tag = el('div', { class: 'section', style: 'background:var(--accent-gold-soft); border:1px solid var(--glass-hairline); margin-top:0;' }, [
      el('div', { class: 'section-content', style: 'font-style:italic; color:var(--text-2);' }, [f.tagline]),
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
      el('div', { class: 'section-content', style: 'font-style:italic; color:var(--text-2);' }, [f.tomorrowHint]),
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
      el('div', { class: 'section-content', style: 'font-style:italic; color:var(--text-2);' }, [f.weeklyHint]),
    ]));
  }

  return wrap;
}

// ---------- 个人测算 ----------
function renderProfile(f) {
  const wrap = el('div', { class: 'card-content card-bg-profile' });

  wrap.appendChild(el('div', { class: 'style-label' }, [f.styleLabel || '个人测算']));
  wrap.appendChild(el('div', { class: 'date-label' }, [f.birthday ? `${f.birthday} · ${f.gender} · ${f.tzOrientation}方位` : '']));

  // NO_BIRTHDAY 错误态
  if (f.error === 'NO_BIRTHDAY') {
    wrap.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-title' }, ['未设置生日']),
      el('div', { class: 'section-content' }, ['请先在设置中填写生日，才能进行个人测算。']),
    ]));
    return wrap;
  }

  wrap.appendChild(el('div', { class: 'title' }, [f.modeLabel]));
  wrap.appendChild(el('div', {}, [stars(f.score)]));

  // 基本信息行
  const infoRow = el('div', { class: 'profile-tags' }, [
    el('span', { class: 'tag' }, [`🐲 ${f.shengxiao}`]),
    el('span', { class: 'tag' }, [`${f.zodiac}`]),
    el('span', { class: 'tag' }, [`${f.tzWuxing}方位`]),
  ]);
  wrap.appendChild(infoRow);

  // mode 专属区块
  if (f.mode === 'bazi') {
    wrap.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-title' }, ['八字简排']),
      el('div', { class: 'bazi-row' }, [`年柱 ${f.yearGanZhi} · 月支 ${f.monthZhi}`]),
      el('div', { class: 'bazi-row' }, [
        '五行分布 ' + Object.entries(f.wuxingDist || {}).map(([k, v]) => `${k}${v}`).join(' '),
      ]),
      el('div', { class: 'bazi-row' }, [`主属性 ${f.dominantLabel}`]),
    ]));
  } else if (f.mode === 'zodiac') {
    wrap.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-title' }, [`${f.zodiac} · 性格`]),
      el('div', { class: 'section-content' }, [f.zodiacTraits]),
      el('div', { class: 'section-content', style: 'font-style:italic;color:var(--text-2);margin-top:6px;' }, [f.zodiacLuck]),
    ]));
  } else {
    wrap.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-title' }, ['性格标签']),
      el('div', { class: 'tag-list' }, (f.personalityTags || []).map((t) => el('span', { class: 'tag' }, [t]))),
    ]));
    if (f.comprehensiveHint) {
      wrap.appendChild(el('div', { class: 'section' }, [
        el('div', { class: 'section-content', style: 'font-style:italic;color:var(--text-2);' }, [f.comprehensiveHint]),
      ]));
    }
  }

  // 幸运
  if (f.luckyNum || f.luckyColor) {
    wrap.appendChild(el('div', { class: 'section' }, [
      el('div', { class: 'section-title' }, ['今日幸运']),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
        f.luckyNum ? el('div', { class: 'tag' }, [`幸运数字 ${f.luckyNum}`]) : null,
        f.luckyColor ? el('div', { class: 'color-chip' }, [
          el('div', { class: 'color-dot', style: `background:${f.luckyColor.hex}` }),
          document.createTextNode(f.luckyColor.name),
        ]) : null,
      ]),
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
  profile: renderProfile,
};

function render(style, fortune, opts = {}) {
  content.innerHTML = '';
  content.classList.toggle('reveal-in', !!opts.reveal);
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

  // 黄历头部（今日黄历 / 今日个人运势 都含 almanac）
  if (fortune && fortune.almanac) {
    content.appendChild(renderAlmanacBar(fortune.almanac));
  }

  // 精灵加成提示（运势顶部）
  if (fortune && fortune.boost) {
    content.appendChild(renderBoostBar(fortune.boost));
  }

  // AI 解读占位（异步追加）
  content.appendChild(el('div', { class: 'ai-interpretation', id: 'ai-block', style: 'display:none;' }));

  // 操作栏
  const actions = el('div', { class: 'actions' }, [
    style === 'profile'
      ? el('button', { class: 'action-btn primary', onclick: handleProfileDecode }, ['🔮 解算'])
      : null,
    ['traditional', 'modern', 'lots', 'tarot', 'personalized'].includes(style)
      ? el('button', { class: 'action-btn', onclick: handleRedraw }, ['换一换'])
      : null,
    el('button', { class: 'action-btn', onclick: handleClose }, ['关闭']),
  ]);
  content.appendChild(actions);

  // 揭晓入场：标题逐字、内容逐行、卡片扫光（替代原来球窗口里的小揭晓卡）
  if (opts.reveal) applyRevealStagger();
}

// 揭晓入场：给标题逐字、其余块逐行加延迟；再触发卡片扫光
function applyRevealStagger() {
  const title = content.querySelector('.title');
  if (title) {
    const text = title.textContent || '';
    title.textContent = '';
    Array.from(text).forEach((ch, i) => {
      const span = document.createElement('span');
      span.textContent = ch;
      span.className = 'rv-ch';
      span.style.animationDelay = (0.06 + i * 0.045) + 's';
      title.appendChild(span);
    });
  }
  // 除标题外的主要块依次上浮
  const blocks = content.querySelectorAll(':scope > .card-content > *, :scope > .section, :scope > .almanac-bar, :scope > .boost-bar');
  blocks.forEach((node, i) => {
    if (node.querySelector('.rv-ch')) return;
    node.classList.add('rv-up');
    node.style.animationDelay = (0.12 + Math.min(i, 8) * 0.06) + 's';
  });
  // 卡片扫光
  const card = document.getElementById('card');
  if (card) {
    card.classList.remove('shine');
    void card.offsetWidth;
    card.classList.add('shine');
  }
}

// 今日黄历头部
function renderAlmanacBar(al) {
  const wrap = el('div', { class: 'almanac-bar' });
  // 第一行：农历 + 干支 + 生肖
  wrap.appendChild(el('div', { class: 'almanac-head' }, [
    al.lunarText ? el('span', { class: 'almanac-lunar' }, [al.lunarText]) : null,
    el('span', { class: 'almanac-ganzhi' }, [al.yearGanzhi]),
    el('span', { class: 'almanac-shengxiao' }, [`${al.shengxiao}年`]),
  ]));
  // 第二行：节气 / 日干支 / 建除 / 黄黑道
  const meta = el('div', { class: 'almanac-meta' });
  if (al.term) meta.appendChild(el('span', { class: 'almanac-tag term' }, [al.term]));
  if (al.dayGanzhi) meta.appendChild(el('span', { class: 'almanac-tag' }, [`${al.dayGanzhi}日`]));
  if (al.jianchu) meta.appendChild(el('span', { class: 'almanac-tag' }, [`${al.jianchu}日`]));
  if (al.huangdaoText) {
    meta.appendChild(el('span', { class: 'almanac-tag ' + (al.huangdao ? 'good' : 'bad') }, [al.huangdaoText]));
  }
  if (meta.childNodes.length) wrap.appendChild(meta);
  // 宜
  if (al.yi && al.yi.length) {
    wrap.appendChild(el('div', { class: 'almanac-row' }, [
      el('span', { class: 'almanac-yi' }, ['宜']),
      document.createTextNode(' ' + al.yi.join(' · ')),
    ]));
  }
  // 忌
  if (al.ji && al.ji.length) {
    wrap.appendChild(el('div', { class: 'almanac-row' }, [
      el('span', { class: 'almanac-ji' }, ['忌']),
      document.createTextNode(' ' + al.ji.join(' · ')),
    ]));
  }
  // 冲煞 + 吉时
  if (al.chong || (al.luckyHours && al.luckyHours.length)) {
    const extra = el('div', { class: 'almanac-row almanac-extra' });
    if (al.chong) extra.appendChild(el('span', { class: 'almanac-chong' }, [al.chong]));
    if (al.luckyHours && al.luckyHours.length) {
      extra.appendChild(el('span', { class: 'almanac-hours' }, [`吉时 ${al.luckyHours.slice(0, 4).join(' ')}`]));
    }
    wrap.appendChild(extra);
  }
  // 幸运
  if (al.luckyColor || al.luckyNum) {
    const luckRow = el('div', { class: 'almanac-row almanac-luck' });
    if (al.luckyNum) luckRow.appendChild(el('span', {}, [`幸运数字 ${al.luckyNum}`]));
    if (al.luckyColor) {
      luckRow.appendChild(el('span', { class: 'color-chip', style: 'margin-left:8px;' }, [
        el('span', { class: 'color-dot', style: `background:${al.luckyColor.hex}` }),
        document.createTextNode(al.luckyColor.name),
      ]));
    }
    wrap.appendChild(luckRow);
  }
  // 免责说明
  if (al.yiJiNote) {
    wrap.appendChild(el('div', { class: 'almanac-note' }, [al.yiJiNote]));
  }
  return wrap;
}

// 运势精灵加持提示条（五项维度）
function renderBoostBar(boost) {
  const applied = boost.applied || [];
  const items = [];
  // 各项维度加持
  const icons = { 综合: '⭐', 爱情: '❤️', 事业: '💼', 财运: '💰', 健康: '🌿' };
  for (const a of applied) {
    // a 形如 "财运+1"
    const dim = a.replace(/\+.+$/, '');
    items.push({ icon: icons[dim] || '✨', text: `${dim}加持 ${a.replace(/^.+(\+\d+)$/, '$1')}`, cls: 'boost-good' });
  }
  if (applied.length === 0) {
    items.push({ icon: '🔮', text: '运势精灵：暂无加持（祈福或移动球到方位可提升）', cls: 'boost-info' });
  } else if (boost.posWuxing) {
    const names = { water: '文昌位', wood: '事业位', metal: '财位', fire: '桃花位', earth: '健康位' };
    items.push({ icon: '📌', text: `球在${names[boost.posWuxing] || boost.posWuxing}，持续积累中`, cls: 'boost-info' });
  }
  const wrap = el('div', { class: 'boost-bar' });
  for (const it of items) {
    wrap.appendChild(el('div', { class: 'boost-item ' + it.cls }, [
      el('span', {}, [it.icon]),
      document.createTextNode(' ' + it.text),
    ]));
  }
  return wrap;
}

// 个人测算"解算"：对当前档案做一次深度 AI 解读
async function handleProfileDecode() {
  window.logger.info('card.profileDecode', 'start');
  try {
    const result = await window.api.aiInterpretAsk({ profile: true });
    if (result.ok && result.text) {
      window.logger.info('card.profileDecode', 'done');
      appendAiInterpretation(result.text, null);
    } else if (result.error === 'NO_BIRTHDAY') {
      window.logger.warn('card.profileDecode', 'NO_BIRTHDAY');
      appendAiInterpretation('请先在设置中填写生日，才能解算。', null);
    } else {
      window.logger.warn('card.profileDecode', `failed: ${result.error}`);
      appendAiInterpretation(`解算失败：${result.error || '未知错误'}`, null);
    }
  } catch (e) {
    window.logger.error('card.profileDecode', e.message);
    appendAiInterpretation(`解算失败：${e.message}`, null);
  }
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
  // 注意：主进程 closeCard() 只会 hide，卡片文本会残留；
  // 这里重新 draw 后通过 card-data 事件触发重新渲染，不需要手动关窗
  // force=true：跳过当天缓存，换一种风格
  const result = await window.api.drawFortune({ force: true });
  if (result) {
    currentStyle = result.style;
    render(result.style, result.fortune, { reveal: true });
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
window.api.onCardData(({ style, fortune: fortuneData, reveal }) => {
  window.logger.info('card.onData', `style=${style} reveal=${!!reveal}`);
  currentStyle = style;
  render(style, fortuneData, { reveal: !!reveal });
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

// AI 不可用提示：显示在 AI 区块的位置，点击打开设置
function appendAiStatus(kind, text) {
  const block = document.getElementById('ai-block');
  if (!block) return;
  block.style.display = '';
  block.innerHTML = '';
  const hint = el('div', { class: 'ai-status-hint', title: '打开设置' }, [
    el('span', {}, ['🤖']),
    document.createTextNode(' ' + (text || 'AI 解读不可用')),
  ]);
  hint.addEventListener('click', (e) => {
    e.stopPropagation();
    window.api.openSettings();
  });
  block.appendChild(hint);
  block.style.opacity = '0';
  block.style.transition = 'opacity 0.4s';
  requestAnimationFrame(() => { block.style.opacity = '1'; });
}

window.api.onAiStatus((payload) => {
  if (!payload) return;
  if (payload.style && currentStyle && payload.style !== currentStyle) return;
  window.logger.info('card.aiStatus', `kind=${payload.kind || 'unknown'}`);
  appendAiStatus(payload.kind, payload.text);
});

// 监听 AI 解读追加事件（带 style 校验，避免上一张卡片的解读串到新卡片上）
window.api.onAiInterpretationReady((payload) => {
  if (payload && payload.style && currentStyle && payload.style !== currentStyle) {
    window.logger.info('card.aiReady', `stale style=${payload.style} (now ${currentStyle})`);
    return;
  }
  window.logger.info('card.aiReady', `text length=${(payload.text || '').length}`);
  appendAiInterpretation(payload.text, payload.usage);
});
