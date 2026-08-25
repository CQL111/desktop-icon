// data/persona.js - 个人测算数据 + 工具
// 生肖 / 天干地支 / 五行 / 时区方位

// ---------- 常量 ----------
// 十二生肖（2008 年 = 鼠）
const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
// 天干 10
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
// 地支 12
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
// 天干对应五行（索引）→ wuxing key（colors.js 的 key）
const GAN_WUXING = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water'];
// 地支对应五行
const ZHI_WUXING = ['water', 'earth', 'wood', 'wood', 'earth', 'fire', 'fire', 'earth', 'metal', 'metal', 'earth', 'water'];
// 地支月（按公历月近似：1月≈丑，2月≈寅（立春）...7月≈未，8月≈申）
// 用公历生日推导，直接按公历月映射最贴近节气
const MONTH_ZHI = ['丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子'];

// 时区方位映射（IANA 时区 → 五行方位）
const TZ_ORIENTATION = [
  { re: /^(Asia\/(Shanghai|Chongqing|Urumqi|Harbin|Taipei|Hong_Kong))/, orientation: '东方', wuxing: 'wood', note: '东方属木，宜成长与开拓' },
  { re: /^(Asia\/(Tokyo|Seoul))/, orientation: '东方', wuxing: 'wood', note: '东方属木' },
  { re: /^(Europe|Africa)/, orientation: '西方', wuxing: 'metal', note: '西方属金' },
  { re: /^(America|Canada|Brazil|Pacific)/, orientation: '西方', wuxing: 'metal', note: '西方属金' },
  { re: /^(Asia\/(Kolkata|Dubai))/, orientation: '中央', wuxing: 'earth', note: '中央属土' },
  // fallback
  { re: /.*/, orientation: '中央', wuxing: 'earth', note: '中央属土' },
];

// ---------- 工具函数 ----------

// 出生年 → 生肖（2008 = 鼠）
function getShengxiao(year) {
  return SHENGXIAO[((year - 2008) % 12 + 12) % 12];
}

// 出生年 → 年柱干支（1984 = 甲子）
function getYearGanzhi(year) {
  const gan = TIAN_GAN[((year - 4) % 10 + 10) % 10];
  const zhi = DI_ZHI[((year - 4) % 12 + 12) % 12];
  return gan + zhi;
}

// 公历月(1-12) → 地支月
function getMonthZhi(month) {
  return MONTH_ZHI[(month - 1 + 12) % 12];
}

// 由干支索引统计五行分布 → { wood:x, fire:x, ... }
function getWuxingDistribution(ganIdxList, zhiIdxList) {
  const dist = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  for (const gi of ganIdxList || []) {
    const key = GAN_WUXING[gi];
    if (key) dist[key]++;
  }
  for (const zi of zhiIdxList || []) {
    const key = ZHI_WUXING[zi];
    if (key) dist[key]++;
  }
  return dist;
}

// 系统时区 → 五行方位
function getTimeZoneOrientation() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return TZ_ORIENTATION.find((o) => o.re.test(tz)) || TZ_ORIENTATION[TZ_ORIENTATION.length - 1];
  } catch {
    return TZ_ORIENTATION[TZ_ORIENTATION.length - 1];
  }
}

// 性格标签（生肖 + 星座 + 性别 → 数组）
function getPersonalityTags(shengxiao, zodiacName, gender) {
  const tags = [];
  const sxTags = {
    '鼠': ['机敏', '灵活'], '牛': ['坚韧', '踏实'], '虎': ['果敢', '有魄力'],
    '兔': ['温和', '细腻'], '龙': ['自信', '有远见'], '蛇': ['深邃', '智慧'],
    '马': ['奔放', '热情'], '羊': ['温和', '善良'], '猴': ['聪明', '机灵'],
    '鸡': ['勤勉', '细致'], '狗': ['忠诚', '正直'], '猪': ['豁达', '乐观'],
  };
  const zTags = {
    '白羊座': ['直率', '行动派'], '金牛座': ['沉稳', '务实'], '双子座': ['好奇', '善沟通'],
    '巨蟹座': ['顾家', '感性'], '狮子座': ['大方', '有领导力'], '处女座': ['细心', '追求完美'],
    '天秤座': ['优雅', '公正'], '天蝎座': ['专注', '洞察力强'], '射手座': ['自由', '乐观'],
    '摩羯座': ['自律', '有野心'], '水瓶座': ['创新', '独立'], '双鱼座': ['浪漫', '共情'],
  };
  if (sxTags[shengxiao]) tags.push(...sxTags[shengxiao]);
  if (zTags[zodiacName]) tags.push(...zTags[zodiacName]);
  if (gender === 'female') tags.push('细腻');
  if (gender === 'male') tags.push('有担当');
  // 去重 + 限 5 个
  return [...new Set(tags)].slice(0, 5);
}

module.exports = {
  SHENGXIAO,
  TIAN_GAN,
  DI_ZHI,
  GAN_WUXING,
  ZHI_WUXING,
  MONTH_ZHI,
  TZ_ORIENTATION,
  getShengxiao,
  getYearGanzhi,
  getMonthZhi,
  getWuxingDistribution,
  getTimeZoneOrientation,
  getPersonalityTags,
};