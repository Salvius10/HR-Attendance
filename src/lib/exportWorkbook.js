import * as XLSX from 'xlsx'
import { formatMinutesAsTime, formatDuration, formatTime, dayKeyLabel } from './attendance.js'

// Short column header for one office day: "Mon 3"
function dayColumnHeader(dk) {
  const [y, m, d] = dk.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
  return `${weekday} ${d}`
}

// P = both swipes, P* = single swipe only, A = absent
function dayMark(rec) {
  if (!rec) return 'A'
  return rec.single ? 'P*' : 'P'
}

// "Wed 1, Thu 2, Fri 3" — every day the card actually swiped
function presentDates(employee) {
  return Object.keys(employee.days).sort().map(dayColumnHeader).join(', ')
}

function sheetFromRows(rows, colWidths, { autofilter = true } = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = colWidths.map((wch) => ({ wch }))
  if (autofilter && rows.length > 1) {
    const end = XLSX.utils.encode_cell({ r: rows.length - 1, c: rows[0].length - 1 })
    ws['!autofilter'] = { ref: `A1:${end}` }
  }
  return ws
}

function summarySheet(month, threshold) {
  const dayKeys = month.officeDays
  const header = [
    'Employee', 'Employee ID', 'Card number', 'Card assigned?',
    'Days present', 'Office days', 'Attendance %',
    'Avg in', 'Avg out', 'Avg hours / day', 'Status',
    'Days present (dates)',
    ...dayKeys.map(dayColumnHeader),
  ]
  const rows = [header]
  for (const e of month.employees) {
    rows.push([
      e.mapped ? e.name : `UNASSIGNED — Card ${e.card}`,
      e.empId ?? '',
      e.card,
      e.mapped ? 'Yes' : 'NO — not assigned',
      e.presentDays,
      dayKeys.length,
      dayKeys.length ? Math.round((e.presentDays / dayKeys.length) * 100) : 0,
      formatMinutesAsTime(e.avgInMin),
      formatMinutesAsTime(e.avgOutMin),
      formatDuration(e.avgHoursMs),
      e.presentDays < threshold ? 'Low' : 'On track',
      presentDates(e),
      ...dayKeys.map((dk) => dayMark(e.days[dk])),
    ])
  }
  const widths = [28, 13, 13, 18, 12, 11, 12, 10, 10, 14, 10, 46, ...dayKeys.map(() => 7)]
  return sheetFromRows(rows, widths)
}

function dailyLogSheet(month) {
  const header = [
    'Date', 'Day', 'Employee', 'Employee ID', 'Card number', 'Card assigned?',
    'In', 'Out', 'Hours', 'Swipes', 'Note',
  ]
  const rows = [header]
  for (const dk of month.officeDays) {
    for (const e of month.employees) {
      const rec = e.days[dk]
      if (!rec) continue
      rows.push([
        dk,
        dayKeyLabel(dk).split(',')[0],
        e.mapped ? e.name : `UNASSIGNED — Card ${e.card}`,
        e.empId ?? '',
        e.card,
        e.mapped ? 'Yes' : 'NO — not assigned',
        formatTime(rec.in),
        rec.single ? '' : formatTime(rec.out),
        rec.single ? '' : formatDuration(rec.hoursMs),
        rec.swipes,
        rec.single ? 'Single swipe — no out time' : '',
      ])
    }
  }
  return sheetFromRows(rows, [12, 6, 28, 13, 13, 18, 10, 10, 9, 8, 26])
}

function unassignedSheet(month) {
  const unmapped = month.employees.filter((e) => !e.mapped)
  const dayKeys = month.officeDays
  const header = [
    'Card number', 'Days present', 'Office days', 'Attendance %',
    'Avg in', 'Avg out', 'Avg hours / day', 'Days present (dates)',
    ...dayKeys.map(dayColumnHeader),
  ]
  const rows = [header]
  for (const e of unmapped) {
    rows.push([
      e.card,
      e.presentDays,
      dayKeys.length,
      dayKeys.length ? Math.round((e.presentDays / dayKeys.length) * 100) : 0,
      formatMinutesAsTime(e.avgInMin),
      formatMinutesAsTime(e.avgOutMin),
      formatDuration(e.avgHoursMs),
      presentDates(e),
      ...dayKeys.map((dk) => dayMark(e.days[dk])),
    ])
  }
  if (unmapped.length === 0) {
    rows.push(['Every card in this report is assigned to an employee.'])
  }
  const widths = [13, 12, 11, 12, 10, 10, 14, 46, ...dayKeys.map(() => 7)]
  return sheetFromRows(rows, widths, { autofilter: unmapped.length > 0 })
}

function aboutSheet(month, threshold) {
  const unmappedCount = month.employees.filter((e) => !e.mapped).length
  const rows = [
    ['Attendance export'],
    [],
    ['Month', month.label],
    ['Generated', new Date().toLocaleString()],
    ['Cards in report', month.employees.length],
    ['Office days', month.officeDays.length],
    ['Day threshold', threshold],
    ['Unassigned cards', unmappedCount],
    [],
    ['Sheet', 'What it holds'],
    ['Summary', 'One row per card — totals, averages, and a P / P* / A mark for every office day.'],
    ['Daily log', 'One row per card per day attended, with in/out times and hours.'],
    ['Unassigned cards', 'Only the cards with no employee assigned, with the days they attended.'],
    [],
    ['Legend', ''],
    ['P', 'Present — swiped in and out'],
    ['P*', 'Present — single swipe only, no out time'],
    ['A', 'Absent — no swipe that day'],
    [],
    ['Note', 'A day counts as present when the card swiped at least once: first swipe = in, last swipe = out.'],
    ['Note', 'Office days are the days on which at least one card swiped in this report.'],
  ]
  return sheetFromRows(rows, [20, 92], { autofilter: false })
}

/** Build and download an .xlsx for one month of the model. */
export function exportMonthWorkbook(month, threshold) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, summarySheet(month, threshold), 'Summary')
  XLSX.utils.book_append_sheet(wb, dailyLogSheet(month), 'Daily log')
  XLSX.utils.book_append_sheet(wb, unassignedSheet(month), 'Unassigned cards')
  XLSX.utils.book_append_sheet(wb, aboutSheet(month, threshold), 'About')
  XLSX.writeFile(wb, `Attendance ${month.label}.xlsx`)
}
