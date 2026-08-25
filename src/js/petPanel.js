// petPanel.js - 运势精灵面板逻辑
const $ = (id) => document.getElementById(id);

let toastTimer = null;
function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

// 维度定义（图标 + 颜色）
const DIMS = [
  { key: '综合', icon: '⭐', color: '#9b59b6' },
  { key: '爱情', icon: '❤️', color: '#ff6b81' },
  { key: '事业', icon: '💼', color: '#2ecc71' },
  { key: '财运', icon: '💰', color: '#f1c40f' },
  { key: '健康', icon: '🌿', color: '#3498db' },
];

// 五行 → 维度
const WUXING_DIM = { water: '综合', wood: '事业', metal: '财运', fire: '爱情', earth: '健康' };

function renderDims(boosts) {
  const container = $('dims');
  container.innerHTML = '';
  for (const d of DIMS) {
    const b = boosts[d.key] || 0;
    const row = document.createElement('div');
    row.className = 'dim-row';
    row.innerHTML = `
      <span class="dim-icon" style="background:${d.color}22;">${d.icon}</span>
      <span class="dim-name">${d.key}</span>
      <span class="dim-boost ${b > 0 ? 'pos' : 'zero'}">${b > 0 ? '+' + b : '0'}</span>
    `;
    container.appendChild(row);
  }
}

function renderBlessRow(remaining) {
  const row = $('bless-row');
  row.innerHTML = '';
  $('bless-remaining').textContent = remaining;
  for (const d of DIMS) {
    const btn = document.createElement('button');
    btn.className = 'bless-btn';
    btn.textContent = `${d.icon} ${d.key}`;
    btn.disabled = remaining <= 0;
    btn.addEventListener('click', () => bless(d.key));
    row.appendChild(btn);
  }
}

function renderPosHint(posWuxing, posDim) {
  const hint = $('pos-hint');
  if (posDim) {
    const names = { 综合: '文昌位', 事业: '事业位', 财运: '财位', 爱情: '桃花位', 健康: '健康位' };
    hint.textContent = `📍 球当前在${names[posDim] || posDim} → 正在积累：${posDim}`;
  } else {
    hint.textContent = '📍 移动球到屏幕不同方位，可积累对应维度的运势加持';
  }
}

// 祈福
async function bless(dim) {
  const result = await window.api.blessSpirit(dim);
  if (result.ok) {
    renderDims(result.boosts);
    renderBlessRow(result.remaining);
    showToast(`🙏 ${dim} 运势 +1`);
    window.logger.info('petPanel', `bless ${dim} +1`);
  } else {
    const msg = $('bless-msg');
    msg.className = 'bless-msg err';
    msg.textContent = result.error === 'DAILY_LIMIT' ? '今日祈福次数已用完' :
                      result.error === 'MAXED' ? `${dim} 加持已满` : '祈福失败';
    setTimeout(() => { msg.className = 'bless-msg'; msg.textContent = ''; }, 2000);
  }
}

// 加载
async function load() {
  const data = await window.api.getSpirit();
  renderDims(data.boosts);
  renderBlessRow(data.blessRemaining);
  renderPosHint(data.posWuxing, data.posDim);
  window.logger.info('petPanel', `loaded boosts=${JSON.stringify(data.boosts)} pos=${data.posWuxing}`);
}

$('close').addEventListener('click', () => window.close());
$('btn-ai').addEventListener('click', () => {
  window.close();
  window.api.openAiInput();
});

load();