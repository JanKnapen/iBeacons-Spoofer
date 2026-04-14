import { useState, useEffect, useRef } from 'react'
import { getAdapters, setAdapter, stopScan, stopSpoof } from '../api'

const ADAPTER_POLL_MS = 3000

export default function AdapterSelector({ status, onAction, onError, children }) {
  const [adapters, setAdapters] = useState([])
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

  // Auto-switch if the active adapter disappeared from the list
  useEffect(() => {
    if (adapters.length === 0) return
    if (!status?.adapter) return
    if (adapters.includes(status.adapter)) return

    const switchToFirst = async () => {
      if (status.scanning) await stopScan().catch(() => {})
      if (status.spoofing) await stopSpoof().catch(() => {})
      onAction(() => setAdapter(adapters[0]))
    }
    switchToFirst()
  }, [adapters, status?.adapter, status?.scanning, status?.spoofing, onAction])

  const disabled = !status || status.scanning || status.spoofing

  return (
    <>
      {/* Section header — mirrors "DEVICES" bar from screenshot */}
      <div className="sec-hdr">
        <span className="sec-icon">◎</span>
        <span className="sec-title">Interface</span>
      </div>

      <div className="sb-block">
        <div className="form-row" style={{ marginBottom: 10 }}>
          <span className="form-label" style={{ minWidth: 54 }}>Adapter</span>
          <select
            value={status?.adapter ?? ''}
            onChange={e => onAction(() => setAdapter(e.target.value))}
            disabled={disabled}
            style={{ flex: 1 }}
          >
            {/* Phantom entry keeps the controlled value valid while auto-switch is in flight */}
            {status?.adapter && !adapters.includes(status.adapter) && (
              <option value={status.adapter} disabled>
                {status.adapter} (unavailable)
              </option>
            )}
            {adapters.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {children}
      </div>
    </>
  )
}
