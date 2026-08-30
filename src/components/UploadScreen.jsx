import { useRef, useState } from 'react'
import { parseSwipeFile, parseMappingFile } from '../lib/parseWorkbooks.js'

function Dropzone({ title, required, hint, icon, status, onFile, secondary }) {
  const inputRef = useRef(null)
  const [dragover, setDragover] = useState(false)

  const pick = (files) => {
    if (files && files.length > 0) onFile(files[0])
  }

  return (
    <div
      className={`dropzone ${secondary ? 'secondary' : ''} ${dragover ? 'dragover' : ''} ${status?.kind === 'ok' ? 'done' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => { e.preventDefault(); setDragover(false); pick(e.dataTransfer.files) }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => { pick(e.target.files); e.target.value = '' }}
      />
      <div className="dz-icon">{icon}</div>
      <div className="dz-req">{required ? 'Required' : 'Optional'}</div>
      <h3>{title}</h3>
      <p>{hint}</p>
      {status && <div className={`dz-status ${status.kind}`}>{status.text}</div>}
    </div>
  )
}

const SheetIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" /><path d="M8 13h8M8 17h8" />
  </svg>
)

const CardIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="12" r="2.2" /><path d="M14 10h5M14 14h5" />
  </svg>
)

export default function UploadScreen({ mapping, hasData, onSwipeParsed, onMappingParsed, onBack }) {
  const [swipeStatus, setSwipeStatus] = useState(null)
  const [mapStatus, setMapStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleSwipe = async (file) => {
    setBusy(true)
    setSwipeStatus(null)
    try {
      const data = await parseSwipeFile(file)
      setSwipeStatus({ kind: 'ok', text: `✓ ${file.name} — ${data.events.length} swipes` })
      onSwipeParsed(data)
    } catch (err) {
      setSwipeStatus({ kind: 'err', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const handleMapping = async (file) => {
    setMapStatus(null)
    try {
      const data = await parseMappingFile(file)
      setMapStatus({ kind: 'ok', text: `✓ ${file.name} — ${data.entries.length} cards mapped` })
      onMappingParsed(data)
    } catch (err) {
      setMapStatus({ kind: 'err', text: err.message })
    }
  }

  const savedText = mapping
    ? `Using saved mapping · ${mapping.entries.length} cards · ${mapping.fileName}`
    : null

  return (
    <div className="upload-screen">
      <div className="upload-hero">
        <div className="logo-lg">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
          </svg>
        </div>
        <h1>Monthly Attendance Tracker</h1>
        <p>
          Upload the month-end access-card swipe report to see who came in, when they
          arrived and when they left — first swipe in, last swipe out.
        </p>
      </div>

      <div className="dropzones">
        <Dropzone
          title="Swipe report"
          required
          icon={SheetIcon}
          hint="The door access log for the month — Time and Card no. columns. Drop the file here or click to browse."
          status={busy ? { kind: 'saved', text: 'Reading…' } : swipeStatus}
          onFile={handleSwipe}
        />
        <Dropzone
          title="Card assignments"
          secondary
          icon={CardIcon}
          hint="Which employee holds which access card. Upload once — it's remembered. Re-upload only when a card changes hands."
          status={mapStatus ?? (savedText ? { kind: 'saved', text: savedText } : null)}
          onFile={handleMapping}
        />
      </div>

      <div className="upload-footnote">
        {onBack ? (
          <button className="btn btn-primary" onClick={onBack}>← Back to dashboard</button>
        ) : (
          'Files are processed entirely in your browser — nothing is uploaded to a server.'
        )}
      </div>
    </div>
  )
}
