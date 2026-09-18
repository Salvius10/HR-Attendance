// Matching attendance rows to the employee directory, and template rendering
// for the draft-emails feature.

function normName(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Match below-threshold employees (from the attendance model) to the uploaded
 * employee directory. Matches by Employee ID first, then by normalized name.
 * @param employees  [{card, name, empId, presentDays, ...}]
 * @param people     [{empId, name, email}] or null
 * @returns [{employee, person|null, email|null}]
 */
export function matchRecipients(employees, people) {
  const byId = new Map()
  const byName = new Map()
  for (const p of people ?? []) {
    if (p.empId) byId.set(p.empId.toLowerCase(), p)
    byName.set(normName(p.name), p)
  }
  return employees.map((employee) => {
    const person =
      (employee.empId && byId.get(employee.empId.toLowerCase())) ||
      byName.get(normName(employee.name)) ||
      null
    return { employee, person, email: person?.email ?? null }
  })
}

export const TEMPLATE_VARIABLES = [
  { key: 'name', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'daysPresent', label: 'Days present' },
  { key: 'threshold', label: 'Required days' },
  { key: 'shortfall', label: 'Days short' },
  { key: 'month', label: 'Month' },
]

/** Build the variable map for one recipient. */
export function templateVars({ employee, person }, { threshold, monthLabel }) {
  const name = person?.name ?? employee.name
  return {
    name,
    firstName: name.split(/\s+/)[0] ?? name,
    daysPresent: String(employee.presentDays),
    threshold: String(threshold),
    shortfall: String(Math.max(0, threshold - employee.presentDays)),
    month: monthLabel,
  }
}

/** Replace {variable} placeholders; unknown ones are left as typed. */
export function renderTemplate(text, vars) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m))
}

/**
 * People in the employee directory who never swiped at all in this month —
 * not one swipe means not present for even a single day, so they are absent
 * for the whole month rather than merely below the threshold.
 *
 * Matching mirrors matchRecipients(): Employee ID first, then normalized name.
 * Unassigned cards can't identify anyone, so their placeholder names ("Card
 * 1234") are ignored — a person behind an unassigned card will show up here.
 *
 * @param employees  the month's attendance rows [{name, empId, mapped, ...}]
 * @param people     the employee directory [{empId, name, email}] or null
 * @returns synthetic attendance rows with zero present days, same shape as
 *          the model's employees so they can flow into the table and emails.
 */
export function findNeverSwiped(employees, people) {
  const seenIds = new Set()
  const seenNames = new Set()
  for (const e of employees) {
    if (e.empId) seenIds.add(e.empId.toLowerCase())
    if (e.mapped) seenNames.add(normName(e.name))
  }
  return (people ?? [])
    .filter((p) => !(p.empId && seenIds.has(p.empId.toLowerCase())) && !seenNames.has(normName(p.name)))
    .map((p) => ({
      card: null,
      name: p.name,
      empId: p.empId,
      email: p.email,
      mapped: true,
      noSwipes: true,
      days: {},
      presentDays: 0,
      avgInMin: null,
      avgOutMin: null,
      avgHoursMs: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Split a typed "a@x.com, b@y.com" list into addresses; ignores anything without an @. */
export function parseAddressList(text) {
  return String(text ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}
