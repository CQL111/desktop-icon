// settings.js - 设置面板逻辑
const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = await window.api.getAiConfig();
  if (cfg) {
    $('baseUrl').value = cfg.baseUrl || '';
    // token 永远不显示明文，仅占位符提示
    $('token').value = '';
    $('token').placeholder = cfg.hasToken ? '已保存（留空保持不变，输入新值覆盖）' : 'eyJhbGciOi...';
  }
  if (!window.api.safeStorageAvailable) {
    showStatus('warn', '当前系统不支持系统级加密存储，token 将以弱加密形式保存');
  }
}

function showStatus(type, text) {
  const el = $('status');
  el.className = 'status ' + type;
  el.textContent = text;
}

$('save').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim();
  const token = $('token').value.trim();
  $('save').disabled = true;
  showStatus('info', '保存中...');
  window.logger.info('settings.save', `baseUrl=${baseUrl} hasToken=${!!token}`);
  try {
    const ok = await window.api.saveAiConfig({ baseUrl, token });
    if (ok) {
      showStatus('ok', '✅ 已保存');
      window.logger.info('settings.save', 'done');
      // 清空 token 输入
      $('token').value = '';
      $('token').placeholder = '已保存（留空保持不变，输入新值覆盖）';
    } else {
      showStatus('err', '保存失败');
      window.logger.warn('settings.save', 'returned false');
    }
  } catch (e) {
    showStatus('err', '保存失败：' + (e.message || e));
    window.logger.error('settings.save', e.message);
  } finally {
    $('save').disabled = false;
  }
});

$('test').addEventListener('click', async () => {
  const baseUrl = $('baseUrl').value.trim();
  const token = $('token').value.trim() || undefined;
  if (!token) {
    showStatus('err', '请先填写 Token 再测试');
    return;
  }
  $('test').disabled = true;
  showStatus('info', '测试连接中（约 2-5 秒）...');
  try {
    const result = await window.api.testAiConnection({ baseUrl, token });
    if (result.ok) {
      showStatus('ok', `✅ 连接成功（模型 ${result.model}）`);
      window.logger.info('settings.test', `ok model=${result.model}`);
    } else {
      const hint = {
        NO_TOKEN: '缺少 Token',
        AUTH_FAILED: 'Token 无效或已过期（HTTP 401）',
        RATE_LIMITED: '请求过于频繁（HTTP 429），稍后再试',
        TIMEOUT: '请求超时',
        NETWORK: '网络错误，请检查连接',
      }[result.error] || result.error;
      showStatus('err', '❌ ' + hint);
      window.logger.warn('settings.test', `failed: ${result.error}`);
    }
  } catch (e) {
    showStatus('err', '测试失败：' + (e.message || e));
    window.logger.error('settings.test', e.message);
  } finally {
    $('test').disabled = false;
  }
});

$('clear').addEventListener('click', async () => {
  if (!confirm('确定清除已保存的 Token？')) return;
  $('baseUrl').value = '';
  $('token').value = '';
  await window.api.saveAiConfig({ baseUrl: '', token: '' });
  showStatus('ok', '已清除');
  $('token').placeholder = 'eyJhbGciOi...';
});

load();