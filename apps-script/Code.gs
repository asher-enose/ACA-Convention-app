/**
 * Convention Volunteer Roster — Apps Script backend.
 *
 * Setup (one time):
 *   1. Create a blank Google Sheet.
 *   2. Extensions > Apps Script, delete the default code, paste this whole file.
 *   3. Run setupSheet() once (Run menu > select setupSheet). Approve permissions when asked.
 *   4. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone.
 *   5. Copy the Web App URL into js/constants.js as CONFIG.API_URL.
 *
 * A member can only be assigned to ONE service per session (can't work two
 * things at once) — that constraint lives in the frontend scheduler, not here.
 * This file is just a thin CRUD/JSON layer over the sheet.
 */

var SHEETS = {
  Teams: ['TeamId', 'TeamName', 'LeaderName', 'CreatedAt'],
  Members: ['MemberId', 'TeamId', 'Name', 'Phone', 'Sex', 'Age', 'CreatedAt'],
  Availability: ['MemberId', 'SessionId', 'ServiceId'],
  ServiceNeeds: ['SessionId', 'ServiceId', 'RequiredCount'],
  Assignments: ['AssignmentId', 'SessionId', 'ServiceId', 'TeamId', 'MemberId', 'BatchId', 'CreatedAt']
};

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEETS[name]);
      sh.setFrozenRows(1);
    }
  });
  var def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > Object.keys(SHEETS).length) {
    ss.deleteSheet(def);
  }
  SpreadsheetApp.getUi().alert('Setup complete. Next: deploy as a Web App.');
}

// ---- HTTP entry points -----------------------------------------------

function doGet(e) {
  return jsonOut({ ok: true, result: { status: 'Convention Volunteer API is running' } });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var result = route(body.action, body);
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route(action, body) {
  switch (action) {
    case 'bootstrap': return bootstrap();
    case 'addTeam': return addTeam(body.teamName, body.leaderName);
    case 'saveMember': return saveMember(body.member);
    case 'deleteMember': return deleteMember(body.memberId);
    case 'saveServiceNeeds': return saveServiceNeeds(body.needs);
    case 'saveAssignments': return saveAssignments(body.assignments);
    case 'lookupMyAssignments': return lookupMyAssignments(body.name, body.phone);
    default: throw new Error('Unknown action: ' + action);
  }
}

// ---- Sheet helpers --------------------------------------------------------

function sheetToObjects(sheetName) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var values = sh.getDataRange().getValues();
  var headers = values.shift();
  return values.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow(sheetName, obj) {
  var headers = SHEETS[sheetName];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  sh.appendRow(headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ''; }));
}

function deleteRowsWhere(sheetName, matchFn) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  for (var i = values.length - 1; i >= 1; i--) {
    var obj = {};
    headers.forEach(function (h, idx) { obj[h] = values[i][idx]; });
    if (matchFn(obj)) sh.deleteRow(i + 1);
  }
}

// ---- Data actions -----------------------------------------------------

function bootstrap() {
  var teams = sheetToObjects('Teams').map(function (t) {
    return { id: t.TeamId, name: t.TeamName, leaderName: t.LeaderName };
  });

  var availByMember = {};
  sheetToObjects('Availability').forEach(function (a) {
    if (!availByMember[a.MemberId]) availByMember[a.MemberId] = [];
    availByMember[a.MemberId].push({ sessionId: a.SessionId, serviceId: a.ServiceId });
  });

  var members = sheetToObjects('Members').map(function (m) {
    return {
      id: m.MemberId,
      teamId: m.TeamId,
      name: m.Name,
      phone: m.Phone,
      sex: m.Sex,
      age: m.Age,
      availability: availByMember[m.MemberId] || []
    };
  });

  var serviceNeeds = sheetToObjects('ServiceNeeds').map(function (n) {
    return { sessionId: n.SessionId, serviceId: n.ServiceId, requiredCount: Number(n.RequiredCount) || 0 };
  });

  var assignments = sheetToObjects('Assignments').map(function (a) {
    return { id: a.AssignmentId, sessionId: a.SessionId, serviceId: a.ServiceId, teamId: a.TeamId, memberId: a.MemberId };
  });

  return { teams: teams, members: members, serviceNeeds: serviceNeeds, assignments: assignments };
}

function addTeam(teamName, leaderName) {
  teamName = (teamName || '').trim();
  if (!teamName) throw new Error('Team name is required');
  var id = Utilities.getUuid();
  appendRow('Teams', { TeamId: id, TeamName: teamName, LeaderName: (leaderName || '').trim(), CreatedAt: new Date() });
  return { id: id, name: teamName, leaderName: (leaderName || '').trim() };
}

function saveMember(member) {
  if (!member || !member.teamId || !(member.name || '').trim() || !(member.phone || '').trim()) {
    throw new Error('Team, name and phone are required');
  }

  var id = member.id;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');

  if (id) {
    var values = sh.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        sh.getRange(i + 1, 1, 1, SHEETS.Members.length).setValues([[
          id, member.teamId, member.name.trim(), member.phone.trim(),
          member.sex || '', member.age || '', values[i][6]
        ]]);
        found = true;
        break;
      }
    }
    if (!found) throw new Error('Member not found');
  } else {
    id = Utilities.getUuid();
    appendRow('Members', {
      MemberId: id, TeamId: member.teamId, Name: member.name.trim(), Phone: member.phone.trim(),
      Sex: member.sex || '', Age: member.age || '', CreatedAt: new Date()
    });
  }

  deleteRowsWhere('Availability', function (a) { return a.MemberId === id; });
  var availSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Availability');
  (member.availability || []).forEach(function (a) {
    availSheet.appendRow([id, a.sessionId, a.serviceId]);
  });

  return { id: id };
}

function deleteMember(memberId) {
  if (!memberId) throw new Error('memberId is required');
  deleteRowsWhere('Members', function (m) { return m.MemberId === memberId; });
  deleteRowsWhere('Availability', function (a) { return a.MemberId === memberId; });
  deleteRowsWhere('Assignments', function (a) { return a.MemberId === memberId; });
  return { deleted: true };
}

function saveServiceNeeds(needs) {
  needs = needs || [];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ServiceNeeds');
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, SHEETS.ServiceNeeds.length).clearContent();
  if (needs.length) {
    var rows = needs.map(function (n) { return [n.sessionId, n.serviceId, n.requiredCount]; });
    sh.getRange(2, 1, rows.length, SHEETS.ServiceNeeds.length).setValues(rows);
  }
  return { saved: needs.length };
}

function saveAssignments(assignments) {
  assignments = assignments || [];
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Assignments');
  var lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, SHEETS.Assignments.length).clearContent();

  var batchId = Utilities.getUuid();
  var now = new Date();
  if (assignments.length) {
    var rows = assignments.map(function (a) {
      return [Utilities.getUuid(), a.sessionId, a.serviceId, a.teamId, a.memberId, batchId, now];
    });
    sh.getRange(2, 1, rows.length, SHEETS.Assignments.length).setValues(rows);
  }
  return { saved: assignments.length, batchId: batchId };
}

function lookupMyAssignments(name, phone) {
  name = (name || '').trim().toLowerCase();
  phone = (phone || '').trim();
  if (!name || !phone) throw new Error('Name and phone are required');

  var members = sheetToObjects('Members');
  var match = null;
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    if (String(m.Name).trim().toLowerCase() === name && String(m.Phone).trim() === phone) {
      match = m;
      break;
    }
  }
  if (!match) return { found: false };

  var assignments = sheetToObjects('Assignments')
    .filter(function (a) { return a.MemberId === match.MemberId; })
    .map(function (a) { return { sessionId: a.SessionId, serviceId: a.ServiceId }; });

  return { found: true, name: match.Name, assignments: assignments };
}
