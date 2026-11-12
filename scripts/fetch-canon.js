#!/usr/bin/env node
// 下载公版命理典籍原文 → data/canon/raw/
// 维基文库 API 在部分网络不可达，默认走 mingli 镜像（原文公版，数字文本 CC BY-SA 4.0）
//
// usage:
//   node scripts/fetch-canon.js
//   node scripts/fetch-canon.js --chunk
//   node scripts/fetch-canon.js --only zhouyi,ditiansui

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'canon');
const RAW = path.join(ROOT, 'raw');
const UA = 'FortuneBallCanonBot/1.0 (personal; local-dev)';
const DELAY_MS = 200;
const MINGLI =
  'https://raw.githubusercontent.com/qq250113397-dotcom/mingli/main/content/classics';

const BOOKS = [
  {
    id: 'zhouyi',
    title: '周易',
    school: '易学',
    license: '原文公版；数字文本 CC BY-SA 4.0（维基文库经 mingli 镜像）',
    sourceNote: 'https://zh.wikisource.org/wiki/周易',
    files: Array.from({ length: 64 }, (_, i) => ({
      url: `${MINGLI}/yixue/zhouyi-${String(i + 1).padStart(2, '0')}.md`,
      label: `第${i + 1}卦`,
    })),
  },
  {
    id: 'ditiansui',
    title: '滴天髓',
    school: '八字',
    license: '原文公版；数字文本 CC BY-SA 4.0（维基文库经 mingli 镜像）',
    sourceNote: 'https://zh.wikisource.org/wiki/滴天髓',
    files: Array.from({ length: 10 }, (_, i) => ({
      url: `${MINGLI}/bazi/ditiansui-${String(i + 1).padStart(2, '0')}.md`,
      label: `第${i + 1}篇`,
    })),
  },
  {
    id: 'yuanhai',
    title: '渊海子平',
    school: '八字',
    license: '原文公版；数字文本 CC BY-SA 4.0（维基文库经 mingli 镜像）',
    sourceNote: 'https://zh.wikisource.org/wiki/淵海子平',
    files: [
      {
        url: `${MINGLI}/bazi/yuanhai-ziping.md`,
        label: '全文',
      },
    ],
  },
];

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
    .replace(/^>\s.*$/gm, '') // 许可引用块
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/plain,*/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
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

async function downloadAll() {
  fs.mkdirSync(RAW, { recursive: true });
  const only = parseOnly();
  const catalog = [];

  for (const book of BOOKS) {
    if (only && !only.has(book.id)) continue;
    const parts = [];
    parts.push(`# ${book.title}`);
    parts.push(`来源: ${book.sourceNote}`);
    parts.push(`许可: ${book.license}`);
    parts.push('');

    for (const file of book.files) {
      process.stderr.write(`fetch ${book.id} ${file.label}\n`);
      const md = await fetchText(file.url);
      const body = stripMarkdownNoise(stripFrontmatter(md));
      parts.push(`===== ${file.label} =====`);
      parts.push(body);
      parts.push('');
      await sleep(DELAY_MS);
    }

    const out = path.join(RAW, `${book.id}.txt`);
    fs.writeFileSync(out, parts.join('\n'), 'utf8');
    const bytes = fs.statSync(out).size;
    console.log(`wrote ${out} (${bytes} bytes, ${book.files.length} parts)`);
    catalog.push({
      id: book.id,
      title: book.title,
      school: book.school,
      license: book.license,
      source: book.sourceNote,
      raw: `raw/${book.id}.txt`,
      parts: book.files.length,
      bytes,
    });
  }

  const catPath = path.join(ROOT, 'catalog.json');
  fs.writeFileSync(catPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log('catalog', catPath);
}

// ponytail: 按 ===== 分段再按空行合并；够 RAG v1，卦名/篇名再 refine
function chunkBook(id, text, maxLen = 700) {
  const sections = text.split(/^===== (.+) =====$/m);
  const chunks = [];
  let n = 0;

  // sections: [preamble, title1, body1, title2, body2, ...]
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
        chunks.push({
          id: `${id}-${n}`,
          book: id,
          title: sectionTitle,
          tags: [sectionTitle],
          text: buf,
        });
        buf = p;
      } else {
        buf = next;
      }
    }
    if (buf) {
      n += 1;
      chunks.push({
        id: `${id}-${n}`,
        book: id,
        title: sectionTitle,
        tags: [sectionTitle],
        text: buf,
      });
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

(async () => {
  if (process.argv.includes('--chunk')) chunkAll();
  else await downloadAll();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
