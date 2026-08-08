# Convention Volunteers

A small static site for coordinating volunteers for the Pastors' Event (Aug 12),
Dedication Service (Aug 13 evening), and the 3-day convention (Aug 14–16,
morning/afternoon/evening). Team leaders register their members and each
member's availability; the organizer sets staffing needs and generates/edits
the roster. Volunteers can look up their own schedule.

There's no traditional server — the site is plain HTML/CSS/JS (works on
GitHub Pages) and reads/writes a Google Sheet through a small Google Apps
Script Web App acting as the API. Access is gated by two shared passcodes
(one for leaders, one for the organizer); "Check my schedule" is public and
only reveals one person's own assignments (matched by name + phone).

## 1. Set up the Google Sheet + API

1. Create a new blank Google Sheet (sheets.new).
2. In it, go to **Extensions > Apps Script**.
3. Delete any starter code, then paste in the full contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this repo.
4. Save the project (any name is fine).
5. From the function dropdown at the top, select **setupSheet** and click
   **Run**. Approve the permissions prompt (it's your own script acting on
   your own sheet). This creates the Teams / Members / Availability /
   ServiceNeeds / Assignments tabs with headers.
6. In the code, find `setPasscodes()` near the top and edit the two
   `CHANGE_ME_...` values to whatever passcodes you want to give out — e.g.
   one for team leaders, a different one for yourself as organizer. Then
   select **setPasscodes** in the function dropdown and click **Run** once.
   (You can re-edit and re-run this any time to change passcodes later.)
7. Click **Deploy > New deployment**. Choose type **Web app**. Set
   **Execute as: Me**, **Who has access: Anyone**. Click **Deploy** and
   authorize again if asked.
8. Copy the **Web app URL** it gives you.

## 2. Point the site at your API

Open [`js/constants.js`](js/constants.js) and replace:

```js
API_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE'
```

with the URL you copied.

If you ever redeploy the Apps Script (not just update an existing
deployment), you'll get a new URL and need to update this again.

## 3. Try it locally

Any static file server works, e.g. from this folder:

```
python3 -m http.server 8000
```

then open `http://localhost:8000`. (Opening `index.html` directly as a
`file://` URL also mostly works, but a local server is more reliable for
fetch requests in some browsers.)

## 4. Publish on GitHub Pages

This repo is intentionally not yet a git repository. When you're ready:

```
git init
git add .
git commit -m "Convention volunteer roster app"
```

Push it to a GitHub repository, then in the repo's **Settings > Pages**,
set the source to the `main` branch, root folder. Your site will be live at
`https://<your-username>.github.io/<repo-name>/`.

## How it works

- **Team Leader** (leader passcode): create/select a team, add members with
  name, phone, sex, age, and a grid of which session × service combinations
  they're willing to help with. Leaders can edit or remove their own members
  any time.
- **Organizer** (organizer passcode):
  - *Overview* — headcounts per team and a per-volunteer load table (how
    many events each person is currently assigned to).
  - *Service Needs* — set how many volunteers are required per service, per
    session (0 means "not needed at that session").
  - *Roster* — generate a roster with a chosen algorithm and a max-events-
    per-person cap, then hand-adjust any slot (remove, add, or force-add
    someone with an override warning) before saving. Save writes the roster
    back to the sheet; Export CSV / Print are available for handing out
    physical schedules.
- **Check my schedule** (no passcode): a volunteer enters their name and
  phone and sees exactly what they've been assigned to, once the organizer
  has saved a roster.

### Roster algorithms

All three treat two things as hard rules: a person is only ever placed
into a session/service they marked themselves willing for, and a person
can only serve one service per session (can't be in two places at once) —
on top of whatever max-events-per-person cap you pick (1–5).

- **Balanced round-robin** (default) — rotates fairly across teams as it
  fills each slot, so no single team dominates.
- **Fewest-assignments-first** — always pulls whoever currently has the
  fewest total assignments, for maximum spread across all volunteers
  regardless of team.
- **Random fair shuffle** — shuffles the eligible pool each time, useful if
  you want a different mix on regeneration.

Regenerating overwrites the on-screen roster (not what's saved to the
sheet) until you click **Save roster** — so it's safe to try different
algorithms/caps before committing.
