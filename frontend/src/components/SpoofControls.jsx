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
          uuid:     selectedBeacon.uuid,
          major:    selectedBeacon.major,
          minor:    selectedBeacon.minor,
          tx_power: selectedBeacon.tx_power ?? DEFAULT_TX,
        }
      : {
          uuid:     manualUUID.trim(),
          major:    parseInt(manualMajor, 10) || 0,
          minor:    parseInt(manualMinor, 10) || 0,
          tx_power: parseInt(manualTX, 10)    || DEFAULT_TX,
        }
    onAction(() => startSpoof(payload))
  }

  return (
    <>
      {/* Section header */}
      <div className="sec-hdr">
        <span className="sec-icon">⊕</span>
        <span className="sec-title">Spoof</span>
        <div className="sec-end">
          {spoofing && <span className="badge badge-red">Broadcasting</span>}
        </div>
      </div>

      <div className="sb-block" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Selected beacon — like the targeted device display in screenshot */}
        <div style={{
          padding: '9px 10px',
          background: '#0A0A0A',
          border: `1px solid ${selectedBeacon ? 'rgba(245,166,35,0.2)' : 'var(--border-hi)'}`,
          borderLeft: `2px solid ${selectedBeacon ? 'var(--amber)' : 'var(--border-hi)'}`,
          borderRadius: 2,
        }}>
          {selectedBeacon ? (
            <>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--amber)',
                marginBottom: 3,
                wordBreak: 'break-all',
                lineHeight: 1.4,
              }}>
                {selectedBeacon.uuid}
              </div>
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 9,
                color: '#444',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
                Major {selectedBeacon.major} · Minor {selectedBeacon.minor}
              </div>
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: '#333', letterSpacing: '0.04em' }}>
              Select a beacon row or enter UUID below
            </span>
          )}
        </div>

        {/* UUID manual entry */}
        <div>
          <div className="form-label" style={{ marginBottom: 4 }}>UUID</div>
          <input
            value={manualUUID}
            onChange={e => setManualUUID(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            disabled={spoofing}
            style={{ width: '100%' }}
          />
        </div>

        {/* Maj / Min / TX — three equal columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div>
            <div className="form-label" style={{ marginBottom: 3 }}>Major</div>
            <input type="number" min={0} max={65535}
              value={manualMajor} onChange={e => setManualMajor(e.target.value)}
              disabled={spoofing} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 3 }}>Minor</div>
            <input type="number" min={0} max={65535}
              value={manualMinor} onChange={e => setManualMinor(e.target.value)}
              disabled={spoofing} style={{ width: '100%' }} />
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 3 }}>TX</div>
            <input type="number" min={-128} max={127}
              value={manualTX} onChange={e => setManualTX(e.target.value)}
              disabled={spoofing} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Action buttons — Start Spoof styled like "FULL EXPLOIT" (red filled) */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`btn-full btn-red`}
            onClick={handleStart}
            disabled={!canSpoof || spoofing}
            style={{ flex: 1 }}
          >
            {spoofing ? '● Broadcasting' : 'Start Spoof'}
          </button>
          <button
            className="btn-full"
            onClick={() => onAction(stopSpoof)}
            disabled={!spoofing}
            style={{ flex: 1 }}
          >
            Stop
          </button>
        </div>
      </div>
    </>
  )
}
