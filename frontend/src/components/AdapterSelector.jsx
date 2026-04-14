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
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label htmlFor="adapter-select">Adapter</label>
        <select
          id="adapter-select"
          value={status?.adapter ?? ''}
          onChange={handleChange}
          disabled={disabled}
        >
          {adapters.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>
      {children}
    </div>
  )
}
