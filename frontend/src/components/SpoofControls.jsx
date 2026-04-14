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
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Selected beacon row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 90 }}>Selected</span>
        <span style={{
          color: selectedBeacon ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 12, flex: 1,
        }}>
          {selectedBeacon
            ? `${selectedBeacon.uuid}  ·  ${selectedBeacon.major}  ·  ${selectedBeacon.minor}`
            : 'No beacon selected — click a table row or use manual entry below'
          }
        </span>
      </div>

      {/* Manual entry fields */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 90 }}>Manual entry</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <div>
            <label>UUID</label>
            <input
              value={manualUUID}
              onChange={e => setManualUUID(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ width: 280 }}
              disabled={spoofing}
            />
          </div>
          <div>
            <label>Major</label>
            <input
              type="number" min={0} max={65535}
              value={manualMajor}
              onChange={e => setManualMajor(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
          </div>
          <div>
            <label>Minor</label>
            <input
              type="number" min={0} max={65535}
              value={manualMinor}
              onChange={e => setManualMinor(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
          </div>
          <div>
            <label>TX Power</label>
            <input
              type="number" min={-128} max={127}
              value={manualTX}
              onChange={e => setManualTX(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleStart} disabled={!canSpoof || spoofing}>
          Start Spoof
        </button>
        <button onClick={() => onAction(stopSpoof)} disabled={!spoofing}>
          Stop Spoof
        </button>
      </div>
    </div>
  )
}
