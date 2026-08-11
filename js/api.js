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
  },

  // Polls a cheap "has anything changed" signal (bumped server-side by
  // every save/delete action) rather than re-fetching full data on a
  // timer. Calls onChanged() the first time the version differs from
  // what was current when watching started. Returns a stop() function.
  // Silently ignores network errors on individual polls -- a flaky
  // connection shouldn't spam the user, it'll just catch up next poll.
  watchForUpdates(onChanged, intervalMs) {
    let lastVersion = null;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const result = await Api.call('checkVersion', {});
        if (lastVersion === null) {
          lastVersion = result.version;
        } else if (result.version && result.version !== lastVersion) {
          lastVersion = result.version;
          onChanged();
        }
      } catch (err) { /* transient network issue -- try again next poll */ }
      if (!stopped) setTimeout(poll, intervalMs || 20000);
    };
    poll();

    return function stop() { stopped = true; };
  }
};
