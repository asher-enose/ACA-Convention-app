const Attendance = (function () {
  let names = [];
  let departments = [];
  let records = [];

  function root() { return document.getElementById('app'); }

  async function start() {
    root().innerHTML = '<div class="screen"><p class="muted">Loading…</p></div>';
    try {
      await loadData_();
      render();
      App.setActiveWatcher(Api.watchForUpdates(function () {
        App.showUpdateBanner(async function () {
          await loadData_();
          render();
        });
      }, 20000));
    } catch (err) {
      root().innerHTML = '<div class="screen"><p class="warning">' + escapeHtml(err.message) + '</p></div>';
    }
  }

  async function loadData_() {
    const data = await Api.call('attendanceBootstrap', {});
    names = data.names || [];
    departments = data.departments || [];
    records = data.attendance || [];
  }

  function render() {
    const active = records.filter(function (a) { return a.status === 'in'; })
      .sort(function (a, b) { return new Date(b.signInAt || 0) - new Date(a.signInAt || 0); });
    const recentlyOut = records.filter(function (a) { return a.status !== 'in'; })
      .sort(function (a, b) { return new Date(b.signOutAt || 0) - new Date(a.signOutAt || 0); })
      .slice(0, 20);

    root().innerHTML =
      '<div class="screen">' +
      '<button class="link-back" id="btn-home">&larr; Home</button>' +
      '<h2>Sign In / Sign Out</h2>' +
      '<p class="muted">Type your name (and phone if someone else shares your name), pick your department, and tap Sign In when you arrive or Sign Out when you leave.</p>' +
      '<form id="form-attendance" class="form" style="max-width:420px;">' +
      '<label>Name<input type="text" id="att-name" list="attendance-name-options" required></label>' +
      '<datalist id="attendance-name-options">' + names.map(function (n) { return '<option value="' + escapeHtml(n) + '">'; }).join('') + '</datalist>' +
      '<label>Phone (optional)<input type="tel" id="att-phone"></label>' +
      '<label>Department<input type="text" id="att-department" list="attendance-department-options" placeholder="Pick an existing department or type a new one"></label>' +
      '<datalist id="attendance-department-options">' + departments.map(function (d) { return '<option value="' + escapeHtml(d) + '">'; }).join('') + '</datalist>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn-primary" id="btn-sign-in">Sign In</button> ' +
      '<button type="button" class="btn-secondary" id="btn-sign-out">Sign Out</button>' +
      '</div></form>' +

      '<h3>Currently signed in <span class="muted">— ' + active.length + '</span></h3>' +
      '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Department</th><th>Phone</th><th>Signed in</th><th></th></tr></thead>' +
      '<tbody>' + (active.map(function (a) {
        return '<tr><td>' + escapeHtml(a.name) + '</td><td>' + escapeHtml(a.department || '') + '</td><td>' + escapeHtml(a.phone || '') + '</td>' +
          '<td>' + formatTime_(a.signInAt) + '</td>' +
          '<td><button class="btn-small" data-attendance-signout="' + a.id + '">Sign Out</button></td></tr>';
      }).join('') || '<tr><td colspan="5" class="muted">No one signed in yet.</td></tr>') + '</tbody></table></div>' +

      (recentlyOut.length ?
        '<h3>Recently signed out</h3>' +
        '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Department</th><th>Phone</th><th>Signed out</th></tr></thead>' +
        '<tbody>' + recentlyOut.map(function (a) {
          return '<tr><td>' + escapeHtml(a.name) + '</td><td>' + escapeHtml(a.department || '') + '</td><td>' + escapeHtml(a.phone || '') + '</td><td>' + formatTime_(a.signOutAt) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '') +
      '</div>';

    document.getElementById('btn-home').addEventListener('click', App.goHome);
    document.getElementById('form-attendance').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      await signInFromForm_();
    });
    document.getElementById('btn-sign-out').addEventListener('click', async function () {
      await signOutFromForm_();
    });
    root().querySelectorAll('[data-attendance-signout]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const id = btn.getAttribute('data-attendance-signout');
        try {
          const result = await Api.call('signOut', { id: id });
          const rec = records.find(function (a) { return a.id === id; });
          rec.status = 'out';
          rec.signOutAt = result.signOutAt;
          App.showToast('Signed out.');
          render();
        } catch (err) { App.showError(err.message); }
      });
    });
  }

  async function signInFromForm_() {
    const name = document.getElementById('att-name').value.trim();
    if (!name) return;
    const phone = document.getElementById('att-phone').value.trim();
    const department = document.getElementById('att-department').value.trim();
    try {
      const result = await Api.call('signIn', { name: name, phone: phone, department: department });
      const existing = records.find(function (a) { return a.id === result.id; });
      if (existing) {
        existing.status = 'in';
        existing.signInAt = result.signInAt;
        if (department) existing.department = department;
      } else {
        records.push({ id: result.id, name: name, phone: phone, department: department, status: 'in', signInAt: result.signInAt, signOutAt: '' });
      }
      App.showToast(name + ' signed in.');
      render();
    } catch (err) { App.showError(err.message); }
  }

  async function signOutFromForm_() {
    const name = document.getElementById('att-name').value.trim();
    const phone = document.getElementById('att-phone').value.trim();
    if (!name) return;
    const rec = records.find(function (a) {
      return a.name.trim().toLowerCase() === name.toLowerCase() && (a.phone || '') === phone;
    });
    if (!rec) { App.showError('No matching sign-in found for that name/phone.'); return; }
    try {
      const result = await Api.call('signOut', { id: rec.id });
      rec.status = 'out';
      rec.signOutAt = result.signOutAt;
      App.showToast(name + ' signed out.');
      render();
    } catch (err) { App.showError(err.message); }
  }

  function formatTime_(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return { start: start };
})();
