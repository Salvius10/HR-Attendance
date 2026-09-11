# HR Attendance

A monthly office-attendance tracker built from access-card swipe logs. Everything runs
in the browser — the Excel files are parsed client-side and never leave the machine.

## How it works

- **Swipe report** (required): the month-end door-access export with `Time` and
  `Card no.` columns. Within a calendar day, the **first swipe is the in-time and the
  last swipe is the out-time**; swipes in between (cafeteria, coffee breaks) are ignored.
  A day with any swipe counts as present; a day with a single swipe shows no out-time
  and is flagged.
- **Card assignments** (optional): the sheet mapping access cards to employees
  (`Employee ID`, `ID Card Number` / `ID CARD`, `Employee Name`, `Date`). It is
  remembered in the browser (localStorage) after the first upload — re-upload only when
  a card changes hands. If a card appears twice, the row with the latest assignment
  date wins.

- **Employee emails** (optional): the employee directory with `Employee Number`,
  `Full Name` and `Email` columns. Also remembered in the browser after the first
  upload. Powers the Draft emails feature.

The dashboard shows one row per employee with a month-at-a-glance strip, days present,
average in/out times, and a **below-threshold filter** (default 12 days, adjustable).
Clicking a row opens the full day-by-day log with an hours-per-day chart.

## Draft emails

**Draft emails** on the dashboard opens a panel listing every below-threshold employee
matched to the directory (by Employee ID, falling back to name). Untick anyone you want
to skip, then edit one shared template — subject and rich-text body — with dynamic
variables that are filled in per recipient: `{name}`, `{firstName}`, `{daysPresent}`,
`{threshold}`, `{shortfall}`, `{month}`. The template is remembered between sessions
and a live preview shows the first recipient's finished email.

Sending goes through a small `POST /api/send-emails` endpoint (`server/sendMail.js`)
that relays via **Microsoft 365 SMTP** (`smtp.office365.com:587`). The same handler is
mounted by the Vite dev/preview server (`server/mailPlugin.js`) and by the standalone
server in the packaged build (`server/server.js`), so sending behaves identically in
both. Enter the from-address password (or app password) in the panel — it is used only
for that send and never stored. Per-recipient success/failure is shown after sending.
Note: the mailbox needs SMTP AUTH enabled in Microsoft 365 for this to work.

## Excel export

**Download Excel** in the top bar exports the month being viewed as
`Attendance <Month Year>.xlsx` (`src/lib/exportWorkbook.js`), with four sheets:
**Summary** (one row per card — totals, averages, and a `P` / `P*` / `A` mark for every
office day), **Daily log** (one row per card per day attended, with in/out and hours),
**Unassigned cards** (only the cards with no employee, and the days they attended), and
**About** (legend and the present-day rule). Unassigned cards are labelled
`UNASSIGNED — Card 1234` throughout and the `Card assigned?` column is filterable.

## Packaging for HR machines

`npm run package` builds `release/Ganit Attendance/` — the folder handed to an HR
computer. It contains the built UI, the server bundled into a single `.cjs`
(nodemailer included), a copy of `node.exe`, `Setup.ps1` and a plain-English
`READ ME FIRST.txt`. About 88 MB, almost all of it the Node runtime.

The recipient extracts the zip and double-clicks **`Start Here.cmd`**. That is the front
door on purpose: a `.ps1` that arrives by email, Teams or download carries
Mark-of-the-Web, and PowerShell refuses it outright — *"the file is not digitally signed.
You cannot run this script on the current system"* — while a right-click launch closes
the window before that message can be read. The `.cmd` runs whatever the execution policy
is, clears the internet mark from every file first, and holds the window open. `Setup.ps1`
pauses on its own too unless it is passed `-NoPause`.

Setup installs to `%LOCALAPPDATA%\Ganit\Attendance`, draws an icon, creates Desktop and
Start-menu shortcuts, and starts the app once to confirm it works. No admin rights, no
Node install, nothing system-wide. Uninstall with
`powershell -ExecutionPolicy Bypass -File Setup.ps1 -Uninstall`.

It fails loudly rather than silently: it names the two things that actually go wrong —
the zip was never extracted (Windows unpacks only the file you double-click, so `app\`
and `node.exe` are absent), and antivirus or policy blocking programs under AppData —
and prints the Windows version, PowerShell version and execution policy for anything else.

Unlike the offer-letter generator, this app cannot ship as a single `.html` opened over
`file://`: SMTP sending needs a process that can open a socket. The shortcut therefore
runs `node.exe` (minimised — that console window is the app's off switch), which serves
the UI on `127.0.0.1` and opens it in an Edge/Chrome app window. The window gets its own
`--user-data-dir`, without which Edge hands the URL to an already-running Edge and exits
immediately; when that window closes, the server shuts down with it.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run package  # build + assemble release/ for handover to an HR machine
```

The dev server supports a synthetic dataset for styling work without real data:
`http://localhost:5173/?demo` — add `&open=<card>` (cards 1001–1020) to open a
detail panel. This is dev-only and excluded from production builds.

## Theming

Brand colors live in one block at the top of `src/index.css` (`:root`). Chart-mark
colors (`--mark-blue`, `--mark-orange`) are lightness-adjusted variants of the brand
colors, validated for contrast and color-vision-deficiency separation — if you change
the brand palette, re-derive these two rather than using the raw brand values.
