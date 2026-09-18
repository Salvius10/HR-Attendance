import { useMemo, useRef, useState } from 'react'
import { formatMinutesAsTime, formatDuration, formatTime, dayKeyLabel } from '../lib/attendance.js'
import { parseMappingFile } from '../lib/parseWorkbooks.js'
import { exportMonthWorkbook } from '../lib/exportWorkbook.js'
import { findNeverSwiped } from '../lib/emails.js'
import EmployeeDetail from './EmployeeDetail.jsx'
import DraftEmails from './DraftEmails.jsx'

/** Stable row id — swipe rows are keyed by card, never-swiped rows by email. */
export function rowId(e) {
  return e.card != null ? `card:${e.card}` : `mail:${e.email}`
}

export function initials(name) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

export function DayStrip({ officeDays, days }) {
  return (
    <span className="day-strip">
      {officeDays.map((dk) => {
        const rec = days[dk]
        let cls = 'ds-cell'
        let tip = `${dayKeyLabel(dk)}\nAbsent`
        if (rec) {
          cls += rec.single ? ' single' : ' present'
          tip = rec.single
            ? `${dayKeyLabel(dk)}\nSingle swipe · ${formatTime(rec.in)}`
            : `${dayKeyLabel(dk)}\n${formatTime(rec.in)} – ${formatTime(rec.out)}`
        }
        return <span key={dk} className={cls} data-tip={tip} />
      })}
    </span>
  )
}

const SearchIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
  </svg>
)

export default function Dashboard({ model, mapping, employeeList, threshold, setThreshold, onMappingParsed, onEmployeeListParsed, onNewUpload }) {
  const [monthKey, setMonthKey] = useState(model.months[0].key)
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [sort, setSort] = useState({ by: 'name', dir: 1 })
  const [selected, setSelected] = useState(() => {
    if (!import.meta.env.DEV) return null
    const open = new URLSearchParams(location.search).get('open')
    return open ? `card:${open}` : null
  })
  const [mapError, setMapError] = useState(null)
  const [showEmails, setShowEmails] = useState(false)
  const [showUnmapped, setShowUnmapped] = useState(false)
  const [noSwipeOnly, setNoSwipeOnly] = useState(false)
  const mapInputRef = useRef(null)

  const month = model.months.find((m) => m.key === monthKey) ?? model.months[0]
  const officeDayCount = month.officeDays.length

  // Directory people with no swipe at all this month — absent every day, so they
  // sit alongside the swipe rows with zero present days.
  const neverSwiped = useMemo(
    () => findNeverSwiped(month.employees, employeeList?.people ?? null),
    [month, employeeList]
  )
  const allEmployees = useMemo(
    () => [...month.employees, ...neverSwiped],
    [month, neverSwiped]
  )

  const belowCount = useMemo(
    () => allEmployees.filter((e) => e.presentDays < threshold).length,
    [allEmployees, threshold]
  )

  const avgDays = useMemo(() => {
    if (month.employees.length === 0) return 0
    return month.employees.reduce((s, e) => s + e.presentDays, 0) / month.employees.length
  }, [month])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = allEmployees
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.empId && e.empId.toLowerCase().includes(q)) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.card != null && String(e.card).includes(q))
      )
    }
    if (lowOnly) list = list.filter((e) => e.presentDays < threshold)
    if (noSwipeOnly) list = list.filter((e) => e.noSwipes)
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sort.by === 'days') return (a.presentDays - b.presentDays) * sort.dir
      return a.name.localeCompare(b.name) * sort.dir
    })
    return sorted
  }, [allEmployees, query, lowOnly, noSwipeOnly, threshold, sort])

  const toggleSort = (by) =>
    setSort((s) => (s.by === by ? { by, dir: -s.dir } : { by, dir: by === 'days' ? 1 : 1 }))

  const unmapped = useMemo(() => month.employees.filter((e) => !e.mapped), [month])

  const handleMappingFile = async (file) => {
    try {
      setMapError(null)
      onMappingParsed(await parseMappingFile(file))
    } catch (err) {
      setMapError(err.message)
    }
  }

  const selectedEmp = selected ? allEmployees.find((e) => rowId(e) === selected) ?? null : null

  return (
    <>
      <header className="topbar">
        <div className="wordmark">
          <span className="logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
            </svg>
          </span>
          Attendance
        </div>
        <span className="month-chip">{month.label}</span>
        <span className="spacer" />
        <input
          ref={mapInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={(e) => { if (e.target.files[0]) handleMappingFile(e.target.files[0]); e.target.value = '' }}
        />
        <button className="btn" onClick={() => mapInputRef.current?.click()}>
          Update mapping{mapping ? ` (${mapping.entries.length})` : ''}
        </button>
        <button
          className="btn btn-icon"
          onClick={() => exportMonthWorkbook(month, threshold, neverSwiped)}
          title={`Download ${month.label} as an Excel workbook`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" />
          </svg>
          Download Excel
        </button>
        <button className="btn btn-primary" onClick={onNewUpload}>Upload report</button>
      </header>

      <main className="dash">
        {model.months.length > 1 && (
          <div className="month-tabs">
            {model.months.map((m) => (
              <button
                key={m.key}
                className={`month-tab ${m.key === monthKey ? 'active' : ''}`}
                onClick={() => setMonthKey(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {mapError && (
          <div className="banner-warn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
            </svg>
            Couldn&apos;t read the mapping file: {mapError}
          </div>
        )}
        {unmapped.length > 0 && (
          <div className="banner-warn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
            </svg>
            <span className="bw-body">
              <span>
                {unmapped.length} {unmapped.length === 1 ? 'card has' : 'cards have'} no employee
                assigned — upload the card-assignment sheet to see names.
                <button className="bw-link" onClick={() => setShowUnmapped((v) => !v)}>
                  {showUnmapped ? 'Hide cards' : 'Show cards'}
                </button>
              </span>
              {showUnmapped && (
                <span className="bw-cards">
                  {unmapped.map((e) => (
                    <button
                      key={e.card}
                      className="bw-card"
                      onClick={() => setSelected(rowId(e))}
                      title={`${e.presentDays} of ${officeDayCount} days present — open detail`}
                    >
                      {e.card}
                      <span className="bw-card-days">{e.presentDays}d</span>
                    </button>
                  ))}
                </span>
              )}
            </span>
          </div>
        )}

        <section className="tiles">
          <div className="tile">
            <div className="t-label">Employees seen</div>
            <div className="t-value">{month.employees.length}</div>
            <div className="t-sub">badged in at least once</div>
          </div>
          <div className="tile">
            <div className="t-label">Office days</div>
            <div className="t-value">{officeDayCount}</div>
            <div className="t-sub">days with any swipe activity</div>
          </div>
          <div className="tile">
            <div className="t-label">Avg attendance</div>
            <div className="t-value">{avgDays.toFixed(1)}</div>
            <div className="t-sub">days per employee</div>
          </div>
          <div className="tile alert">
            <div className="t-label">Below {threshold} days</div>
            <div className="t-value">{belowCount}</div>
            <div className="t-sub">of {allEmployees.length} employees</div>
          </div>
          {employeeList && (
            <div className={`tile ${neverSwiped.length > 0 ? 'alert' : ''}`}>
              <div className="t-label">No swipe at all</div>
              <div className="t-value">{neverSwiped.length}</div>
              <div className="t-sub">
                {neverSwiped.length === 0
                  ? `everyone in the list swiped in ${month.label}`
                  : `in the employee list, absent all of ${month.label}`}
              </div>
            </div>
          )}
        </section>

        <div className="controls">
          <div className="search">
            {SearchIcon}
            <input
              placeholder="Search name, ID or card…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className={`filter-chip ${lowOnly ? 'active' : ''}`} onClick={() => setLowOnly(!lowOnly)}>
            Below {threshold} days <span className="count">{belowCount}</span>
          </button>
          {neverSwiped.length > 0 && (
            <button
              className={`filter-chip ${noSwipeOnly ? 'active' : ''}`}
              onClick={() => setNoSwipeOnly(!noSwipeOnly)}
              title="Employees in the uploaded list with no swipe at all this month"
            >
              No swipes <span className="count">{neverSwiped.length}</span>
            </button>
          )}
          <button className="btn de-open" onClick={() => setShowEmails(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
            </svg>
            Draft emails{belowCount > 0 ? ` (${belowCount})` : ''}
          </button>
          <span className="threshold-ctl">
            <button onClick={() => setThreshold(threshold - 1)} aria-label="Lower threshold">−</button>
            <b>{threshold}</b>
            <button onClick={() => setThreshold(threshold + 1)} aria-label="Raise threshold">+</button>
            <span style={{ paddingRight: 6 }}>day threshold</span>
          </span>
        </div>

        <div className="table-card">
          <table className="emp">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('name')}>
                  Employee{sort.by === 'name' && <span className="arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
                </th>
                <th>Card</th>
                <th>Month at a glance</th>
                <th className="sortable" onClick={() => toggleSort('days')}>
                  Days present{sort.by === 'days' && <span className="arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
                </th>
                <th>Avg in</th>
                <th>Avg out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className="empty-row" colSpan={7}>No employees match.</td></tr>
              )}
              {rows.map((e) => (
                <tr key={rowId(e)} className={e.noSwipes ? 'no-swipe-row' : ''} onClick={() => setSelected(rowId(e))}>
                  <td>
                    <span className="emp-cell">
                      <span className={`avatar ${e.mapped ? '' : 'unmapped'}`}>{initials(e.name)}</span>
                      <span>
                        <div className="nm">{e.name}</div>
                        {(e.empId || e.email) && <div className="sub">{e.empId ?? e.email}</div>}
                      </span>
                    </span>
                  </td>
                  <td className="muted">{e.card ?? '—'}</td>
                  <td><DayStrip officeDays={month.officeDays} days={e.days} /></td>
                  <td className="days-cell">
                    {e.presentDays} <span className="of">/ {officeDayCount}</span>
                  </td>
                  <td>{formatMinutesAsTime(e.avgInMin)}</td>
                  <td>{formatMinutesAsTime(e.avgOutMin)}</td>
                  <td>
                    {e.noSwipes
                      ? <span className="badge-none" title="In the employee list but never swiped this month">● No swipes</span>
                      : e.presentDays < threshold
                        ? <span className="badge-low">● Low</span>
                        : <span className="badge-ok">● On track</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="rule-note">
          A day counts as present when the card swiped at least once — <b>first swipe = in</b>,{' '}
          <b>last swipe = out</b>. Days with a single swipe show no out-time.
          {employeeList && (
            <>
              {' '}Rows marked <b>No swipes</b> come from the employee list and have no swipe at
              all in {month.label} — absent every day
              {unmapped.length > 0 ? ', unless they are behind one of the unassigned cards above' : ''}.
            </>
          )}
        </p>
      </main>

      {showEmails && (
        <DraftEmails
          month={month}
          neverSwiped={neverSwiped}
          threshold={threshold}
          employeeList={employeeList}
          onEmployeeListParsed={onEmployeeListParsed}
          onClose={() => setShowEmails(false)}
        />
      )}

      {selectedEmp && (
        <EmployeeDetail
          employee={selectedEmp}
          month={month}
          threshold={threshold}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
