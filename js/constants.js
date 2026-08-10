// Fixed schedule for this event. Edit here if dates/services change.

const CONFIG = {
  // Paste your Apps Script Web App URL here after deploying (see README.md).
  API_URL: 'https://script.google.com/macros/s/AKfycbxRXs5Z1gejmJhL-akLWLsvmcbudoB_PguC5mOa2AEgcykExYa3g9o0GiH5N65XF6Y/exec'
};

const SESSIONS = [
  { id: 'D0-MOR', label: 'Aug 12 — Breakfast', group: 'Wed, Aug 12', event: "Pastors' Event" },
  { id: 'D0-AFT', label: 'Aug 12 — Lunch', group: 'Wed, Aug 12', event: "Pastors' Event" },
  { id: 'D1-EVE', label: 'Aug 13 — Dinner', group: 'Thu, Aug 13', event: 'Dedication Service' },
  { id: 'D2-MOR', label: 'Aug 14 — Breakfast', group: 'Fri, Aug 14', event: 'Convention Day 1' },
  { id: 'D2-AFT', label: 'Aug 14 — Lunch', group: 'Fri, Aug 14', event: 'Convention Day 1' },
  { id: 'D2-EVE', label: 'Aug 14 — Dinner', group: 'Fri, Aug 14', event: 'Convention Day 1' },
  { id: 'D3-MOR', label: 'Aug 15 — Breakfast', group: 'Sat, Aug 15', event: 'Convention Day 2' },
  { id: 'D3-AFT', label: 'Aug 15 — Lunch', group: 'Sat, Aug 15', event: 'Convention Day 2' },
  { id: 'D3-EVE', label: 'Aug 15 — Dinner', group: 'Sat, Aug 15', event: 'Convention Day 2' },
  { id: 'D4-MOR', label: 'Aug 16 — Breakfast', group: 'Sun, Aug 16', event: 'Convention Day 3' },
  { id: 'D4-AFT', label: 'Aug 16 — Lunch', group: 'Sun, Aug 16', event: 'Convention Day 3' },
  { id: 'D4-EVE', label: 'Aug 16 — Dinner', group: 'Sun, Aug 16', event: 'Convention Day 3' }
];

const SERVICES = [
  { id: 'MEALS', label: 'Meals' },
  { id: 'WELCOME', label: 'Welcome & Registration' },
  { id: 'PARKING', label: 'Traffic & Parking' },
  { id: 'TRANSPORT', label: 'Transportation' },
  { id: 'CROWD', label: 'Crowd Management' },
  { id: 'CLEANING', label: 'Cleaning' },
  { id: 'SNACK', label: 'Snack Bar' }
];

function sessionById(id) { return SESSIONS.find(function (s) { return s.id === id; }); }
function serviceById(id) { return SERVICES.find(function (s) { return s.id === id; }); }

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

