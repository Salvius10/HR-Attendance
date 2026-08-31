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
