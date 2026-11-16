#!/usr/bin/env node
// 下载公版命理典籍原文 → data/canon/raw/
// 维基文库 API 在部分网络不可达：章节本走 mingli 镜像，整本走 shushubook。
//
// usage:
//   node scripts/fetch-canon.js
//   node scripts/fetch-canon.js --force
//   node scripts/fetch-canon.js --only zhouyi,qiongtong
//   node scripts/fetch-canon.js --chunk

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'canon');
const RAW = path.join(ROOT, 'raw');
const UA = 'FortuneBallCanonBot/1.0 (personal; local-dev)';
const DELAY_MS = 200;
const MINGLI =
  'https://raw.githubusercontent.com/qq250113397-dotcom/mingli/main/content/classics';
const SHUSHU = 'https://raw.githubusercontent.com/kentang2017/shushubook/main';
const XUANXUE = 'https://raw.githubusercontent.com/youngzs/xuanxue/main/docs';

const LICENSE_MINGLI = '原文公版；数字文本 CC BY-SA 4.0（维基文库经 mingli 镜像）';
const LICENSE_SHUSHU = '原文公版；数字文本来自 shushubook 镜像';
const LICENSE_XUANXUE = '原文公版；数字文本来自 youngzs/xuanxue';

function seq(n, mapFn) {
  return Array.from({ length: n }, (_, i) => mapFn(i + 1));
}

function mingliParts(dir, prefix, n, width, labelFn) {
  return seq(n, (i) => ({
    url: `${MINGLI}/${dir}/${prefix}-${width > 1 ? String(i).padStart(width, '0') : i}.md`,
    label: labelFn(i),
  }));
}

const BOOKS = [
  {
    id: 'zhouyi',
    title: '周易',
    author: '先秦 · 王弼注本',
    school: '易学',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/周易',
    files: mingliParts('yixue', 'zhouyi', 64, 2, (i) => `第${i}卦`),
  },
  {
    id: 'yizhuan',
    title: '易传',
    author: '先秦十翼',
    school: '易学',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/周易',
    files: mingliParts('yixue', 'zhouyi-commentary', 9, 2, (i) => `第${i}篇`),
  },
  {
    id: 'ditiansui',
    title: '滴天髓',
    author: '明·刘基（传）',
    school: '八字',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/滴天髓',
    files: mingliParts('bazi', 'ditiansui', 10, 2, (i) => `第${i}篇`),
  },
  {
    id: 'yuanhai',
    title: '渊海子平',
    author: '宋·徐升 / 明·杨淙',
    school: '八字',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/淵海子平',
    files: [{ url: `${MINGLI}/bazi/yuanhai-ziping.md`, label: '全文' }],
  },
  {
    id: 'sanming',
    title: '三命通会',
    author: '明·万民英',
    school: '八字',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/三命通會',
    files: mingliParts('bazi', 'sanming-tonghui', 9, 1, (i) => `卷${i}`),
  },
  {
    id: 'shenfeng',
    title: '神峰通考',
    author: '明·张楠',
    school: '八字',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/神峰通考',
    files: [{ url: `${MINGLI}/bazi/shenfeng-tongkao.md`, label: '全文' }],
  },
  {
    id: 'wuxingjingji',
    title: '五行精纪',
    author: '宋·廖中',
    school: '八字',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/五行精紀',
    files: [{ url: `${MINGLI}/bazi/wuxing-jingji.md`, label: '全文' }],
  },
  {
    id: 'meihua',
    title: '梅花易数',
    author: '宋·邵雍（传）',
    school: '易学',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/梅花易數',
    files: mingliParts('yixue', 'meihua-yishu', 3, 1, (i) => `卷${i}`),
  },
  {
    id: 'zengshan',
    title: '增删卜易',
    author: '清·野鹤老人',
    school: '易学',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/增刪卜易',
    files: [
      { url: `${MINGLI}/yixue/zengshan-buyi-xu.md`, label: '序' },
      ...mingliParts('yixue', 'zengshan-buyi', 26, 1, (i) => `第${i}章`),
      { url: `${MINGLI}/yixue/zengshan-buyi-15又.md`, label: '第15章又' },
      { url: `${MINGLI}/yixue/zengshan-buyi-26又1.md`, label: '第26章又1' },
      { url: `${MINGLI}/yixue/zengshan-buyi-26又2.md`, label: '第26章又2' },
      { url: `${MINGLI}/yixue/zengshan-buyi-26又3.md`, label: '第26章又3' },
      { url: `${MINGLI}/yixue/zengshan-buyi-26又4.md`, label: '第26章又4' },
    ],
  },
  {
    id: 'ziwei',
    title: '紫微斗数全书',
    author: '明·陈希夷（传）',
    school: '紫微',
    license: LICENSE_MINGLI,
    sourceNote: 'https://zh.wikisource.org/wiki/紫微斗數全書',
    files: mingliParts('ziwei', 'ziwei-doushu-quanshu', 3, 1, (i) => `卷${i}`),
  },
  {
    id: 'lixuzhong',
    title: '李虚中命书',
    author: '唐·李虚中（传）',
    school: '八字',
    license: LICENSE_SHUSHU,
    sourceNote: 'https://zh.wikisource.org/wiki/李虛中命書',
    files: [{ url: `${SHUSHU}/命理/李虚中命书-周-鬼谷子.txt`, label: '全文' }],
  },
  {
    id: 'qiongtong',
    title: '穷通宝鉴',
    author: '明·余春台',
    school: '八字',
    license: LICENSE_SHUSHU,
    sourceNote: 'https://zh.wikisource.org/wiki/窮通寶鑑',
    files: [{ url: `${SHUSHU}/命理/穷通宝鉴-明-余春台.txt`, label: '全文' }],
  },
  {
    id: 'yuzhao',
    title: '玉照神应真经',
    author: '晋·郭璞（传）',
    school: '八字',
    license: LICENSE_SHUSHU,
    sourceNote: 'https://zh.wikisource.org/wiki/玉照定真經',
    files: [{ url: `${SHUSHU}/命理/玉照神应真经-晋-郭璞.txt`, label: '全文' }],
  },
  {
    id: 'huangjince',
    title: '黄金策',
    author: '明·刘基（传）',
    school: '易学',
    license: LICENSE_SHUSHU,
    sourceNote: 'https://zh.wikisource.org/wiki/黃金策',
    files: [{ url: `${SHUSHU}/命理/黄金策-明-刘基.txt`, label: '全文' }],
  },
  {
    id: 'lingqi',
    title: '灵棋经',
    author: '汉·东方朔（传）',
    school: '占卜',
    license: LICENSE_SHUSHU,
    sourceNote: 'https://zh.wikisource.org/wiki/靈棋經',
    files: [{ url: `${SHUSHU}/占卜/灵棋经-汉-东方朔.txt`, label: '全文' }],
  },
  {
    id: 'luolu',
    title: '珞琭子三命消息赋注',
    author: '宋·徐子平',
    school: '八字',
    license: LICENSE_SHUSHU,
    sourceNote: 'https://zh.wikisource.org/wiki/珞琭子三命消息賦',
    files: [{ url: `${SHUSHU}/命理/珞琭子三命消息赋注-宋-徐子平.txt`, label: '全文' }],
  },
];

function shushu(id, title, school, author, relPath, wiki) {
  return {
    id,
    title,
    school,
    author,
    license: LICENSE_SHUSHU,
    sourceNote: wiki,
    files: [{ url: `${SHUSHU}/${relPath}`, label: '全文' }],
  };
}

// 只收作者卒年足够久的公版。不下：韦千里、袁树珊、尚秉和、杭辛斋、陈公笃、徐乐吾评注。
BOOKS.push(
  shushu('xingxue', '星学大成', '星命', '明·万民英', '命理/星学大成-明-万民英.txt', 'https://zh.wikisource.org/wiki/星學大成'),
  shushu('sanmingzhimi', '三命指迷赋', '八字', '宋·岳珂', '命理/三命指迷赋-宋-岳珂.txt', 'https://zh.wikisource.org/wiki/三命指迷賦'),
  shushu('lantai', '兰台妙选', '八字', '明·西窗老人', '命理/兰台妙选-明-西窗老人.txt', 'https://zh.wikisource.org/wiki/蘭臺妙選'),
  shushu('xingmingzonggua', '星命总括', '星命', '辽·耶律纯', '命理/星命总括-辽-耶律纯.txt', 'https://zh.wikisource.org/wiki/星命總括'),
  shushu('zhangguo', '张果星宗', '星命', '明·佚名', '命理/张果星宗-明-佚名.txt', 'https://zh.wikisource.org/wiki/張果星宗'),
  shushu('ditiansuichanwei', '滴天髓阐微', '八字', '明·刘基 / 清·任铁樵注', '命理/滴天髓阐微-清-任铁樵.txt', 'https://zh.wikisource.org/wiki/滴天髓闡微'),
  shushu('qianyuan', '乾元秘旨', '八字', '清·舒继英', '命理/乾元秘旨-清-舒继英.txt', 'https://zh.wikisource.org/wiki/乾元秘旨'),
  shushu('bushiquanshu', '卜筮全书', '易学', '明·姚际隆', '占卜/卜筮全书-明-姚际隆.txt', 'https://zh.wikisource.org/wiki/卜筮全書'),
  shushu('bushizhengzong', '卜筮正宗', '易学', '清·王洪绪', '占卜/卜筮正宗-清-王洪绪.txt', 'https://zh.wikisource.org/wiki/卜筮正宗'),
  shushu('huozhulin', '火珠林', '易学', '宋·麻衣道者', '占卜/火珠林-宋-麻衣道者.txt', 'https://zh.wikisource.org/wiki/火珠林'),
  shushu('duanyi', '断易天机', '易学', '明·佚名', '占卜/断易天机-明-佚名.txt', 'https://zh.wikisource.org/wiki/斷易天機'),
  shushu('yimai', '易冒', '易学', '清·程良玉', '周易/易冒-清-程良玉.txt', 'https://zh.wikisource.org/wiki/易冒'),
  shushu('yiyin', '易隐', '易学', '清·曹九锡', '周易/易隐-清-曹九锡.txt', 'https://zh.wikisource.org/wiki/易隱'),
  shushu('jiaoshiyilin', '焦氏易林', '易学', '汉·焦延寿', '周易/焦氏易林-汉-焦延寿.txt', 'https://zh.wikisource.org/wiki/焦氏易林'),
  shushu('jingshi', '京氏易传', '易学', '汉·京房', '周易/京氏易传-汉-京房.txt', 'https://zh.wikisource.org/wiki/京氏易傳'),
  shushu('huangjijingshi', '皇极经世', '易学', '宋·邵雍', '周易/皇极经世-宋-邵雍.txt', 'https://zh.wikisource.org/wiki/皇極經世'),
  shushu('zhouyibianyi', '周易本义', '易学', '宋·朱熹', '周易/周易本义-宋-朱熹.txt', 'https://zh.wikisource.org/wiki/周易本義'),
  shushu('wuxingdayi', '五行大义', '五行', '隋·萧吉', '其他/五行大义-隋-萧吉.txt', 'https://zh.wikisource.org/wiki/五行大義'),
  shushu('tuibeitu', '推背图', '谶纬', '唐·李淳风（传）', '其他/推背图-唐-李淳风.txt', 'https://zh.wikisource.org/wiki/推背圖'),
  shushu('zhaijing', '宅经', '堪舆', '旧题黄帝', '堪舆风水/宅经--.txt', 'https://zh.wikisource.org/wiki/黃帝宅經'),
  shushu('zangshu', '葬书', '堪舆', '晋·郭璞', '堪舆风水/葬书-晋-郭璞.txt', 'https://zh.wikisource.org/wiki/葬書'),
  shushu('hanlong', '撼龙经', '堪舆', '唐·杨筠松', '堪舆风水/撼龙经-唐-杨筠松.txt', 'https://zh.wikisource.org/wiki/撼龍經'),
  shushu('qingnang', '青囊奥语', '堪舆', '唐·杨筠松', '堪舆风水/青囊奥语-唐-杨筠松.txt', 'https://zh.wikisource.org/wiki/青囊奧語'),
  shushu('liurenquan', '六壬大全', '六壬', '明·郭载騋', '六壬/六壬大全-明-郭载騋.txt', 'https://zh.wikisource.org/wiki/六壬大全'),
  shushu('dunjia', '遁甲演义', '奇门', '明·程道生', '奇门遁甲/遁甲演义-明-程道生.txt', 'https://zh.wikisource.org/wiki/遁甲演義'),
  shushu('taiyijinjing', '太乙金镜式经', '太乙', '唐·王希明', '奇门遁甲/太乙金镜式经-唐-王希明.txt', 'https://zh.wikisource.org/wiki/太乙金鏡式經'),
  shushu('shenxiang', '神相全编', '相术', '宋·陈抟（传）', '相术/神相全编-宋-陈抟.txt', 'https://zh.wikisource.org/wiki/神相全編'),
  shushu('bingjian', '冰鉴', '相术', '清·曾国藩', '相术/冰鉴-清-曾国藩.txt', 'https://zh.wikisource.org/wiki/冰鑑'),
  shushu('taiqing', '太清神鉴', '相术', '五代·王朴', '相术/太清神鉴-五代-王朴.txt', 'https://zh.wikisource.org/wiki/太清神鑑'),
  shushu('xufu', '许负相法', '相术', '汉·许负（传）', '相术/许负相法-汉-许负.txt', 'https://zh.wikisource.org/wiki/許負'),
);

BOOKS.push(
  shushu('xushiluolu', '徐氏珞琭子赋注', '八字', '宋·徐子平', '命理/徐氏珞琭子赋注-宋-徐子平.txt', 'https://zh.wikisource.org/wiki/珞琭子賦注'),
  shushu('yuetanfu', '月谈赋', '八字', '明·佚名', '命理/月谈赋-明-佚名.txt', 'https://zh.wikisource.org/wiki/月談賦'),
  shushu('minglizhengzong', '命理正宗', '八字', '明·张楠', '命理/命理正宗--张神峰.txt', 'https://zh.wikisource.org/wiki/神峰通考'),
  shushu('zipingzhengquan', '子平真诠', '八字', '清·沈孝瞻', '命理/子平真诠评注-清-沈孝瞻.txt', 'https://zh.wikisource.org/wiki/子平真詮'),
  shushu('zhouyijizhu', '周易集注', '易学', '明·来知德', '周易/周易集注-明-来知德.txt', 'https://zh.wikisource.org/wiki/周易集註_(來知德)'),
  shushu('zhouyijijie', '周易集解', '易学', '唐·李鼎祚', '周易/周易集解-唐-李鼎祚.txt', 'https://zh.wikisource.org/wiki/周易集解'),
  shushu('zhouyizhengyi', '周易正义', '易学', '唐·孔颖达', '周易/周易正义-唐-孔颖达.txt', 'https://zh.wikisource.org/wiki/周易正義'),
  shushu('yichuanyizhuan', '伊川易传', '易学', '宋·程颐', '周易/伊川易传-宋-程颐.txt', 'https://zh.wikisource.org/wiki/伊川易傳'),
  shushu('dongpoyizhuan', '东坡易传', '易学', '宋·苏轼', '周易/东坡易传-宋-苏东坡.txt', 'https://zh.wikisource.org/wiki/東坡易傳'),
  shushu('zhouyilueli', '周易略例', '易学', '晋·王弼', '周易/周易略例-晋-王弼.txt', 'https://zh.wikisource.org/wiki/周易略例'),
  shushu('taixuanjing', '太玄经', '易学', '汉·扬雄', '周易/太玄经-汉-杨雄.txt', 'https://zh.wikisource.org/wiki/太玄經'),
  shushu('yulinbuyi', '易林补遗', '易学', '明·张世宝', '周易/易林补遗-明-张世宝.txt', 'https://zh.wikisource.org/wiki/易林補遺'),
  shushu('zhouyishangzhan', '周易尚占', '易学', '元·李道纯', '周易/周易尚占-元-李道纯.txt', 'https://zh.wikisource.org/wiki/周易尚占'),
  shushu('zhouyichanzhen', '周易阐真', '易学', '清·刘一明', '周易/周易阐真-清-刘一明.txt', 'https://zh.wikisource.org/wiki/周易闡真'),
  shushu('zhouyishu', '周易述', '易学', '清·惠栋', '周易/周易述-清-惠栋.txt', 'https://zh.wikisource.org/wiki/周易述'),
  shushu('zhouyiqianshu', '周易浅述', '易学', '清·陈梦雷', '周易/周易浅述-清-陈梦雷.txt', 'https://zh.wikisource.org/wiki/周易淺述'),
  shushu('yuzuan', '御纂周易折中', '易学', '清·李光地', '周易/御纂周易折中-清-李光地.txt', 'https://zh.wikisource.org/wiki/御纂周易折中'),
  shushu('zhengyixinfa', '正易心法', '易学', '宋·麻衣道者', '周易/正易心法-宋-麻衣道者.txt', 'https://zh.wikisource.org/wiki/正易心法'),
  shushu('zhoumengjie', '周公解梦', '占卜', '旧题周公', '占卜/周公解梦--佚名.txt', 'https://zh.wikisource.org/wiki/周公解夢'),
  shushu('wenwangjinqian', '文王金钱课', '占卜', '旧题姬昌', '占卜/文王金钱课-周-姬昌.txt', 'https://zh.wikisource.org/wiki/文王課'),
  shushu('duanyiguiling', '断易鬼灵经', '占卜', '佚名', '占卜/断易鬼灵经--佚名.txt', 'https://zh.wikisource.org/wiki/斷易天機'),
  shushu('haidiyan', '海底眼', '占卜', '宋·王鼎', '占卜/海底眼-宋-王鼎.txt', 'https://zh.wikisource.org/wiki/海底眼'),
  shushu('yanqintongzuan', '演禽通纂', '占卜', '佚名', '占卜/演禽通纂--佚名.txt', 'https://zh.wikisource.org/wiki/演禽通纂'),
  shushu('qinxingyijian', '禽星易见', '占卜', '明·池本理', '占卜/禽星易见-明-池本理.txt', 'https://zh.wikisource.org/wiki/禽星易見'),
  shushu('cezimidie', '测字秘牒', '占卜', '清·程省', '占卜/测字秘牒-清-程省.txt', 'https://zh.wikisource.org/wiki/測字秘牒'),
  shushu('yizhangjing', '神机妙算一掌经', '占卜', '唐·张遂（传）', '占卜/神机妙算一掌经-唐-张遂.txt', 'https://zh.wikisource.org/wiki/一掌經'),
  shushu('zhugeshenshu', '诸葛神数', '占卜', '旧题诸葛亮', '占卜/秘本诸葛神数-三国蜀-诸葛亮.txt', 'https://zh.wikisource.org/wiki/諸葛神數'),
  shushu('tianjing', '天玉经', '堪舆', '唐·杨筠松', '堪舆风水/天玉经-唐-杨筠松.txt', 'https://zh.wikisource.org/wiki/天玉經'),
  shushu('yilongjing', '疑龙经', '堪舆', '唐·杨筠松', '堪舆风水/疑龙经-唐-杨筠松.txt', 'https://zh.wikisource.org/wiki/疑龍經'),
  shushu('zangfadaozhang', '葬法倒杖', '堪舆', '唐·杨筠松', '堪舆风水/葬法倒杖-唐-杨筠松.txt', 'https://zh.wikisource.org/wiki/葬法倒杖'),
  shushu('qingnangxu', '青囊序', '堪舆', '唐·杨筠松', '堪舆风水/青囊序-唐-杨筠松.txt', 'https://zh.wikisource.org/wiki/青囊序'),
  shushu('qingwu', '青乌经', '堪舆', '旧题樗里子', '堪舆风水/青乌经-秦-樗里子.txt', 'https://zh.wikisource.org/wiki/青烏先生葬經'),
  shushu('cuiguan', '催官篇', '堪舆', '宋·赖文俊', '堪舆风水/催官篇-宋-赖文俊.txt', 'https://zh.wikisource.org/wiki/催官篇'),
  shushu('rudiyan', '入地眼全书', '堪舆', '宋·静道和尚', '堪舆风水/入地眼全书-宋-静道.txt', 'https://zh.wikisource.org/wiki/入地眼全書'),
  shushu('pingshayuchi', '平砂玉尺经', '堪舆', '元·刘秉忠', '堪舆风水/平砂玉尺经-元-刘秉忠.txt', 'https://zh.wikisource.org/wiki/平砂玉尺經'),
  shushu('dilbianzheng', '地理辨正', '堪舆', '清·蒋大鸿', '堪舆风水/地理辨正-清-蒋大鸿.txt', 'https://zh.wikisource.org/wiki/地理辨正'),
  shushu('renzixuzhi', '人子须知', '堪舆', '明·徐继善', '堪舆风水/人子须知-明-徐继善.txt', 'https://zh.wikisource.org/wiki/人子須知'),
  shushu('lingcheng', '灵城精义', '堪舆', '南唐·何溥', '堪舆风水/灵城精义-南唐-何溥.txt', 'https://zh.wikisource.org/wiki/靈城精義'),
  shushu('liurenzhinan', '六壬指南', '六壬', '明·陈公献', '六壬/六壬指南-明-陈公献.txt', 'https://zh.wikisource.org/wiki/大六壬指南'),
  shushu('liurenxinjing', '六壬心镜', '六壬', '唐·徐道符', '六壬/六壬心镜-唐-徐道符.txt', 'https://zh.wikisource.org/wiki/六壬心鏡'),
  shushu('liurenduanan', '六壬断案', '六壬', '宋·邵彦和', '六壬/六壬断案-宋-邵彦和.txt', 'https://zh.wikisource.org/wiki/六壬斷案'),
  shushu('liurencuiyan', '六壬粹言', '六壬', '清·刘赤江', '六壬/六壬粹言-清-刘赤江.txt', 'https://zh.wikisource.org/wiki/六壬粹言'),
  shushu('liurengui', '壬归', '六壬', '清·佚名', '六壬/壬归-清-佚名.txt', 'https://zh.wikisource.org/wiki/壬歸'),
  shushu('liurenjinkou', '六壬神课金口诀', '六壬', '佚名', '六壬/六壬神课金口诀古本--佚名.txt', 'https://zh.wikisource.org/wiki/大六壬神課金口訣'),
  shushu('qimenzong', '奇门遁甲统宗', '奇门', '旧题诸葛亮', '奇门遁甲/奇门遁甲统宗-三国蜀-诸葛亮.txt', 'https://zh.wikisource.org/wiki/奇門遁甲統宗大全'),
  shushu('qimenmiji', '奇门遁甲秘笈大全', '奇门', '明·刘基（传）', '奇门遁甲/奇门遁甲秘笈大全-明-刘伯温.txt', 'https://zh.wikisource.org/wiki/奇門遁甲秘笈大全'),
  shushu('dunjiafuying', '遁甲符应经', '奇门', '宋·杨维德', '奇门遁甲/遁甲符应经-宋-杨维德.txt', 'https://zh.wikisource.org/wiki/遁甲符應經'),
  shushu('taiyimishu', '太乙秘书', '太乙', '宋·王佐', '奇门遁甲/太乙秘书-宋-王佐.txt', 'https://zh.wikisource.org/wiki/太乙秘書'),
  shushu('xieji', '协纪辨方书', '择日', '清·梅毂成等', '其他/钦定协纪辨方书-清-梅毂成.txt', 'https://zh.wikisource.org/wiki/欽定協紀辨方書'),
  shushu('kaiyuanzhanjing', '开元占经', '星占', '唐·瞿昙悉达', '其他/开元占经-唐-瞿昙悉达.txt', 'https://zh.wikisource.org/wiki/開元占經'),
  shushu('lingtaimiyuan', '灵台秘苑', '星占', '宋·王安礼', '其他/灵台秘苑-宋-王安礼.txt', 'https://zh.wikisource.org/wiki/靈臺秘苑'),
  shushu('shushujiyi', '数术记遗', '数术', '汉·徐岳', '其他/数术记遗-汉-徐岳.txt', 'https://zh.wikisource.org/wiki/數術記遺'),
  shushu('liuzhuang', '柳庄相法', '相术', '明·袁珙', '相术/柳庄相法-明-袁珙.txt', 'https://zh.wikisource.org/wiki/柳莊相法'),
  shushu('renlundatong', '人伦大统赋', '相术', '金·张行简', '相术/人伦大统赋-金-张行简.txt', 'https://zh.wikisource.org/wiki/人倫大統賦'),
  shushu('xinxiangpian', '心相篇', '相术', '宋·陈抟', '相术/心相篇-宋-陈希夷.txt', 'https://zh.wikisource.org/wiki/心相篇'),
  shushu('yuebodong', '月波洞中记', '相术', '旧题郑樵', '相术/月波洞中记-宋-郑樵.txt', 'https://zh.wikisource.org/wiki/月波洞中記'),
  shushu('tieguandao', '神相铁关刀', '相术', '清·云谷山人', '相术/神相铁关刀-清-云谷山人.txt', 'https://zh.wikisource.org/wiki/神相鐵關刀'),
);

function xuanxue(id, title, school, author, folder, wiki) {
  return {
    id,
    title,
    school,
    author,
    license: LICENSE_XUANXUE,
    sourceNote: wiki,
    xuanxueFolder: folder,
    files: [],
  };
}

// 五行 / 八字：xuanxue 分章本 + shushubook「其他」里还缺的汉唐天文。不下现代讲义、评注、公笃/千里/袁树珊。
BOOKS.push(
  xuanxue('mingliyueyan', '命理约言', '八字', '清·陈素庵', '命理约言', 'https://zh.wikisource.org/wiki/命理約言'),
  xuanxue('zipingguanjian', '子平管见', '八字', '清·佚名', '子平管见', 'https://zh.wikisource.org/wiki/子平管見'),
  xuanxue('yudingziping', '御定子平', '八字', '清·允禄等', '御定子平', 'https://zh.wikisource.org/wiki/御定子平'),
  xuanxue('xingpinghuihai', '星平会海', '八字', '明·佚名', '星平会海', 'https://zh.wikisource.org/wiki/星平會海'),
  xuanxue('yuzhaodingzhen', '玉照定真经', '八字', '旧题张果', '玉照定真经', 'https://zh.wikisource.org/wiki/玉照定真經'),
  xuanxue('guiguyiwen', '鬼谷遗文', '八字', '旧题鬼谷子', '鬼谷遗文', 'https://zh.wikisource.org/wiki/鬼谷子'),
  xuanxue('guagua', '呱呱集', '八字', '清·佚名', '呱呱集', 'https://zh.wikisource.org/wiki/呱呱集'),
  xuanxue('nvmingguisui', '女命骨髓赋', '八字', '旧题刘基', '女命骨髓赋', 'https://zh.wikisource.org/wiki/三命通會'),
  xuanxue('taweifu', '增补太微赋', '八字', '宋·佚名', '增补太微赋', 'https://zh.wikisource.org/wiki/太微賦'),
  xuanxue('bifafa', '毕法赋', '八字', '宋·徐大升', '毕法赋', 'https://zh.wikisource.org/wiki/三命通會'),
  xuanxue('xuanweilun', '玄微论', '八字', '明·佚名', '玄微论', 'https://zh.wikisource.org/wiki/玄微論'),
  xuanxue('shenshadaquan', '神煞大全', '八字', '清·佚名', '神煞大全', 'https://zh.wikisource.org/wiki/神煞'),
  xuanxue('baziyueling', '八字月令', '五行', '明·余春台（传）', '八字月令', 'https://zh.wikisource.org/wiki/窮通寶鑑'),
  xuanxue('shijitianguan', '史记天官书', '五行', '汉·司马迁', '史记天官书', 'https://zh.wikisource.org/wiki/史記/卷027'),
  xuanxue('hanhutianwen', '汉书天文志', '五行', '汉·班固', '汉书天文志', 'https://zh.wikisource.org/wiki/漢書/卷026'),
  xuanxue('lingxian', '灵宪', '五行', '汉·张衡', '灵宪', 'https://zh.wikisource.org/wiki/靈憲'),
  shushu('wuxingzhan', '马王堆帛书五星占', '五行', '汉·佚名', '其他/马王堆汉墓帛书五星占--.txt', 'https://zh.wikisource.org/wiki/五星占'),
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripFrontmatter(md) {
  const s = String(md || '').replace(/^\uFEFF/, '');
  if (!s.startsWith('---')) return s.trim();
  const end = s.indexOf('\n---', 3);
  if (end < 0) return s.trim();
  return s.slice(end + 4).trim();
}

function stripMarkdownNoise(text) {
  return String(text || '')
    .replace(/^>\s.*$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const { execFileSync } = require('child_process');

function decodeBytes(buf) {
  if (!buf || !buf.length) return '';
  const b0 = buf[0];
  const b1 = buf[1];
  const b2 = buf[2];
  if (b0 === 0xff && b1 === 0xfe) return new TextDecoder('utf-16le').decode(buf.slice(2));
  if (b0 === 0xfe && b1 === 0xff) return new TextDecoder('utf-16be').decode(buf.slice(2));
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) return buf.slice(3).toString('utf8');
  const sample = buf.subarray(0, Math.min(buf.length, 400));
  let nulls = 0;
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) nulls++;
  if (nulls > sample.length / 6) {
    const evenNull = [...sample].filter((_, i) => i % 2 === 1 && sample[i] === 0).length;
    return new TextDecoder(evenNull > nulls / 2 ? 'utf-16le' : 'utf-16be').decode(buf);
  }
  const utf8 = buf.toString('utf8');
  const fffd = (utf8.match(/\uFFFD/g) || []).length;
  if (fffd === 0) return utf8;
  return new TextDecoder('gb18030').decode(buf);
}

function fetchBufferCurl(url) {
  return execFileSync(
    'curl.exe',
    ['-sL', '--fail', '--max-time', '180', '-A', 'FortuneBallCanonBot/1.0', encodeURI(url)],
    { encoding: 'buffer', maxBuffer: 30 * 1024 * 1024 },
  );
}

async function fetchText(url) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      return decodeBytes(fetchBufferCurl(url));
    } catch (e1) {
      last = e1;
      if (i < 3) await sleep(700 * (i + 1));
    }
  }
  process.stderr.write(`curl fail, try fetch: ${last && last.message}\n`);
  const res = await fetch(encodeURI(url), {
    headers: { 'User-Agent': UA, Accept: 'application/octet-stream,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return decodeBytes(Buffer.from(await res.arrayBuffer()));
}

function fileLooksGarbled(p) {
  const b = fs.readFileSync(p);
  if (b.includes(0)) return true;
  const s = b.toString('utf8');
  return (s.match(/\uFFFD/g) || []).length >= 2;
}

function parseOnly() {
  const i = process.argv.indexOf('--only');
  if (i < 0 || !process.argv[i + 1]) return null;
  return new Set(
    process.argv[i + 1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function catalogEntry(book, out) {
  const bytes = fs.existsSync(out) ? fs.statSync(out).size : 0;
  const digital =
    (book.files[0] && book.files[0].url) ||
    (book.xuanxueFolder && `${XUANXUE}/${book.xuanxueFolder}/`);
  return {
    id: book.id,
    title: book.title,
    author: book.author || '',
    school: book.school,
    license: book.license,
    source: book.sourceNote,
    digital,
    raw: `raw/${book.id}.txt`,
    parts: book.files.length || 1,
    bytes,
  };
}

function fetchJsonCurl(url) {
  const buf = execFileSync(
    'curl.exe',
    ['-sL', '--fail', '--max-time', '60', '-A', UA, url],
    { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
  );
  return JSON.parse(buf.toString('utf8'));
}

let xuanxueTreeCache = null;
function listXuanxueFiles(folder) {
  if (!xuanxueTreeCache) {
    xuanxueTreeCache = fetchJsonCurl(
      'https://api.github.com/repos/youngzs/xuanxue/git/trees/main?recursive=1',
    );
  }
  const prefix = `docs/${folder}/`;
  return (xuanxueTreeCache.tree || [])
    .filter((x) => x.type === 'blob' && x.path.startsWith(prefix) && x.path.endsWith('.md'))
    .filter((x) => !x.path.endsWith('/index.md') && path.basename(x.path) !== 'index.md')
    .sort((a, b) => a.path.localeCompare(b.path, 'zh'))
    .map((x) => {
      const base = path.basename(x.path, '.md').replace(/^\d+/, '');
      return { url: `https://raw.githubusercontent.com/youngzs/xuanxue/main/${x.path}`, label: base || folder };
    });
}

function resolveBookFiles(book) {
  if (book.xuanxueFolder && (!book.files || !book.files.length)) {
    book.files = listXuanxueFiles(book.xuanxueFolder);
  }
}

function writeCatalog() {
  const catalog = [];
  for (const book of BOOKS) {
    const out = path.join(RAW, `${book.id}.txt`);
    if (!fs.existsSync(out)) continue;
    try {
      resolveBookFiles(book);
    } catch (e) {
      process.stderr.write(`list ${book.id}: ${e.message}\n`);
    }
    catalog.push(catalogEntry(book, out));
  }
  const catPath = path.join(ROOT, 'catalog.json');
  fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2), 'utf8');
  const srcMd = [
    '# 典籍出处',
    '',
    '原文均为公版古籍。数字文本来自 [mingli](https://github.com/qq250113397-dotcom/mingli)（维基文库 CC BY-SA 4.0）、[shushubook](https://github.com/kentang2017/shushubook) 或 [xuanxue](https://github.com/youngzs/xuanxue)。',
    '',
    '| 书名 | 作者/时代 | 门类 | 维基文库 | 数字镜像 |',
    '|---|---|---|---|---|',
    ...catalog.map((b) => `| ${b.title} | ${b.author || '—'} | ${b.school} | ${b.source} | ${b.digital || ''} |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'SOURCES.md'), srcMd, 'utf8');
  console.log('catalog', catPath, catalog.length, 'books');
}

async function downloadAll() {
  fs.mkdirSync(RAW, { recursive: true });
  const only = parseOnly();
  const force = process.argv.includes('--force');

  for (const book of BOOKS) {
    if (only && !only.has(book.id)) continue;
    const out = path.join(RAW, `${book.id}.txt`);
    if (!force && fs.existsSync(out) && fs.statSync(out).size > 200 && !fileLooksGarbled(out)) {
      const cur = fs.readFileSync(out);
      if (!(cur[0] === 0xef && cur[1] === 0xbb && cur[2] === 0xbf)) {
        fs.writeFileSync(out, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), cur]));
      }
      console.log(`skip ${book.id} (${fs.statSync(out).size} bytes)`);
      continue;
    }

    try {
      resolveBookFiles(book);
      if (!book.files.length) throw new Error('no files');
      const parts = [`# ${book.title}`, `来源: ${book.sourceNote}`, `许可: ${book.license}`, ''];
      for (const file of book.files) {
        process.stderr.write(`fetch ${book.id} ${file.label}\n`);
        const md = await fetchText(file.url);
        const body = stripMarkdownNoise(stripFrontmatter(md));
        parts.push(`===== ${file.label} =====`);
        parts.push(body);
        parts.push('');
        await sleep(DELAY_MS);
      }
      // UTF-8 BOM：Windows 记事本才能认编码，否则会显示乱码
      fs.writeFileSync(out, `\uFEFF${parts.join('\n')}`, 'utf8');
      console.log(`wrote ${out} (${fs.statSync(out).size} bytes, ${book.files.length} parts)`);
    } catch (e) {
      console.error(`FAIL ${book.id}: ${e.message}`);
    }
  }

  writeCatalog();
}

// ponytail: 按 ===== 分段再按空行合并；够 RAG v1
function chunkBook(id, text, maxLen = 700) {
  const sections = text.split(/^===== (.+) =====$/m);
  const chunks = [];
  let n = 0;
  for (let i = 1; i < sections.length; i += 2) {
    const sectionTitle = (sections[i] || '').trim();
    const body = (sections[i + 1] || '').trim();
    if (!body) continue;
    const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buf = '';
    for (const p of paras) {
      const next = buf ? `${buf}\n\n${p}` : p;
      if (next.length > maxLen && buf) {
        n += 1;
        chunks.push({ id: `${id}-${n}`, book: id, title: sectionTitle, tags: [sectionTitle], text: buf });
        buf = p;
      } else {
        buf = next;
      }
    }
    if (buf) {
      n += 1;
      chunks.push({ id: `${id}-${n}`, book: id, title: sectionTitle, tags: [sectionTitle], text: buf });
    }
  }
  return chunks;
}

function chunkAll() {
  fs.mkdirSync(ROOT, { recursive: true });
  const only = parseOnly();
  for (const book of BOOKS) {
    if (only && !only.has(book.id)) continue;
    const raw = path.join(RAW, `${book.id}.txt`);
    if (!fs.existsSync(raw)) {
      console.error(`missing raw: ${raw} (先跑不带 --chunk)`);
      process.exitCode = 1;
      continue;
    }
    const chunks = chunkBook(book.id, fs.readFileSync(raw, 'utf8'));
    const out = path.join(ROOT, `${book.id}.json`);
    fs.writeFileSync(out, JSON.stringify(chunks, null, 2), 'utf8');
    console.log(`chunks ${book.id}: ${chunks.length} → ${out}`);
  }
}

module.exports = { BOOKS };

if (require.main === module) {
  (async () => {
    if (process.argv.includes('--chunk')) chunkAll();
    else await downloadAll();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
