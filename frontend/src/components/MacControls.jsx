import { useState } from 'react'
import { setMac, resetMac } from '../api'

function generateRandomMac() {
  const bytes = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256)
  )
  // Set top two bits of first byte for BLE random static address
  bytes[0] = (bytes[0] | 0xC0)
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')
}

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/

export default function MacControls({ macInfo, status, onAction }) {
  const [customMac, setCustomMac] = useState('')

  const disabled = !status || status.scanning || status.spoofing
  const validCustom = MAC_RE.test(customMac)

  const handleSet = () => {
    if (!validCustom) return
    onAction(() => setMac(customMac))
    setCustomMac('')
  }

  const handleRandom = () => {
    const mac = generateRandomMac()
    onAction(() => setMac(mac))
  }

  const handleReset = () => {
    onAction(() => resetMac())
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && validCustom && !disabled) handleSet()
  }

  const effectiveMac = macInfo?.spoofed_mac || macInfo?.original_mac || '—'
  const isSpoofed = !!macInfo?.spoofed_mac

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Current MAC display */}
      <div className="form-row">
        <span className="form-label" style={{ minWidth: 32 }}>MAC</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: isSpoofed ? 'var(--warn)' : 'var(--text-bright)',
          letterSpacing: '0.04em',
          flex: 1,
        }}>
          {effectiveMac}
        </span>
        {isSpoofed && <span className="badge badge-warn">Spoofed</span>}
      </div>

      {/* MAC input */}
      <input
        value={customMac}
        onChange={e => setCustomMac(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="AA:BB:CC:DD:EE:FF"
        disabled={disabled}
        style={{ width: '100%' }}
      />

      {/* Action buttons */}
      <div className="form-row" style={{ gap: 6 }}>
        <button className="btn-sm btn-primary" onClick={handleSet} disabled={disabled || !validCustom}>
          Set
        </button>
        <button className="btn-sm" onClick={handleRandom} disabled={disabled}>
          Random
        </button>
        {isSpoofed && (
          <button className="btn-sm btn-warn" onClick={handleReset} disabled={disabled}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
