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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <label>MAC</label>
      <span style={{ fontSize: 13, fontFamily: 'monospace', minWidth: 140 }}>
        {effectiveMac}
      </span>
      {isSpoofed && (
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 3,
          background: '#2a3a1a', color: '#81c784', border: '1px solid #4a5a3a',
        }}>
          Spoofed
        </span>
      )}

      <input
        value={customMac}
        onChange={e => setCustomMac(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="AA:BB:CC:DD:EE:FF"
        disabled={disabled}
        style={{ width: 160, fontFamily: 'monospace' }}
      />
      <button onClick={handleSet} disabled={disabled || !validCustom}>
        Set
      </button>
      <button onClick={handleRandom} disabled={disabled}>
        Random
      </button>
      {isSpoofed && (
        <button onClick={handleReset} disabled={disabled}>
          Reset
        </button>
      )}
    </div>
  )
}
