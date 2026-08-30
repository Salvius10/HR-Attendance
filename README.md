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

The dashboard shows one row per employee with a month-at-a-glance strip, days present,
average in/out times, and a **below-threshold filter** (default 12 days, adjustable).
Clicking a row opens the full day-by-day log with an hours-per-day chart.

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
