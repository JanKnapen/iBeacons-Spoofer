import { useState } from 'react'
import { startSpoof, stopSpoof } from '../api'

const DEFAULT_TX = -59

export default function SpoofControls({ status, selectedBeacon, onAction }) {
  const [manualUUID, setManualUUID]   = useState('')
  const [manualMajor, setManualMajor] = useState('')
  const [manualMinor, setManualMinor] = useState('')
  const [manualTX, setManualTX]       = useState(String(DEFAULT_TX))

  const scanning = status?.scanning ?? false
  const spoofing = status?.spoofing ?? false

  // Payload priority: selected beacon row > manual fields
  const canSpoof = !!status && !scanning && (
    selectedBeacon !== null || manualUUID.trim() !== ''
  )

  const handleStart = () => {
    const payload = selectedBeacon
      ? {
          uuid: selectedBeacon.uuid,
          major: selectedBeacon.major,
          minor: selectedBeacon.minor,
          tx_power: selectedBeacon.tx_power ?? DEFAULT_TX,
        }
      : {
          uuid: manualUUID.trim(),
          major: parseInt(manualMajor, 10) || 0,
          minor: parseInt(manualMinor, 10) || 0,
          tx_power: parseInt(manualTX, 10) || DEFAULT_TX,
        }
    onAction(() => startSpoof(payload))
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Spoof</span>
        {spoofing && <span className="badge badge-warn">Broadcasting</span>}
      </div>
      <div className="panel-body">

        {/* Selected beacon display */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--surface-high)',
          border: `1px solid ${selectedBeacon ? 'rgba(0,204,255,0.2)' : 'var(--border)'}`,
          borderLeft: `3px solid ${selectedBeacon ? 'var(--accent)' : 'var(--border-hi)'}`,
          borderRadius: 4,
        }}>
          {selectedBeacon ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--accent)',
                wordBreak: 'break-all',
              }}>
                {selectedBeacon.uuid}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                Major: {selectedBeacon.major} · Minor: {selectedBeacon.minor}
              </span>
            </div>
          ) : (
            <span style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}>
              Select a beacon row or use manual entry below
            </span>
          )}
        </div>

        {/* Manual entry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="form-label">Manual Entry</span>

          <div className="form-row">
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 28 }}>UUID</span>
            <input
              value={manualUUID}
              onChange={e => setManualUUID(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={spoofing}
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>

          <div className="form-row" style={{ gap: 6 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Maj</span>
            <input
              type="number" min={0} max={65535}
              value={manualMajor}
              onChange={e => setManualMajor(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Min</span>
            <input
              type="number" min={0} max={65535}
              value={manualMinor}
              onChange={e => setManualMinor(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>TX</span>
            <input
              type="number" min={-128} max={127}
              value={manualTX}
              onChange={e => setManualTX(e.target.value)}
              style={{ width: 64 }}
              disabled={spoofing}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="form-row" style={{ gap: 8 }}>
          <button
            onClick={handleStart}
            disabled={!canSpoof || spoofing}
            className={spoofing ? 'btn-warn' : canSpoof ? 'btn-primary' : ''}
            style={{ flex: 1 }}
          >
            {spoofing ? '⬤ Broadcasting' : 'Start Spoof'}
          </button>
          <button
            onClick={() => onAction(stopSpoof)}
            disabled={!spoofing}
            style={{ flex: 1 }}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  )
}
