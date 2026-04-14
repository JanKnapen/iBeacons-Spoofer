import { startScan, stopScan } from '../api'

export default function ScanControls({ status, onAction }) {
  const scanning = status?.scanning ?? false
  const spoofing = status?.spoofing ?? false

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Scan</span>
        {scanning && <span className="badge badge-active">Active</span>}
      </div>
      <div className="panel-body" style={{ flexDirection: 'row', gap: 8 }}>
        <button
          className={scanning ? 'btn-active' : 'btn-primary'}
          onClick={() => onAction(startScan)}
          disabled={scanning || spoofing}
          style={{ flex: 1 }}
        >
          {scanning ? '⬤ Scanning' : 'Start Scan'}
        </button>
        <button
          onClick={() => onAction(stopScan)}
          disabled={!scanning}
          style={{ flex: 1 }}
        >
          Stop
        </button>
      </div>
    </div>
  )
}
