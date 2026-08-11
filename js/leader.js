const Leader = (function () {
  let teams = [];
  let members = [];
  let currentTeamId = null;

  async function start() {
    await loadData();
    currentTeamId = null;
    renderTeamPicker();
  }

  async function loadData() {
    const data = await Api.call('bootstrap', {});
    teams = data.teams;
    members = data.members;
  }

  function root() { return document.getElementById('app'); }

  function renderTeamPicker() {
    const items = teams.map(function (t) {
      const count = members.filter(function (m) { return m.teamId === t.id; }).length;
      return '<button class="list-item" data-team-id="' + t.id + '">' +
        '<strong>' + escapeHtml(t.name) + '</strong>' +
        (t.leaderName ? '<span class="muted"> — ' + escapeHtml(t.leaderName) + '</span>' : '') +
        '<span class="muted"> · ' + count + ' member' + (count === 1 ? '' : 's') + '</span>' +
        '</button>';
    }).join('');

    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-home">&larr; Home</button>' +
      '<h2>Team Leader</h2>' +
      '<p class="muted">Pick your team, or create a new one below.</p>' +
      '<div class="list">' + (items || '<p class="muted">No teams yet — create the first one below.</p>') + '</div>' +
      '<h3>Create a new team</h3>' +
      '<form id="form-new-team" class="form">' +
      '<label>Team name<input type="text" id="new-team-name" required></label>' +
      '<label>Leader name<input type="text" id="new-team-leader"></label>' +
      '<button type="submit" class="btn-primary">Create team</button>' +
      '</form>' +
      '</div>';

    document.getElementById('btn-home').addEventListener('click', App.goHome);
    root().querySelectorAll('[data-team-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentTeamId = btn.getAttribute('data-team-id');
        renderDashboard();
      });
    });
    document.getElementById('form-new-team').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const name = document.getElementById('new-team-name').value.trim();
      const leaderName = document.getElementById('new-team-leader').value.trim();
      if (!name) return;
      try {
        const team = await Api.call('addTeam', { teamName: name, leaderName: leaderName });
        teams.push(team);
        currentTeamId = team.id;
        renderDashboard();
      } catch (err) {
        App.showError(err.message);
      }
    });
  }

  function renderDashboard() {
    const team = teams.find(function (t) { return t.id === currentTeamId; });
    const teamMembers = members.filter(function (m) { return m.teamId === currentTeamId; });

    const rows = teamMembers.map(function (m) {
      const sessionsCount = new Set((m.availability || []).map(function (a) { return a.sessionId; })).size;
      return '<tr>' +
        '<td>' + escapeHtml(m.name) + '</td>' +
        '<td>' + escapeHtml(m.phone) + '</td>' +
        '<td>' + escapeHtml(m.sex || '') + '</td>' +
        '<td>' + escapeHtml(m.age || '') + '</td>' +
        '<td>' + sessionsCount + ' session' + (sessionsCount === 1 ? '' : 's') + '</td>' +
        '<td class="row-actions">' +
        '<button class="btn-small" data-edit="' + m.id + '">Edit</button>' +
        '<button class="btn-small btn-danger" data-delete="' + m.id + '">Delete</button>' +
        '</td></tr>';
    }).join('');

    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-back">&larr; Change team</button>' +
      '<h2>' + escapeHtml(team.name) + ' <span class="muted" style="font-size:0.6em;">· ' + teamMembers.length + ' member' + (teamMembers.length === 1 ? '' : 's') + '</span></h2>' +
      (team.leaderName ? '<p class="muted">Led by ' + escapeHtml(team.leaderName) + '</p>' : '') +
      '<button class="btn-primary" id="btn-add-member">+ Add member</button>' +
      '<div class="table-wrap">' +
      '<table><thead><tr><th>Name</th><th>Phone</th><th>Sex</th><th>Age</th><th>Availability</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6" class="muted">No members yet.</td></tr>') + '</tbody></table>' +
      '</div></div>';

    document.getElementById('btn-back').addEventListener('click', function () { currentTeamId = null; renderTeamPicker(); });
    document.getElementById('btn-add-member').addEventListener('click', function () { renderMemberForm(null); });
    root().querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = members.find(function (mm) { return mm.id === btn.getAttribute('data-edit'); });
        renderMemberForm(m);
      });
    });
    root().querySelectorAll('[data-delete]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-delete');
        const m = members.find(function (mm) { return mm.id === id; });
        if (!confirm('Remove ' + m.name + ' from the team?')) return;
        try {
          await Api.call('deleteMember', { memberId: id });
          members = members.filter(function (mm) { return mm.id !== id; });
          renderDashboard();
        } catch (err) { App.showError(err.message); }
      });
    });
  }

  function renderMemberForm(member) {
    const availSet = new Set(((member && member.availability) || []).map(function (a) { return a.sessionId + '|' + a.serviceId; }));

    let grid = '<table class="avail-grid"><thead><tr><th>Session</th>' +
      SERVICES.map(function (s) { return '<th>' + escapeHtml(s.label) + '</th>'; }).join('') + '</tr></thead><tbody>';
    SESSIONS.forEach(function (session) {
      grid += '<tr>';
      grid += '<td><strong>' + escapeHtml(session.label) + '</strong><br><span class="muted">' + escapeHtml(session.event) + '</span></td>';
      SERVICES.forEach(function (service) {
        const key = session.id + '|' + service.id;
        const checked = availSet.has(key) ? 'checked' : '';
        grid += '<td class="cell-check"><input type="checkbox" data-session="' + session.id + '" data-service="' + service.id + '" ' + checked + '></td>';
      });
      grid += '</tr>';
    });
    grid += '</tbody></table>';

    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-cancel">&larr; Cancel</button>' +
      '<h2>' + (member ? 'Edit member' : 'Add member') + '</h2>' +
      '<form id="form-member" class="form">' +
      '<label>Name<input type="text" id="m-name" value="' + escapeHtml(member ? member.name : '') + '" required></label>' +
      '<label>Phone<input type="tel" id="m-phone" value="' + escapeHtml(member ? member.phone : '') + '" required></label>' +
      '<label>Sex<select id="m-sex"><option value="">--</option>' +
      '<option value="M"' + (member && member.sex === 'M' ? ' selected' : '') + '>Male</option>' +
      '<option value="F"' + (member && member.sex === 'F' ? ' selected' : '') + '>Female</option></select></label>' +
      '<label>Age<input type="number" id="m-age" min="1" max="120" value="' + escapeHtml(member ? member.age : '') + '"></label>' +
      '<h3>Willing to serve</h3>' +
      '<p class="muted">Tick every session &times; service this person is willing to help with. Multiple selections are fine.</p>' +
      '<div class="table-wrap">' + grid + '</div>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn-primary">Save member</button>' +
      '</div></form></div>';

    document.getElementById('btn-cancel').addEventListener('click', renderDashboard);
    document.getElementById('form-member').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const name = document.getElementById('m-name').value.trim();
      const phone = document.getElementById('m-phone').value.trim();
      const sex = document.getElementById('m-sex').value;
      const age = document.getElementById('m-age').value;
      if (!name || !phone) return;

      const availability = [];
      root().querySelectorAll('.avail-grid input[type=checkbox]:checked').forEach(function (cb) {
        availability.push({ sessionId: cb.getAttribute('data-session'), serviceId: cb.getAttribute('data-service') });
      });

      const payload = {
        id: member ? member.id : undefined,
        teamId: currentTeamId,
        name: name, phone: phone, sex: sex, age: age,
        availability: availability
      };

      try {
        const result = await Api.call('saveMember', { member: payload });
        if (member) {
          Object.assign(member, payload);
        } else {
          members.push(Object.assign({}, payload, { id: result.id }));
        }
        renderDashboard();
      } catch (err) { App.showError(err.message); }
    });
  }

  return { start: start };
})();
