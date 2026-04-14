import { useState } from 'react'

export default function BeaconList({ beacons, selectedBeacon, onSelect, onCloneMac, cloneDisabled }) {
  const [hoveredId, setHoveredId] = useState(null)

  function rowBg(b) {
    if (selectedBeacon?.id === b.id) return 'var(--selected)'
    if (hoveredId === b.id) return 'var(--surface2)'
    return 'transparent'
  }

  return (
    <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: 12,
      }}>
        Beacons ({beacons.length})
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              {['MAC', 'UUID', 'Major', 'Minor', 'RSSI', 'TX Power', 'Distance', 'Last Seen', ''].map(h => (
                <th key={h} style={{
                  padding: '6px 10px', textAlign: 'left',
                  color: 'var(--text-muted)', fontWeight: 500,
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {beacons.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: '16px 10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No beacons found. Start scanning to discover nearby iBeacons.
                </td>
              </tr>
            ) : (
              beacons.map(b => (
                <tr
                  key={b.id}
                  onClick={() => onSelect(b)}
                  onMouseEnter={() => setHoveredId(b.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    background: rowBg(b),
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {[b.mac, b.uuid, b.major, b.minor, b.rssi, b.tx_power, b.distance,
                    b.last_seen ? b.last_seen.replace('T', ' ').slice(0, 19) : '—'
                  ].map((val, i) => (
                    <td key={i} style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      {val ?? '—'}
                    </td>
                  ))}
                  <td style={{ padding: '5px 10px' }}>
                    {b.mac && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCloneMac(b.mac) }}
                        disabled={cloneDisabled}
                        style={{ padding: '2px 8px', fontSize: 11 }}
                      >
                        Clone MAC
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
