import { useState, useEffect, useCallback, useRef } from 'react'
import { getStatus, getBeacons, getMac, setMac } from './api'
import AdapterSelector from './components/AdapterSelector'
import ScanControls from './components/ScanControls'
import BeaconList from './components/BeaconList'
import SpoofControls from './components/SpoofControls'
import MacControls from './components/MacControls'

function getState(status) {
  if (status?.spoofing) return 'spoofing'
  if (status?.scanning) return 'scanning'
  return 'idle'
}

function statusLabel(status) {
  if (!status) return 'Idle'
  if (status.spoofing && status.spoof_target) {
    const { uuid, major, minor } = status.spoof_target
    return `Spoofing · ${uuid} · ${major}:${minor}`
  }
  if (status.scanning) return 'Scanning for beacons...'
  return 'Idle'
}

export default function App() {
  const [status, setStatus]               = useState(null)
  const [beacons, setBeacons]             = useState([])
  const [selectedBeacon, setSelectedBeacon] = useState(null)
  const [error, setError]                 = useState(null)
  const [macInfo, setMacInfo]             = useState(null)
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

  const refreshMac = useCallback(async () => {
    try {
      setMacInfo(await getMac())
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

  useEffect(() => { refreshStatus(); refreshMac() }, [refreshStatus, refreshMac])

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
    await refreshMac()
  }, [refreshStatus, refreshBeacons, refreshMac])

  const handleCloneMac = useCallback((mac) => {
    handleAction(() => setMac(mac))
  }, [handleAction])

  const handleSelectBeacon = useCallback((beacon) => {
    setSelectedBeacon(prev => prev?.id === beacon.id ? null : beacon)
  }, [])

  const state = getState(status)
  const label = statusLabel(status)

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-icon">◈</div>
          <span className="app-name">i<span className="hi">Beacon</span></span>
        </div>
        <div className="app-status">
          <span className="status-dot" data-state={state} />
          <span className="status-label" data-state={state}>{label}</span>
        </div>
        {status?.adapter && (
          <span className="adapter-badge">{status.adapter}</span>
        )}
      </header>

      {/* ── Body ── */}
      <div className="app-body">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'transparent', border: '1px solid rgba(255,61,90,0.35)', color: 'var(--danger)', padding: '2px 9px', fontSize: 11 }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="app-layout">
          <main className="app-main">
            <BeaconList
              beacons={beacons}
              selectedBeacon={selectedBeacon}
              onSelect={handleSelectBeacon}
              onCloneMac={handleCloneMac}
              cloneDisabled={!status || status.scanning || status.spoofing}
            />
          </main>

          <aside className="app-sidebar">
            <AdapterSelector status={status} onAction={handleAction} onError={setError}>
              <MacControls macInfo={macInfo} status={status} onAction={handleAction} />
            </AdapterSelector>
            <ScanControls status={status} onAction={handleAction} />
            <SpoofControls status={status} selectedBeacon={selectedBeacon} onAction={handleAction} />
          </aside>
        </div>
      </div>
    </div>
  )
}
