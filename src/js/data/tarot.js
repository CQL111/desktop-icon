// data/tarot.js - 大阿尔克那 22 张 + 12 星座
const _data = {
  // 12 星座（dates 是 [起始月日, 结束月日]）
  zodiacs: [
    { key: 'capricorn',   name: '摩羯座', dates: [[12,22],[1,19]], ruler: '土星', element: '土' },
    { key: 'aquarius',    name: '水瓶座', dates: [[1,20],[2,18]],  ruler: '天王星', element: '风' },
    { key: 'pisces',      name: '双鱼座', dates: [[2,19],[3,20]],  ruler: '海王星', element: '水' },
    { key: 'aries',       name: '白羊座', dates: [[3,21],[4,19]],  ruler: '火星', element: '火' },
    { key: 'taurus',      name: '金牛座', dates: [[4,20],[5,20]],  ruler: '金星', element: '土' },
    { key: 'gemini',      name: '双子座', dates: [[5,21],[6,21]],  ruler: '水星', element: '风' },
    { key: 'cancer',      name: '巨蟹座', dates: [[6,22],[7,22]],  ruler: '月亮', element: '水' },
    { key: 'leo',         name: '狮子座', dates: [[7,23],[8,22]],  ruler: '太阳', element: '火' },
    { key: 'virgo',       name: '处女座', dates: [[8,23],[9,22]],  ruler: '水星', element: '土' },
    { key: 'libra',       name: '天秤座', dates: [[9,23],[10,23]], ruler: '金星', element: '风' },
    { key: 'scorpio',     name: '天蝎座', dates: [[10,24],[11,22]], ruler: '冥王星', element: '水' },
    { key: 'sagittarius', name: '射手座', dates: [[11,23],[12,21]], ruler: '木星', element: '火' },
  ],
  // 大阿尔克那 22 张
  cards: [
    { num: 0,  name: '愚者', en: 'The Fool', keyword: '新起点、自由、纯真' },
    { num: 1,  name: '魔术师', en: 'The Magician', keyword: '创造力、技能、主动' },
    { num: 2,  name: '女祭司', en: 'The High Priestess', keyword: '直觉、潜识、智慧' },
    { num: 3,  name: '皇后', en: 'The Empress', keyword: '丰盛、母性、滋养' },
    { num: 4,  name: '皇帝', en: 'The Emperor', keyword: '权威、稳定、秩序' },
    { num: 5,  name: '教皇', en: 'The Hierophant', keyword: '传统、信仰、教导' },
    { num: 6,  name: '恋人', en: 'The Lovers', keyword: '抉择、爱、和谐' },
    { num: 7,  name: '战车', en: 'The Chariot', keyword: '胜利、意志、前进' },
    { num: 8,  name: '力量', en: 'Strength', keyword: '勇气、内在力量、耐心' },
    { num: 9,  name: '隐士', en: 'The Hermit', keyword: '内省、独处、指引' },
    { num: 10, name: '命运之轮', en: 'Wheel of Fortune', keyword: '转折、循环、机遇' },
    { num: 11, name: '正义', en: 'Justice', keyword: '公平、真理、因果' },
    { num: 12, name: '倒吊人', en: 'The Hanged Man', keyword: '牺牲、新视角、等待' },
    { num: 13, name: '死神', en: 'Death', keyword: '结束、转变、新生' },
    { num: 14, name: '节制', en: 'Temperance', keyword: '平衡、调和、耐心' },
    { num: 15, name: '恶魔', en: 'The Devil', keyword: '束缚、欲望、执着' },
    { num: 16, name: '塔', en: 'The Tower', keyword: '突变、崩塌、觉醒' },
    { num: 17, name: '星星', en: 'The Star', keyword: '希望、灵感、治愈' },
    { num: 18, name: '月亮', en: 'The Moon', keyword: '迷惑、潜意识、直觉' },
    { num: 19, name: '太阳', en: 'The Sun', keyword: '快乐、成功、活力' },
    { num: 20, name: '审判', en: 'Judgement', keyword: '觉醒、宽恕、重生' },
    { num: 21, name: '世界', en: 'The World', keyword: '圆满、完成、成就' },
  ],
};

// 根据生日找星座
function getZodiac(month, day) {
  for (const z of _data.zodiacs) {
    const [[m1, d1], [m2, d2]] = z.dates;
    // 跨年的星座（如摩羯 12/22 - 1/19）
    if (m1 > m2) {
      if ((month === m1 && day >= d1) || (month === m2 && day <= d2)) return z;
    } else {
      if ((month === m1 && day >= d1) || (month === m2 && day <= d2)) return z;
    }
  }
  return _data.zodiacs[0];
}

module.exports = _data;
module.exports.getZodiac = getZodiac;
