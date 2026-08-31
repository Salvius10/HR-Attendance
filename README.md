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

Sending goes through a small endpoint inside the Vite dev/preview server
(`server/mailPlugin.js`) that relays via **Microsoft 365 SMTP** (`smtp.office365.com:587`).
Enter the from-address password (or app password) in the panel — it is used only for
that send and never stored. Per-recipient success/failure is shown after sending.
Note: the mailbox needs SMTP AUTH enabled in Microsoft 365 for this to work.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

The dev server supports a synthetic dataset for styling work without real data:
`http://localhost:5173/?demo` — add `&open=<card>` (cards 1001–1020) to open a
detail panel. This is dev-only and excluded from production builds.

## Theming

Brand colors live in one block at the top of `src/index.css` (`:root`). Chart-mark
colors (`--mark-blue`, `--mark-orange`) are lightness-adjusted variants of the brand
colors, validated for contrast and color-vision-deficiency separation — if you change
the brand palette, re-derive these two rather than using the raw brand values.
