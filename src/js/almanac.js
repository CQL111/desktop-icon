// almanac.js - 日课（黄历）核心
// 依赖 astro.js（节气/朔）与 lunar.js（农历），全部离线计算。
// 内容：日干支、年/月柱、建除十二值日、黄黑道、冲煞、彭祖百忌、时辰吉凶、规则宜忌。
// 说明：宜忌由「建除 + 黄黑道 + 冲煞 + 五行」规则组合，属传统参考口径，非某一本通书原文。

const astro = require('./astro');
const lunar = require('./lunar');

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
const GAN_WUXING = ['木', '木', '火', '火', '土', '土', '金', '金', '水', '水'];
const ZHI_WUXING = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];
const WUXING_COLOR = {
  木: { name: '青绿', hex: '#4caf50' },
  火: { name: '朱红', hex: '#d32f2f' },
  土: { name: '土黄', hex: '#a1887f' },
  金: { name: '鎏金', hex: '#d4af37' },
  水: { name: '藏青', hex: '#1e3a5f' },
};

// 建除十二值日（顺序固定）
const JIANCHU = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
// 建除 → 黄道/黑道（常见口径）
const JIANCHU_YELLOW = new Set(['除', '危', '定', '执', '成', '开']);

// 日干 → 彭祖百忌（简版）
const PENGZU_GAN = {
  甲: '甲不开仓财物耗散', 乙: '乙不栽植千株不长',
  丙: '丙不修灶必见灾殃', 丁: '丁不剃头头必生疮',
  戊: '戊不受田田主不祥', 己: '己不破券二比并亡',
  庚: '庚不经络织机虚张', 辛: '辛不合酱主人不尝',
  壬: '壬不汲水更难提防', 癸: '癸不词讼理弱敌强',
};
const PENGZU_ZHI = {
  子: '子不问卜自惹祸殃', 丑: '丑不冠带主不还乡',
  寅: '寅不祭祀神鬼不尝', 卯: '卯不穿井水泉不香',
  辰: '辰不哭泣必主重丧', 巳: '巳不远行财物伏藏',
  午: '午不苫盖屋主更张', 未: '未不服药毒气入肠',
  申: '申不安床鬼祟入房', 酉: '酉不会客醉坐颠狂',
  戌: '戌不吃犬作怪上床', 亥: '亥不嫁娶不利新郎',
};

// 地支六冲
const ZHI_CHONG = { 子: '午', 丑: '未', 寅: '申', 卯: '酉', 辰: '戌', 巳: '亥', 午: '子', 未: '丑', 申: '寅', 酉: '卯', 戌: '辰', 亥: '巳' };
// 冲的方位（被冲地支所属方位）
const ZHI_DIRECTION = { 子: '北', 丑: '东北', 寅: '东北', 卯: '东', 辰: '东南', 巳: '东南', 午: '南', 未: '西南', 申: '西南', 酉: '西', 戌: '西北', 亥: '西北' };

// 建除 → 宜忌取向（规则库）
const JIANCHU_ADVICE = {
  建: { yi: ['出行', '会见', '求职', '谈判'], ji: ['动土', '开仓', '安葬'] },
  除: { yi: ['沐浴', '理发', '打扫', '求医', '祛病'], ji: ['嫁娶', '开业', '签约'] },
  满: { yi: ['祭祀', '祈福', '聚餐', '纳财'], ji: ['诉讼', '远行', '装修'] },
  平: { yi: ['修整', '会友', '学习', '散步'], ji: ['嫁娶', '开业', '动土'] },
  定: { yi: ['订婚', '签约', '安床', '面试'], ji: ['出行', '诉讼', '搬家'] },
  执: { yi: ['求职', '提案', '竞标', '收账'], ji: ['搬家', '远行', '动土'] },
  破: { yi: ['求医', '拆改', '断舍离'], ji: ['嫁娶', '开业', '签约', '出行', '投资'] },
  危: { yi: ['休息', '反思', '体检', '整理'], ji: ['冒险', '签约', '远行'] },
  成: { yi: ['开业', '签约', '嫁娶', '入宅', '面试'], ji: ['诉讼', '破土'] },
  收: { yi: ['纳财', '收账', '整理', '复盘'], ji: ['开市', '远行', '动土'] },
  开: { yi: ['开业', '动土', '嫁娶', '出行'], ji: ['安葬', '诉讼'] },
  闭: { yi: ['静养', '读书', '储蓄', '整理'], ji: ['开业', '签约', '远行', '动土'] },
};

// 日干支：JDN = 北京日期对应的儒略日数（2000-01-07 = 2451551 = 甲子日）
// 通行公式：(JDN + 49) mod 60，0 为甲子
function dayGanzhi(dateKey) {
  const jdn = Math.floor(astro.jdFromDateKey(dateKey) + 1.5);
  const idx = ((jdn + 49) % 60 + 60) % 60;
  return { gan: GAN[idx % 10], zhi: ZHI[idx % 12], index: idx };
}

// 年柱：以立春为界（八字口径）
function yearGanzhiByLichun(dateKey) {
  const [y] = String(dateKey).split('-').map(Number);
  const lichun = astro.solarTermsInYear(y).find((t) => t.name === '立春');
  const lichunKey = `${lichun.y}-${String(lichun.m).padStart(2, '0')}-${String(lichun.d).padStart(2, '0')}`;
  const yearForGanzhi = dateKey >= lichunKey ? y : y - 1;
  return { year: yearForGanzhi, ganzhi: GAN[((yearForGanzhi - 4) % 10 + 10) % 10] + ZHI[((yearForGanzhi - 4) % 12 + 12) % 12] };
}

// 月柱：节气月地支 + 五虎遁
function monthGanzhi(dateKey) {
  const branch = lunar.solarMonthBranch(dateKey);
  const { year } = yearGanzhiByLichun(dateKey);
  // 五虎遁：甲己年丙寅起，乙庚年戊寅，丙辛年庚寅，丁壬年壬寅，戊癸年甲寅
  const yearGanIdx = ((year - 4) % 10 + 10) % 10;
  const startGan = [2, 4, 6, 8, 0][yearGanIdx % 5]; // 寅月的天干索引
  const branchOrder = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
  const offset = branchOrder.indexOf(branch);
  const gan = GAN[(startGan + offset) % 10];
  return { gan, zhi: branch, ganzhi: gan + branch };
}

// 建除十二值日：日支相对月支的序号
function jianchuOf(dateKey, monthBranch) {
  const { zhi } = dayGanzhi(dateKey);
  const offset = (ZHI.indexOf(zhi) - ZHI.indexOf(monthBranch) + 12) % 12;
  return JIANCHU[offset];
}

// 冲煞：日支冲生肖、方位
function chongOf(dateKey) {
  const { zhi } = dayGanzhi(dateKey);
  const target = ZHI_CHONG[zhi];
  return {
    zhi,
    chong: target,
    shengxiao: SHENGXIAO[ZHI.indexOf(target)],
    direction: ZHI_DIRECTION[target] || '',
    text: `冲${SHENGXIAO[ZHI.indexOf(target)]}（${target}）煞${ZHI_DIRECTION[target] || ''}`,
  };
}

// 十二时辰吉凶：时辰地支与日支同建除逻辑（黄道=除危定执成开）
const HOUR_ZHI = [
  { name: '子', from: 23, to: 1 }, { name: '丑', from: 1, to: 3 }, { name: '寅', from: 3, to: 5 },
  { name: '卯', from: 5, to: 7 }, { name: '辰', from: 7, to: 9 }, { name: '巳', from: 9, to: 11 },
  { name: '午', from: 11, to: 13 }, { name: '未', from: 13, to: 15 }, { name: '申', from: 15, to: 17 },
  { name: '酉', from: 17, to: 19 }, { name: '戌', from: 19, to: 21 }, { name: '亥', from: 21, to: 23 },
];

function hourAuspice(dateKey) {
  const { zhi } = dayGanzhi(dateKey);
  return HOUR_ZHI.map((h) => {
    const offset = (ZHI.indexOf(h.name) - ZHI.indexOf(zhi) + 12) % 12;
    const jc = JIANCHU[offset];
    const yellow = JIANCHU_YELLOW.has(jc);
    return { name: h.name, range: `${h.from}–${h.to}时`, jianchu: jc, good: yellow };
  });
}

// 规则宜忌：建除建议 + 黄黑道修正 + 冲煞提醒（去重、各取 3–5 条）
function yiJi(dateKey, jc, yellow, chong) {
  const base = JIANCHU_ADVICE[jc] || { yi: [], ji: [] };
  const yi = new Set(base.yi);
  const ji = new Set(base.ji);
  if (yellow) {
    yi.add('祈福');
    yi.add('会友');
  } else {
    ji.add('签约');
    ji.add('远行');
  }
  if (jc === '破') ji.add('投资');
  if (jc === '成' || jc === '开') yi.add('开业');
  // 冲煞：被冲生肖今日宜低调（转为一条通用提醒）
  if (chong && chong.shengxiao) ji.add('冲动争执');
  return { yi: [...yi].slice(0, 5), ji: [...ji].slice(0, 5) };
}

// 幸运色/数字：由日干支确定性推导（同一天同一结果，不随机）
function luckyOf(dateKey) {
  const { gan, zhi, index } = dayGanzhi(dateKey);
  const wx = GAN_WUXING[GAN.indexOf(gan)] || '土';
  return {
    color: WUXING_COLOR[wx] || WUXING_COLOR['土'],
    wuxing: wx,
    number: (index % 9) + 1,
  };
}

/**
 * 某天的完整黄历
 * @param {string} dateKey YYYY-MM-DD（本地日期）
 */
function getDay(dateKey) {
  const day = dayGanzhi(dateKey);
  const lunarInfo = lunar.fromDateKey(dateKey);
  const term = lunar.termOnDateKey(dateKey);
  const year = yearGanzhiByLichun(dateKey);
  const month = monthGanzhi(dateKey);
  const jc = jianchuOf(dateKey, month.zhi);
  const yellow = JIANCHU_YELLOW.has(jc);
  const chong = chongOf(dateKey);
  const advice = yiJi(dateKey, jc, yellow, chong);
  const lucky = luckyOf(dateKey);
  const hours = hourAuspice(dateKey);
  const luckyHours = hours.filter((h) => h.good).map((h) => h.name + '时');

  return {
    date: dateKey,
    // 农历
    lunar: lunarInfo,
    lunarText: lunarInfo ? `农历${lunarInfo.monthName}${lunarInfo.dayName}` : '',
    term: term ? term.name : '',
    // 干支
    yearGanzhi: year.ganzhi,
    shengxiao: SHENGXIAO[((year.year - 4) % 12 + 12) % 12],
    monthGanzhi: month.ganzhi,
    dayGanzhi: day.gan + day.zhi,
    dayGan: day.gan,
    dayZhi: day.zhi,
    // 建除 / 黄黑道
    jianchu: jc,
    huangdao: yellow,
    huangdaoText: yellow ? '黄道吉日' : '黑道日',
    // 冲煞
    chong: chong.text,
    chongShengxiao: chong.shengxiao,
    chongZhi: chong.chong,
    chongDirection: chong.direction,
    // 彭祖百忌
    pengzu: [PENGZU_GAN[day.gan], PENGZU_ZHI[day.zhi]].filter(Boolean),
    // 宜忌（规则参考）
    yi: advice.yi,
    ji: advice.ji,
    yiJiNote: '宜忌由建除、黄黑道与冲煞规则推得，仅供传统参考',
    // 吉时
    luckyHours,
    hours,
    // 幸运
    luckyColor: lucky.color,
    luckyNum: lucky.number,
    wuxing: lucky.wuxing,
  };
}

module.exports = {
  GAN,
  ZHI,
  SHENGXIAO,
  JIANCHU,
  dayGanzhi,
  yearGanzhiByLichun,
  monthGanzhi,
  jianchuOf,
  chongOf,
  hourAuspice,
  luckyOf,
  getDay,
};
