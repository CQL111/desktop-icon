// legal.js - 渲染法律文档（内容来自 legal-data.js，由 scripts/build-legal.js 生成）
const key = new URLSearchParams(location.search).get('doc') || 'privacy';
const doc = (window.LEGAL || {})[key];
const box = document.getElementById('doc');
if (doc) {
  document.title = doc.title + ' · 今日运势';
  box.innerHTML = doc.html;
} else {
  box.innerHTML = '<p class="loading">文档未找到（' + key + '）。请重新构建：npm run build:legal</p>';
}
