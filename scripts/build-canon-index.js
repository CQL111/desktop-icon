#!/usr/bin/env node
// 构建典籍检索索引：data/canon/raw/*.txt → data/canon/index.json
// 清洗：去掉来源头、修正标题、按段落/篇章切分、繁简保留原文。
// usage: node scripts/build-canon-index.js
const fs = require('fs');
const path = require('path');
const { BOOKS: FETCH_BOOKS } = require('./fetch-canon');

const ROOT = path.join(__dirname, '..', 'data', 'canon');
const RAW = path.join(ROOT, 'raw');
const OUT = path.join(ROOT, 'index.json');

const BOOKS = Object.fromEntries(FETCH_BOOKS.map((b) => [b.id, { title: b.title, school: b.school, license: b.license }]));

const HEXAGRAMS = [
  '乾', '坤', '屯', '蒙', '需', '讼', '师', '比', '小畜', '履',
  '泰', '否', '同人', '大有', '谦', '豫', '随', '蛊', '临', '观',
  '噬嗑', '贲', '剥', '复', '无妄', '大畜', '颐', '大过', '坎', '离',
  '咸', '恒', '遁', '大壮', '晋', '明夷', '家人', '睽', '蹇', '解',
  '损', '益', '夬', '姤', '萃', '升', '困', '井', '革', '鼎',
  '震', '艮', '渐', '归妹', '丰', '旅', '巽', '兑', '涣', '节',
  '中孚', '小过', '既济', '未济',
];

const STEMS = ['甲木', '乙木', '丙火', '丁火', '戊土', '己土', '庚金', '辛金', '壬水', '癸水'];
const NL2 = /\n{2,}/;

function splitSections(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = /^=====\s*(.+?)\s*=====$/.exec(line.trim());
    if (m) {
      if (current) sections.push(current);
      current = { label: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function cleanText(lines) {
  return lines
    .map((l) => l.replace(/^next=.*$/, '').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleFromBuf(buf, fallback) {
  const firstLine = buf.split('\n').find((l) => l.trim()) || '';
  return firstLine.replace(/[《》【】]/g, '').split(/[。；！？]/)[0].slice(0, 16) || fallback;
}

function chunkBody(id, school, bookTitle, sectionLabel, body, maxLen = 900) {
  let paras = body.split(NL2).map((p) => p.trim()).filter(Boolean);
  // ponytail: 整本 txt 常只有单换行，退化为按行切再合并
  if (paras.length < 4) paras = body.split(/\n+/).map((p) => p.trim()).filter((p) => p.length > 8);
  const docs = [];
  let buf = '';
  let idx = 0;
  const flush = () => {
    if (!buf.trim()) return;
    idx += 1;
    const title = sectionLabel && sectionLabel !== '全文' ? sectionLabel : titleFromBuf(buf, `第${idx}节`);
    docs.push({
      id: `${id}-${docs.length + 1}`,
      book: id,
      title,
      tags: [school, bookTitle, title],
      text: buf.trim(),
    });
    buf = '';
  };
  for (const p of paras) {
    if (buf && (buf + '\n\n' + p).length > maxLen) flush();
    buf = buf ? buf + '\n\n' + p : p;
  }
  flush();
  return docs;
}

function buildZhouyi() {
  const text = fs.readFileSync(path.join(RAW, 'zhouyi.txt'), 'utf8');
  return splitSections(text).map((sec, i) => {
    const body = cleanText(sec.lines);
    const display = HEXAGRAMS[i] || `第${i + 1}卦`;
    return {
      id: `zhouyi-${i + 1}`,
      book: 'zhouyi',
      title: `第${i + 1}卦·${display}`,
      tags: ['易学', display, `第${i + 1}卦`],
      text: body,
    };
  });
}

function buildDitiansui() {
  const text = fs.readFileSync(path.join(RAW, 'ditiansui.txt'), 'utf8');
  const sections = splitSections(text);
  const docs = [];
  let n = 0;
  for (const sec of sections) {
    const body = cleanText(sec.lines);
    const paras = body.split(NL2).map((x) => x.trim()).filter(Boolean);
    let buf = [];
    let title = '';
    const push = () => {
      if (!buf.length) return;
      n += 1;
      const name = title || '通论';
      docs.push({
        id: `ditiansui-${n}`,
        book: 'ditiansui',
        title: name,
        tags: ['八字', '滴天髓', name],
        text: buf.join('\n\n'),
      });
      buf = [];
    };
    for (const p of paras) {
      const clean = p.replace(/\n/g, '').trim();
      if (STEMS.includes(clean)) {
        push();
        title = clean;
        buf.push(p);
      } else {
        buf.push(p);
      }
    }
    push();
  }
  const merged = [];
  for (const d of docs) {
    const prev = merged[merged.length - 1];
    if (prev && d.text.length < 120 && d.title === '通论') {
      prev.text = prev.text + '\n\n' + d.text;
    } else {
      merged.push(d);
    }
  }
  return merged;
}

function buildGeneric(id) {
  const meta = BOOKS[id];
  const file = path.join(RAW, `${id}.txt`);
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const sections = splitSections(text);
  const chunks = sections.length ? sections : [{ label: '全文', lines: text.split('\n') }];
  const docs = [];
  for (const sec of chunks) {
    const body = cleanText(sec.lines);
    if (!body) continue;
    docs.push(...chunkBody(id, meta.school, meta.title, sec.label, body));
  }
  return docs.map((d, i) => ({ ...d, id: `${id}-${i + 1}` }));
}

function main() {
  const special = { zhouyi: buildZhouyi, ditiansui: buildDitiansui };
  const docs = [];
  for (const id of Object.keys(BOOKS)) {
    const file = path.join(RAW, `${id}.txt`);
    if (!fs.existsSync(file)) {
      console.error('missing raw', id);
      continue;
    }
    const built = special[id] ? special[id]() : buildGeneric(id);
    docs.push(...built);
  }
  const meta = Object.entries(BOOKS)
    .map(([id, b]) => {
      const list = docs.filter((d) => d.book === id);
      if (!list.length) return null;
      return {
        id,
        title: b.title,
        school: b.school,
        license: b.license,
        docs: list.length,
        chars: list.reduce((s, d) => s + d.text.length, 0),
      };
    })
    .filter(Boolean);
  const out = {
    version: 1,
    builtAt: new Date().toISOString(),
    books: meta,
    docs: docs.map((d) => ({ ...d, ref: `${BOOKS[d.book].title}·${d.title}` })),
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  const size = fs.statSync(OUT).size;
  console.log('docs', docs.length, 'books', meta.length, 'size', (size / 1024).toFixed(1) + 'KB');
  for (const b of meta) console.log(' ', b.title, b.docs, 'docs', b.chars, 'chars');
}

main();
