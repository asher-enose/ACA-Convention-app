const Organizer = (function () {
  let teams = [];
  let members = [];
  let serviceNeeds = [];
  let savedAssignments = [];
  let workingAssignments = [];
  let unfilledSlots = [];
  let activeTab = 'overview';
  let byTeamSelectedId = null;
  let byTeamGrouping = 'name';
  let byTeamServiceFilter = 'ALL';
  let volSessionServiceFilter = 'ALL';
  let rosterGrouping = 'session';
  let lastAlgorithm = 'round-robin';
  let lastMaxPerMember = 3;

  async function start() {
    await loadData();
    activeTab = 'overview';
    render();
  }

  async function loadData() {
    const data = await Api.call('bootstrap', {});
    teams = data.teams;
    members = data.members;
    serviceNeeds = data.serviceNeeds;
    savedAssignments = data.assignments;
    workingAssignments = data.assignments.slice();
    unfilledSlots = computeCoverage(workingAssignments).filter(function (c) { return c.filled < c.required; });
  }

  function root() { return document.getElementById('app'); }
  function teamName(id) {
    const t = teams.find(function (x) { return x.id === id; });
    if (!t) return '(unknown team)';
    return t.leaderName ? t.name + ' (' + t.leaderName + ')' : t.name;
  }
  function member(id) { return members.find(function (m) { return m.id === id; }); }
  function memberName(id) { const m = member(id); return m ? m.name : '(removed member)'; }
  function needFor(sessionId, serviceId) {
    const n = serviceNeeds.find(function (x) { return x.sessionId === sessionId && x.serviceId === serviceId; });
    return n ? n.requiredCount : 0;
  }

  function computeCoverage(assignments) {
    const coverage = [];
    SESSIONS.forEach(function (session) {
      SERVICES.forEach(function (service) {
        const required = needFor(session.id, service.id);
        if (required <= 0) return;
        const filled = assignments.filter(function (a) { return a.sessionId === session.id && a.serviceId === service.id; }).length;
        coverage.push({ sessionId: session.id, serviceId: service.id, required: required, filled: filled });
      });
    });
    return coverage;
  }

  // ---- shell / tabs ------------------------------------------------------

  function render() {
    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-home">&larr; Home</button>' +
      '<h2>Organizer</h2>' +
      '<div class="tabs">' +
      tabBtn('overview', 'Overview') + tabBtn('volunteers', 'Volunteers by Session') + tabBtn('byteam', 'Volunteers by Team') + tabBtn('needs', 'Service Needs') + tabBtn('roster', 'Roster') +
      '</div>' +
      '<div id="tab-content"></div>' +
      '</div>';
    document.getElementById('btn-home').addEventListener('click', App.goHome);
    root().querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { activeTab = btn.getAttribute('data-tab'); render(); });
    });
    if (activeTab === 'overview') renderOverview();
    else if (activeTab === 'volunteers') renderVolunteersBySession();
    else if (activeTab === 'byteam') renderVolunteersByTeam();
    else if (activeTab === 'needs') renderNeeds();
    else renderRoster();
  }

  function tabBtn(id, label) {
    return '<button class="tab-btn' + (activeTab === id ? ' active' : '') + '" data-tab="' + id + '">' + label + '</button>';
  }

  // ---- overview ------------------------------------------------------

  function renderOverview() {
    const teamRows = teams.map(function (t) {
      const count = members.filter(function (m) { return m.teamId === t.id; }).length;
      const assigned = new Set(savedAssignments.filter(function (a) { return a.teamId === t.id; }).map(function (a) { return a.memberId; })).size;
      return '<tr><td>' + escapeHtml(teamName(t.id)) + '</td><td>' + count + '</td><td>' + assigned + '</td></tr>';
    }).join('');

    const load = Scheduler.computeMemberLoad(members, savedAssignments);
    const memberRows = members.slice()
      .sort(function (a, b) { return (load[b.id] || 0) - (load[a.id] || 0); })
      .map(function (m) {
        return '<tr><td>' + escapeHtml(m.name) + '</td><td>' + escapeHtml(teamName(m.teamId)) + '</td><td>' + (load[m.id] || 0) + '</td></tr>';
      }).join('');

    const totalRequired = computeCoverage(savedAssignments).reduce(function (s, c) { return s + c.required; }, 0);
    const totalFilled = computeCoverage(savedAssignments).reduce(function (s, c) { return s + Math.min(c.filled, c.required); }, 0);

    document.getElementById('tab-content').innerHTML =
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-num">' + members.length + '</div><div class="stat-label">Volunteers registered</div></div>' +
      '<div class="stat"><div class="stat-num">' + teams.length + '</div><div class="stat-label">Teams</div></div>' +
      '<div class="stat"><div class="stat-num">' + totalFilled + ' / ' + totalRequired + '</div><div class="stat-label">Slots filled (saved roster)</div></div>' +
      '</div>' +
      '<h3>By team</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Team</th><th>Members</th><th>Currently serving</th></tr></thead>' +
      '<tbody>' + (teamRows || '<tr><td colspan="3" class="muted">No teams yet.</td></tr>') + '</tbody></table></div>' +
      '<h3>Volunteer load (saved roster)</h3>' +
      '<p class="muted">How many events each person is currently assigned to — use this to spot anyone over- or under-used.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Team</th><th>Events assigned</th></tr></thead>' +
      '<tbody>' + (memberRows || '<tr><td colspan="3" class="muted">No volunteers yet.</td></tr>') + '</tbody></table></div>';
  }

  // ---- volunteers by session ------------------------------------------------------

  function renderVolunteersBySession() {
    const groups = {};
    SESSIONS.forEach(function (s) { (groups[s.group] = groups[s.group] || []).push(s); });

    let html = '<p class="muted">Everyone who has registered availability for each session, grouped by team, regardless of whether a roster has been generated yet.</p>' +
      '<div class="form" style="max-width:320px;margin:10px 0 16px;"><label>Filter by service<select id="vol-session-service-filter">' +
      '<option value="ALL"' + (volSessionServiceFilter === 'ALL' ? ' selected' : '') + '>All</option>' +
      SERVICES.map(function (s) { return '<option value="' + s.id + '"' + (s.id === volSessionServiceFilter ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>'; }).join('') +
      '</select></label></div>';

    Object.keys(groups).forEach(function (groupLabel) {
      html += '<h3>' + escapeHtml(groupLabel) + '</h3>';
      groups[groupLabel].forEach(function (session) {
        const registered = eligibleMembersForSession_(session.id);

        html += '<div class="roster-session">' +
          '<div class="roster-session-title" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
          '<span>' + escapeHtml(session.label) + ' <span class="muted">— ' + escapeHtml(session.event) + ' · ' + registered.length + ' registered</span></span>' +
          (registered.length ? '<button class="btn-small" data-download-session="' + session.id + '">Download Excel</button>' : '') +
          '</div>';

        if (!registered.length) {
          html += '<p class="muted">No one registered' + (volSessionServiceFilter === 'ALL' ? ' yet' : ' for this service yet') + '.</p></div>';
          return;
        }

        const byTeam = {};
        registered.forEach(function (m) { (byTeam[m.teamId] = byTeam[m.teamId] || []).push(m); });
        var orderedTeamIds = teams.map(function (t) { return t.id; })
          .concat(Object.keys(byTeam).filter(function (id) { return teams.every(function (t) { return t.id !== id; }); }));

        orderedTeamIds.forEach(function (teamId) {
          const teamMembers = byTeam[teamId];
          if (!teamMembers || !teamMembers.length) return;
          html += '<div class="roster-slot">';
          html += '<div class="roster-slot-head"><strong>' + escapeHtml(teamName(teamId)) + '</strong> <span class="muted">' + teamMembers.length + '</span></div>';
          html += '<div class="chip-row">';
          teamMembers.forEach(function (m) {
            const svc = volSessionServiceFilter === 'ALL' ? servicesFor(m, session.id) : serviceById(volSessionServiceFilter).label;
            const detail = [m.phone, svc].filter(Boolean).join(' · ');
            html += '<span class="chip">' + escapeHtml(m.name) + (detail ? ' <span class="muted">(' + escapeHtml(detail) + ')</span>' : '') + '</span>';
          });
          html += '</div></div>';
        });
        html += '</div>';
      });
    });

    document.getElementById('tab-content').innerHTML = html;

    document.getElementById('vol-session-service-filter').addEventListener('change', function () {
      volSessionServiceFilter = this.value;
      renderVolunteersBySession();
    });
    root().querySelectorAll('[data-download-session]').forEach(function (btn) {
      btn.addEventListener('click', function () { exportSessionCsv(btn.getAttribute('data-download-session')); });
    });
  }

  function eligibleMembersForSession_(sessionId) {
    return eligibleMembersFor2(sessionId).filter(function (m) {
      return volSessionServiceFilter === 'ALL' || (m.availability || []).some(function (a) {
        return a.sessionId === sessionId && a.serviceId === volSessionServiceFilter;
      });
    });
  }

  function servicesFor(member, sessionId) {
    return SERVICES.filter(function (s) {
      return (member.availability || []).some(function (a) { return a.sessionId === sessionId && a.serviceId === s.id; });
    }).map(function (s) { return s.label; }).join(', ');
  }

  function exportSessionCsv(sessionId) {
    const session = sessionById(sessionId);
    const registered = eligibleMembersForSession_(sessionId).slice().sort(function (a, b) {
      return teamName(a.teamId).localeCompare(teamName(b.teamId)) || a.name.localeCompare(b.name);
    });
    const rows = [['Team', 'Name', 'Phone', 'Sex', 'Services']];
    registered.forEach(function (m) {
      const svc = volSessionServiceFilter === 'ALL' ? servicesFor(m, sessionId) : serviceById(volSessionServiceFilter).label;
      rows.push([teamName(m.teamId), m.name, m.phone || '', m.sex || '', svc]);
    });
    const csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'volunteers-' + session.label.replace(/[^a-z0-9]+/gi, '-') + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function eligibleMembersFor2(sessionId) {
    const seen = new Set();
    return members.filter(function (m) {
      const hit = (m.availability || []).some(function (a) { return a.sessionId === sessionId; });
      if (!hit || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }

  // ---- volunteers by team ------------------------------------------------------

  function renderVolunteersByTeam() {
    document.getElementById('tab-content').innerHTML =
      '<div class="form"><label>Team<select id="byteam-select">' +
      '<option value="">Select a team…</option>' +
      teams.map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === byTeamSelectedId ? ' selected' : '') + '>' + escapeHtml(teamName(t.id)) + '</option>';
      }).join('') +
      '</select></label></div>' +
      '<div id="byteam-body"></div>';

    document.getElementById('byteam-select').addEventListener('change', function () {
      byTeamSelectedId = this.value || null;
      renderByTeamBody();
    });

    renderByTeamBody();
  }

  function renderByTeamBody() {
    const body = document.getElementById('byteam-body');
    if (!byTeamSelectedId) {
      body.innerHTML = '<p class="muted">Pick a team to see its volunteers and every session they\'re registered for.</p>';
      return;
    }

    const t = teams.find(function (x) { return x.id === byTeamSelectedId; });
    const teamMembers = members.filter(function (m) { return m.teamId === byTeamSelectedId; });

    let html =
      '<h3>' + escapeHtml(t ? t.name : '(unknown team)') + (t && t.leaderName ? ' <span class="muted">— ' + escapeHtml(t.leaderName) + '</span>' : '') + '</h3>' +
      '<div class="tabs small">' +
      '<button class="tab-btn' + (byTeamGrouping === 'name' ? ' active' : '') + '" data-byteam-group="name">Group by Name</button>' +
      '<button class="tab-btn' + (byTeamGrouping === 'session' ? ' active' : '') + '" data-byteam-group="session">Group by Session</button>' +
      '</div>' +
      '<div class="form" style="max-width:320px;margin:10px 0 16px;"><label>Filter by service<select id="byteam-service-filter">' +
      '<option value="ALL"' + (byTeamServiceFilter === 'ALL' ? ' selected' : '') + '>All</option>' +
      SERVICES.map(function (s) { return '<option value="' + s.id + '"' + (s.id === byTeamServiceFilter ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>'; }).join('') +
      '</select></label></div>';

    html += byTeamGrouping === 'session' ? renderByTeamGroupedBySession(teamMembers) : renderByTeamGroupedByName(teamMembers);

    body.innerHTML = html;

    body.querySelectorAll('[data-byteam-group]').forEach(function (btn) {
      btn.addEventListener('click', function () { byTeamGrouping = btn.getAttribute('data-byteam-group'); renderByTeamBody(); });
    });
    document.getElementById('byteam-service-filter').addEventListener('change', function () {
      byTeamServiceFilter = this.value;
      renderByTeamBody();
    });
    body.querySelectorAll('[data-byteam-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = members.find(function (mm) { return mm.id === btn.getAttribute('data-byteam-edit'); });
        renderByTeamMemberForm(m);
      });
    });
  }

  function matchesFilter_(a) {
    return byTeamServiceFilter === 'ALL' || a.serviceId === byTeamServiceFilter;
  }

  function renderByTeamGroupedByName(teamMembers) {
    const visible = teamMembers.filter(function (m) {
      return byTeamServiceFilter === 'ALL' || (m.availability || []).some(matchesFilter_);
    });

    const rows = visible.map(function (m) {
      const chips = [];
      SESSIONS.forEach(function (s) {
        (m.availability || []).filter(function (a) { return a.sessionId === s.id && matchesFilter_(a); }).forEach(function (a) {
          const text = byTeamServiceFilter === 'ALL' ? s.label + ' (' + serviceById(a.serviceId).label + ')' : s.label;
          chips.push('<span class="chip">' + escapeHtml(text) + '</span>');
        });
      });
      const sessionChips = chips.join('');
      return '<tr>' +
        '<td>' + escapeHtml(m.name) + '</td>' +
        '<td>' + escapeHtml(m.phone || '') + '</td>' +
        '<td>' + escapeHtml(m.sex || '') + '</td>' +
        '<td>' + escapeHtml(m.age || '') + '</td>' +
        '<td class="sessions-cell">' + (sessionChips ? '<div class="chip-row" style="margin-bottom:0;">' + sessionChips + '</div>' : '<span class="muted">None yet</span>') + '</td>' +
        '<td class="row-actions"><button class="btn-small" data-byteam-edit="' + m.id + '">Edit</button></td>' +
        '</tr>';
    }).join('');

    return '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Sex</th><th>Age</th><th>Registered sessions</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6" class="muted">No members match this filter.</td></tr>') + '</tbody></table></div>';
  }

  function renderByTeamGroupedBySession(teamMembers) {
    const groups = {};
    SESSIONS.forEach(function (s) { (groups[s.group] = groups[s.group] || []).push(s); });

    let html = '';
    Object.keys(groups).forEach(function (groupLabel) {
      html += '<h4>' + escapeHtml(groupLabel) + '</h4>';
      groups[groupLabel].forEach(function (session) {
        const registered = teamMembers.filter(function (m) {
          return (m.availability || []).some(function (a) { return a.sessionId === session.id && matchesFilter_(a); });
        });
        html += '<div class="roster-slot">';
        html += '<div class="roster-slot-head"><strong>' + escapeHtml(session.label) + '</strong> <span class="muted">— ' + escapeHtml(session.event) + ' · ' + registered.length + '</span></div>';
        if (registered.length) {
          html += '<div class="chip-row">';
          registered.forEach(function (m) {
            const matchedServices = (m.availability || []).filter(function (a) { return a.sessionId === session.id && matchesFilter_(a); })
              .map(function (a) { return serviceById(a.serviceId).label; });
            const svcText = byTeamServiceFilter === 'ALL' ? ' <span class="muted">[' + escapeHtml(matchedServices.join(', ')) + ']</span>' : '';
            html += '<span class="chip">' + escapeHtml(m.name) + (m.phone ? ' <span class="muted">(' + escapeHtml(m.phone) + ')</span>' : '') + svcText + '</span>';
          });
          html += '</div>';
        } else {
          html += '<p class="muted">No one from this team registered for this session' + (byTeamServiceFilter === 'ALL' ? '' : ' for this service') + '.</p>';
        }
        html += '</div>';
      });
    });
    return html;
  }

  function renderByTeamMemberForm(member) {
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

    document.getElementById('tab-content').innerHTML =
      '<button class="link-back" id="btn-byteam-cancel">&larr; Back to ' + escapeHtml(teamName(member.teamId)) + '</button>' +
      '<h2>Edit member</h2>' +
      '<form id="form-byteam-member" class="form">' +
      '<label>Name<input type="text" id="bm-name" value="' + escapeHtml(member.name) + '" required></label>' +
      '<label>Phone<input type="tel" id="bm-phone" value="' + escapeHtml(member.phone) + '" required></label>' +
      '<label>Sex<select id="bm-sex"><option value="">--</option>' +
      '<option value="M"' + (member.sex === 'M' ? ' selected' : '') + '>Male</option>' +
      '<option value="F"' + (member.sex === 'F' ? ' selected' : '') + '>Female</option></select></label>' +
      '<label>Age<input type="number" id="bm-age" min="1" max="120" value="' + escapeHtml(member.age) + '"></label>' +
      '<h3>Willing to serve</h3>' +
      '<p class="muted">Tick every session &times; service this person is willing to help with.</p>' +
      '<div class="table-wrap">' + grid + '</div>' +
      '<div class="form-actions"><button type="submit" class="btn-primary">Save member</button></div>' +
      '</form>';

    document.getElementById('btn-byteam-cancel').addEventListener('click', renderVolunteersByTeam);
    document.getElementById('form-byteam-member').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const name = document.getElementById('bm-name').value.trim();
      const phone = document.getElementById('bm-phone').value.trim();
      const sex = document.getElementById('bm-sex').value;
      const age = document.getElementById('bm-age').value;
      if (!name || !phone) return;

      const availability = [];
      document.querySelectorAll('.avail-grid input[type=checkbox]:checked').forEach(function (cb) {
        availability.push({ sessionId: cb.getAttribute('data-session'), serviceId: cb.getAttribute('data-service') });
      });

      const payload = { id: member.id, teamId: member.teamId, name: name, phone: phone, sex: sex, age: age, availability: availability };
      try {
        await Api.call('saveMember', { member: payload });
        Object.assign(member, payload);
        App.showToast('Member updated.');
        renderVolunteersByTeam();
      } catch (err) { App.showError(err.message); }
    });
  }

  // ---- service needs ------------------------------------------------------

  function renderNeeds() {
    let html = '<p class="muted">Set how many volunteers are required per service, per session. Leave at 0 for services not needed at a given session.</p>';
    const groups = {};
    SESSIONS.forEach(function (s) { (groups[s.group] = groups[s.group] || []).push(s); });

    Object.keys(groups).forEach(function (groupLabel) {
      html += '<h3>' + escapeHtml(groupLabel) + '</h3>';
      groups[groupLabel].forEach(function (session) {
        html += '<div class="needs-session"><div class="needs-session-title">' + escapeHtml(session.label) + ' <span class="muted">— ' + escapeHtml(session.event) + '</span></div>';
        html += '<div class="needs-grid">';
        SERVICES.forEach(function (service) {
          html += '<label class="needs-cell">' + escapeHtml(service.label) +
            '<input type="number" min="0" value="' + needFor(session.id, service.id) + '" data-need-session="' + session.id + '" data-need-service="' + service.id + '"></label>';
        });
        html += '</div></div>';
      });
    });

    html += '<div class="form-actions"><button class="btn-primary" id="btn-save-needs">Save service needs</button></div>';
    document.getElementById('tab-content').innerHTML = html;

    document.getElementById('btn-save-needs').addEventListener('click', async function () {
      const needs = [];
      root().querySelectorAll('[data-need-session]').forEach(function (input) {
        needs.push({
          sessionId: input.getAttribute('data-need-session'),
          serviceId: input.getAttribute('data-need-service'),
          requiredCount: Math.max(0, parseInt(input.value, 10) || 0)
        });
      });
      try {
        await Api.call('saveServiceNeeds', { needs: needs });
        serviceNeeds = needs;
        App.showToast('Service needs saved.');
      } catch (err) { App.showError(err.message); }
    });
  }

  // ---- roster ------------------------------------------------------

  function renderRoster() {
    const coverage = computeCoverage(workingAssignments);
    const unfilledCount = coverage.filter(function (c) { return c.filled < c.required; }).length;

    let html =
      '<div class="roster-controls">' +
      '<label>Algorithm<select id="opt-algorithm">' +
      '<option value="round-robin"' + (lastAlgorithm === 'round-robin' ? ' selected' : '') + '>Balanced round-robin (spread across teams)</option>' +
      '<option value="greedy"' + (lastAlgorithm === 'greedy' ? ' selected' : '') + '>Fewest-assignments-first (max spread per person)</option>' +
      '<option value="random"' + (lastAlgorithm === 'random' ? ' selected' : '') + '>Random fair shuffle</option>' +
      '</select></label>' +
      '<label>Max events per person<select id="opt-max">' +
      [1, 2, 3, 4, 5].map(function (n) { return '<option value="' + n + '"' + (n === lastMaxPerMember ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
      '</select></label>' +
      '<button class="btn-primary" id="btn-generate">Generate roster</button>' +
      '<button class="btn-secondary" id="btn-save-roster">Save roster</button>' +
      '<button class="btn-secondary" id="btn-export">Export CSV</button>' +
      '<button class="btn-secondary" id="btn-print">Print</button>' +
      '</div>' +
      (unfilledCount ? '<p class="warning">' + unfilledCount + ' slot(s) still short of the required headcount — see below.</p>' : '<p class="success">All slots fully staffed.</p>') +
      '<div class="tabs small">' +
      '<button class="tab-btn' + (rosterGrouping === 'session' ? ' active' : '') + '" data-group="session">Group by session</button>' +
      '<button class="tab-btn' + (rosterGrouping === 'team' ? ' active' : '') + '" data-group="team">Group by team</button>' +
      '</div>' +
      '<div id="roster-body"></div>';

    document.getElementById('tab-content').innerHTML = html;

    document.getElementById('btn-generate').addEventListener('click', function () {
      lastAlgorithm = document.getElementById('opt-algorithm').value;
      lastMaxPerMember = parseInt(document.getElementById('opt-max').value, 10);
      const result = Scheduler.generate(members, serviceNeeds, { algorithm: lastAlgorithm, maxPerMember: lastMaxPerMember });
      workingAssignments = result.assignments;
      unfilledSlots = result.unfilled;
      renderRoster();
    });
    document.getElementById('btn-save-roster').addEventListener('click', async function () {
      try {
        await Api.call('saveAssignments', { assignments: workingAssignments });
        savedAssignments = workingAssignments.slice();
        App.showToast('Roster saved — visible to volunteers via "Check my schedule".');
        renderRoster();
      } catch (err) { App.showError(err.message); }
    });
    document.getElementById('btn-export').addEventListener('click', exportCsv);
    document.getElementById('btn-print').addEventListener('click', function () { window.print(); });
    root().querySelectorAll('[data-group]').forEach(function (btn) {
      btn.addEventListener('click', function () { rosterGrouping = btn.getAttribute('data-group'); renderRoster(); });
    });

    if (rosterGrouping === 'session') renderRosterBySession();
    else renderRosterByTeam();
  }

  function eligibleMembersFor(sessionId, serviceId) {
    return members.filter(function (m) {
      return (m.availability || []).some(function (a) { return a.sessionId === sessionId && a.serviceId === serviceId; });
    });
  }

  function renderRosterBySession() {
    const groups = {};
    SESSIONS.forEach(function (s) { (groups[s.group] = groups[s.group] || []).push(s); });

    let html = '';
    Object.keys(groups).forEach(function (groupLabel) {
      const sessionsInGroup = groups[groupLabel].filter(function (session) {
        return SERVICES.some(function (service) { return needFor(session.id, service.id) > 0; });
      });
      if (!sessionsInGroup.length) return;
      html += '<h3>' + escapeHtml(groupLabel) + '</h3>';
      sessionsInGroup.forEach(function (session) {
        html += '<div class="roster-session"><div class="roster-session-title">' + escapeHtml(session.label) + ' <span class="muted">— ' + escapeHtml(session.event) + '</span></div>';
        SERVICES.forEach(function (service) {
          const required = needFor(session.id, service.id);
          if (required <= 0) return;
          const assigned = workingAssignments.filter(function (a) { return a.sessionId === session.id && a.serviceId === service.id; });
          const short = assigned.length < required;
          const eligible = eligibleMembersFor(session.id, service.id).filter(function (m) {
            return !assigned.some(function (a) { return a.memberId === m.id; });
          });

          html += '<div class="roster-slot">';
          html += '<div class="roster-slot-head"><strong>' + escapeHtml(service.label) + '</strong> ' +
            '<span class="' + (short ? 'warning' : 'success') + '">' + assigned.length + ' / ' + required + '</span></div>';

          const byTeam = {};
          assigned.forEach(function (a) { (byTeam[a.teamId] = byTeam[a.teamId] || []).push(a); });
          var orderedTeamIds = teams.map(function (t) { return t.id; })
            .concat(Object.keys(byTeam).filter(function (id) { return teams.every(function (t) { return t.id !== id; }); }));

          orderedTeamIds.forEach(function (teamId) {
            const teamAssignments = byTeam[teamId];
            if (!teamAssignments || !teamAssignments.length) return;
            html += '<div class="team-group-label muted">' + escapeHtml(teamName(teamId)) + '</div>';
            html += '<div class="chip-row">';
            teamAssignments.forEach(function (a) {
              const am = member(a.memberId);
              html += '<span class="chip">' + escapeHtml(memberName(a.memberId)) + (am && am.phone ? ' <span class="muted">(' + escapeHtml(am.phone) + ')</span>' : '') +
                ' <button class="chip-remove" data-remove-session="' + session.id + '" data-remove-service="' + service.id + '" data-remove-member="' + a.memberId + '">&times;</button></span>';
            });
            html += '</div>';
          });
          if (!assigned.length) html += '<div class="chip-row"></div>';
          html += '<select class="add-select" data-add-session="' + session.id + '" data-add-service="' + service.id + '">' +
            '<option value="">+ Add volunteer…</option>' +
            eligible.map(function (m) { return '<option value="' + m.id + '">' + escapeHtml(m.name) + ' (' + escapeHtml(teamName(m.teamId)) + ')</option>'; }).join('') +
            '<option value="__any__">Choose from anyone (override)…</option>' +
            '</select>';
          html += '</div>';
        });
        html += '</div>';
      });
    });

    document.getElementById('roster-body').innerHTML = html || '<p class="muted">No service needs set yet — go to the Service Needs tab first.</p>';
    bindSlotControls();
  }

  function renderRosterByTeam() {
    const byTeam = Scheduler.groupByTeam(workingAssignments);
    let html = '';
    teams.forEach(function (t) {
      const rows = (byTeam[t.id] || []).slice().sort(function (a, b) {
        return SESSIONS.findIndex(function (s) { return s.id === a.sessionId; }) - SESSIONS.findIndex(function (s) { return s.id === b.sessionId; });
      });
      html += '<div class="roster-session"><div class="roster-session-title">' + escapeHtml(teamName(t.id)) +
        ' <span class="muted">— ' + rows.length + ' assignment(s), ' + new Set(rows.map(function (r) { return r.memberId; })).size + ' people</span></div>';
      if (rows.length) {
        html += '<div class="table-wrap"><table><thead><tr><th>Volunteer</th><th>Session</th><th>Service</th></tr></thead><tbody>';
        rows.forEach(function (a) {
          html += '<tr><td>' + escapeHtml(memberName(a.memberId)) + '</td><td>' + escapeHtml(sessionById(a.sessionId).label) + '</td><td>' + escapeHtml(serviceById(a.serviceId).label) + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<p class="muted">No assignments yet.</p>';
      }
      html += '</div>';
    });
    document.getElementById('roster-body').innerHTML = html || '<p class="muted">No teams yet.</p>';
  }

  function bindSlotControls() {
    root().querySelectorAll('[data-remove-member]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const sessionId = btn.getAttribute('data-remove-session');
        const serviceId = btn.getAttribute('data-remove-service');
        const memberId = btn.getAttribute('data-remove-member');
        workingAssignments = workingAssignments.filter(function (a) {
          return !(a.sessionId === sessionId && a.serviceId === serviceId && a.memberId === memberId);
        });
        renderRoster();
      });
    });
    root().querySelectorAll('.add-select').forEach(function (select) {
      select.addEventListener('change', function () {
        const sessionId = select.getAttribute('data-add-session');
        const serviceId = select.getAttribute('data-add-service');
        let memberId = select.value;
        if (!memberId) return;

        if (memberId === '__any__') {
          const name = prompt('Type the exact volunteer name to force-add (bypasses eligibility checks):');
          if (!name) { renderRoster(); return; }
          const match = members.find(function (m) { return m.name.toLowerCase() === name.trim().toLowerCase(); });
          if (!match) { App.showError('No volunteer found with that exact name.'); renderRoster(); return; }
          memberId = match.id;
        }

        const check = Scheduler.checkOverride(members, workingAssignments, memberId, sessionId, serviceId, lastMaxPerMember);
        if (!check.ok && !confirm(check.reason + ' — add anyway?')) { renderRoster(); return; }

        workingAssignments.push({ sessionId: sessionId, serviceId: serviceId, teamId: member(memberId).teamId, memberId: memberId });
        renderRoster();
      });
    });
  }

  function exportCsv() {
    const rows = [['Session', 'Event', 'Service', 'Team', 'Volunteer', 'Phone']];
    workingAssignments
      .slice()
      .sort(function (a, b) { return SESSIONS.findIndex(function (s) { return s.id === a.sessionId; }) - SESSIONS.findIndex(function (s) { return s.id === b.sessionId; }); })
      .forEach(function (a) {
        const session = sessionById(a.sessionId);
        const m = member(a.memberId);
        rows.push([session.label, session.event, serviceById(a.serviceId).label, teamName(a.teamId), m ? m.name : '', m ? m.phone : '']);
      });
    const csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'convention-roster.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return { start: start };
})();
