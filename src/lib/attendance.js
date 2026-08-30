// Builds the attendance model from swipe events + card mapping.
// Rule: within one calendar day, the first swipe of a card is the in-time and
// the last swipe is the out-time; swipes in between are ignored.

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

export function formatTime(ts) {
  if (ts == null) return '—'
  const d = new Date(ts)
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function formatMinutesAsTime(min) {
  if (min == null) return '—'
  const total = Math.round(min) % 1440
  let h = Math.floor(total / 60)
  const m = total % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function formatDuration(ms) {
  if (ms == null) return '—'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

function minutesOfDay(ts) {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * @param events   [{card, ts: Date}]
 * @param mapping  [{card, name, empId}] or null
 * @returns { months: [monthModel], monthKeys: [string] } sorted newest first
 */
export function buildModel(events, mapping) {
  const mapByCard = new Map((mapping ?? []).map((e) => [e.card, e]))

  // month -> card -> day -> {first, last, swipes}
  const months = new Map()
  for (const { card, ts } of events) {
    const mk = monthKey(ts)
    let cards = months.get(mk)
    if (!cards) months.set(mk, (cards = new Map()))
    let days = cards.get(card)
    if (!days) cards.set(card, (days = new Map()))
    const dk = dayKey(ts)
    const rec = days.get(dk)
    if (!rec) days.set(dk, { first: ts.getTime(), last: ts.getTime(), swipes: 1 })
    else {
      if (ts.getTime() < rec.first) rec.first = ts.getTime()
      if (ts.getTime() > rec.last) rec.last = ts.getTime()
      rec.swipes += 1
    }
  }

  const monthModels = []
  for (const [mk, cards] of months) {
    const officeDaySet = new Set()
    for (const days of cards.values()) for (const dk of days.keys()) officeDaySet.add(dk)
    const officeDays = [...officeDaySet].sort()

    const employees = []
    for (const [card, days] of cards) {
      const info = mapByCard.get(card)
      const dayRecords = {}
      let inSum = 0, inCount = 0, outSum = 0, outCount = 0, totalMs = 0
      for (const [dk, rec] of days) {
        const single = rec.swipes === 1 || rec.first === rec.last
        dayRecords[dk] = {
          in: rec.first,
          out: single ? null : rec.last,
          swipes: rec.swipes,
          single,
          hoursMs: single ? null : rec.last - rec.first,
        }
        inSum += minutesOfDay(rec.first); inCount += 1
        if (!single) {
          outSum += minutesOfDay(rec.last); outCount += 1
          totalMs += rec.last - rec.first
        }
      }
      employees.push({
        card,
        name: info ? info.name : `Card ${card}`,
        empId: info ? info.empId : null,
        mapped: !!info,
        days: dayRecords,
        presentDays: days.size,
        avgInMin: inCount ? inSum / inCount : null,
        avgOutMin: outCount ? outSum / outCount : null,
        avgHoursMs: outCount ? totalMs / outCount : null,
      })
    }
    employees.sort((a, b) => a.name.localeCompare(b.name))
    monthModels.push({ key: mk, label: monthLabel(mk), officeDays, employees })
  }

  monthModels.sort((a, b) => b.key.localeCompare(a.key))
  return { months: monthModels }
}

export function dayKeyLabel(dk, { withYear = false } = {}) {
  const [y, m, d] = dk.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  return withYear
    ? `${weekday}, ${MONTH_NAMES[m - 1].slice(0, 3)} ${d}, ${y}`
    : `${weekday}, ${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`
}

export function dayOfMonth(dk) {
  return Number(dk.split('-')[2])
}

export function isWeekend(dk) {
  const [y, m, d] = dk.split('-').map(Number)
  const wd = new Date(y, m - 1, d).getDay()
  return wd === 0 || wd === 6
}
