const MemberLookup = (function () {
  function root() { return document.getElementById('app'); }

  function start() {
    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-home">&larr; Home</button>' +
      '<h2>Check my schedule</h2>' +
      '<p class="muted">Enter your name and phone number exactly as your team leader registered them.</p>' +
      '<form id="form-lookup" class="form">' +
      '<label>Name<input type="text" id="lk-name" required></label>' +
      '<label>Phone<input type="tel" id="lk-phone" required></label>' +
      '<button type="submit" class="btn-primary">Find my schedule</button>' +
      '</form>' +
      '<div id="lookup-result"></div>' +
      '</div>';

    document.getElementById('btn-home').addEventListener('click', App.goHome);
    document.getElementById('form-lookup').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const name = document.getElementById('lk-name').value.trim();
      const phone = document.getElementById('lk-phone').value.trim();
      const resultEl = document.getElementById('lookup-result');
      resultEl.innerHTML = '<p class="muted">Looking up…</p>';
      try {
        const result = await Api.call('lookupMyAssignments', { name: name, phone: phone });
        if (!result.found) {
          resultEl.innerHTML = '<p class="warning">No matching volunteer found — check with your team leader that your name and phone are registered correctly.</p>';
          return;
        }
        if (!result.assignments.length) {
          resultEl.innerHTML = '<p class="muted">Hi ' + escapeHtml(result.name) + ' — no schedule has been assigned to you yet. Check back once the organizer publishes the roster.</p>';
          return;
        }
        const sorted = result.assignments.slice().sort(function (a, b) {
          return SESSIONS.findIndex(function (s) { return s.id === a.sessionId; }) - SESSIONS.findIndex(function (s) { return s.id === b.sessionId; });
        });
        const rows = sorted.map(function (a) {
          const session = sessionById(a.sessionId);
          const service = serviceById(a.serviceId);
          return '<tr><td>' + escapeHtml(session ? session.label : a.sessionId) + '</td>' +
            '<td class="muted">' + escapeHtml(session ? session.event : '') + '</td>' +
            '<td>' + escapeHtml(service ? service.label : a.serviceId) + '</td></tr>';
        }).join('');
        resultEl.innerHTML =
          '<h3>Hi ' + escapeHtml(result.name) + ', you\'re serving:</h3>' +
          '<div class="table-wrap"><table><thead><tr><th>Session</th><th>Event</th><th>Service</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
      } catch (err) {
        resultEl.innerHTML = '<p class="warning">' + escapeHtml(err.message) + '</p>';
      }
    });
  }

  return { start: start };
})();
