import { useState } from 'react'

function SignalBars({ rssi }) {
  if (rssi == null) return <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>—</span>
  const val = Number(rssi)
  const strength = val >= -50 ? 5 : val >= -60 ? 4 : val >= -70 ? 3 : val >= -80 ? 2 : val >= -90 ? 1 : 0
  return (
    <div className="signal-bars" title={`${rssi} dBm`}>
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`signal-bar${i <= strength ? ` lvl-${strength}` : ''}`}
          style={{ height: `${i * 3 + 4}px` }}
        />
      ))}
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
    <div className="panel" style={{ padding: 0 }}>
      <div className="panel-header">
        <span className="panel-title">Discovered Beacons</span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: beacons.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
        }}>
          {beacons.length}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="beacon-table">
          <thead>
            <tr>
              <th className="col-narrow">Sig</th>
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
                <td colSpan={9} style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-ui)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  borderBottom: 'none',
                }}>
                  No signals detected — start scanning to discover nearby iBeacons
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
                    style={{ animationDelay: `${idx * 25}ms` }}
                  >
                    <td className="col-narrow">
                      <SignalBars rssi={b.rssi} />
                    </td>
                    <td className="col-narrow" style={{ color: 'var(--accent)' }}>{b.mac ?? '—'}</td>
                    <td className="col-uuid" style={{ color: 'var(--text-bright)' }}>
                      {b.uuid ?? '—'}
                    </td>
                    <td className="col-narrow">{b.major ?? '—'}</td>
                    <td className="col-narrow">{b.minor ?? '—'}</td>
                    <td className="col-narrow" style={{ color: 'var(--text-muted)' }}>{b.tx_power ?? '—'}</td>
                    <td className="col-narrow" style={{ color: 'var(--text-muted)' }}>{b.distance ?? '—'}</td>
                    <td className="col-narrow" style={{ color: 'var(--text-muted)', fontSize: 10 }}>{formatLastSeen(b.last_seen)}</td>
                    <td className="col-narrow">
                      {b.mac && (
                        <button
                          className="btn-sm"
                          onClick={(e) => { e.stopPropagation(); onCloneMac(b.mac) }}
                          disabled={cloneDisabled}
                        >
                          Clone
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
