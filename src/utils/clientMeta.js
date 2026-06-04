/** Device/browser metadata sent with login requests for security emails. */
export function getClientMeta() {
  return {
    user_agent: navigator.userAgent || '',
    platform: navigator.platform || '',
    language: navigator.language || '',
  };
}
