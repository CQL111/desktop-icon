// settings.js - 设置面板逻辑（模型管理：线上 DeepSeek 硬编码 + 本地模型切换/下载）
const $ = (id) => document.getElementById(id);

function showStatus(type, text) {
  const el = $('pull-status');
  el.className = 'status ' + type;
  el.textContent = text;
}

// 刷新顶部"当前模型来源"只读状态
async function refreshLlmStatus() {
  try {
    const status = await window.api.getLlmStatus();
    const el = $('llm-status');
    if (status.source === 'local') {
      el.className = 'llm-status local';
      el.textContent = `🟢 当前：本地模型 ${status.model}`;
    } else if (status.source === 'online') {
      el.className = 'llm-status online';
      el.textContent = `🌐 当前：线上模型 ${status.model}`;
    } else {
      el.className = 'llm-status none';
      el.textContent = '⚠️ 未配置 AI';
    }
  } catch (e) {
    $('llm-status').textContent = '模型状态检测失败';
  }
}

// 刷新本地模型下拉列表（Ollama 已装模型）
async function refreshLocalModels() {
  const select = $('local-model-select');
  const hint = $('local-model-hint');
  try {
    const result = await window.api.getLocalModels();
    // 保留当前选中值
    const current = select.value;

    if (!result.available) {
      select.innerHTML = '<option value="">（使用线上 DeepSeek）</option>';
      hint.textContent = '未检测到 Ollama（本地推理服务）。请先安装并启动 Ollama，再点"刷新列表"。';
      hint.style.color = '#ff8a8a';
      return;
    }

    // 重建下拉
    select.innerHTML = '<option value="">（使用线上 DeepSeek）</option>';
    for (const m of result.models) {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = `${m.name}${m.sizeLabel ? '（' + m.sizeLabel + '）' : ''}`;
      select.appendChild(opt);
    }
    select.value = current; // 恢复选中（若还存在）

    if (result.models.length === 0) {
      hint.textContent = 'Ollama 已运行，但还没有模型。用下方"下载模型"拉取一个。';
      hint.style.color = '#ffb347';
    } else {
      hint.textContent = `检测到 ${result.models.length} 个本地模型。选中即启用本地。`;
      hint.style.color = '#8a8f99';
    }
  } catch (e) {
    hint.textContent = '获取本地模型失败：' + (e.message || e);
    hint.style.color = '#ff8a8a';
  }
}

// 下拉选中 → 启用本地 / 清除回线上
$('local-model-select').addEventListener('change', async (e) => {
  const name = e.target.value;
  window.logger.info('settings.localModel', `select "${name}"`);
  await window.api.setLocalModel(name);
  await refreshLlmStatus();
  showStatus(name ? 'info' : '', name ? `已切换到本地模型 ${name}` : '');
});

// 刷新按钮
$('refresh').addEventListener('click', refreshLocalModels);

// 使用线上按钮
$('use-online').addEventListener('click', async () => {
  $('local-model-select').value = '';
  await window.api.setLocalModel('');
  await refreshLlmStatus();
  showStatus('info', '已切换回线上 DeepSeek');
});

// 下载模型
$('pull').addEventListener('click', async () => {
  const name = $('pull-name').value.trim();
  if (!name) {
    showStatus('err', '请输入模型名');
    return;
  }
  $('pull').disabled = true;
  showStatus('info', `正在下载 ${name}（大模型可能需要几分钟，请耐心等待）...`);
  window.logger.info('settings.pull', `start "${name}"`);
  try {
    const result = await window.api.pullLocalModel(name);
    if (result.ok) {
      showStatus('ok', `✅ ${name} 下载完成`);
      $('pull-name').value = '';
      await refreshLocalModels();
    } else {
      showStatus('err', `下载失败：${result.error || '未知错误'}`);
    }
  } catch (e) {
    showStatus('err', '下载失败：' + (e.message || e));
  } finally {
    $('pull').disabled = false;
  }
});

// 启动
(async () => {
  window.logger.info('settings.load', 'start');
  await refreshLlmStatus();
  await refreshLocalModels();
})();