// 临时业务：按生日把人分成每组 K 人。不落盘。只在对话命中时由 agent 挂上。
const persona = require('../data/persona');

const WUXING_LABEL = { wood: '木', fire: '火', earth: '土', metal: '金', water: '水' };
const SHENG_NEXT = { wood: 'fire', fire: 'earth', earth: 'metal', metal: 'water', water: 'wood' };
const KE_NEXT = { wood: 'earth', earth: 'water', water: 'fire', fire: 'metal', metal: 'wood' };
const CHONG = {
  鼠: '马', 牛: '羊', 虎: '猴', 兔: '鸡', 龙: '狗', 蛇: '猪',
  马: '鼠', 羊: '牛', 猴: '虎', 鸡: '兔', 狗: '龙', 猪: '蛇',
};

const PROMPT =
  '用户在做临时组队。必须调用 group_by_birthday，不要自己编组。从对话中抽出人名和生日（YYYY-MM-DD）。';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'group_by_birthday',
      description: '按生日用生肖/五行把人分成每组 K 人。临时组队，结果以本 tool 为准。',
      parameters: {
        type: 'object',
        properties: {
          people: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                birthday: { type: 'string', description: 'YYYY-MM-DD，缺日可用 YYYY-01-01' },
              },
              required: ['name', 'birthday'],
            },
          },
          groupSize: { type: 'integer', description: '每组人数，默认 3' },
          excludeNames: { type: 'array', items: { type: 'string' }, description: '不参与分组的姓名' },
        },
        required: ['people'],
      },
    },
  },
];

const LABELS = { group_by_birthday: '按生日分组' };

function shouldActivate(userQuery, history) {
  const last = (history || []).filter((m) => m && m.content).slice(-1)[0];
  const blob = [userQuery, last && last.content].filter(Boolean).join('\n');
  const intent = /分组|一组|分成/.test(blob);
  const birthday = /生日|\d{4}-\d{1,2}-\d{1,2}|\d{4}年/.test(blob);
  return intent && birthday;
}

function parseBirthday(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月]?(\d{1,2})?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = m[3] ? Number(m[3]) : 1;
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function chartOf(name, birthday) {
  const parsed = parseBirthday(birthday);
  if (!parsed) return null;
  const shengxiao = persona.getShengxiao(parsed.y);
  const ganzhi = persona.getYearGanzhi(parsed.y);
  const ganIdx = persona.TIAN_GAN.indexOf(ganzhi[0]);
  const wuxing = persona.GAN_WUXING[ganIdx] || 'earth';
  return {
    name: String(name || '').trim(),
    birthday: `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`,
    shengxiao,
    wuxing,
    wuxingLabel: WUXING_LABEL[wuxing] || wuxing,
    yearGanZhi: ganzhi,
  };
}

function pairScore(a, b) {
  if (CHONG[a.shengxiao] === b.shengxiao) return -3;
  if (SHENG_NEXT[a.wuxing] === b.wuxing || SHENG_NEXT[b.wuxing] === a.wuxing) return 2;
  if (a.wuxing === b.wuxing) return 1;
  if (KE_NEXT[a.wuxing] === b.wuxing || KE_NEXT[b.wuxing] === a.wuxing) return -1;
  return 0;
}

function addScore(group, person) {
  let s = 0;
  for (const m of group) s += pairScore(m, person);
  return s;
}

function reasonFor(members) {
  const sx = members.map((m) => m.shengxiao).join('、');
  const wx = [...new Set(members.map((m) => m.wuxingLabel))].join('、');
  return `生肖${sx}，五行${wx}`;
}

function group(args = {}) {
  const groupSize = Math.max(2, Math.min(8, Number(args.groupSize) || 3));
  const exclude = new Set((args.excludeNames || []).map((n) => String(n).trim()).filter(Boolean));
  const skipped = [];
  const pool = [];
  for (const p of args.people || []) {
    const name = String((p && p.name) || '').trim();
    if (!name) continue;
    if (exclude.has(name)) continue;
    const c = chartOf(name, p.birthday);
    if (!c) {
      skipped.push({ name, birthday: p && p.birthday, error: 'BAD_BIRTHDAY' });
      continue;
    }
    pool.push(c);
  }
  pool.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const groups = [];
  while (pool.length >= groupSize) {
    const members = [pool.shift()];
    while (members.length < groupSize && pool.length) {
      let bestI = 0;
      let bestS = addScore(members, pool[0]);
      for (let i = 1; i < pool.length; i++) {
        const s = addScore(members, pool[i]);
        if (s > bestS) {
          bestS = s;
          bestI = i;
        }
      }
      members.push(pool.splice(bestI, 1)[0]);
    }
    groups.push({
      members: members.map((m) => ({
        name: m.name,
        birthday: m.birthday,
        shengxiao: m.shengxiao,
        wuxing: m.wuxingLabel,
      })),
      reason: reasonFor(members),
    });
  }

  return {
    groupSize,
    groups,
    leftover: pool.map((m) => ({ name: m.name, birthday: m.birthday, shengxiao: m.shengxiao, wuxing: m.wuxingLabel })),
    skipped,
  };
}

function execute(name, args) {
  if (name === 'group_by_birthday') return group(args);
  return { error: 'UNKNOWN_TOOL', name };
}

module.exports = {
  id: 'group_by_birthday',
  TOOLS,
  LABELS,
  PROMPT,
  shouldActivate,
  group,
  execute,
};
