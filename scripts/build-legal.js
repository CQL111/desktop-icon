#!/usr/bin/env node
// 把 docs/legal/*.md 转成 src/legal-data.js（应用内展示用，零依赖）
// usage: node scripts/build-legal.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'legal');
const OUT = path.join(ROOT, 'src', 'legal-data.js');

const DOCS = [
  { key: 'privacy', file: 'privacy-policy.md', title: '隐私政策' },
  { key: 'terms', file: 'user-agreement.md', title: '用户协议' },
  { key: 'disclaimer', file: 'disclaimer.md', title: '免责声明' },
  { key: 'thirdparty', file: 'third-party-licenses.md', title: '第三方与开源许可' },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  out = out.replace(/(^|[^"=])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');
  return out;
}

function toHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let listOpen = false;
  const closeList = () => {
    if (listOpen) { out.push('</ul>'); listOpen = false; }
  };
  while (i < lines.length) {
    const line = lines[i];
    // 代码块
    if (/^```/.test(line)) {
      closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // 表格
    if (/^\|/.test(line) && /^\|\s*-/.test(lines[i + 1] || '')) {
      closeList();
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push('<table><thead><tr>' + head.map((h) => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>');
      for (const r of rows) out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    }
    // 标题
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }
    // 分隔线
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); i++; continue; }
    // 引用
    if (/^>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    // 列表
    if (/^\s*[-*]\s+/.test(line)) {
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
      i++;
      continue;
    }
    // 空行
    if (!line.trim()) { closeList(); i++; continue; }
    // 段落
    closeList();
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\||```|>|\s*[-*]\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

const data = {};
for (const d of DOCS) {
  const file = path.join(SRC, d.file);
  if (!fs.existsSync(file)) {
    console.warn('跳过（不存在）:', d.file);
    continue;
  }
  data[d.key] = { title: d.title, html: toHtml(fs.readFileSync(file, 'utf8')) };
}
const js = `// 自动生成：node scripts/build-legal.js（勿手改）
window.LEGAL = ${JSON.stringify(data, null, 2)};
`;
fs.writeFileSync(OUT, js, 'utf8');
console.log('legal-data.js', (fs.statSync(OUT).size / 1024).toFixed(1) + 'KB', 'docs:', Object.keys(data).join(','));
