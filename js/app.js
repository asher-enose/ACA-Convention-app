const App = (function () {
  let activeWatcherStop = null;

  function root() { return document.getElementById('app'); }

  // Screens that watch for updates (via Api.watchForUpdates) register
  // their stop() function here so it gets shut down the moment the user
  // navigates away, instead of polling forever in the background.
  function setActiveWatcher(stopFn) {
    stopActiveWatcher();
    activeWatcherStop = stopFn;
  }

  function stopActiveWatcher() {
    if (activeWatcherStop) { activeWatcherStop(); activeWatcherStop = null; }
    hideUpdateBanner();
  }

  function showUpdateBanner(onRefresh) {
    let el = document.getElementById('update-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'update-banner';
      document.body.appendChild(el);
    }
    el.innerHTML = 'New data is available. <button class="btn-small" id="update-banner-btn">Refresh</button>';
    el.className = 'update-banner show';
    document.getElementById('update-banner-btn').addEventListener('click', function () {
      hideUpdateBanner();
      onRefresh();
    });
  }

  function hideUpdateBanner() {
    const el = document.getElementById('update-banner');
    if (el) el.className = 'update-banner';
  }

  function goHome() {
    stopActiveWatcher();
    root().innerHTML =
      '<div class="screen landing">' +
      '<h1>Convention Volunteers</h1>' +
      '<p class="muted">Dedication Service Aug 13 · Convention Aug 14&ndash;16</p>' +
      '<div class="landing-buttons">' +
      '<button class="btn-landing" id="btn-leader">' +
      '<strong>Team Leader</strong><span>Add your team members and their availability</span></button>' +
      '<button class="btn-landing" id="btn-organizer">' +
      '<strong>Organizer</strong><span>Set needs and build the roster</span></button>' +
      '<button class="btn-landing" id="btn-control-room">' +
      '<strong>Control Room</strong><span>Live coverage, incidents, key contacts</span></button>' +
      '<button class="btn-landing" id="btn-attendance">' +
      '<strong>Sign In / Sign Out</strong><span>Report when you arrive or leave</span></button>' +
      '</div>' +
      '<div id="banner"></div>' +
      '</div>';

    document.getElementById('btn-leader').addEventListener('click', function () { Leader.start(); });
    document.getElementById('btn-organizer').addEventListener('click', function () { Organizer.start(); });
    document.getElementById('btn-control-room').addEventListener('click', function () { ControlRoom.start(); });
    document.getElementById('btn-attendance').addEventListener('click', function () { Attendance.start(); });
  }

  function showToast(message, type) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'toast show' + (type === 'error' ? ' error' : '');
    setTimeout(function () { el.className = 'toast'; }, 3500);
  }

  function showError(message) {
    showToast(message, 'error');
  }

  return {
    goHome: goHome, showToast: showToast, showError: showError,
    setActiveWatcher: setActiveWatcher, showUpdateBanner: showUpdateBanner, hideUpdateBanner: hideUpdateBanner
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  App.goHome();
});
