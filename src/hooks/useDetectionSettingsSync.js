import { useCallback, useEffect, useState } from 'react';


export default function useDetectionSettingsSync() {
  const [confThresh, setConfThresh] = useState(50);
  const [enabledClasses, setEnabledClasses] = useState({ cigarette: true, smoke: true, vape: true });
  const [settingsSynced, setSettingsSynced] = useState(false);

  useEffect(() => {
    fetch('/api/detection/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.enabled_classes) setEnabledClasses(data.enabled_classes);
        if (data.conf_thresh !== null && data.conf_thresh !== undefined) {
          setConfThresh(data.conf_thresh);
        }
        setSettingsSynced(true);
      })
      .catch(() => setSettingsSynced(true));
  }, []);

  useEffect(() => {
    if (!settingsSynced) return;
    const t = setTimeout(() => {
      fetch('/api/detection/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf_thresh: confThresh }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [confThresh, settingsSynced]);

  const updateEnabledClasses = useCallback((classes) => {
    setEnabledClasses(classes);
    fetch('/api/detection/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_classes: classes }),
    }).catch(() => {});
  }, []);

  return {
    confThresh,
    setConfThresh,
    enabledClasses,
    updateEnabledClasses,
    settingsSynced,
  };
}
