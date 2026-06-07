import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { DEFAULT_ALERT_COOLDOWN } from '../utils/clientSettings.js';

export const DEFAULT_CONF_THRESH = 48;

export function enabledClassPayload(enabledClasses) {
  return {
    cigarette: enabledClasses.cigarette !== false,
    vape: enabledClasses.vape !== false,
    smoke: enabledClasses.smoke !== false,
  };
}

export function countActiveDetectionClasses(enabledClasses) {
  let count = 0;
  if (enabledClasses.cigarette !== false) count += 1;
  if (enabledClasses.vape !== false) count += 1;
  if (enabledClasses.smoke !== false) count += 1;
  return count;
}

export default function useDetectionSettingsSync(staffSync = false) {
  const [confThresh, setConfThresh] = useState(DEFAULT_CONF_THRESH);
  const [enabledClasses, setEnabledClasses] = useState({ cigarette: true, smoke: true, vape: true });
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [alertCooldown, setAlertCooldownState] = useState(() => {
    const stored = Number(localStorage.getItem('alertCooldown'));
    return Number.isFinite(stored) && stored >= 10 ? stored : DEFAULT_ALERT_COOLDOWN;
  });
  const [settingsSynced, setSettingsSynced] = useState(false);
  const skipNextPost = useRef(true);

  useEffect(() => {
    if (!staffSync) {
      setSettingsSynced(true);
      return;
    }

    apiFetch('/api/detection/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) {
          setSettingsSynced(true);
          return;
        }
        if (data.enabled_classes) {
          setEnabledClasses({
            cigarette: data.enabled_classes.cigarette !== false,
            smoke: data.enabled_classes.smoke !== false,
            vape: data.enabled_classes.vape !== false,
          });
        }
        if (data.conf_thresh !== null && data.conf_thresh !== undefined) {
          setConfThresh(data.conf_thresh);
        }
        if (typeof data.email_alerts === 'boolean') {
          setEmailAlerts(data.email_alerts);
        }
        if (data.alert_cooldown !== null && data.alert_cooldown !== undefined) {
          const cooldown = Number(data.alert_cooldown);
          setAlertCooldownState(cooldown);
          localStorage.setItem('alertCooldown', String(cooldown));
        }
        skipNextPost.current = true;
        setSettingsSynced(true);
      })
      .catch(() => setSettingsSynced(true));
  }, [staffSync]);

  const pushDetectionSettings = useCallback(async (payload) => {
    if (!staffSync) return null;
    return apiFetch('/api/detection/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }, [staffSync]);

  useEffect(() => {
    if (!settingsSynced || !staffSync) return;
    if (skipNextPost.current) {
      skipNextPost.current = false;
      return;
    }

    const timer = setTimeout(() => {
      pushDetectionSettings({
        conf_thresh: confThresh,
        enabled_classes: enabledClassPayload(enabledClasses),
        email_alerts: emailAlerts,
        alert_cooldown: alertCooldown,
      }).catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [
    confThresh,
    enabledClasses,
    emailAlerts,
    alertCooldown,
    settingsSynced,
    staffSync,
    pushDetectionSettings,
  ]);

  const setAlertCooldown = useCallback((value) => {
    const next = Number(value);
    setAlertCooldownState(next);
    localStorage.setItem('alertCooldown', String(next));
  }, []);

  const updateEnabledClasses = useCallback((classes) => {
    setEnabledClasses(classes);
  }, []);

  const resetDetectionSettings = useCallback(async () => {
    const defaults = {
      confThresh: DEFAULT_CONF_THRESH,
      enabledClasses: { cigarette: true, smoke: true, vape: true },
      emailAlerts: true,
      alertCooldown: DEFAULT_ALERT_COOLDOWN,
    };

    setConfThresh(defaults.confThresh);
    setEnabledClasses(defaults.enabledClasses);
    setEmailAlerts(defaults.emailAlerts);
    setAlertCooldown(defaults.alertCooldown);
    skipNextPost.current = false;

    await pushDetectionSettings({
      conf_thresh: defaults.confThresh,
      enabled_classes: enabledClassPayload(defaults.enabledClasses),
      email_alerts: defaults.emailAlerts,
      alert_cooldown: defaults.alertCooldown,
    }).catch(() => {});
  }, [pushDetectionSettings, setAlertCooldown]);

  return {
    confThresh,
    setConfThresh,
    enabledClasses,
    updateEnabledClasses,
    emailAlerts,
    setEmailAlerts,
    alertCooldown,
    setAlertCooldown,
    settingsSynced,
    resetDetectionSettings,
    countActiveClasses: countActiveDetectionClasses(enabledClasses),
  };
}
