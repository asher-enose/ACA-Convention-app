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

    document.getElementById('btn-leader').addEventListener('click', function () { showPasscodeGate('leader'); });
    document.getElementById('btn-organizer').addEventListener('click', function () { showPasscodeGate('organizer'); });
    document.getElementById('btn-member').addEventListener('click', function () { MemberLookup.start(); });
  }

  function showPasscodeGate(wantedRole) {
    const label = wantedRole === 'organizer' ? 'Organizer' : 'Team Leader';
    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-home">&larr; Home</button>' +
      '<h2>' + label + ' access</h2>' +
      '<form id="form-passcode" class="form">' +
      '<label>Passcode<input type="password" id="passcode-input" required autofocus></label>' +
      '<button type="submit" class="btn-primary">Continue</button>' +
      '</form>' +
      '<div id="gate-error"></div>' +
      '</div>';

    document.getElementById('btn-home').addEventListener('click', goHome);
    document.getElementById('form-passcode').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const passcode = document.getElementById('passcode-input').value.trim();
      const errEl = document.getElementById('gate-error');
      errEl.innerHTML = '';
      try {
        const result = await Api.call('checkPasscode', { passcode: passcode });
        if (wantedRole === 'organizer' && result.role === 'organizer') {
          await Organizer.start(passcode);
        } else if (wantedRole === 'leader' && (result.role === 'leader' || result.role === 'organizer')) {
          await Leader.start(passcode);
        } else {
          errEl.innerHTML = '<p class="warning">Incorrect passcode for ' + label.toLowerCase() + ' access.</p>';
        }
      } catch (err) {
        errEl.innerHTML = '<p class="warning">' + escapeHtml(err.message) + '</p>';
      }
    });
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
