// Pure, backend-agnostic rostering logic. Everything here treats two things
// as hard constraints, regardless of algorithm: (1) a member is only ever
// placed into a session/service they marked themselves willing for, and
// (2) a member can only serve one service per session (can't be in two
// places at once) — plus the organizer-chosen cap on total assignments.
const Scheduler = (function () {
  function buildAvailabilityIndex(members) {
    const index = {}; // "sessionId|serviceId" -> [memberId, ...]
    members.forEach(function (m) {
      (m.availability || []).forEach(function (a) {
        const key = a.sessionId + '|' + a.serviceId;
        if (!index[key]) index[key] = [];
        index[key].push(m.id);
      });
    });
    return index;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function pickGreedy(eligible, count, assignCount) {
    const sorted = eligible.slice().sort(function (a, b) {
      const diff = assignCount[a] - assignCount[b];
      return diff !== 0 ? diff : (Math.random() - 0.5);
    });
    return sorted.slice(0, count);
  }

  function pickRoundRobinByTeam(eligible, count, assignCount, membersById, teamOrder, offset) {
    const byTeam = {};
    eligible.forEach(function (id) {
      const teamId = membersById[id].teamId;
      if (!byTeam[teamId]) byTeam[teamId] = [];
      byTeam[teamId].push(id);
    });
    Object.keys(byTeam).forEach(function (teamId) {
      byTeam[teamId].sort(function (a, b) {
        const diff = assignCount[a] - assignCount[b];
        return diff !== 0 ? diff : (Math.random() - 0.5);
      });
    });

    const rotation = teamOrder.filter(function (t) { return byTeam[t] && byTeam[t].length; });
    if (!rotation.length) return [];

    const picked = [];
    let i = offset % rotation.length;
    let guard = 0;
    const maxGuard = count * rotation.length + rotation.length + 1;
    while (picked.length < count && guard < maxGuard) {
      const teamId = rotation[i % rotation.length];
      const pool = byTeam[teamId];
      if (pool && pool.length) picked.push(pool.shift());
      i++;
      guard++;
      if (rotation.every(function (t) { return !byTeam[t].length; })) break;
    }
    return picked;
  }

  // members: [{id, teamId, availability:[{sessionId, serviceId}]}]
  // serviceNeeds: [{sessionId, serviceId, requiredCount}]
  // options: {algorithm: 'round-robin' | 'greedy' | 'random', maxPerMember: number}
  function generate(members, serviceNeeds, options) {
    options = options || {};
    const algorithm = options.algorithm || 'round-robin';
    const maxPerMember = options.maxPerMember || 3;

    const membersById = {};
    members.forEach(function (m) { membersById[m.id] = m; });

    const availIndex = buildAvailabilityIndex(members);
    const assignCount = {};
    const sessionUsed = {};
    members.forEach(function (m) { assignCount[m.id] = 0; sessionUsed[m.id] = new Set(); });

    const teamOrder = Array.from(new Set(members.map(function (m) { return m.teamId; })));
    let teamRotationOffset = 0;

    const slots = [];
    SESSIONS.forEach(function (session) {
      SERVICES.forEach(function (service) {
        const need = serviceNeeds.find(function (n) { return n.sessionId === session.id && n.serviceId === service.id; });
        const required = need ? need.requiredCount : 0;
        if (required > 0) slots.push({ sessionId: session.id, serviceId: service.id, required: required });
      });
    });

    const assignments = [];
    const unfilled = [];

    slots.forEach(function (slot) {
      const key = slot.sessionId + '|' + slot.serviceId;
      const candidateIds = availIndex[key] || [];
      const eligible = candidateIds.filter(function (id) {
        return assignCount[id] < maxPerMember && !sessionUsed[id].has(slot.sessionId);
      });

      let picked;
      if (algorithm === 'greedy') {
        picked = pickGreedy(eligible, slot.required, assignCount);
      } else if (algorithm === 'random') {
        picked = shuffle(eligible).slice(0, slot.required);
      } else {
        picked = pickRoundRobinByTeam(eligible, slot.required, assignCount, membersById, teamOrder, teamRotationOffset);
        teamRotationOffset++;
      }

      picked.forEach(function (memberId) {
        assignments.push({ sessionId: slot.sessionId, serviceId: slot.serviceId, teamId: membersById[memberId].teamId, memberId: memberId });
        assignCount[memberId]++;
        sessionUsed[memberId].add(slot.sessionId);
      });

      if (picked.length < slot.required) {
        unfilled.push({ sessionId: slot.sessionId, serviceId: slot.serviceId, required: slot.required, filled: picked.length });
      }
    });

    return { assignments: assignments, unfilled: unfilled, memberLoad: assignCount };
  }

  // Returns whether adding `memberId` to (sessionId, serviceId) would break a
  // hard constraint, for the organizer's manual-override UI to warn on.
  function checkOverride(members, assignments, memberId, sessionId, serviceId, maxPerMember) {
    const member = members.find(function (m) { return m.id === memberId; });
    if (!member) return { ok: false, reason: 'Unknown member' };

    const willing = (member.availability || []).some(function (a) { return a.sessionId === sessionId && a.serviceId === serviceId; });
    if (!willing) return { ok: false, reason: "Didn't select this service/session as willing", severity: 'warn' };

    const sameSession = assignments.some(function (a) { return a.memberId === memberId && a.sessionId === sessionId; });
    if (sameSession) return { ok: false, reason: 'Already assigned another service this session', severity: 'warn' };

    const total = assignments.filter(function (a) { return a.memberId === memberId; }).length;
    if (total >= maxPerMember) return { ok: false, reason: 'Already at the max-assignments cap', severity: 'warn' };

    return { ok: true };
  }

  function groupBySession(assignments) {
    const bySession = {};
    assignments.forEach(function (a) {
      if (!bySession[a.sessionId]) bySession[a.sessionId] = {};
      if (!bySession[a.sessionId][a.serviceId]) bySession[a.sessionId][a.serviceId] = [];
      bySession[a.sessionId][a.serviceId].push(a);
    });
    return bySession;
  }

  function groupByTeam(assignments) {
    const byTeam = {};
    assignments.forEach(function (a) {
      if (!byTeam[a.teamId]) byTeam[a.teamId] = [];
      byTeam[a.teamId].push(a);
    });
    return byTeam;
  }

  function computeMemberLoad(members, assignments) {
    const load = {};
    members.forEach(function (m) { load[m.id] = 0; });
    assignments.forEach(function (a) { load[a.memberId] = (load[a.memberId] || 0) + 1; });
    return load;
  }

  return {
    generate: generate,
    checkOverride: checkOverride,
    groupBySession: groupBySession,
    groupByTeam: groupByTeam,
    computeMemberLoad: computeMemberLoad
  };
})();
