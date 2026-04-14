import { useState, useEffect, useCallback, useRef } from 'react'
import { getStatus, getBeacons, getMac, setMac, startScan, stopScan } from './api'
import AdapterSelector from './components/AdapterSelector'
import BeaconList from './components/BeaconList'
import SpoofControls from './components/SpoofControls'
import MacControls from './components/MacControls'

export default function App() {
  const [status, setStatus]                 = useState(null)
  const [beacons, setBeacons]               = useState([])
  const [selectedBeacon, setSelectedBeacon] = useState(null)
  const [error, setError]                   = useState(null)
  const [macInfo, setMacInfo]               = useState(null)
  const pollRef = useRef(null)

  const refreshStatus = useCallback(async () => {
    try { const s = await getStatus(); setStatus(s); return s }
    catch (e) { setError(e?.response?.data?.error || e.message) }
  }, [])

  const refreshBeacons = useCallback(async () => {
    try { setBeacons(await getBeacons()) }
    catch (e) { setError(e?.response?.data?.error || e.message) }
  }, [])

  const refreshMac = useCallback(async () => {
    try { setMacInfo(await getMac()) }
    catch (e) { setError(e?.response?.data?.error || e.message) }
  }, [])

  useEffect(() => {
    if (status?.scanning) {
      pollRef.current = setInterval(refreshBeacons, 3000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [status?.scanning, refreshBeacons])

  // Load persisted beacons on mount (bug fix: was missing refreshBeacons)
  useEffect(() => {
    refreshStatus(); refreshMac(); refreshBeacons()
  }, [refreshStatus, refreshMac, refreshBeacons])

  const handleAction = useCallback(async (fn) => {
    setError(null)
    try { const s = await fn(); if (s) setStatus(s) }
    catch (e) { setError(e?.response?.data?.error || e.message) }
    await refreshStatus()
    await refreshBeacons()
    await refreshMac()
  }, [refreshStatus, refreshBeacons, refreshMac])

  const handleCloneMac    = useCallback((mac) => handleAction(() => setMac(mac)), [handleAction])
  const handleSelectBeacon = useCallback((beacon) => {
    setSelectedBeacon(prev => prev?.id === beacon.id ? null : beacon)
  }, [])

  const scanning = status?.scanning ?? false
  const spoofing = status?.spoofing ?? false

  return (
    <div className="app-shell">

      {/* ── Header — mirrors WHISPERPAIR bar from screenshot ── */}
      <header className="app-header">
        <div className="hdr-brand">
          <span className="hdr-bticon">✦</span>
          <span className="hdr-name">iBeacon</span>
          {status?.adapter && (
            <span className="hdr-badge">{status.adapter}</span>
          )}
        </div>

        <div className="hdr-right">
          {/* Spoofing indicator */}
          {spoofing && status?.spoof_target && (
            <div className="hdr-status spoofing">
              <span className="hdr-dot pulse" />
              {`Broadcasting ${status.spoof_target.major}:${status.spoof_target.minor}`}
            </div>
          )}

          {/* MAC spoofed indicator */}
          {macInfo?.spoofed_mac && (
            <div className="hdr-status spoofing">
              <span className="hdr-dot" />
              MAC Spoofed
            </div>
          )}

          {/* Scan toggle — styled like "SCAN DEVICES" button in screenshot */}
          {!scanning ? (
            <button
              className="hdr-scan-btn"
              onClick={() => handleAction(startScan)}
              disabled={spoofing}
            >
              <span style={{ fontSize: 9 }}>◎</span>
              Scan Devices
            </button>
          ) : (
            <button
              className="hdr-scan-btn active"
              onClick={() => handleAction(stopScan)}
            >
              <span className="hdr-dot pulse" />
              Stop Scan
            </button>
          )}
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="app-body">
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,61,90,0.35)',
                color: 'var(--danger)',
                padding: '2px 10px',
                fontSize: 10,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="app-layout">
          {/* Left sidebar — controls (mirrors narrow left panel in screenshot) */}
          <aside className="app-sidebar">
            <AdapterSelector status={status} onAction={handleAction} onError={setError}>
              <MacControls macInfo={macInfo} status={status} onAction={handleAction} />
            </AdapterSelector>
            <SpoofControls
              status={status}
              selectedBeacon={selectedBeacon}
              onAction={handleAction}
            />
          </aside>

          {/* Right main — beacon console (mirrors EXPLOIT CONSOLE panel) */}
          <main className="app-main">
            <BeaconList
              beacons={beacons}
              selectedBeacon={selectedBeacon}
              onSelect={handleSelectBeacon}
              onCloneMac={handleCloneMac}
              cloneDisabled={!status || scanning || spoofing}
            />
          </main>
        </div>
      </div>
    </div>
  )
}
