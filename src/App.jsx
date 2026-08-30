import { useEffect, useMemo, useState } from 'react'
import UploadScreen from './components/UploadScreen.jsx'
import Dashboard from './components/Dashboard.jsx'
import { buildModel } from './lib/attendance.js'

const MAPPING_KEY = 'hr-attendance.mapping.v1'
const THRESHOLD_KEY = 'hr-attendance.threshold.v1'

function loadSavedMapping() {
  try {
    const raw = localStorage.getItem(MAPPING_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data.entries) || data.entries.length === 0) return null
    return data
  } catch {
    return null
  }
}

export default function App() {
  const [swipeData, setSwipeData] = useState(null)
  const [mapping, setMapping] = useState(loadSavedMapping)
  const [threshold, setThresholdState] = useState(() => {
    const v = parseInt(localStorage.getItem(THRESHOLD_KEY) ?? '12', 10)
    return Number.isFinite(v) && v > 0 ? v : 12
  })
  const [showUpload, setShowUpload] = useState(true)

  // Dev-only: `?demo` loads a synthetic dataset for styling work (no localStorage writes)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!new URLSearchParams(location.search).has('demo')) return
    import('./lib/demoData.js').then(({ makeDemoData }) => {
      const { events, mapping: entries } = makeDemoData()
      setSwipeData({ events, fileName: 'demo-swipes.xlsx' })
      setMapping({ entries, fileName: 'demo-mapping.xlsx', savedAt: Date.now() })
      setShowUpload(false)
    })
  }, [])

  const setThreshold = (v) => {
    const clamped = Math.max(1, Math.min(31, v))
    setThresholdState(clamped)
    localStorage.setItem(THRESHOLD_KEY, String(clamped))
  }

  const handleSwipeParsed = (data) => {
    setSwipeData(data)
    setShowUpload(false)
  }

  const handleMappingParsed = ({ entries, fileName }) => {
    const data = { entries, fileName, savedAt: Date.now() }
    setMapping(data)
    localStorage.setItem(MAPPING_KEY, JSON.stringify(data))
  }

  const model = useMemo(
    () => (swipeData ? buildModel(swipeData.events, mapping?.entries ?? null) : null),
    [swipeData, mapping]
  )

  if (showUpload || !model) {
    return (
      <UploadScreen
        mapping={mapping}
        hasData={!!model}
        onSwipeParsed={handleSwipeParsed}
        onMappingParsed={handleMappingParsed}
        onBack={model ? () => setShowUpload(false) : null}
      />
    )
  }

  return (
    <Dashboard
      model={model}
      mapping={mapping}
      threshold={threshold}
      setThreshold={setThreshold}
      onMappingParsed={handleMappingParsed}
      onNewUpload={() => setShowUpload(true)}
    />
  )
}
