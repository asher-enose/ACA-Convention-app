// Thin wrapper around the Apps Script Web App. POST body is sent as
// text/plain (not application/json) on purpose: application/json triggers a
// CORS preflight (OPTIONS request) that Apps Script Web Apps can't answer,
// while a "simple request" like text/plain skips preflight entirely.
const Api = {
  async call(action, payload) {
    if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PASTE_YOUR') === 0) {
      throw new Error('API_URL is not configured yet — see README.md setup steps.');
    }
    const body = JSON.stringify(Object.assign({ action: action }, payload || {}));
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body
    });
    if (!res.ok) throw new Error('Network error (' + res.status + ')');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data.result;
  }
};
