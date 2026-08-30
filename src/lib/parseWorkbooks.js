import * as XLSX from 'xlsx'

// Excel serial date -> JS Date (local), used only if a cell escapes cellDates:true
function serialToDate(n) {
  const ms = Math.round((n - 25569) * 86400 * 1000)
  const d = new Date(ms)
  // re-interpret as local wall-clock time
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
}

function toDate(cell) {
  if (cell instanceof Date && !isNaN(cell)) return cell
  if (typeof cell === 'number' && cell > 20000) return serialToDate(cell)
  if (typeof cell === 'string') {
    const d = new Date(cell)
    if (!isNaN(d)) return d
  }
  return null
}

function toCardNumber(cell) {
  if (typeof cell === 'number' && isFinite(cell)) return Math.round(cell)
  if (typeof cell === 'string') {
    const digits = cell.replace(/\D/g, '')
    if (digits) return parseInt(digits, 10)
  }
  return null
}

async function readWorkbook(file) {
  const buf = await file.arrayBuffer()
  return XLSX.read(buf, { cellDates: true })
}

function findHeaderRow(rows, requiredPatterns) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => String(c ?? '').toLowerCase().trim())
    const cols = {}
    let ok = true
    for (const [key, pattern] of Object.entries(requiredPatterns)) {
      const idx = cells.findIndex((c) => pattern.test(c))
      if (idx === -1) { ok = false; break }
      cols[key] = idx
    }
    if (ok) return { rowIndex: i, cols }
  }
  return null
}

/**
 * Parse the swipe-log workbook. Returns { events: [{card, ts}], fileName }.
 * Looks for a header row containing "Time" and "Card" columns on any sheet.
 */
export async function parseSwipeFile(file) {
  const wb = await readWorkbook(file)
  const events = []
  let found = false
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true })
    const header = findHeaderRow(rows, {
      time: /^time$/,
      card: /card\s*no/,
    })
    if (!header) continue
    found = true
    for (let i = header.rowIndex + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue
      const ts = toDate(row[header.cols.time])
      const card = toCardNumber(row[header.cols.card])
      if (ts && card != null) events.push({ card, ts })
    }
  }
  if (!found) {
    throw new Error('Could not find a sheet with "Time" and "Card no." columns. Is this the swipe-log export?')
  }
  if (events.length === 0) throw new Error('No swipe rows found in the file.')
  events.sort((a, b) => a.ts - b.ts)
  return { events, fileName: file.name }
}

/**
 * Parse the card-assignment workbook. Returns { entries: [{card, name, empId}], fileName }.
 * When a card appears more than once (reassignment), the row with the latest
 * assignment date wins; with no dates, the later row wins.
 */
export async function parseMappingFile(file) {
  const wb = await readWorkbook(file)
  const byCard = new Map()
  let found = false
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true })
    const header = findHeaderRow(rows, {
      name: /employee\s*name/,
      cardFmt: /id\s*ca?r?d\s*number/,
    })
    if (!header) continue
    found = true
    const cells = rows[header.rowIndex].map((c) => String(c ?? '').toLowerCase().trim())
    const empIdCol = cells.findIndex((c) => /employee\s*id/.test(c))
    const cardRawCol = cells.findIndex((c) => /^id\s*ca?r?d$/.test(c))
    const dateCol = cells.findIndex((c) => /^date$/.test(c))

    for (let i = header.rowIndex + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue
      const empName = row[header.cols.name]
      if (empName == null || String(empName).trim() === '') continue
      const card = toCardNumber(cardRawCol !== -1 ? row[cardRawCol] : undefined) ?? toCardNumber(row[header.cols.cardFmt])
      if (card == null) continue
      const assignedAt = dateCol !== -1 ? toDate(row[dateCol]) : null
      const entry = {
        card,
        name: String(empName).trim(),
        empId: empIdCol !== -1 && row[empIdCol] != null ? String(row[empIdCol]).trim() : null,
        assignedAt: assignedAt ? assignedAt.getTime() : null,
        rowOrder: i,
      }
      const prev = byCard.get(card)
      if (!prev) byCard.set(card, entry)
      else {
        const prevKey = prev.assignedAt ?? -1
        const curKey = entry.assignedAt ?? -1
        if (curKey > prevKey || (curKey === prevKey && entry.rowOrder > prev.rowOrder)) byCard.set(card, entry)
      }
    }
  }
  if (!found) {
    throw new Error('Could not find a sheet with "Employee Name" and "ID Card Number" columns. Is this the card-assignment sheet?')
  }
  const entries = [...byCard.values()].map(({ card, name, empId }) => ({ card, name, empId }))
  if (entries.length === 0) throw new Error('No card assignments found in the file.')
  return { entries, fileName: file.name }
}
