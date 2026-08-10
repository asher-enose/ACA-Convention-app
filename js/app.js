const App = (function () {
  function root() { return document.getElementById('app'); }

  function goHome() {
    root().innerHTML =
      '<div class="screen landing">' +
      '<h1>Convention Volunteers</h1>' +
      '<p class="muted">Dedication Service Aug 13 · Convention Aug 14&ndash;16</p>' +
      '<div class="landing-buttons">' +
      '<button class="btn-landing" id="btn-leader">' +
      '<strong>Team Leader</strong><span>Add your team members and their availability</span></button>' +
      '<button class="btn-landing" id="btn-organizer">' +
      '<strong>Organizer</strong><span>Set needs and build the roster</span></button>' +
      '<button class="btn-landing" id="btn-member">' +
      '<strong>Check my schedule</strong><span>Volunteers: see what you\'re assigned to</span></button>' +
      '</div>' +
      '<div id="banner"></div>' +
      '</div>';

    document.getElementById('btn-leader').addEventListener('click', function () { Leader.start(); });
    document.getElementById('btn-organizer').addEventListener('click', function () { Organizer.start(); });
    document.getElementById('btn-member').addEventListener('click', function () { MemberLookup.start(); });
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

  return { goHome: goHome, showToast: showToast, showError: showError };
})();

document.addEventListener('DOMContentLoaded', function () {
  App.goHome();
});
