import { useState, useEffect, useCallback, useRef } from 'react'
import { getStatus, getBeacons } from './api'
import AdapterSelector from './components/AdapterSelector'
import ScanControls from './components/ScanControls'
import BeaconList from './components/BeaconList'
import SpoofControls from './components/SpoofControls'

function statusLabel(status) {
  if (!status) return 'Idle'
  if (status.spoofing && status.spoof_target) {
    const { uuid, major, minor } = status.spoof_target
    return `Spoofing [${uuid}::${major}::${minor}]`
  }
  if (status.scanning) return 'Scanning...'
  return 'Idle'
}

export default function App() {
  const [status, setStatus]               = useState(null)
  const [beacons, setBeacons]             = useState([])
  const [selectedBeacon, setSelectedBeacon] = useState(null)
  const [error, setError]                 = useState(null)
  const pollRef = useRef(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getStatus()
      setStatus(s)
      return s
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }, [])

  const refreshBeacons = useCallback(async () => {
    try {
      setBeacons(await getBeacons())
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }, [])

  useEffect(() => {
    if (status?.scanning) {
      pollRef.current = setInterval(refreshBeacons, 3000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [status?.scanning, refreshBeacons])

  useEffect(() => { refreshStatus() }, [refreshStatus])

  const handleAction = useCallback(async (fn) => {
    setError(null)
    try {
      const s = await fn()
      if (s) setStatus(s)
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
    await refreshStatus()
    await refreshBeacons()
  }, [refreshStatus, refreshBeacons])

  const handleSelectBeacon = useCallback((beacon) => {
    setSelectedBeacon(prev => prev?.id === beacon.id ? null : beacon)
  }, [])

  const label = statusLabel(status)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Status bar */}
      <div style={{
        background: status?.spoofing ? '#1a3a1a' : status?.scanning ? '#1a2a3a' : 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <span style={{
          color: status?.spoofing ? '#81c784' : status?.scanning ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: 500,
          fontSize: 13,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        {status && (
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {status.adapter}
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: '#2a1a1a', border: '1px solid var(--error)',
          color: 'var(--error)', padding: '8px 14px', borderRadius: 4,
          marginBottom: 12, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: 12, padding: '2px 8px' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AdapterSelector
          status={status}
          onAction={handleAction}
          onError={setError}
        />
        <ScanControls status={status} onAction={handleAction} />
        <BeaconList
          beacons={beacons}
          selectedBeacon={selectedBeacon}
          onSelect={handleSelectBeacon}
        />
        <SpoofControls
          status={status}
          selectedBeacon={selectedBeacon}
          onAction={handleAction}
        />
      </div>
    </div>
  )
}
