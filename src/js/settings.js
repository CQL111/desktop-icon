// settings.js - 设置面板逻辑（线上 DeepSeek 走 .env + 本地模型切换/下载）
const $ = (id) => document.getElementById(id);

function showStatus(id, type, text) {
  const el = $(id);
  if (!el) return;
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
      hint.style.color = 'var(--danger)';
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
      hint.style.color = 'var(--warning)';
    } else {
      hint.textContent = `检测到 ${result.models.length} 个本地模型。选中即启用本地。`;
      hint.style.color = 'var(--text-3)';
    }
  } catch (e) {
    hint.textContent = '获取本地模型失败：' + (e.message || e);
    hint.style.color = 'var(--danger)';
  }
}

// 下拉选中 → 启用本地 / 清除回线上
$('local-model-select').addEventListener('change', async (e) => {
  const name = e.target.value;
  window.logger.info('settings.localModel', `select "${name}"`);
  await window.api.setLocalModel(name);
  await refreshLlmStatus();
  showStatus('pull-status', name ? 'info' : '', name ? `已切换到本地模型 ${name}` : '');
});

// 刷新按钮
$('refresh').addEventListener('click', refreshLocalModels);

// 使用线上按钮
$('use-online').addEventListener('click', async () => {
  $('local-model-select').value = '';
  await window.api.setLocalModel('');
  await refreshLlmStatus();
  showStatus('pull-status', 'info', '已切换回线上模型');
});

// 下载模型
$('pull').addEventListener('click', async () => {
  const name = $('pull-name').value.trim();
  if (!name) {
    showStatus('pull-status', 'err', '请输入模型名');
    return;
  }
  $('pull').disabled = true;
  showStatus('pull-status', 'info', `正在下载 ${name}（大模型可能需要几分钟，请耐心等待）...`);
  window.logger.info('settings.pull', `start "${name}"`);
  try {
    const result = await window.api.pullLocalModel(name);
    if (result.ok) {
      showStatus('pull-status', 'ok', `✅ ${name} 下载完成`);
      $('pull-name').value = '';
      await refreshLocalModels();
    } else {
      showStatus('pull-status', 'err', `下载失败：${result.error || '未知错误'}`);
    }
  } catch (e) {
    showStatus('pull-status', 'err', '下载失败：' + (e.message || e));
  } finally {
    $('pull').disabled = false;
  }
});

async function loadOnlineConfig() {
  try {
    const cfg = await window.api.getOnlineAiConfig();
    $('online-base-url').value = cfg.baseUrl || '';
    $('online-model').value = cfg.model || '';
    $('online-token').value = '';
    const hint = $('online-token-hint');
    if (cfg.hasToken) {
      if (cfg.fromBundled) {
        hint.textContent = `当前使用应用内置 Key（${cfg.tokenHint}），留空则不修改`;
      } else if (cfg.fromEnv) {
        hint.textContent = `当前使用 .env 中的 Key（${cfg.tokenHint}）`;
      } else {
        hint.textContent = `已保存 Key（${cfg.tokenHint}），留空则不修改`;
      }
    } else {
      hint.textContent = '尚未配置 API Key，填入后点保存';
    }
  } catch (e) {
    window.logger.warn('settings.online', `load failed: ${e.message}`);
  }
}

$('online-save').addEventListener('click', async () => {
  const payload = {
    baseUrl: $('online-base-url').value.trim(),
    model: $('online-model').value.trim(),
    token: $('online-token').value.trim(),
  };
  try {
    const result = await window.api.saveOnlineAiConfig(payload);
    $('online-token').value = '';
    await loadOnlineConfig();
    await refreshLlmStatus();
    showStatus('online-status', 'ok', result.tokenHint ? `✅ 已保存（${result.tokenHint}）` : '✅ 已保存');
  } catch (e) {
    showStatus('online-status', 'err', '保存失败：' + (e.message || e));
  }
});

$('online-test').addEventListener('click', async () => {
  $('online-test').disabled = true;
  showStatus('online-status', 'info', '正在测试连接…');
  try {
    const result = await window.api.testOnlineAi();
    if (result.ok) {
      showStatus('online-status', 'ok', `✅ 连接成功${result.model ? ' · ' + result.model : ''}`);
    } else {
      showStatus('online-status', 'err', '连接失败：' + (result.error || '未知错误'));
    }
  } catch (e) {
    showStatus('online-status', 'err', '测试失败：' + (e.message || e));
  } finally {
    $('online-test').disabled = false;
  }
});

// 清除已保存的 Key（回退到 .env；.env 也没有就变成未配置）
$('online-clear').addEventListener('click', async () => {
  try {
    const result = await window.api.clearOnlineAiToken();
    await loadOnlineConfig();
    await refreshLlmStatus();
    showStatus('online-status', result.ok ? 'ok' : 'err',
      result.hasToken ? '✅ 已清除本机保存的 Key，当前使用 .env' : '✅ 已清除，当前没有可用 Key');
  } catch (e) {
    showStatus('online-status', 'err', '清除失败：' + (e.message || e));
  }
});

// ---------- 桌面形象 ----------
async function loadPersona() {
  try {
    const name = await window.api.getPersona();
    $('persona-select').value = name || 'cat';
    const st = await window.api.getStreak();
    $('streak-hint').textContent = st && st.count
      ? `🔥 连续看运 ${st.count} 天（最佳 ${st.best} 天）`
      : '还没有连续看运记录';
  } catch (e) {
    window.logger.warn('settings.persona', `load failed: ${e.message}`);
  }
}
$('persona-select').addEventListener('change', async (e) => {
  try {
    await window.api.setPersona(e.target.value);
    window.logger.info('settings.persona', `set ${e.target.value}`);
  } catch (err) {
    window.logger.warn('settings.persona', `save failed: ${err.message}`);
  }
});

// ---------- 每日提醒 ----------
async function loadReminder() {
  try {
    const cfg = (await window.api.getConfig('dailyReminder')) || {};
    $('reminder-toggle').checked = cfg.enabled === true;
    $('reminder-time').value = cfg.time || '09:00';
  } catch (e) {
    window.logger.warn('settings.reminder', `load failed: ${e.message}`);
  }
}
async function saveReminder(patch) {
  try {
    const cfg = (await window.api.getConfig('dailyReminder')) || {};
    await window.api.saveConfig('dailyReminder', { ...cfg, ...patch });
  } catch (e) {
    window.logger.warn('settings.reminder', `save failed: ${e.message}`);
  }
}
$('reminder-toggle').addEventListener('change', (e) => saveReminder({ enabled: e.target.checked }));
$('reminder-time').addEventListener('change', (e) => {
  const v = e.target.value;
  if (/^[0-9]{2}:[0-9]{2}$/.test(v)) saveReminder({ time: v, enabled: $('reminder-toggle').checked });
});

// ---------- 抽签动画 ----------
async function loadAnimSetting() {
  try {
    const v = await window.api.getConfig('animations');
    const enabled = v !== false;
    $('anim-toggle').checked = enabled;
    updateAnimHint(enabled);
  } catch (e) {
    window.logger.warn('settings.anim', `load failed: ${e.message}`);
    $('anim-toggle').checked = true;
    updateAnimHint(true);
  }
}

function updateAnimHint(enabled) {
  const el = $('anim-state');
  if (!el) return;
  const reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!enabled) {
    el.className = 'inline-hint';
    el.textContent = '已关闭，点击球将直接弹出运势卡片';
  } else if (reduced) {
    el.className = 'inline-hint warn';
    el.textContent = '系统已开启「减少动态效果」，将自动跳过动画';
  } else {
    el.className = 'inline-hint';
    el.textContent = '点击球时播放约 3.5 秒粒子动画';
  }
}

$('anim-toggle').addEventListener('change', async (e) => {
  const enabled = e.target.checked;
  try {
    await window.api.saveConfig('animations', enabled);
    updateAnimHint(enabled);
    window.logger.info('settings.anim', `set animations=${enabled}`);
  } catch (err) {
    window.logger.warn('settings.anim', `save failed: ${err.message}`);
    $('anim-toggle').checked = !enabled;
  }
});

$('anim-preview').addEventListener('click', async () => {
  $('anim-preview').disabled = true;
  try {
    await window.api.previewBallAnim();
  } catch (e) {
    window.logger.warn('settings.anim', `preview failed: ${e.message}`);
  } finally {
    setTimeout(() => { $('anim-preview').disabled = false; }, 2600);
  }
});

// ---------- 个人信息 ----------
async function loadProfile() {
  try {
    const [profile, mode] = await Promise.all([
      window.api.getProfile(),
      window.api.getProfileMode(),
    ]);
    $('birthday').value = (profile && profile.birthday) || '';
    $('gender').value = (profile && profile.gender) || '';
    $('profile-mode').value = mode || 'comprehensive';
  } catch (e) {
    window.logger.warn('settings.profile', `load failed: ${e.message}`);
  }
}

$('profile-save').addEventListener('click', async () => {
  const birthday = $('birthday').value;
  const gender = $('gender').value;
  const mode = $('profile-mode').value;
  window.logger.info('settings.profile', `save birthday=${birthday} gender=${gender} mode=${mode}`);
  try {
    await window.api.saveProfile({ birthday, gender });
    await window.api.setProfileMode(mode);
    const st = $('profile-status');
    st.className = 'status ok';
    st.textContent = '✅ 已保存';
  } catch (e) {
    $('profile-status').className = 'status err';
    $('profile-status').textContent = '保存失败：' + (e.message || e);
  }
});

// 查看测算：直接弹卡片
$('profile-view').addEventListener('click', async () => {
  const birthday = $('birthday').value;
  if (!birthday) {
    $('profile-status').className = 'status err';
    $('profile-status').textContent = '请先填写生日';
    return;
  }
  // 先保存当前表单，再让球触发 profile scope
  try {
    await window.api.saveProfile({ birthday, gender: $('gender').value });
    await window.api.setProfileMode($('profile-mode').value);
  } catch {}
  // 通过 draw-fortune scope=profile 直接弹卡片
  const result = await window.api.drawFortune({ scope: 'profile' });
  if (result && result.fortune && result.fortune.error === 'NO_BIRTHDAY') {
    $('profile-status').className = 'status err';
    $('profile-status').textContent = '请先填写生日';
  }
});

// ---------- 法律与隐私 ----------
document.querySelectorAll('.legal-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const key = b.getAttribute('data-legal');
    window.logger.info('settings.legal', 'open ' + key);
    window.api.openLegal(key);
  });
});

// 启动
(async () => {
  window.logger.info('settings.load', 'start');
  // 动画开关只读本地配置，先加载，避免被 Ollama 探测（最长 2s）拖慢
  await loadAnimSetting();
  await loadPersona();
  await loadReminder();
  await refreshLlmStatus();
  await loadOnlineConfig();
  await refreshLocalModels();
  await loadProfile();
})();