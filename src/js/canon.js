// canon.js - 典籍检索（本地 RAG 的检索层，不依赖网络与大模型）
// 数据来自 data/canon/index.json（由 scripts/build-canon-index.js 生成）。
// 能力：繁简归一 + 停用词 + 双字/单字加权 + BM25 排序 + 命中摘录。
// 纯 Node，可在 smoke-test 直接断言。

const fs = require('fs');
const path = require('path');

let INDEX = null;
let IDX = null;

// ---------- 繁简归一（只收命理/黄历常见字） ----------
const T2S_PAIRS = '乾乾 坤坤 訟讼 師师 蠱蛊 觀观 賁贲 剝剥 復复 頤颐 離离 遯遁 壯壮 晉晋 損损 漸渐 歸归 豐丰 兌兑 渙涣 節节 過过 濟济 '
  + '陰阴 陽阳 聲声 氣气 勢势 萬万 與与 為为 於于 從从 後后 覺觉 學学 說说 將将 應应 當当 發发 開开 關关 間间 會会 內内 兩两 時时 實实 質质 '
  + '動动 進进 遠远 運运 過过 這这 麼么 樣样 點点 數数 種种 認认 識识 觀观 淨净 織织 絲丝 經经 續续 繼继 練练 終终 統统 緣缘 紀纪 約约 '
  + '見见 視视 規规 親亲 覺觉 觸触 計计 讓让 託托 許许 証证 詩诗 試试 話话 語语 誰谁 請请 謝谢 議议 讀读 變变 讓让 豐丰 敗败 殺杀 氣气 '
  + '剋克 衝冲 進进 貴贵 財财 門门 問问 聞闻 幹干 歲岁 歷历 曆历 難难 頭头 顯显 體体 髮发 鬥斗 養养 醫医 藥药 鬆松 鬱郁 靈灵 壽寿 '
  + '製制 麵面 麵面 遊游 遊游 裡里 裏里 週周 遞递 遲迟 遲迟 遺遗 選选 還还 邊边 鄰邻 鄉乡 郵邮 醜丑 鈔钞 錢钱 鑽钻 長长 開开 陰阴 '
  + '陳陈 陽阳 隱隐 雜杂 雙双 雞鸡 離离 電电 震震 靜静 韓韩 順顺 須须 預预 領领 頌颂 願愿 類类 風风 飛飞 飯饭 餵喂 驅驱 驗验 驚惊 '
  + '鬥斗 魚鱼 鳥鸟 鳳凤 鳴鸣 麗丽 黃黄 黨党 齊齐 齒齿 龍龙 龜龟';

const T2S = {};
// 注意：必须去掉配对串里的空白，否则两两配对会错位（把空格映射成汉字）
const T2S_FLAT = T2S_PAIRS.split('').filter((ch) => !/\s/.test(ch)).join('');
for (let i = 0; i < T2S_FLAT.length; i += 2) {
  const a = T2S_FLAT[i];
  const b = T2S_FLAT[i + 1];
  if (a && b && a !== b) T2S[a] = b;
}

const STOP = new Set('的了是在和與与有也就都而及或者个個这這那要會会把被让讓给給不无不無一二三四五六七八九十百千之其所以为為上中下内外內外前后前後左右'.split(''));

function normalize(text) {
  let out = '';
  for (const ch of String(text || '')) {
    out += T2S[ch] || ch;
  }
  return out;
}

// 中文按字切分（不引入词典），英文/数字按串
function tokenize(text) {
  const norm = normalize(text).toLowerCase();
  const tokens = [];
  const re = /[a-z0-9]+|[一-鿿]/g;
  let m;
  while ((m = re.exec(norm))) {
    const t = m[0];
    if (t.length === 1 && STOP.has(t)) continue;
    tokens.push(t);
  }
  // 双字片段（提高短语命中权重）
  const cn = norm.match(/[一-鿿]+/g) || [];
  for (const run of cn) {
    for (let i = 0; i + 1 < run.length; i++) {
      const bi = run.slice(i, i + 2);
      if (STOP.has(bi[0]) || STOP.has(bi[1])) continue;
      tokens.push(bi);
    }
  }
  return tokens;
}

function load() {
  if (INDEX) return INDEX;
  const file = path.join(__dirname, '..', '..', 'data', 'canon', 'index.json');
  try {
    INDEX = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    INDEX = { version: 0, books: [], docs: [] };
  }
  return INDEX;
}

function buildIndexData() {
  if (IDX) return IDX;
  const data = load();
  const docs = data.docs || [];
  const df = new Map();
  const docTokens = docs.map((d) => {
    const text = normalize(`${d.title}\n${d.tags ? d.tags.join(' ') : ''}\n${d.text}`);
    const tf = new Map();
    for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1);
    const seen = new Set(tf.keys());
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
    const len = [...tf.values()].reduce((a, b) => a + b, 0) || 1;
    return { tf, len };
  });
  const avgLen = docTokens.reduce((s, d) => s + d.len, 0) / (docTokens.length || 1);
  IDX = { docs, docTokens, df, avgLen, total: docs.length };
  return IDX;
}

// BM25
const K1 = 1.4;
const B = 0.72;

function scoreDocs(queryTokens) {
  const idx = buildIndexData();
  const q = new Map();
  for (const t of queryTokens) q.set(t, (q.get(t) || 0) + 1);
  const scores = new Array(idx.total).fill(0);
  for (const [t, qtf] of q) {
    const df = idx.df.get(t) || 0;
    if (!df) continue;
    const idf = Math.log(1 + (idx.total - df + 0.5) / (df + 0.5));
    // 双字权重更高
    const w = t.length >= 2 ? 1.6 : 1;
    for (let i = 0; i < idx.total; i++) {
      const { tf, len } = idx.docTokens[i];
      const f = tf.get(t) || 0;
      if (!f) continue;
      scores[i] += w * idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / idx.avgLen)))) * Math.min(qtf, 3);
    }
  }
  return scores;
}

function excerpt(text, queryTokens, maxLen = 260) {
  const norm = normalize(text);
  let best = -1;
  let bestCount = 0;
  for (const t of queryTokens) {
    if (t.length < 2) continue;
    const i = norm.indexOf(t);
    if (i < 0) continue;
    let count = 0;
    let j = i;
    while ((j = norm.indexOf(t, j)) >= 0) { count++; j += t.length; }
    if (count > bestCount) { bestCount = count; best = i; }
  }
  if (best < 0) return { text: String(text).slice(0, maxLen), matched: false };
  const start = Math.max(0, best - 40);
  const end = Math.min(String(text).length, start + maxLen);
  return { text: (start > 0 ? '…' : '') + String(text).slice(start, end) + (end < String(text).length ? '…' : ''), matched: true };
}

/**
 * 检索典籍
 * @param {string} query 用户问题
 * @param {{book?: string, limit?: number}} opts book: zhouyi|ditiansui|yuanhai
 * @returns {{ok:boolean, query:string, results:Array}}
 */
function search(query, opts = {}) {
  const idx = buildIndexData();
  if (!idx.total) return { ok: false, error: 'NO_INDEX', results: [] };
  if (!String(query || '').trim()) return { ok: false, error: 'EMPTY_QUERY', results: [] };
  const tokens = tokenize(query);
  if (!tokens.length) return { ok: false, error: 'EMPTY_QUERY', results: [] };
  const scores = scoreDocs(tokens);
  const limit = Math.max(1, Math.min(opts.limit || 3, 5));
  let list = idx.docs.map((d, i) => ({ doc: d, score: scores[i] })).filter((x) => x.score > 0);
  if (opts.book) list = list.filter((x) => x.doc.book === opts.book);
  list.sort((a, b) => b.score - a.score);
  const results = list.slice(0, limit).map(({ doc, score }) => {
    const ex = excerpt(doc.text, tokens);
    return {
      ref: doc.ref,
      book: doc.book,
      title: doc.title,
      text: ex.text,
      matched: ex.matched,
      score: Math.round(score * 100) / 100,
    };
  });
  return {
    ok: results.length > 0,
    query,
    tokens: tokens.slice(0, 12),
    results,
    totalDocs: idx.total,
  };
}

function books() {
  const data = load();
  return data.books || [];
}

module.exports = { search, books, normalize, tokenize, excerpt };
