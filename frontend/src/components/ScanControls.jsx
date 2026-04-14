import { startScan, stopScan } from '../api'

export default function ScanControls({ status, onAction }) {
  const scanning = status?.scanning ?? false
  const spoofing = status?.spoofing ?? false

  return (
    <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12, marginRight: 4 }}>Scan</span>
      <button
        onClick={() => onAction(startScan)}
        disabled={scanning || spoofing}
      >
        Start Scan
      </button>
      <button
        onClick={() => onAction(stopScan)}
        disabled={!scanning}
      >
        Stop Scan
      </button>
    </div>
  )
}
