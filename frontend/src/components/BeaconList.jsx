import { useState } from 'react'

/**
 * Gradient signal bar with white tick marker.
 * Replicates the exact style from the WhisperPair screenshot:
 * green (strong/left) → yellow → red (weak/right), white vertical marker at current RSSI.
 *
 * RSSI mapping: -30 dBm → 0 % (leftmost, green)
 *               -100 dBm → 100 % (rightmost, red)
 */
function SignalBar({ rssi }) {
  if (rssi == null) {
    return <span style={{ color: '#2A2A2A', fontFamily: 'var(--font-ui)', fontSize: 10 }}>—</span>
  }
  const val = Number(rssi)
  const pct = Math.min(100, Math.max(0, (-val - 30) / 70 * 100))
  const quality =
    val >= -50 ? 'Excellent' :
    val >= -65 ? 'Good'      :
    val >= -75 ? 'Fair'      :
    val >= -85 ? 'Weak'      : 'Poor'

  return (
    <div className="sig-wrap">
      <div className="sig-track">
        <div className="sig-marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="sig-meta">
        <span>{rssi} dBm</span>
        <span>{quality}</span>
      </div>
    </div>
  )
}

function formatLastSeen(ts) {
  if (!ts) return '—'
  return ts.replace('T', ' ').slice(0, 19)
}

export default function BeaconList({ beacons, selectedBeacon, onSelect, onCloneMac, cloneDisabled }) {
  const [hoveredId, setHoveredId] = useState(null)

  return (
    <div className="beacon-panel">

      {/* Section header — mirrors "EXPLOIT CONSOLE" bar from screenshot */}
      <div className="sec-hdr">
        <span className="sec-icon">◈</span>
        <span className="sec-title">Beacon Console</span>
        <div className="sec-end">
          <span
            className="badge"
            style={
              beacons.length > 0
                ? { background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid var(--amber-bd)' }
                : { color: '#333', border: '1px solid #222', background: 'transparent' }
            }
          >
            {beacons.length}
          </span>
        </div>
      </div>

      <div className="beacon-scroll">
        <table className="beacon-table">
          <thead>
            <tr>
              <th className="col-narrow">Signal</th>
              <th className="col-narrow">MAC</th>
              <th className="col-uuid">UUID</th>
              <th className="col-narrow">Maj</th>
              <th className="col-narrow">Min</th>
              <th className="col-narrow">TX</th>
              <th className="col-narrow">Dist</th>
              <th className="col-narrow">Last Seen</th>
              <th className="col-narrow"></th>
            </tr>
          </thead>
          <tbody>
            {beacons.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  style={{
                    padding: '52px 16px',
                    textAlign: 'center',
                    color: '#282828',
                    fontFamily: 'var(--font-ui)',
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    borderBottom: 'none',
                  }}
                >
                  No beacons detected — press Scan Devices to start
                </td>
              </tr>
            ) : (
              beacons.map((b, idx) => {
                const isSelected = selectedBeacon?.id === b.id
                return (
                  <tr
                    key={b.id}
                    className={`beacon-row${isSelected ? ' selected' : ''}`}
                    onClick={() => onSelect(b)}
                    onMouseEnter={() => setHoveredId(b.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ animationDelay: `${idx * 22}ms` }}
                  >
                    {/* Signal bar — gradient strip + white tick marker */}
                    <td className="col-narrow col-first">
                      <SignalBar rssi={b.rssi} />
                    </td>

                    {/* MAC — highlighted amber when row is selected */}
                    <td className="col-narrow mac-val">{b.mac ?? '—'}</td>

                    {/* UUID */}
                    <td
                      className="col-uuid"
                      style={{ color: isSelected ? '#C0C0C0' : '#4A4A4A' }}
                    >
                      {b.uuid ?? '—'}
                    </td>

                    <td className="col-narrow">{b.major ?? '—'}</td>
                    <td className="col-narrow">{b.minor ?? '—'}</td>
                    <td className="col-narrow">{b.tx_power ?? '—'}</td>
                    <td className="col-narrow">{b.distance ?? '—'}</td>
                    <td className="col-narrow" style={{ fontSize: 10 }}>{formatLastSeen(b.last_seen)}</td>

                    {/* Clone button — amber when row is selected (like TARGET button in screenshot) */}
                    <td className="col-narrow">
                      {b.mac && (
                        <button
                          className={`btn-sm${isSelected ? ' btn-amber' : ''}`}
                          onClick={e => { e.stopPropagation(); onCloneMac(b.mac) }}
                          disabled={cloneDisabled}
                        >
                          Clone MAC
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
