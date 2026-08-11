const ControlRoom = (function () {
  let teams = [];
  let members = [];
  let serviceNeeds = [];
  let assignments = [];
  let incidents = [];
  let contacts = [];
  let activeTab = 'dashboard';
  let selectedSessionId = null;
  let editingContactId = null;

  async function start() {
    await loadData();
    activeTab = 'dashboard';
    selectedSessionId = currentSessionId();
    render();
  }

  async function loadData() {
    const data = await Api.call('bootstrap', {});
    teams = data.teams;
    members = data.members;
    serviceNeeds = data.serviceNeeds;
    assignments = data.assignments;
    incidents = data.incidents || [];
    contacts = data.contacts || [];
  }

  function root() { return document.getElementById('app'); }
  function teamName(id) {
    const t = teams.find(function (x) { return x.id === id; });
    if (!t) return '(unknown team)';
    return t.leaderName ? t.name + ' (' + t.leaderName + ')' : t.name;
  }
  function needFor(sessionId, serviceId) {
    const n = serviceNeeds.find(function (x) { return x.sessionId === sessionId && x.serviceId === serviceId; });
    return n ? n.requiredCount : 0;
  }

  // Best-effort guess at "the session happening right now," based on this
  // event's fixed Aug 2026 schedule. Always overridable via the dropdown.
  function currentSessionId() {
    const now = new Date();
    if (now.getFullYear() === 2026 && now.getMonth() === 7) {
      const day = now.getDate();
      const hour = now.getHours();
      const suffix = hour < 11 ? 'MOR' : (hour < 16 ? 'AFT' : 'EVE');
      const match = SESSIONS.find(function (s) {
        const m = /^\w+\s+(\d+)/.exec(s.label);
        return m && Number(m[1]) === day && s.id.slice(-3) === suffix;
      });
      if (match) return match.id;
    }
    return SESSIONS[0].id;
  }

  // Shrinks a photo (e.g. straight from a phone camera, which can be
  // several MB) down to a JPEG capped at maxDim on its longest side, so the
  // upload is fast and stays well under Apps Script's request size limits.
  // Resolves to { base64, mimeType } with the base64 already stripped of
  // its "data:image/jpeg;base64," prefix.
  function compressImageFile_(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the photo file.')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Could not load the photo.')); };
        img.onload = function () {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---- shell / tabs ------------------------------------------------------

  function render() {
    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-home">&larr; Home</button>' +
      '<h2>Control Room</h2>' +
      '<div class="tabs">' +
      tabBtn('dashboard', 'Dashboard') + tabBtn('incidents', 'Incidents') + tabBtn('contacts', 'Contacts') +
      '</div>' +
      '<div id="tab-content"></div>' +
      '</div>';
    document.getElementById('btn-home').addEventListener('click', App.goHome);
    root().querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { activeTab = btn.getAttribute('data-tab'); render(); });
    });
    if (activeTab === 'incidents') renderIncidents();
    else if (activeTab === 'contacts') renderContacts();
    else renderDashboard();
  }

  function tabBtn(id, label) {
    return '<button class="tab-btn' + (activeTab === id ? ' active' : '') + '" data-tab="' + id + '">' + label + '</button>';
  }

  // ---- dashboard ------------------------------------------------------

  function renderDashboard() {
    const openIncidents = incidents.filter(function (i) { return i.status !== 'resolved'; }).length;
    const session = sessionById(selectedSessionId) || SESSIONS[0];

    let html =
      '<div class="stat-row">' +
      '<div class="stat"><div class="stat-num">' + members.length + '</div><div class="stat-label">Volunteers registered</div></div>' +
      '<div class="stat"><div class="stat-num">' + teams.length + '</div><div class="stat-label">Teams</div></div>' +
      '<div class="stat"><div class="stat-num">' + openIncidents + '</div><div class="stat-label">Open incidents</div></div>' +
      '</div>' +
      '<div class="form" style="max-width:360px;margin:16px 0;"><label>Session<select id="cr-session">' +
      SESSIONS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === selectedSessionId ? ' selected' : '') + '>' + escapeHtml(s.label) + ' — ' + escapeHtml(s.event) + '</option>'; }).join('') +
      '</select></label></div>';

    const rows = SERVICES.filter(function (svc) { return needFor(session.id, svc.id) > 0; }).map(function (svc) {
      const required = needFor(session.id, svc.id);
      const filled = assignments.filter(function (a) { return a.sessionId === session.id && a.serviceId === svc.id; }).length;
      const short = filled < required;
      return '<tr><td>' + escapeHtml(svc.label) + '</td><td>' + required + '</td><td>' + filled + '</td>' +
        '<td><span class="' + (short ? 'warning' : 'success') + '">' + (short ? 'SHORT' : 'FULL') + '</span></td></tr>';
    }).join('');

    html += '<h3>' + escapeHtml(session.label) + ' <span class="muted">— ' + escapeHtml(session.event) + '</span></h3>';
    html += '<div class="table-wrap"><table><thead><tr><th>Service</th><th>Required</th><th>Filled</th><th>Status</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="4" class="muted">No service needs set for this session yet.</td></tr>') + '</tbody></table></div>';

    document.getElementById('tab-content').innerHTML = html;
    document.getElementById('cr-session').addEventListener('change', function () {
      selectedSessionId = this.value;
      renderDashboard();
    });
  }

  // ---- incidents ------------------------------------------------------

  function renderIncidents() {
    const sorted = incidents.slice().sort(function (a, b) {
      if ((a.status === 'resolved') !== (b.status === 'resolved')) return a.status === 'resolved' ? 1 : -1;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const rows = sorted.map(function (i) {
      const resolved = i.status === 'resolved';
      return '<tr>' +
        '<td>' + escapeHtml(i.description) + '</td>' +
        '<td>' + escapeHtml(i.location || '') + '</td>' +
        '<td>' + escapeHtml(i.reportedBy || '') + '</td>' +
        '<td>' + (i.photoUrl ? '<a href="' + escapeHtml(i.photoUrl) + '" target="_blank" rel="noopener">View photo</a>' : '') + '</td>' +
        '<td><span class="' + (resolved ? 'success' : 'warning') + '">' + (resolved ? 'RESOLVED' : 'OPEN') + '</span></td>' +
        '<td><button class="btn-small" data-toggle-incident="' + i.id + '">' + (resolved ? 'Reopen' : 'Resolve') + '</button></td>' +
        '</tr>';
    }).join('');

    document.getElementById('tab-content').innerHTML =
      '<h3>Report an incident</h3>' +
      '<form id="form-incident" class="form" style="max-width:480px;">' +
      '<label>What happened<input type="text" id="inc-description" required></label>' +
      '<label>Location<input type="text" id="inc-location"></label>' +
      '<label>Reported by<input type="text" id="inc-reported-by"></label>' +
      '<label>Photo (optional)<input type="file" id="inc-photo" accept="image/*" capture="environment"></label>' +
      '<div class="form-actions"><button type="submit" class="btn-primary" id="btn-submit-incident">Log incident</button></div>' +
      '</form>' +
      '<h3>Incident log</h3>' +
      '<div class="table-wrap"><table><thead><tr><th>What</th><th>Location</th><th>Reported by</th><th>Photo</th><th>Status</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="6" class="muted">No incidents logged.</td></tr>') + '</tbody></table></div>';

    document.getElementById('form-incident').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const description = document.getElementById('inc-description').value.trim();
      if (!description) return;

      const submitBtn = document.getElementById('btn-submit-incident');
      const photoFile = document.getElementById('inc-photo').files[0];
      let photoBase64, photoMimeType;

      if (photoFile) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing photo…';
        try {
          const compressed = await compressImageFile_(photoFile, 1280, 0.7);
          photoBase64 = compressed.base64;
          photoMimeType = compressed.mimeType;
        } catch (err) {
          App.showError('Could not process photo: ' + err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'Log incident';
          return;
        }
      }

      const incident = {
        description: description,
        location: document.getElementById('inc-location').value.trim(),
        reportedBy: document.getElementById('inc-reported-by').value.trim(),
        status: 'open',
        photoBase64: photoBase64,
        photoMimeType: photoMimeType
      };
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = photoFile ? 'Uploading photo…' : 'Saving…';
        const result = await Api.call('saveIncident', { incident: incident });
        incidents.push({
          id: result.id, description: incident.description, location: incident.location,
          reportedBy: incident.reportedBy, status: incident.status,
          photoUrl: result.photoUrl || '', createdAt: new Date().toISOString()
        });
        App.showToast('Incident logged.');
        renderIncidents();
      } catch (err) {
        App.showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log incident';
      }
    });

    root().querySelectorAll('[data-toggle-incident]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-toggle-incident');
        const incident = incidents.find(function (i) { return i.id === id; });
        const newStatus = incident.status === 'resolved' ? 'open' : 'resolved';
        try {
          await Api.call('saveIncident', { incident: Object.assign({}, incident, { status: newStatus }) });
          incident.status = newStatus;
          renderIncidents();
        } catch (err) { App.showError(err.message); }
      });
    });
  }

  // ---- contacts ------------------------------------------------------
  // Services/departments are whatever's actually in the data -- nothing
  // hardcoded. The "Service" field offers existing values via a datalist
  // but also accepts a brand new one, so new departments can be created
  // straight from this screen.

  function renderContacts() {
    const editing = editingContactId ? contacts.find(function (c) { return c.id === editingContactId; }) : null;
    const existingServices = Array.from(new Set(contacts.map(function (c) { return c.role; }).filter(Boolean))).sort();

    let html =
      '<h3>' + (editing ? 'Edit contact' : 'Add a contact') + '</h3>' +
      '<form id="form-contact" class="form" style="max-width:480px;">' +
      '<label>Name<input type="text" id="con-name" value="' + escapeHtml(editing ? editing.name : '') + '" required></label>' +
      '<label>Service<input type="text" id="con-role" list="service-options" value="' + escapeHtml(editing ? (editing.role || '') : '') + '" placeholder="Pick an existing service or type a new one"></label>' +
      '<datalist id="service-options">' + existingServices.map(function (r) { return '<option value="' + escapeHtml(r) + '">'; }).join('') + '</datalist>' +
      '<label>Phone<input type="tel" id="con-phone" value="' + escapeHtml(editing ? (editing.phone || '') : '') + '"></label>' +
      '<label>Notes<input type="text" id="con-notes" value="' + escapeHtml(editing ? (editing.notes || '') : '') + '"></label>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn-primary">' + (editing ? 'Save changes' : 'Add contact') + '</button>' +
      (editing ? ' <button type="button" class="btn-secondary" id="btn-cancel-edit-contact">Cancel</button>' : '') +
      '</div></form>';

    const byService = {};
    contacts.forEach(function (c) { (byService[c.role || '(No service set)'] = byService[c.role || '(No service set)'] || []).push(c); });
    const serviceKeys = Object.keys(byService).sort();

    if (!serviceKeys.length) {
      html += '<p class="muted">No contacts added yet.</p>';
    } else {
      serviceKeys.forEach(function (service) {
        html += '<h3>' + escapeHtml(service) + '</h3>';
        const rows = byService[service].map(function (c) {
          return '<tr>' +
            '<td>' + escapeHtml(c.name) + '</td>' +
            '<td>' + escapeHtml(c.phone || '') + '</td>' +
            '<td>' + escapeHtml(c.notes || '') + '</td>' +
            '<td class="row-actions">' +
            '<button class="btn-small" data-edit-contact="' + c.id + '">Edit</button>' +
            '<button class="btn-small btn-danger" data-delete-contact="' + c.id + '">Delete</button>' +
            '</td></tr>';
        }).join('');
        html += '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Notes</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
      });
    }

    document.getElementById('tab-content').innerHTML = html;

    document.getElementById('form-contact').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const name = document.getElementById('con-name').value.trim();
      if (!name) return;
      const payload = {
        id: editing ? editing.id : undefined,
        name: name,
        role: document.getElementById('con-role').value.trim(),
        phone: document.getElementById('con-phone').value.trim(),
        notes: document.getElementById('con-notes').value.trim()
      };
      try {
        const result = await Api.call('saveContact', { contact: payload });
        if (editing) {
          Object.assign(editing, payload);
          App.showToast('Contact updated.');
        } else {
          contacts.push(Object.assign({}, payload, { id: result.id }));
          App.showToast('Contact added.');
        }
        editingContactId = null;
        renderContacts();
      } catch (err) { App.showError(err.message); }
    });

    if (editing) {
      document.getElementById('btn-cancel-edit-contact').addEventListener('click', function () {
        editingContactId = null;
        renderContacts();
      });
    }

    root().querySelectorAll('[data-edit-contact]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        editingContactId = btn.getAttribute('data-edit-contact');
        renderContacts();
      });
    });

    root().querySelectorAll('[data-delete-contact]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-delete-contact');
        const c = contacts.find(function (x) { return x.id === id; });
        if (!confirm('Remove ' + c.name + ' from contacts?')) return;
        try {
          await Api.call('deleteContact', { contactId: id });
          contacts = contacts.filter(function (x) { return x.id !== id; });
          renderContacts();
        } catch (err) { App.showError(err.message); }
      });
    });
  }

  return { start: start };
})();
