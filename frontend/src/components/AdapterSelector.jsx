import { useState, useEffect } from 'react'
import { getAdapters, setAdapter } from '../api'

export default function AdapterSelector({ status, onAction, onError, children }) {
  const [adapters, setAdapters] = useState([])

  useEffect(() => {
    getAdapters()
      .then(setAdapters)
      .catch(e => onError(e?.response?.data?.error || e.message))
  }, [onError])

  const disabled = !status || status.scanning || status.spoofing

  const handleChange = (e) => {
    const adapter = e.target.value
    onAction(() => setAdapter(adapter))
  }

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
            onChange={handleChange}
            disabled={disabled}
            style={{ flex: 1 }}
          >
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
