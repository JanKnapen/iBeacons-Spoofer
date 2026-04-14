import { useState } from 'react'
import { setMac, resetMac } from '../api'

function generateRandomMac() {
  const bytes = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256))
  // Set top two bits of first byte for BLE random static address
  bytes[0] = (bytes[0] | 0xC0)
  return bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':')
}

const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/

export default function MacControls({ macInfo, status, onAction }) {
  const [customMac, setCustomMac] = useState('')

  const disabled    = !status || status.scanning || status.spoofing
  const validCustom = MAC_RE.test(customMac)

  const handleSet = () => {
    if (!validCustom) return
    onAction(() => setMac(customMac))
    setCustomMac('')
  }
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && validCustom && !disabled) handleSet()
  }

  const effectiveMac = macInfo?.spoofed_mac || macInfo?.original_mac || '—'
  const isSpoofed    = !!macInfo?.spoofed_mac

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

      {/* Current MAC display */}
      <div className="form-row">
        <span className="form-label" style={{ minWidth: 32 }}>MAC</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: isSpoofed ? 'var(--amber)' : '#666',
          letterSpacing: '0.04em',
          flex: 1,
        }}>
          {effectiveMac}
        </span>
        {isSpoofed && <span className="badge badge-amber">Spoofed</span>}
      </div>

      {/* Custom MAC input */}
      <input
        value={customMac}
        onChange={e => setCustomMac(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="AA:BB:CC:DD:EE:FF"
        disabled={disabled}
        style={{ width: '100%' }}
      />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn-sm btn-amber"
          onClick={handleSet}
          disabled={disabled || !validCustom}
          style={{ flex: 1 }}
        >
          Set
        </button>
        <button
          className="btn-sm"
          onClick={() => onAction(() => setMac(generateRandomMac()))}
          disabled={disabled}
          style={{ flex: 1 }}
        >
          Random
        </button>
        {isSpoofed && (
          <button
            className="btn-sm"
            onClick={() => onAction(() => resetMac())}
            disabled={disabled}
            style={{ flex: 1 }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}
