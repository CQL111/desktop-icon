// 临时业务场景注册表。加新场景：写模块 + 推进 SCENES。agent 只扫表。
const groupByBirthday = require('./groupByBirthday');

const SCENES = [groupByBirthday];

function getScene(id) {
  if (!id) return null;
  return SCENES.find((s) => s.id === id) || null;
}

function resolveScene(userQuery, history, currentScene) {
  for (const s of SCENES) {
    if (typeof s.shouldActivate === 'function' && s.shouldActivate(userQuery, history)) return s.id;
  }
  if (currentScene && getScene(currentScene)) return currentScene;
  return '';
}

function toolsFor(sceneId) {
  const s = getScene(sceneId);
  return (s && s.TOOLS) || [];
}

function labelsFor(sceneId) {
  const s = getScene(sceneId);
  return (s && s.LABELS) || {};
}

function promptFor(sceneId) {
  const s = getScene(sceneId);
  return (s && s.PROMPT) || '';
}

function execute(name, args, ctx) {
  for (const s of SCENES) {
    const names = (s.TOOLS || []).map((t) => t.function && t.function.name).filter(Boolean);
    if (!names.includes(name)) continue;
    if (typeof s.execute === 'function') return s.execute(name, args, ctx);
  }
  return { error: 'UNKNOWN_TOOL', name };
}

module.exports = {
  SCENES,
  getScene,
  resolveScene,
  toolsFor,
  labelsFor,
  promptFor,
  execute,
};
