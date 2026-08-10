const Organizer = (function () {
  let teams = [];
  let members = [];
  let serviceNeeds = [];
  let savedAssignments = [];
  let workingAssignments = [];
  let unfilledSlots = [];
  let activeTab = 'overview';
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
  function teamName(id) { const t = teams.find(function (x) { return x.id === id; }); return t ? t.name : '(unknown team)'; }
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
      tabBtn('overview', 'Overview') + tabBtn('volunteers', 'Volunteers by Session') + tabBtn('needs', 'Service Needs') + tabBtn('roster', 'Roster') +
      '</div>' +
      '<div id="tab-content"></div>' +
      '</div>';
    document.getElementById('btn-home').addEventListener('click', App.goHome);
    root().querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { activeTab = btn.getAttribute('data-tab'); render(); });
    });
    if (activeTab === 'overview') renderOverview();
    else if (activeTab === 'volunteers') renderVolunteersBySession();
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
      return '<tr><td>' + escapeHtml(t.name) + '</td><td>' + count + '</td><td>' + assigned + '</td></tr>';
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

    let html = '<p class="muted">Everyone who has registered availability for each session, grouped by team, regardless of whether a roster has been generated yet.</p>';

    Object.keys(groups).forEach(function (groupLabel) {
      html += '<h3>' + escapeHtml(groupLabel) + '</h3>';
      groups[groupLabel].forEach(function (session) {
        const registered = eligibleMembersFor2(session.id);

        html += '<div class="roster-session">' +
          '<div class="roster-session-title" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">' +
          '<span>' + escapeHtml(session.label) + ' <span class="muted">— ' + escapeHtml(session.event) + ' · ' + registered.length + ' registered</span></span>' +
          (registered.length ? '<button class="btn-small" data-download-session="' + session.id + '">Download Excel</button>' : '') +
          '</div>';

        if (!registered.length) {
          html += '<p class="muted">No one registered yet.</p></div>';
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
            const services = servicesFor(m, session.id);
            html += '<span class="chip">' + escapeHtml(m.name) + (services ? ' <span class="muted">(' + escapeHtml(services) + ')</span>' : '') + '</span>';
          });
          html += '</div></div>';
        });
        html += '</div>';
      });
    });

    document.getElementById('tab-content').innerHTML = html;

    root().querySelectorAll('[data-download-session]').forEach(function (btn) {
      btn.addEventListener('click', function () { exportSessionCsv(btn.getAttribute('data-download-session')); });
    });
  }

  function servicesFor(member, sessionId) {
    return SERVICES.filter(function (s) {
      return (member.availability || []).some(function (a) { return a.sessionId === sessionId && a.serviceId === s.id; });
    }).map(function (s) { return s.label; }).join(', ');
  }

  function exportSessionCsv(sessionId) {
    const session = sessionById(sessionId);
    const registered = eligibleMembersFor2(sessionId).slice().sort(function (a, b) {
      return teamName(a.teamId).localeCompare(teamName(b.teamId)) || a.name.localeCompare(b.name);
    });
    const rows = [['Team', 'Name', 'Phone', 'Sex', 'Services']];
    registered.forEach(function (m) {
      rows.push([teamName(m.teamId), m.name, m.phone || '', m.sex || '', servicesFor(m, sessionId)]);
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
          html += '<div class="chip-row">';
          assigned.forEach(function (a) {
            html += '<span class="chip">' + escapeHtml(memberName(a.memberId)) + ' <span class="muted">(' + escapeHtml(teamName(a.teamId)) + ')</span>' +
              ' <button class="chip-remove" data-remove-session="' + session.id + '" data-remove-service="' + service.id + '" data-remove-member="' + a.memberId + '">&times;</button></span>';
          });
          html += '</div>';
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
      html += '<div class="roster-session"><div class="roster-session-title">' + escapeHtml(t.name) +
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
