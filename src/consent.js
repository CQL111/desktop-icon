// consent.js - 首次启动协议同意页
const agree = document.getElementById('agree');
const accept = document.getElementById('accept');

agree.addEventListener('change', () => {
  accept.disabled = !agree.checked;
});

accept.addEventListener('click', () => {
  if (!agree.checked) return;
  window.logger.info('consent', 'accepted');
  window.api.acceptConsent();
});

document.getElementById('quit').addEventListener('click', () => {
  window.logger.info('consent', 'quit');
  window.api.quitApp();
});

document.querySelectorAll('.link').forEach((b) => {
  b.addEventListener('click', () => window.api.openLegal(b.getAttribute('data-doc')));
});
