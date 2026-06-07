export const DEFAULT_WEBCAM_FPS = 30;
export const DEFAULT_ALERT_COOLDOWN = 60;

export function getWebcamUploadFps() {
  const raw = Number(localStorage.getItem('throttle') || DEFAULT_WEBCAM_FPS);
  return Math.min(60, Math.max(1, raw));
}

export function isWebcamAutoCaptureEnabled() {
  return localStorage.getItem('autoCapture') !== 'false';
}

export function getAlertCooldownSeconds() {
  const raw = Number(localStorage.getItem('alertCooldown') || DEFAULT_ALERT_COOLDOWN);
  return Math.max(1, raw);
}

export function applyAccentColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--red', color);
  localStorage.setItem('accentColor', color);
}

export function loadAccentColor() {
  const saved = localStorage.getItem('accentColor');
  if (saved) applyAccentColor(saved);
  return saved;
}
