import { useEffect, useMemo, useRef, useState } from 'react'
import { matchRecipients, templateVars, renderTemplate, TEMPLATE_VARIABLES } from '../lib/emails.js'
import { parseEmployeeListFile } from '../lib/parseWorkbooks.js'
import { MailIcon } from './UploadScreen.jsx'
import { initials } from './Dashboard.jsx'

const TEMPLATE_KEY = 'hr-attendance.emailTemplate.v1'
const FROM_KEY = 'hr-attendance.fromEmail.v1'

const DEFAULT_SUBJECT = 'Office attendance for {month}'
const DEFAULT_BODY =
  '<p>Hi {firstName},</p>' +
  '<p>Our records show you were in the office <b>{daysPresent} day(s)</b> in {month}, ' +
  'which is below the required {threshold} days ({shortfall} day(s) short).</p>' +
  '<p>Please plan the coming month so you meet the attendance requirement. ' +
  'If you believe this is an error, reply to this email.</p>' +
  '<p>Regards,<br/>HR Team</p>'

function loadTemplate() {
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY)
    if (raw) {
      const t = JSON.parse(raw)
      if (typeof t.subject === 'string' && typeof t.body === 'string') return t
    }
  } catch { /* fall through */ }
  return { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY }
}

function ToolbarButton({ label, title, onClick, children }) {
  return (
    <button
      type="button"
      className="rt-btn"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault() /* keep editor selection */}
      onClick={onClick}
    >
      {children ?? label}
    </button>
  )
}

export default function DraftEmails({ month, threshold, employeeList, onEmployeeListParsed, onClose }) {
  const [template, setTemplate] = useState(loadTemplate)
  const [fromEmail, setFromEmail] = useState(() => localStorage.getItem(FROM_KEY) ?? 'melvin.i@ganitinc.com')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [excluded, setExcluded] = useState(() => new Set())
  const [phase, setPhase] = useState('edit') // edit | confirm | sending | done
  const [sendError, setSendError] = useState(null)
  const [results, setResults] = useState(null) // Map(email -> {ok, error})
  const [showPreview, setShowPreview] = useState(true)
  const [listError, setListError] = useState(null)
  const editorRef = useRef(null)
  const listInputRef = useRef(null)

  const below = useMemo(
    () => month.employees.filter((e) => e.presentDays < threshold),
    [month, threshold]
  )
  const matched = useMemo(
    () => matchRecipients(below, employeeList?.people ?? null),
    [below, employeeList]
  )
  const recipients = matched.filter((r) => r.email)
  const unmatched = matched.filter((r) => !r.email)
  const selected = recipients.filter((r) => !excluded.has(r.email))

  // contentEditable is uncontrolled; seed it once
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = template.body
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveTemplate = (t) => {
    setTemplate(t)
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(t))
  }

  const onBodyInput = () => {
    if (editorRef.current) saveTemplate({ ...template, body: editorRef.current.innerHTML })
  }

  const exec = (cmd, arg = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, arg)
    onBodyInput()
  }

  const insertVariable = (key) => {
    editorRef.current?.focus()
    document.execCommand('insertText', false, `{${key}}`)
    onBodyInput()
  }

  const toggleRecipient = (email) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  const handleListFile = async (file) => {
    setListError(null)
    try {
      onEmployeeListParsed(await parseEmployeeListFile(file))
    } catch (err) {
      setListError(err.message)
    }
  }

  const previewFor = selected[0] ?? recipients[0] ?? null
  const preview = previewFor
    ? {
        to: previewFor.email,
        subject: renderTemplate(template.subject, templateVars(previewFor, { threshold, monthLabel: month.label })),
        html: renderTemplate(template.body, templateVars(previewFor, { threshold, monthLabel: month.label })),
      }
    : null

  const canSend = selected.length > 0 && fromEmail.includes('@') && password.length > 0

  const doSend = async () => {
    setPhase('sending')
    setSendError(null)
    const messages = selected.map((r) => {
      const vars = templateVars(r, { threshold, monthLabel: month.label })
      return {
        to: r.email,
        subject: renderTemplate(template.subject, vars),
        html: renderTemplate(template.body, vars),
      }
    })
    try {
      const res = await fetch('/api/send-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, password, messages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`)
      setResults(new Map(data.results.map((r) => [r.to, r])))
      setPhase('done')
    } catch (err) {
      setSendError(err.message)
      setPhase('edit')
    }
  }

  const sentCount = results ? [...results.values()].filter((r) => r.ok).length : 0
  const failCount = results ? [...results.values()].filter((r) => !r.ok).length : 0

  return (
    <>
      <div className="overlay" onClick={phase === 'sending' ? undefined : onClose} />
      <aside className="slideover de-panel" role="dialog" aria-label="Draft emails">
        <div className="so-head">
          <span className="avatar de-mail-icon">{MailIcon}</span>
          <div>
            <div className="nm">Draft emails</div>
            <div className="sub">
              {below.length} below {threshold} days · {month.label}
            </div>
          </div>
          <button className="so-close" onClick={onClose} aria-label="Close" disabled={phase === 'sending'}>✕</button>
        </div>

        <div className="so-body">
          {!employeeList ? (
            <div className="de-setup">
              <p>
                To draft emails, upload the employee list with names and email addresses
                (e.g. the Bangalore employee list). It&apos;s remembered after the first upload.
              </p>
              <input
                ref={listInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={(e) => { if (e.target.files[0]) handleListFile(e.target.files[0]); e.target.value = '' }}
              />
              <button className="btn btn-primary" onClick={() => listInputRef.current?.click()}>
                Upload employee list
              </button>
              {listError && <div className="dz-status err">{listError}</div>}
            </div>
          ) : (
            <>
              {phase === 'done' && (
                <div className={failCount === 0 ? 'de-banner ok' : 'de-banner warn'}>
                  {failCount === 0
                    ? `All ${sentCount} email(s) sent successfully.`
                    : `${sentCount} sent, ${failCount} failed — see the list below.`}
                </div>
              )}
              {sendError && <div className="de-banner err">{sendError}</div>}

              <div className="de-section">
                <h3>Recipients <span className="de-count">{selected.length} of {recipients.length} selected</span></h3>
                <div className="de-recipients">
                  {recipients.map((r) => {
                    const res = results?.get(r.email)
                    return (
                      <label key={r.email} className={`de-recipient ${excluded.has(r.email) ? 'off' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!excluded.has(r.email)}
                          onChange={() => toggleRecipient(r.email)}
                          disabled={phase === 'sending'}
                        />
                        <span className="avatar">{initials(r.person?.name ?? r.employee.name)}</span>
                        <span className="de-r-name">
                          <span className="nm">{r.person?.name ?? r.employee.name}</span>
                          <span className="sub">{r.email}</span>
                        </span>
                        <span className="de-r-days">{r.employee.presentDays} / {threshold} days</span>
                        {res && (res.ok
                          ? <span className="badge-ok">✓ Sent</span>
                          : <span className="badge-low" title={res.error}>✗ Failed</span>)}
                      </label>
                    )
                  })}
                  {recipients.length === 0 && (
                    <div className="de-empty">No below-threshold employees matched the email list.</div>
                  )}
                </div>
                {unmatched.length > 0 && (
                  <div className="de-unmatched">
                    No email found for: {unmatched.map((r) => r.employee.name).join(', ')} — they
                    won&apos;t receive an email. Update the employee list if needed.
                  </div>
                )}
              </div>

              <div className="de-section">
                <h3>Message template</h3>
                <p className="hint">
                  Click a variable to insert it — each recipient gets their own values filled in.
                </p>
                <div className="de-vars">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <button key={v.key} type="button" className="var-chip"
                      title={v.label} onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(v.key)}>
                      {'{'}{v.key}{'}'}
                    </button>
                  ))}
                </div>
                <input
                  className="de-input de-subject"
                  placeholder="Subject"
                  value={template.subject}
                  onChange={(e) => saveTemplate({ ...template, subject: e.target.value })}
                />
                <div className="rt-toolbar">
                  <ToolbarButton title="Bold" onClick={() => exec('bold')}><b>B</b></ToolbarButton>
                  <ToolbarButton title="Italic" onClick={() => exec('italic')}><i>I</i></ToolbarButton>
                  <ToolbarButton title="Underline" onClick={() => exec('underline')}><u>U</u></ToolbarButton>
                  <span className="rt-sep" />
                  <ToolbarButton title="Bulleted list" onClick={() => exec('insertUnorderedList')}>• List</ToolbarButton>
                  <ToolbarButton title="Numbered list" onClick={() => exec('insertOrderedList')}>1. List</ToolbarButton>
                  <span className="rt-sep" />
                  <ToolbarButton title="Clear formatting" onClick={() => exec('removeFormat')}>Tx</ToolbarButton>
                  <ToolbarButton
                    title="Reset to default template"
                    onClick={() => {
                      saveTemplate({ subject: DEFAULT_SUBJECT, body: DEFAULT_BODY })
                      if (editorRef.current) editorRef.current.innerHTML = DEFAULT_BODY
                    }}
                  >Reset</ToolbarButton>
                </div>
                <div
                  ref={editorRef}
                  className="rt-editor"
                  contentEditable={phase !== 'sending'}
                  suppressContentEditableWarning
                  onInput={onBodyInput}
                />
              </div>

              <div className="de-section">
                <h3>
                  Preview
                  <button className="de-toggle" onClick={() => setShowPreview(!showPreview)}>
                    {showPreview ? 'hide' : 'show'}
                  </button>
                </h3>
                {showPreview && (preview ? (
                  <div className="de-preview">
                    <div className="de-p-meta"><b>To:</b> {preview.to}</div>
                    <div className="de-p-meta"><b>Subject:</b> {preview.subject}</div>
                    <div className="de-p-body" dangerouslySetInnerHTML={{ __html: preview.html }} />
                  </div>
                ) : (
                  <div className="de-empty">Select at least one recipient to preview.</div>
                ))}
              </div>

              <div className="de-section">
                <h3>Send</h3>
                <div className="de-cred-row">
                  <label className="de-field">
                    <span>From</span>
                    <input
                      className="de-input"
                      type="email"
                      value={fromEmail}
                      onChange={(e) => { setFromEmail(e.target.value); localStorage.setItem(FROM_KEY, e.target.value) }}
                    />
                  </label>
                  <label className="de-field">
                    <span>Email password</span>
                    <span className="de-pass-wrap">
                      <input
                        className="de-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Password or app password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="off"
                      />
                      <button type="button" className="de-eye" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? 'hide' : 'show'}
                      </button>
                    </span>
                  </label>
                </div>
                <p className="hint">
                  Sends via smtp.office365.com from this machine. The password is used only for
                  this send and is never stored.
                </p>
                <div className="de-send-row">
                  {phase !== 'confirm' ? (
                    <button
                      className="btn btn-primary de-send"
                      disabled={!canSend || phase === 'sending'}
                      onClick={() => setPhase('confirm')}
                    >
                      {phase === 'sending' ? 'Sending…' : `Send email to ${selected.length} employee(s)`}
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-primary de-send" onClick={doSend}>
                        Yes, send {selected.length} email(s) now
                      </button>
                      <button className="btn" onClick={() => setPhase('edit')}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
