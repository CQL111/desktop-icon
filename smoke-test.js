// smoke-test.js - 核心模块单元烟雾测试
const behavior = require('./src/js/behavior');
const fortune = require('./src/js/fortune');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.log('  ✗', msg); }
}

// === behavior.js ===
console.log('\n[behavior.js]');
assert(behavior.STYLES.length === 5, 'STYLES 有 5 个');
assert(behavior.STYLES.includes('traditional'), '包含 traditional');
assert(behavior.STYLES.includes('modern'), '包含 modern');
assert(behavior.STYLES.includes('lots'), '包含 lots');
assert(behavior.STYLES.includes('tarot'), '包含 tarot');
assert(behavior.STYLES.includes('personalized'), '包含 personalized');

// 冷启动应该均匀轮询
const empty = {};
for (let i = 0; i < 5; i++) {
  const picked = behavior.pickStyle(empty);
  assert(behavior.STYLES.includes(picked), `轮询第 ${i} 次返回 ${picked}`);
}

// 模拟用户反复点击 lots
const b1 = {};
for (let i = 0; i < 20; i++) behavior.recordInteraction(b1, 'lots', 30);
const scores = behavior.scoreAll(b1, Date.now());
assert(scores.lots > scores.modern, `lots 分数 (${scores.lots.toFixed(2)}) 应高于 modern (${scores.modern.toFixed(2)})`);

// softmax 应该偏向 lots
const chosenStyle = behavior.pickStyle(b1);
assert(chosenStyle === 'lots', `行为指向时 pickStyle 应选 lots，实际: ${chosenStyle}`);

// 时间衰减
const oldDate = Date.now() - 30 * 86400000; // 30 天前
const b2 = { lots: { clicks: 10, view_seconds: 100, last_seen: oldDate } };
const decayed = behavior.scoreStyle('lots', b2, Date.now());
const fresh = behavior.scoreStyle('lots', { lots: { clicks: 10, view_seconds: 100, last_seen: Date.now() } });
assert(decayed < fresh, `30 天前的分数 (${decayed.toFixed(3)}) 应低于新鲜的 (${fresh.toFixed(3)})`);

// === fortune.js ===
console.log('\n[fortune.js]');
assert(typeof fortune.getTodayKey === 'function', 'getTodayKey 是函数');
const todayKey = fortune.getTodayKey();
assert(/^\d{4}-\d{2}-\d{2}$/.test(todayKey), `todayKey 格式正确: ${todayKey}`);

// 5 种风格都能生成
for (const style of behavior.STYLES) {
  const data = fortune.generate(style, { dateKey: todayKey, zodiac: 'scorpio' });
  assert(data.style === style, `${style}: 风格标记正确`);
  assert(typeof data.score === 'number' && data.score >= 1 && data.score <= 5, `${style}: score 在 1-5 (${data.score})`);
  assert(['happy', 'neutral', 'sad'].includes(data.mood), `${style}: mood 合法 (${data.mood})`);
  assert(data.date === todayKey, `${style}: 日期正确`);
}

// 同日同风格 → 同结果（seeded）
const d1 = fortune.generate('traditional', { dateKey: '2026-08-20', zodiac: null });
const d2 = fortune.generate('traditional', { dateKey: '2026-08-20', zodiac: null });
assert(JSON.stringify(d1) === JSON.stringify(d2), '同日同风格结果稳定');

// 不同日 → 不同结果
const d3 = fortune.generate('modern', { dateKey: '2026-08-20', zodiac: null });
const d4 = fortune.generate('modern', { dateKey: '2026-08-21', zodiac: null });
assert(JSON.stringify(d3) !== JSON.stringify(d4), '不同日结果不同');

// 各风格特定字段
const trad = fortune.generate('traditional', { dateKey: todayKey, zodiac: null });
assert(trad.dims && trad.dims.综合, 'traditional 有 dims.综合');
assert(trad.luckyNum >= 1 && trad.luckyNum <= 9, 'traditional luckyNum 1-9');
assert(Array.isArray(trad.yi) && trad.yi.length > 0, 'traditional 有 yi 列表');
assert(Array.isArray(trad.ji) && trad.ji.length > 0, 'traditional 有 ji 列表');
assert(trad.luckyColor && /^#[0-9a-f]{6}$/i.test(trad.luckyColor.hex), 'traditional 有 luckyColor.hex');

const modern = fortune.generate('modern', { dateKey: todayKey, zodiac: null });
assert(modern.dims.感情 >= 30 && modern.dims.感情 <= 100, 'modern 感情分 30-100');
assert(modern.summaries && modern.summaries.感情, 'modern 有 summaries.感情');
assert(modern.luckyColor && /^#[0-9a-f]{6}$/i.test(modern.luckyColor.hex), 'modern 有 luckyColor.hex');

const lot = fortune.generate('lots', { dateKey: todayKey, zodiac: null });
assert(['上上签','上签','中签','中下签','下签'].includes(lot.level), `lots level 合法 (${lot.level})`);
assert(lot.poem && lot.interpretation, 'lots 有签文和解签');
assert(lot.luckyColor && /^#[0-9a-f]{6}$/i.test(lot.luckyColor.hex), 'lots 有 luckyColor.hex');

const taro = fortune.generate('tarot', { dateKey: todayKey, zodiac: null });
assert(taro.cardName, `tarot cardName: ${taro.cardName}`);
assert(typeof taro.reversed === 'boolean', 'tarot reversed 是布尔');
assert(taro.zodiac, `tarot zodiac: ${taro.zodiac}`);
assert(taro.luckyColor && /^#[0-9a-f]{6}$/i.test(taro.luckyColor.hex), 'tarot 有 luckyColor.hex');

// 个性化在交互不足时退化到 modern
const persCold = fortune.generate('personalized', { dateKey: todayKey, zodiac: null, totalClicks: 3 });
assert(persCold.style === 'personalized', 'personalized cold-start style 标记为 personalized');

// 个性化在交互充足时保留 tagline
const persHot = fortune.generate('personalized', { dateKey: todayKey, zodiac: null, totalClicks: 20, topStyles: ['lots', 'modern'] });
assert(persHot.tagline, 'personalized hot 有 tagline');

// ===== 第三阶段：3 个新 scope 生成器 =====

// 此刻 (moment)
const momentF = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申' });
assert(momentF.style === 'moment', 'moment style 正确');
assert(momentF.styleLabel === '此刻个人运势', 'moment styleLabel 正确');
assert(momentF.hour === '申', 'moment hour 正确');
assert(typeof momentF.luckyWord === 'string' && momentF.luckyWord.length > 0, 'moment luckyWord 存在');
assert(typeof momentF.guidance === 'string' && momentF.guidance.length > 0, 'moment guidance 存在');
assert(Array.isArray(momentF.yi) && momentF.yi.length >= 1, 'moment yi 数组');
assert(Array.isArray(momentF.ji) && momentF.ji.length >= 1, 'moment ji 数组');
assert(momentF.luckyColor && momentF.luckyColor.hex, 'moment luckyColor.hex 存在');
assert(momentF.score >= 1 && momentF.score <= 5, 'moment score 1-5');

// 不同时辰 → 不同内容
const momentF2 = fortune.genHourFortune({ dateKey: todayKey, hourKey: '子' });
assert(momentF.luckyWord !== momentF2.luckyWord || momentF.guidance !== momentF2.guidance, '不同时辰产出不同');

// 明日 (tomorrow)
const tomorrowF = fortune.genTomorrowFortune({ dateKey: '2026-08-22' });
assert(tomorrowF.style === 'tomorrow', 'tomorrow style 正确');
assert(tomorrowF.styleLabel === '明日运势', 'tomorrow styleLabel 正确');
assert(tomorrowF.date === '2026-08-22', 'tomorrow dateKey 正确');
assert(tomorrowF.dims && tomorrowF.dims.感情 !== undefined, 'tomorrow dims.感情 存在');
assert(typeof tomorrowF.tomorrowHint === 'string', 'tomorrow hint 存在');
assert(tomorrowF.luckyColor && tomorrowF.luckyColor.hex, 'tomorrow luckyColor.hex 存在');

// 本周 (week)
const weekF = fortune.genWeekFortune({ dateKey: todayKey });
assert(weekF.style === 'week', 'week style 正确');
assert(weekF.styleLabel === '本周运势', 'week styleLabel 正确');
assert(Array.isArray(weekF.days) && weekF.days.length === 7, 'week days 长度=7');
assert(weekF.days[0].weekday === '周一' && weekF.days[6].weekday === '周日', 'week 周一-周日顺序');
const todayEntry = weekF.days.find((d) => d.isToday);
assert(todayEntry, 'week 标记了今天');
assert(typeof weekF.weeklyHint === 'string', 'week weeklyHint 存在');
assert(weekF.isoWeek && /^[\d-]+-W\d+$/.test(weekF.isoWeek), 'week isoWeek 格式');

// 工具
assert(typeof fortune.getCurrentHourKey() === 'string', 'getCurrentHourKey 返回字符串');
assert(typeof fortune.getIsoWeek(new Date()) === 'string', 'getIsoWeek 返回字符串');
const hourInfo = fortune.getHourInfo('申');
assert(hourInfo && hourInfo.name === '申时', 'getHourInfo 申时正确');

// ===== 第六阶段：个人测算 =====
const persona = require('./src/js/data/persona');
assert(persona.getShengxiao(1995) === '猪', 'persona 1995=猪');
assert(persona.getShengxiao(2008) === '鼠', 'persona 2008=鼠');
assert(persona.getYearGanzhi(1984) === '甲子', 'persona 1984=甲子');
assert(persona.getMonthZhi(7) === '未', 'persona 7月=未');
const tzInfo = persona.getTimeZoneOrientation();
assert(tzInfo && tzInfo.orientation, 'persona 时区方位存在');

const profile = { birthday: '1995-07-20', gender: 'female' };
const profComp = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'comprehensive' });
assert(profComp.style === 'profile', 'profile comprehensive style');
assert(profComp.mode === 'comprehensive', 'profile comprehensive mode');
assert(profComp.shengxiao === '猪', 'profile 生肖');
assert(profComp.zodiac === '巨蟹座', 'profile 星座 1995-07-20=巨蟹');
assert(Array.isArray(profComp.personalityTags) && profComp.personalityTags.length > 0, 'profile 性格标签');
assert(profComp.luckyColor && profComp.luckyColor.hex, 'profile 幸运色');

const profBazi = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'bazi' });
assert(profBazi.mode === 'bazi', 'profile bazi mode');
assert(profBazi.yearGanZhi === '乙亥', 'profile 年柱 1995=乙亥');
assert(profBazi.monthZhi === '未', 'profile 月支 7月=未');
assert(profBazi.wuxingDist && Object.keys(profBazi.wuxingDist).length === 5, 'profile 五行分布 5 行');
assert(profBazi.dominantLabel, 'profile 主属性');

const profZodiac = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'zodiac' });
assert(profZodiac.mode === 'zodiac', 'profile zodiac mode');
assert(profZodiac.zodiacTraits && profZodiac.zodiacTraits.length > 0, 'profile 星座性格');

// NO_BIRTHDAY
let threw = false;
try { fortune.genProfile({ dateKey: todayKey, profile: {}, profileMode: 'comprehensive' }); }
catch (e) { threw = e.message === 'NO_BIRTHDAY'; }
assert(threw, 'profile 无生日抛 NO_BIRTHDAY');

// ===== 第六阶段：今日黄历 =====
const almanac = fortune.genAlmanac({ dateKey: '2026-08-24' });
assert(almanac.style === 'almanac', 'almanac style');
assert(almanac.styleLabel === '今日黄历', 'almanac 标题');
assert(almanac.yearGanzhi === '丙午', 'almanac 2026=丙午');
assert(almanac.shengxiao === '马', 'almanac 2026=马');
assert(Array.isArray(almanac.yi) && almanac.yi.length >= 3, 'almanac 宜至少 3 条');
assert(Array.isArray(almanac.ji) && almanac.ji.length >= 3, 'almanac 忌至少 3 条');
assert(almanac.luckyColor && almanac.luckyColor.hex, 'almanac 幸运色');
assert(almanac.luckyNum >= 1 && almanac.luckyNum <= 9, 'almanac 幸运数字 1-9');

// profile 融合黄历
const profWithAlmanac = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'comprehensive' });
assert(profWithAlmanac.styleLabel === '今日个人运势', 'profile 标题改为今日个人运势');
assert(profWithAlmanac.almanac && profWithAlmanac.almanac.yearGanzhi, 'profile 含黄历数据');

// moment 融合个人
const momentWithProfile = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申', profile });

const mA = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申', installId: 'id-aaa' });
const mB = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申', installId: 'id-bbb' });
const mA2 = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申', installId: 'id-aaa' });
assert(JSON.stringify(mA) === JSON.stringify(mA2), '同 installId 此刻运势稳定');
assert(JSON.stringify(mA) !== JSON.stringify(mB), '不同 installId 此刻运势不同');
const tA = fortune.generate('traditional', { dateKey: '2026-08-20', installId: 'id-aaa' });
const tB = fortune.generate('traditional', { dateKey: '2026-08-20', installId: 'id-bbb' });
assert(JSON.stringify(tA) !== JSON.stringify(tB), '不同 installId 今日运势不同');
assert(momentWithProfile.styleLabel === '此刻个人运势', 'moment 标题改为此刻个人运势');
assert(momentWithProfile.personal && momentWithProfile.personal.shengxiao === '猪', 'moment 含个人生肖');

// ===== 第七阶段：运势精灵 =====
const spirit = require('./src/js/fortuneSpirit');
let sp = spirit.defaultSpirit();
assert(sp.boosts.综合 === 0 && sp.boosts.财运 === 0, 'spirit 初始加持全 0');
assert(spirit.DIMENSIONS.length === 5, 'spirit 五项维度');

// 摆位积累
sp = spirit.applyPosition(sp, 'metal', Date.now());  // 进入财位
assert(sp.positionWuxing === 'metal', 'spirit 摆位记录方位');
sp.positionSince = Date.now() - 6 * 60 * 1000;       // 模拟停留6分钟
sp = spirit.applyPosition(sp, 'metal', Date.now());
assert(sp.boosts.财运 === 1, 'spirit 摆位6分钟财运+1');

// 祈福
let br = spirit.bless(sp, '财运', '2026-08-24', Date.now());
assert(br.ok !== false && br.boost === 2, 'spirit 祈福财运+1（累计2）');
assert(br.remaining === 2, 'spirit 祈福后剩余2次');

// 每日限次
let sp2 = spirit.defaultSpirit();
sp2 = spirit.bless(sp2, '综合', '2026-08-24', Date.now()).spirit;
sp2 = spirit.bless(sp2, '爱情', '2026-08-24', Date.now()).spirit;
sp2 = spirit.bless(sp2, '事业', '2026-08-24', Date.now()).spirit;
const limitRes = spirit.bless(sp2, '财运', '2026-08-24', Date.now());
assert(limitRes.error === 'DAILY_LIMIT', 'spirit 第4次祈福触发限次');

// 上限
let sp3 = spirit.defaultSpirit();
sp3.boosts.财运 = 3;
const maxRes = spirit.bless(sp3, '财运', '2026-08-24', Date.now());
assert(maxRes.error === 'MAXED', 'spirit 财运满3不能再祈福');

// 五行→维度映射
assert(spirit.WUXING_TO_DIM.metal === '财运', 'spirit 金→财运');
assert(spirit.WUXING_TO_DIM.wood === '事业', 'spirit 木→事业');
assert(spirit.DIM_FIELDS.爱情.includes('感情'), 'spirit 爱情映射含感情字段');

// ===== 连续看运天数 =====
const streakMod = require('./src/js/streak');
{
  const s0 = streakMod.defaultStreak();
  const r1 = streakMod.checkIn(s0, '2026-11-10');
  assert(r1.changed === true && r1.streak === 1 && r1.broke === false, 'streak 首次=1');
  const r2 = streakMod.checkIn(r1.state, '2026-11-10');
  assert(r2.changed === false && r2.streak === 1, 'streak 同日不重复');
  const r3 = streakMod.checkIn(r2.state, '2026-11-11');
  assert(r3.streak === 2 && r3.state.best === 2, 'streak 连续 +1');
  const r4 = streakMod.checkIn(r3.state, '2026-11-13');
  assert(r4.streak === 1 && r4.broke === true, 'streak 断签不清零、从 1 开始');
  assert(r4.state.best === 2, 'streak 保留最佳记录');
  assert(streakMod.shiftDateKey('2026-03-01', -1) === '2026-02-28', 'streak 跨月减一天');
  assert(streakMod.shiftDateKey('2026-01-01', -1) === '2025-12-31', 'streak 跨年减一天');
}

// 精灵每周衰减
{
  const sp = spirit.defaultSpirit();
  sp.boosts['财运'] = 3;
  sp.boosts['综合'] = 1;
  // 第一次调用只记录当前周（没有上一周可比）；跨到下一周才衰减
  const init = spirit.applyWeeklyDecay(sp, '2026-W46');
  assert(init.boosts['财运'] === 3, '精灵首周不衰减');
  const a = spirit.applyWeeklyDecay(init, '2026-W47');
  assert(a.boosts['财运'] === 2 && a.boosts['综合'] === 0, '精灵跨周 -1 且不低于 0');
  const b = spirit.applyWeeklyDecay(a, '2026-W47');
  assert(b.boosts['财运'] === 2, '精灵同周不重复衰减');
}

// ===== 真黄历：农历 / 节气 / 日干支 / 建除 =====
const astro = require('./src/js/astro');
const lunar = require('./src/js/lunar');
const almanacMod = require('./src/js/almanac');
{
  // 春节（正月初一）
  const spring = { '2023-01-22': '正月初一', '2024-02-10': '正月初一', '2025-01-29': '正月初一', '2026-02-17': '正月初一' };
  for (const [key, expect] of Object.entries(spring)) {
    const l = lunar.fromDateKey(key);
    assert(l && l.month === 1 && l.day === 1 && !l.leap, `农历 ${key} = 正月初一`);
  }
  // 闰月：2023 闰二月、2025 闰六月
  const leap2023 = lunar.fromDateKey('2023-03-22');
  assert(leap2023 && leap2023.leap && leap2023.month === 2, '2023-03-22 = 闰二月初一');
  const leap2025 = lunar.fromDateKey('2025-07-25');
  assert(leap2025 && leap2025.leap && leap2025.month === 6, '2025-07-25 = 闰六月初一');
  // 节气
  assert(astro.termOnDate(2024, 2, 4)?.name === '立春', '2024-02-04 立春');
  assert(astro.termOnDate(2026, 6, 21)?.name === '夏至', '2026-06-21 夏至');
  assert(astro.termOnDate(2025, 12, 21)?.name === '冬至', '2025-12-21 冬至');
  // 日干支锚点
  assert(almanacMod.dayGanzhi('2000-01-07').gan + almanacMod.dayGanzhi('2000-01-07').zhi === '甲子', '2000-01-07 甲子日');
  const d1 = almanacMod.dayGanzhi('2026-11-01');
  const d2 = almanacMod.dayGanzhi('2026-11-02');
  assert((d1.index + 1) % 60 === d2.index, '日干支逐日递增');
  // 建除顺序
  assert(almanacMod.JIANCHU.length === 12, '建除十二值日');
  const day = almanacMod.getDay('2026-11-12');
  assert(day.lunarText && day.dayGanzhi && day.jianchu && day.chong, 'getDay 字段完整');
  assert(Array.isArray(day.yi) && day.yi.length >= 3, '宜忌规则产出');
}

// ===== 典籍检索（本地 RAG 检索层） =====
const canon = require('./src/js/canon');
{
  const books = canon.books();
  assert(books.length === 3, '典籍目录 3 本');
  const docs = require('./data/canon/index.json').docs;
  assert(docs.length >= 120, '典籍文档数 >= 120');
  // 繁简归一：繁体问题也能命中
  const a = canon.search('財多身弱');
  assert(a.ok && a.results.length > 0, '繁体「財多身弱」可命中');
  // 主题命中
  const b = canon.search('伤官见官');
  assert(b.ok && b.results.some((r) => /伤官见官/.test(r.ref + r.text)), '「伤官见官」命中原文');
  // 卦名
  const c = canon.search('乾卦 潜龙勿用');
  assert(c.ok && c.results[0].ref.includes('乾'), '「乾卦」首位命中');
  // 书目过滤
  const d = canon.search('甲木', { book: 'ditiansui' });
  assert(d.ok && d.results.every((r) => r.book === 'ditiansui'), '按书目过滤生效');
  // 空查询
  assert(canon.search('   ').ok === false, '空查询返回失败');
  // 返回字段
  const e = b.results[0];
  assert(e.ref && e.text && typeof e.score === 'number', '检索结果字段完整');
}

// ===== 第五阶段：detector 模式匹配 + 行为打分日志 =====
const detector = require('./src/js/detector');
assert(Array.isArray(detector.PATTERNS) && detector.PATTERNS.length >= 6, 'detector 有至少 6 条规则');
assert(detector.classify('[T] [ERROR] [ai] HTTP_401', { status: 401 }).matched === true, 'detector 识别 auth');
assert(detector.classify('[T] [ERROR] [ai] NETWORK refused', {}).category === 'network', 'detector 识别 network');
assert(detector.classify('[T] [WARN] [x] nothing', {}).matched === false, 'detector 不误报 warn');
assert(detector.parseLevel('[2026-08-21T10:00:00.000Z] [CRITICAL] [x] y') === 'critical', 'parseLevel critical');

// behavior 打分仍正常（加了 logger 后不破坏逻辑）
const behaviorMod = require('./src/js/behavior');
const fakeBehavior = { traditional: { clicks: 5, view_seconds: 100, last_seen: Date.now() } };
const pickedStyle = behaviorMod.pickStyle({ traditional: { clicks: 3, view_seconds: 0, last_seen: Date.now() } });
assert(behaviorMod.STYLES.includes(pickedStyle), 'behavior.pickStyle 返回合法 style');
assert(typeof behaviorMod.recordInteraction(fakeBehavior, 'modern', 5) === 'object', 'recordInteraction 返回对象');

// ===== 聊天 agent tools（不调 LLM）=====
const fs = require('fs');
const path = require('path');
const onlineCfgSrc = fs.readFileSync(path.join(__dirname, 'src/js/onlineConfig.js'), 'utf8');
assert(!/sk-[a-zA-Z0-9]{8,}/.test(onlineCfgSrc), 'onlineConfig.js 不含硬编码 token');
const onlineConfig = require('./src/js/onlineConfig');
assert(typeof onlineConfig.baseUrl === 'string' && onlineConfig.baseUrl.includes('deepseek'), 'onlineConfig baseUrl');
assert('token' in onlineConfig, 'onlineConfig 有 token 字段（值来自 .env）');
// 三种 Key 来源：用户设置 > .env / 内置 > 无
const ocResolved = onlineConfig.resolve({});
assert(['user', 'env', 'bundled', 'none'].includes(ocResolved.tokenSource), 'Key 来源标记合法');
assert(onlineConfig.resolve({ token: 'sk-user-123' }).tokenSource === 'user', '用户填 Key 时来源=user');
assert(onlineConfig.resolve({ token: '' }).tokenSource !== 'user', '空白 Key 不算用户配置');

const merged = onlineConfig.resolve({ baseUrl: 'https://example.com/v1', token: 'sk-user', model: 'my-model' });
assert(merged.baseUrl === 'https://example.com/v1' && merged.token === 'sk-user' && merged.model === 'my-model', '设置面板配置覆盖 .env');
const fallback = onlineConfig.resolve({ baseUrl: '  ', token: '', model: '' });
assert(fallback.baseUrl.includes('deepseek'), '空白字段回退 .env baseUrl');
assert(onlineConfig.maskToken('sk-abcdefghijklmnop').includes('••••'), 'maskToken 打码');

const agent = require('./src/js/agent');
assert(agent.TOOLS.length >= 6, 'agent tools 数量');
const almanacTool = agent.executeTool('get_almanac', { date: '2026-08-20' }, {});
assert(almanacTool.yearGanzhi === '丙午', 'agent get_almanac 2026=丙午');
const noBday = agent.executeTool('get_personal_chart', {}, { profile: {} });
assert(noBday.error === 'NO_BIRTHDAY', 'agent 无生日返回 NO_BIRTHDAY');
const lotsTool = agent.executeTool('get_today_fortune', { style: 'lots' }, { todayKey: '2026-08-20' });
assert(lotsTool.style === 'lots' && lotsTool.poem, 'agent get_today_fortune lots');
const unknown = agent.executeTool('not_a_tool', {}, {});
assert(unknown.error === 'UNKNOWN_TOOL', 'agent 未知 tool');
assert(agent.parseArgs('{"dimension":"财运"}').dimension === '财运', 'agent parseArgs');
assert(agent.TOOLS.length === 8, '默认个人 tools 8 个（含 search_canon）');
assert(agent.TOOLS.some((t) => t.function.name === 'search_canon'), '默认 tools 含典籍检索');
assert(!agent.TOOLS.some((t) => t.function.name === 'group_by_birthday'), '默认 tools 不含分组');
assert(Array.isArray(agent.SCENES) && agent.SCENES.some((s) => s.id === 'group_by_birthday'), '场景表含生日分组');
assert(agent.resolveScene('按生日3人一组 1995-07-20', [], '') === agent.SCENES[0].id, '注册表 resolveScene 返回场景 id');

const groupByBirthday = require('./src/js/scenarios/groupByBirthday');
assert(groupByBirthday.shouldActivate('今天运势怎么样', []) === false, '普通问运势不激活分组');
assert(groupByBirthday.shouldActivate('按生日把这9人3人一组：张三 1995-07-20', []) === true, '分组+生日激活');
assert(groupByBirthday.shouldActivate('3人一组', [{ role: 'user', content: '名单生日如下 1998-01-05' }]) === true, '跨轮话也能激活');

const nine = [
  { name: '张三', birthday: '1995-07-20' },
  { name: '李四', birthday: '1998-01-05' },
  { name: '王五', birthday: '1991-11-11' },
  { name: '赵六', birthday: '2000-03-03' },
  { name: '钱七', birthday: '1993-09-09' },
  { name: '孙八', birthday: '1988-12-12' },
  { name: '周九', birthday: '1996-06-06' },
  { name: '吴十', birthday: '1994-04-04' },
  { name: '郑十一', birthday: '1997-08-08' },
];
const grouped = groupByBirthday.group({ people: nine, groupSize: 3 });
assert(grouped.groups.length === 3, `9人3组实际 ${grouped.groups.length}`);
assert(grouped.groups.every((g) => g.members.length === 3), '每组 3 人');
assert(grouped.leftover.length === 0, '9人整除无剩余');
const names = grouped.groups.flatMap((g) => g.members.map((m) => m.name));
assert(names.length === 9 && nine.every((p) => names.includes(p.name)), '9 人全部入组');
const g2 = groupByBirthday.group({ people: nine, groupSize: 3 });
assert(JSON.stringify(g2) === JSON.stringify(grouped), '同名单分组稳定');
const ten = nine.concat([{ name: '我', birthday: '1990-01-01' }]);
const grouped9 = groupByBirthday.group({ people: ten, groupSize: 3, excludeNames: ['我'] });
assert(grouped9.groups.length === 3 && grouped9.leftover.length === 0, '排除自己后 9 人 3 组');
const viaAgent = agent.executeTool('group_by_birthday', { people: nine, groupSize: 3 });
assert(viaAgent.groups.length === 3, 'agent 能分发 group_by_birthday');

assert(agent.resolveScene('今天运势', [], '') === '', '普通话无场景');
assert(agent.resolveScene('按生日3人一组 1995-07-20', [], '') === 'group_by_birthday', '首句点亮分组场景');
assert(agent.resolveScene('改成两人一组', [{ role: 'assistant', content: '已分好' }], 'group_by_birthday') === 'group_by_birthday', '场景粘滞');
assert(agent.resolveScene('改成两人一组', [{ role: 'assistant', content: '已分好' }], '') === '', '无粘滞则第二句不点亮');

const manyTurns = [];
for (let i = 0; i < 12; i++) {
  manyTurns.push({ role: 'user', content: 'u' + i });
  manyTurns.push({ role: 'assistant', content: 'a' + i });
  manyTurns.push({ role: 'tool', tool_call_id: 't' + i, content: '{}' });
}
const trimmed = agent.trimByUserTurns(manyTurns, 8);
const trimmedUsers = trimmed.filter((m) => m.role === 'user');
assert(trimmedUsers.length === 8, `按轮裁剪留 8 轮，实际 ${trimmedUsers.length}`);
assert(trimmedUsers[0].content === 'u4', '裁掉最早的用户轮');
const ui = agent.publicHistory(trimmed);
assert(ui.every((m) => m.role === 'user' || m.role === 'assistant'), '界面历史不含 tool');
const dumped = JSON.parse(JSON.stringify({ messages: trimmed, scene: 'group_by_birthday' }));
assert(dumped.messages.length === trimmed.length && dumped.scene === 'group_by_birthday', '会话可 JSON 落盘');

(async () => {
  const seen = [];
  const fakeLLM = async ({ messages, tools }) => {
    seen.push({
      users: messages.filter((m) => m.role === 'user').map((m) => m.content),
      hasGroupTool: (tools || []).some((t) => t.function && t.function.name === 'group_by_birthday'),
      hasPrevAssistant: messages.some((m) => m.role === 'assistant'),
    });
    const last = messages[messages.length - 1];
    if (last.role === 'user' && /一组/.test(last.content) && !messages.some((m) => m.role === 'tool')) {
      return {
        content: '',
        tool_calls: [{
          id: 'call_g',
          function: {
            name: 'group_by_birthday',
            arguments: JSON.stringify({
              people: [
                { name: '张三', birthday: '1995-07-20' },
                { name: '李四', birthday: '1998-01-05' },
                { name: '王五', birthday: '1991-11-11' },
              ],
              groupSize: 3,
            }),
          },
        }],
        usage: {},
      };
    }
    return { content: '本轮已根据记录作答', tool_calls: [], usage: {} };
  };
  const cfg = { token: 'test', baseUrl: 'http://127.0.0.1', model: 'test' };
  const t1 = await agent.runAgent({
    history: [],
    userQuery: '按生日把3人一组：张三 1995-07-20',
    aiConfig: cfg,
    ctx: { scene: '' },
    callLLM: fakeLLM,
  });
  assert(t1.scene === 'group_by_birthday', '第一轮记下分组场景');
  assert(t1.toolsUsed.includes('group_by_birthday'), '第一轮调用了分组 tool');
  assert(t1.history.some((m) => m.role === 'user'), 'history 含用户句');
  const t2 = await agent.runAgent({
    history: t1.history,
    userQuery: '改成两人一组',
    aiConfig: cfg,
    ctx: { scene: t1.scene },
    callLLM: fakeLLM,
  });
  const lastSeen = seen[seen.length - 1];
  assert(lastSeen.users.includes('按生日把3人一组：张三 1995-07-20'), '第二轮 LLM 看得到第一句');
  assert(lastSeen.hasGroupTool === true, '粘滞后仍挂分组 tool');
  assert(t2.history.filter((m) => m.role === 'user').length >= 2, '两轮用户句都在缓存 history 里');

  const t3 = await agent.runAgent({
    history: [],
    userQuery: '今天运势如何',
    aiConfig: cfg,
    ctx: { scene: '' },
    callLLM: async ({ tools }) => {
      seen.push({ hasGroupTool: (tools || []).some((t) => t.function && t.function.name === 'group_by_birthday') });
      return { content: '今日平稳', tool_calls: [], usage: {} };
    },
  });
  assert(t3.scene === '', '普通问运势无场景');
  assert(seen[seen.length - 1].hasGroupTool === false, '普通问运势不挂分组 tool');

  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => {
  failed++;
  console.log('  ✗ async', e.stack || e.message);
  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
  process.exit(1);
});
