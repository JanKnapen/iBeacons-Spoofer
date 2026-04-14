import { useState, useEffect, useRef } from 'react'
import { getAdapters, setAdapter, stopScan, stopSpoof } from '../api'

const ADAPTER_POLL_MS = 3000

export default function AdapterSelector({ status, onAction, onError, children }) {
  const [adapters, setAdapters] = useState([])
  // Track the previous adapter list so we can detect removals
  const prevAdaptersRef = useRef([])

  // Poll adapter list every 3 s to catch hot-plug events
  useEffect(() => {
    const fetchAdapters = () =>
      getAdapters()
        .then(list => {
          prevAdaptersRef.current = adapters
          setAdapters(list)
        })
        .catch(e => onError(e?.response?.data?.error || e.message))

    fetchAdapters()
    const id = setInterval(fetchAdapters, ADAPTER_POLL_MS)
    return () => clearInterval(id)
  }, [onError]) // eslint-disable-line react-hooks/exhaustive-deps
  // ↑ intentionally omitting `adapters` — we only need the interval to restart
  //   when onError changes (never in practice). Reading stale adapters here is fine
  //   because prevAdaptersRef is always current.

  // React to adapter list changes: if the active adapter disappeared, stop any
  // active operation then switch to the first available adapter.
  useEffect(() => {
    if (adapters.length === 0) return
    if (!status?.adapter) return
    if (adapters.includes(status.adapter)) return

    // Active adapter is gone
    const switchToFirst = async () => {
      // Stop scan/spoof cleanly before switching so the backend cleans up the
      // dead subprocess rather than leaving it in an inconsistent state.
      if (status.scanning) await stopScan().catch(() => {})
      if (status.spoofing) await stopSpoof().catch(() => {})
      onAction(() => setAdapter(adapters[0]))
    }
    switchToFirst()
  }, [adapters, status?.adapter, status?.scanning, status?.spoofing, onAction])

  const disabled = !status || status.scanning || status.spoofing

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Interface</span>
      </div>
      <div className="panel-body">
        <div className="form-row">
          <span className="form-label" style={{ minWidth: 52 }}>Adapter</span>
          <select
            id="adapter-select"
            value={status?.adapter ?? ''}
            onChange={e => onAction(() => setAdapter(e.target.value))}
            disabled={disabled}
            style={{ flex: 1 }}
          >
            {/* Phantom entry keeps the controlled value valid while the
                auto-switch request is in flight */}
            {status?.adapter && !adapters.includes(status.adapter) && (
              <option value={status.adapter} disabled>
                {status.adapter} (unavailable)
              </option>
            )}
            {adapters.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {children}
      </div>
    </div>
  )
}
