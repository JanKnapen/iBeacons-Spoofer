# MAC Address Spoofing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent MAC address spoofing to the BLE adapter — clone from scanned beacons, enter custom, or generate random.

**Architecture:** New `get_original_mac()` helper and `set_random_address()` method on Spoofer. Three new API endpoints (GET/PUT/DELETE `/api/mac`). Spoofer.start() takes an optional `spoofed_mac` to switch own-address-type in advertising params. New `MacControls` React component below adapter selector, plus a Clone button per beacon row.

**Tech Stack:** Python/Flask, hcitool HCI commands, React, Axios

---

### Task 1: Backend — MAC helper and Spoofer changes

**Files:**
- Modify: `backend/spoofer.py`
- Modify: `backend/tests/test_spoofer.py`

- [ ] **Step 1: Write failing tests for `get_original_mac` and `set_random_address`**

Add to `backend/tests/test_spoofer.py`:

```python
from unittest.mock import patch, MagicMock
from spoofer import build_payload, Spoofer, get_original_mac


def test_get_original_mac_parses_hciconfig():
    fake_output = (
        "hci0:\tType: Primary  Bus: USB\n"
        "\tBD Address: AA:BB:CC:DD:EE:FF  ACL MTU: 1021:8  SCO MTU: 64:1\n"
    )
    with patch("spoofer.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout=fake_output, returncode=0)
        result = get_original_mac("hci0")
    assert result == "AA:BB:CC:DD:EE:FF"
    mock_run.assert_called_once_with(
        ["sudo", "hciconfig", "hci0"], capture_output=True, text=True
    )


def test_get_original_mac_returns_none_on_failure():
    with patch("spoofer.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="", returncode=1)
        result = get_original_mac("hci0")
    assert result is None


def test_set_random_address_sends_hci_command():
    spoofer = Spoofer()
    with patch.object(spoofer, "_run") as mock_run:
        spoofer.set_random_address("hci0", "AA:BB:CC:DD:EE:FF")
    mock_run.assert_called_once_with([
        "sudo", "hcitool", "-i", "hci0", "cmd",
        "0x08", "0x0005", "ff", "ee", "dd", "cc", "bb", "aa"
    ])


def test_start_with_spoofed_mac_uses_random_address_type():
    spoofer = Spoofer()
    calls = []
    with patch.object(spoofer, "_run", side_effect=lambda cmd: calls.append(cmd)):
        spoofer.start("hci0", "12345678-1234-1234-1234-123456789ABC", 1, 2, -59,
                       spoofed_mac="AA:BB:CC:DD:EE:FF")
    # First call: set random address
    assert calls[0] == [
        "sudo", "hcitool", "-i", "hci0", "cmd",
        "0x08", "0x0005", "ff", "ee", "dd", "cc", "bb", "aa"
    ]
    # Second call: advertising params with own_address_type = 01
    assert calls[1][7:] == [
        "a0", "00", "a0", "00", "03",
        "01", "00", "00", "00", "00", "00", "00", "00", "07", "00"
    ]


def test_start_without_spoofed_mac_uses_public_address_type():
    spoofer = Spoofer()
    calls = []
    with patch.object(spoofer, "_run", side_effect=lambda cmd: calls.append(cmd)):
        spoofer.start("hci0", "12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    # First call: advertising params with own_address_type = 00
    assert calls[0][7:] == [
        "a0", "00", "a0", "00", "03",
        "00", "00", "00", "00", "00", "00", "00", "00", "07", "00"
    ]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_spoofer.py -v`
Expected: FAIL — `get_original_mac` not defined, `set_random_address` not defined, `start()` doesn't accept `spoofed_mac`

- [ ] **Step 3: Implement `get_original_mac`, `set_random_address`, and update `start()`**

Replace the full contents of `backend/spoofer.py` with:

```python
import re
import subprocess


def get_original_mac(adapter: str) -> str | None:
    """Read the BD Address from hciconfig output."""
    result = subprocess.run(
        ["sudo", "hciconfig", adapter], capture_output=True, text=True
    )
    match = re.search(r"BD Address:\s+([0-9A-Fa-f:]{17})", result.stdout)
    return match.group(1) if match else None


def build_payload(uuid: str, major: int, minor: int, tx_power: int) -> str:
    """Return space-separated lowercase hex bytes for HCI advertising payload."""
    prefix = bytes.fromhex("0201061AFF4C000215")
    uuid_b = bytes.fromhex(uuid.replace("-", ""))
    major_b = major.to_bytes(2, "big")
    minor_b = minor.to_bytes(2, "big")
    tx_b = tx_power.to_bytes(1, "big", signed=True)
    payload = prefix + uuid_b + major_b + minor_b + tx_b
    return " ".join(f"{b:02x}" for b in payload)


class Spoofer:
    def set_random_address(self, adapter: str, mac: str):
        """Set the BLE random address via HCI command 0x08 0x0005."""
        octets = mac.split(":")
        reversed_bytes = [b.lower() for b in reversed(octets)]
        self._run(["sudo", "hcitool", "-i", adapter, "cmd",
                   "0x08", "0x0005"] + reversed_bytes)

    def start(self, adapter: str, uuid: str, major: int, minor: int,
              tx_power: int, spoofed_mac: str | None = None):
        hex_bytes = build_payload(uuid, major, minor, tx_power)
        payload_parts = hex_bytes.split()
        length = f"{len(payload_parts):02x}"

        own_addr_type = "00"
        if spoofed_mac:
            self.set_random_address(adapter, spoofed_mac)
            own_addr_type = "01"

        # Set advertising parameters: 100ms interval, non-connectable, all channels
        self._run(["sudo", "hcitool", "-i", adapter, "cmd",
                   "0x08", "0x0006",
                   "a0", "00", "a0", "00", "03",
                   own_addr_type, "00", "00", "00", "00", "00", "00", "00", "07", "00"])
        # Set advertising data (length prefix + payload)
        self._run(["sudo", "hcitool", "-i", adapter, "cmd",
                   "0x08", "0x0008", length] + payload_parts)
        # Enable advertising
        self._run(["sudo", "hcitool", "-i", adapter, "cmd",
                   "0x08", "0x000a", "01"])

    def stop(self, adapter: str):
        self._run(["sudo", "hcitool", "-i", adapter, "cmd", "0x08", "0x000a", "00"])

    def _run(self, cmd: list):
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(
                f"Command {cmd} failed (rc={result.returncode}): "
                f"{result.stderr.decode(errors='replace').strip()}"
            )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_spoofer.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/spoofer.py backend/tests/test_spoofer.py
git commit -m "feat: add MAC spoofing support to Spoofer (get_original_mac, set_random_address, own_addr_type)"
```

---

### Task 2: Backend — API endpoints for MAC management

**Files:**
- Modify: `backend/app.py`
- Modify: `backend/tests/test_app.py`

- [ ] **Step 1: Write failing tests for GET/PUT/DELETE `/api/mac`**

Add to `backend/tests/test_app.py`:

```python
def test_get_mac_returns_original_and_spoofed(client):
    state["original_mac"] = "AA:BB:CC:DD:EE:FF"
    state["spoofed_mac"] = None
    res = client.get("/api/mac")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["original_mac"] == "AA:BB:CC:DD:EE:FF"
    assert data["spoofed_mac"] is None


def test_get_mac_reads_original_on_first_call(client):
    state["original_mac"] = None
    with patch("app.get_original_mac", return_value="11:22:33:44:55:66") as mock:
        res = client.get("/api/mac")
    mock.assert_called_once_with("hci0")
    data = json.loads(res.data)
    assert data["original_mac"] == "11:22:33:44:55:66"
    assert state["original_mac"] == "11:22:33:44:55:66"


def test_put_mac_sets_spoofed_mac(client):
    with patch("app._spoofer.set_random_address"):
        res = client.put("/api/mac", json={"mac": "AA:BB:CC:DD:EE:FF"})
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["spoofed_mac"] == "AA:BB:CC:DD:EE:FF"
    assert state["spoofed_mac"] == "AA:BB:CC:DD:EE:FF"


def test_put_mac_rejected_while_scanning(client):
    state["scanning"] = True
    res = client.put("/api/mac", json={"mac": "AA:BB:CC:DD:EE:FF"})
    assert res.status_code == 409


def test_put_mac_rejected_while_spoofing(client):
    state["spoofing"] = True
    res = client.put("/api/mac", json={"mac": "AA:BB:CC:DD:EE:FF"})
    assert res.status_code == 409


def test_put_mac_rejects_invalid_format(client):
    res = client.put("/api/mac", json={"mac": "not-a-mac"})
    assert res.status_code == 400


def test_put_mac_rejects_missing_field(client):
    res = client.put("/api/mac", json={})
    assert res.status_code == 400


def test_delete_mac_clears_spoofed(client):
    state["spoofed_mac"] = "AA:BB:CC:DD:EE:FF"
    res = client.delete("/api/mac")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["spoofed_mac"] is None
    assert state["spoofed_mac"] is None


def test_delete_mac_rejected_while_scanning(client):
    state["scanning"] = True
    state["spoofed_mac"] = "AA:BB:CC:DD:EE:FF"
    res = client.delete("/api/mac")
    assert res.status_code == 409


def test_delete_mac_rejected_while_spoofing(client):
    state["spoofing"] = True
    state["spoofed_mac"] = "AA:BB:CC:DD:EE:FF"
    res = client.delete("/api/mac")
    assert res.status_code == 409


def test_spoof_start_passes_spoofed_mac(client):
    state["spoofed_mac"] = "AA:BB:CC:DD:EE:FF"
    with patch("app._spoofer.start") as mock_start:
        res = client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    assert res.status_code == 200
    mock_start.assert_called_once_with(
        "hci0", "12345678-1234-1234-1234-123456789ABC", 1, 2, -59,
        spoofed_mac="AA:BB:CC:DD:EE:FF"
    )


def test_spoof_start_passes_none_when_no_spoofed_mac(client):
    state["spoofed_mac"] = None
    with patch("app._spoofer.start") as mock_start:
        res = client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    assert res.status_code == 200
    mock_start.assert_called_once_with(
        "hci0", "12345678-1234-1234-1234-123456789ABC", 1, 2, -59,
        spoofed_mac=None
    )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_app.py -v`
Expected: FAIL — `original_mac`/`spoofed_mac` not in state, endpoints not defined, `get_original_mac` not imported

- [ ] **Step 3: Update `reset_state` fixture**

In `backend/tests/test_app.py`, update the `reset_state` fixture to include the new state fields:

```python
@pytest.fixture(autouse=True)
def reset_state():
    state.update({
        "adapter": "hci0", "scanning": False, "spoofing": False,
        "spoof_target": None, "original_mac": None, "spoofed_mac": None,
    })
    yield
```

- [ ] **Step 4: Implement MAC endpoints in `app.py`**

In `backend/app.py`, add the import at the top:

```python
from spoofer import Spoofer, get_original_mac
```

Update the `state` dict:

```python
state = {
    "adapter": "hci0",
    "scanning": False,
    "spoofing": False,
    "spoof_target": None,
    "original_mac": None,
    "spoofed_mac": None,
}
```

Add the MAC validation helper and three endpoints after the adapter endpoints, before the scan section:

```python
_MAC_RE = re.compile(r"^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")


# ── MAC endpoints ──────────────────────────────────────────────────────────

@app.get("/api/mac")
def get_mac():
    if state["original_mac"] is None:
        state["original_mac"] = get_original_mac(state["adapter"])
    return jsonify({
        "original_mac": state["original_mac"],
        "spoofed_mac": state["spoofed_mac"],
    })


@app.put("/api/mac")
def put_mac():
    if state["scanning"] or state["spoofing"]:
        return jsonify({"error": "Cannot change MAC while scanning or spoofing"}), 409
    body = request.json or {}
    mac = body.get("mac")
    if not mac:
        return jsonify({"error": "mac field is required"}), 400
    if not _MAC_RE.match(mac):
        return jsonify({"error": "Invalid MAC format. Use XX:XX:XX:XX:XX:XX"}), 400
    try:
        _spoofer.set_random_address(state["adapter"], mac)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    state["spoofed_mac"] = mac.upper()
    return jsonify({
        "original_mac": state["original_mac"],
        "spoofed_mac": state["spoofed_mac"],
    })


@app.delete("/api/mac")
def delete_mac():
    if state["scanning"] or state["spoofing"]:
        return jsonify({"error": "Cannot reset MAC while scanning or spoofing"}), 409
    state["spoofed_mac"] = None
    return jsonify({
        "original_mac": state["original_mac"],
        "spoofed_mac": state["spoofed_mac"],
    })
```

Update the `spoof_start` endpoint to pass `spoofed_mac`:

```python
_spoofer.start(state["adapter"], uuid, int(major), int(minor), int(tx_power),
               spoofed_mac=state["spoofed_mac"])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All PASS (both test_app.py and test_spoofer.py)

- [ ] **Step 6: Commit**

```bash
git add backend/app.py backend/tests/test_app.py
git commit -m "feat: add GET/PUT/DELETE /api/mac endpoints for MAC spoofing"
```

---

### Task 3: Frontend — API functions and MacControls component

**Files:**
- Modify: `frontend/src/api.js`
- Create: `frontend/src/components/MacControls.jsx`

- [ ] **Step 1: Add MAC API functions**

Add to `frontend/src/api.js`:

```javascript
export const getMac    = ()          => axios.get('/api/mac').then(r => r.data)
export const setMac    = (mac)       => axios.put('/api/mac', { mac }).then(r => r.data)
export const resetMac  = ()          => axios.delete('/api/mac').then(r => r.data)
```

- [ ] **Step 2: Create MacControls component**

Create `frontend/src/components/MacControls.jsx`:

```jsx
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
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js frontend/src/components/MacControls.jsx
git commit -m "feat: add MacControls component and MAC API functions"
```

---

### Task 4: Frontend — Wire up MacControls and Clone button

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/AdapterSelector.jsx`
- Modify: `frontend/src/components/BeaconList.jsx`

- [ ] **Step 1: Add MAC state and polling to App.jsx**

In `frontend/src/App.jsx`, add the `getMac` import:

```javascript
import { getStatus, getBeacons, getMac } from './api'
```

Add the `MacControls` import:

```javascript
import MacControls from './components/MacControls'
```

Add MAC state inside `App()`:

```javascript
const [macInfo, setMacInfo] = useState(null)
```

Add a `refreshMac` callback after `refreshBeacons`:

```javascript
const refreshMac = useCallback(async () => {
  try {
    setMacInfo(await getMac())
  } catch (e) {
    setError(e?.response?.data?.error || e.message)
  }
}, [])
```

Call `refreshMac` in the initial useEffect alongside `refreshStatus`:

```javascript
useEffect(() => { refreshStatus(); refreshMac() }, [refreshStatus, refreshMac])
```

Update `handleAction` to also refresh MAC after actions:

```javascript
const handleAction = useCallback(async (fn) => {
  setError(null)
  try {
    const s = await fn()
    if (s) setStatus(s)
  } catch (e) {
    setError(e?.response?.data?.error || e.message)
  }
  await refreshStatus()
  await refreshBeacons()
  await refreshMac()
}, [refreshStatus, refreshBeacons, refreshMac])
```

- [ ] **Step 2: Add MacControls to AdapterSelector panel**

Update `frontend/src/components/AdapterSelector.jsx` to accept and render `MacControls` as a child:

```jsx
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
```

In `App.jsx`, render `MacControls` inside `AdapterSelector`:

```jsx
<AdapterSelector
  status={status}
  onAction={handleAction}
  onError={setError}
>
  <MacControls
    macInfo={macInfo}
    status={status}
    onAction={handleAction}
  />
</AdapterSelector>
```

- [ ] **Step 3: Add Clone button to BeaconList rows**

Update `frontend/src/components/BeaconList.jsx` to accept an `onCloneMac` prop and add a Clone button column:

```jsx
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
```

In `App.jsx`, add `setMac` import and the clone handler:

```javascript
import { getStatus, getBeacons, getMac, setMac } from './api'
```

Add the handler inside `App()`:

```javascript
const handleCloneMac = useCallback((mac) => {
  handleAction(() => setMac(mac))
}, [handleAction])
```

Update the `BeaconList` JSX:

```jsx
<BeaconList
  beacons={beacons}
  selectedBeacon={selectedBeacon}
  onSelect={handleSelectBeacon}
  onCloneMac={handleCloneMac}
  cloneDisabled={!status || status.scanning || status.spoofing}
/>
```

- [ ] **Step 4: Run the dev servers and verify in browser**

Run backend: `cd backend && python app.py`
Run frontend: `cd frontend && npm run dev`

Verify:
1. MAC address shows below adapter dropdown with "Original" label
2. Typing a custom MAC and clicking "Set" updates the displayed MAC and shows "Spoofed" badge
3. "Random" button generates and sets a random MAC
4. "Reset" button clears back to original
5. "Clone MAC" button on beacon rows sets that beacon's MAC
6. All MAC controls are disabled during scanning/spoofing
7. Existing scan and spoof features still work

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/AdapterSelector.jsx frontend/src/components/BeaconList.jsx
git commit -m "feat: wire up MacControls in UI with clone button on beacon rows"
```

---

### Task 5: Backend — update sudoers docs

**Files:**
- Modify: `README.md` (if sudoers section exists)

- [ ] **Step 1: Check if README mentions sudoers and update if needed**

The `set_random_address` uses `hcitool` which is already in the sudoers list. No additional sudoers entries are needed. Verify by reading the README and confirming `hcitool` is listed.

- [ ] **Step 2: Run full test suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: All PASS

- [ ] **Step 3: Final commit if any changes**

Only commit if README was updated.
