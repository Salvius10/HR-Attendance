import { useMemo, useState } from 'react'
import {
  formatTime, formatMinutesAsTime, formatDuration, dayKeyLabel, dayOfMonth,
} from '../lib/attendance.js'
import { initials } from './Dashboard.jsx'

// Bar with a rounded top and a square baseline end
function barPath(x, y, w, h, r) {
  if (h <= 0) return ''
  const rr = Math.min(r, h, w / 2)
  return `M ${x} ${y + h}
          L ${x} ${y + rr}
          Q ${x} ${y} ${x + rr} ${y}
          L ${x + w - rr} ${y}
          Q ${x + w} ${y} ${x + w} ${y + rr}
          L ${x + w} ${y + h} Z`
}

function HoursChart({ employee, month }) {
  const [tip, setTip] = useState(null)

  const W = 640, H = 200
  const padL = 34, padR = 8, padT = 14, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const days = month.officeDays
  const maxHours = useMemo(() => {
    let mx = 0
    for (const dk of days) {
      const rec = employee.days[dk]
      if (rec?.hoursMs) mx = Math.max(mx, rec.hoursMs / 3600000)
    }
    return Math.max(2, Math.ceil(mx / 2) * 2)
  }, [employee, days])

  const step = maxHours <= 8 ? 2 : 4
  const slot = plotW / days.length
  const barW = Math.min(22, Math.max(6, slot - 4))

  const ticks = []
  for (let t = step; t <= maxHours; t += step) ticks.push(t)

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Hours in office per day">
        {ticks.map((t) => {
          const y = padT + plotH - (t / maxHours) * plotH
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
              <text x={padL - 7} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="var(--ink-3)">{t}h</text>
            </g>
          )
        })}
        <line x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} stroke="var(--line-strong)" strokeWidth="1" />

        {days.map((dk, i) => {
          const rec = employee.days[dk]
          const cx = padL + slot * i + slot / 2
          const x = cx - barW / 2
          const label = dayOfMonth(dk)
          const showLabel = days.length <= 24 || i % 2 === 0
          const els = []
          if (rec && rec.hoursMs != null) {
            const h = Math.max(3, (rec.hoursMs / 3600000 / maxHours) * plotH)
            els.push(
              <path key="bar" d={barPath(x, padT + plotH - h, barW, h, 4)} fill="var(--mark-blue)" />
            )
          } else if (rec && rec.single) {
            els.push(
              <circle key="dot" cx={cx} cy={padT + plotH - 5} r="4"
                fill="var(--surface)" stroke="var(--mark-orange)" strokeWidth="2" />
            )
          }
          return (
            <g key={dk}>
              {els}
              {showLabel && (
                <text x={cx} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--ink-3)">{label}</text>
              )}
              <rect
                x={padL + slot * i} y={padT} width={slot} height={plotH + padB} fill="transparent"
                onMouseEnter={() => {
                  let text
                  if (!rec) text = `${dayKeyLabel(dk)}\nAbsent`
                  else if (rec.single) text = `${dayKeyLabel(dk)}\nSingle swipe · ${formatTime(rec.in)}`
                  else text = `${dayKeyLabel(dk)}\n${formatTime(rec.in)} – ${formatTime(rec.out)} · ${formatDuration(rec.hoursMs)}`
                  setTip({ xPct: (cx / W) * 100, yPct: (padT / H) * 100 + 4, text })
                }}
                onMouseLeave={() => setTip(null)}
              />
            </g>
          )
        })}
      </svg>
      {tip && (
        <div className="chart-tip" style={{ left: `${tip.xPct}%`, top: `${tip.yPct}%` }}>{tip.text}</div>
      )}
    </div>
  )
}

export default function EmployeeDetail({ employee, month, threshold, onClose }) {
  const presentPct = Math.round((employee.presentDays / month.officeDays.length) * 100)

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="slideover" role="dialog" aria-label={`${employee.name} attendance detail`}>
        <div className="so-head">
          <span className={`avatar ${employee.mapped ? '' : 'unmapped'}`}>{initials(employee.name)}</span>
          <div>
            <div className="nm">{employee.name}</div>
            <div className="sub">
              {employee.empId ? `${employee.empId} · ` : ''}Card {employee.card} · {month.label}
            </div>
          </div>
          <button className="so-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="so-body">
          <div className="so-tiles">
            <div className={`tile ${employee.presentDays < threshold ? 'alert' : ''}`}>
              <div className="t-label">Days present</div>
              <div className="t-value">{employee.presentDays} <span style={{ fontSize: 14, color: 'var(--ink-3)', fontWeight: 500 }}>/ {month.officeDays.length}</span></div>
              <div className="t-sub">{presentPct}% of office days</div>
            </div>
            <div className="tile">
              <div className="t-label">Avg in</div>
              <div className="t-value">{formatMinutesAsTime(employee.avgInMin)}</div>
            </div>
            <div className="tile">
              <div className="t-label">Avg out</div>
              <div className="t-value">{formatMinutesAsTime(employee.avgOutMin)}</div>
            </div>
            <div className="tile">
              <div className="t-label">Avg time in office</div>
              <div className="t-value">{formatDuration(employee.avgHoursMs)}</div>
            </div>
          </div>

          <div className="chart-card">
            <h3>Hours in office per day</h3>
            <p className="hint">Last swipe minus first swipe. Hollow dot = single swipe (no out-time).</p>
            <HoursChart employee={employee} month={month} />
          </div>

          <div className="detail-table-card">
            <h3>Day-by-day log</h3>
            <table className="detail">
              <thead>
                <tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th></tr>
              </thead>
              <tbody>
                {month.officeDays.map((dk) => {
                  const rec = employee.days[dk]
                  if (!rec) {
                    return (
                      <tr key={dk} className="absent">
                        <td className="day-name">{dayKeyLabel(dk)}</td>
                        <td>—</td><td>—</td><td>Absent</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={dk}>
                      <td className="day-name">{dayKeyLabel(dk)}</td>
                      <td>{formatTime(rec.in)}</td>
                      <td>
                        {rec.out != null ? formatTime(rec.out) : '—'}
                        {rec.single && <span className="pill-single">single swipe</span>}
                      </td>
                      <td>{rec.hoursMs != null ? formatDuration(rec.hoursMs) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </>
  )
}
