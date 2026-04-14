# iBeacon Spoofer — Design Spec
_Date: 2026-04-14_

## Overview

A local-only, single-user web application for scanning nearby iBeacons and spoofing (re-broadcasting) them on Linux. No internet access or authentication required. The user selects a Bluetooth adapter, scans for beacons, then either selects a scanned beacon or enters one manually to broadcast.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend | Flask (Python) |
| Database | SQLite via SQLAlchemy |
| Bluetooth | Direct `subprocess` calls to `hcitool` / `hcidump` / `hciconfig` |

System packages required: `bluez`, `bluez-hcidump`

---

## File Structure

```
my-app/
├── backend/
│   ├── app.py            # Flask app, API routes, global state
│   ├── database.py       # SQLAlchemy models + SQLite setup
│   ├── scanner.py        # hcidump reader + iBeacon packet parser
│   ├── spoofer.py        # HCI payload builder + broadcaster
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx                   # Root: status bar, layout, global state
    │   ├── components/
    │   │   ├── AdapterSelector.jsx   # HCI adapter dropdown
    │   │   ├── BeaconList.jsx        # Scanned beacon table
    │   │   ├── ScanControls.jsx      # Start/Stop scan buttons
    │   │   └── SpoofControls.jsx     # Row-select + manual entry + Start/Stop spoof
    │   └── api.js                    # All Axios calls to Flask
    └── package.json
```

---

## Backend API

### Global State (`app.py`)

```python
state = {
    "adapter": "hci0",       # currently selected HCI adapter
    "scanning": False,
    "spoofing": False,
    "spoof_target": None,    # {"uuid", "major", "minor"} shown in status bar
}
```

State is in-process (not persisted to DB). The beacon database itself persists across restarts.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/adapters` | List available HCI adapters (parsed from `hciconfig` output) |
| `PUT` | `/api/adapter` | Set `state["adapter"]`; rejected with 409 if scanning or spoofing |
| `GET` | `/api/status` | Return full `state` dict |
| `POST` | `/api/scan/start` | Start `lescan` + `hcidump` reader on selected adapter |
| `POST` | `/api/scan/stop` | Kill processes, stop reader thread |
| `GET` | `/api/beacons` | Return all rows from `beacons` table |
| `POST` | `/api/spoof/start` | Body: `{uuid, major, minor, tx_power}`; auto-stops scan first |
| `POST` | `/api/spoof/stop` | Disable BLE advertising |

**Error responses:** subprocess failures return `{"error": "<message>"}` with HTTP 500. The frontend displays these as a dismissable error banner.

---

## Database Schema

Table: `beacons` (SQLite, persists across restarts)

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key, autoincrement |
| `uuid` | TEXT | Not null |
| `major` | INTEGER | Not null |
| `minor` | INTEGER | Not null |
| `mac` | TEXT | |
| `tx_power` | INTEGER | |
| `rssi` | INTEGER | |
| `distance` | TEXT | e.g. `~3.2m`, `>100m` |
| `last_seen` | TEXT | ISO 8601 UTC |

Unique constraint: `(uuid, major, minor, mac)`. Upsert on conflict updates `rssi`, `distance`, `last_seen`.

---

## Scanner (`scanner.py`)

Manages two subprocesses and one reader thread.

### Startup sequence

1. `sudo hciconfig <adapter> up` — blocking, one-shot
2. `sudo hcitool -i <adapter> lescan --passive --duplicates` — kept alive, PID stored
3. `sudo hcidump -i <adapter> -R` — stdout read line-by-line in a `threading.Thread`

### Packet reconstruction

- Lines beginning with `>` start a new packet; previous packet is processed
- Continuation lines are appended
- All whitespace stripped, uppercased before processing

### `process_packet(hex_str: str) -> dict | None`

```python
IBEACON_SIGNATURE = "FF4C000215"

def process_packet(hex_str: str) -> dict | None:
    if IBEACON_SIGNATURE not in hex_str:
        return None

    after = hex_str.split(IBEACON_SIGNATURE, 1)[1]
    if len(after) < 42:
        return None

    raw = after[0:32]
    uuid = f"{raw[0:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:32]}".upper()

    major = int(after[32:36], 16)
    minor = int(after[36:40], 16)

    tx = int(after[40:42], 16)
    if tx > 127:
        tx -= 256

    mac = "??:??:??:??:??:??"
    if len(hex_str) >= 26:
        b = [hex_str[14+i*2:16+i*2] for i in range(6)]
        mac = ":".join(reversed(b)).upper()

    rssi = int(hex_str[-2:], 16)
    if rssi > 127:
        rssi -= 256

    dist_str = "?m"
    if tx != 0:
        import math
        d = 10 ** ((tx - rssi) / 20.0)
        dist_str = f"~{d:.1f}m" if d < 10 else f"~{d:.0f}m" if d < 100 else ">100m"

    return {
        "uuid": uuid, "major": major, "minor": minor,
        "tx_power": tx, "rssi": rssi, "mac": mac,
        "distance": dist_str,
        "last_seen": datetime.utcnow().isoformat()
    }
```

### Teardown

A `threading.Event` signals the reader thread to exit. `stop()` sets the event, kills both subprocesses, and joins the thread.

---

## Spoofer (`spoofer.py`)

### Payload construction

```python
prefix    = bytes.fromhex("0201061AFF004C000215")
uuid_b    = bytes.fromhex(uuid.replace("-", ""))   # 16 bytes
major_b   = major.to_bytes(2, "big")
minor_b   = minor.to_bytes(2, "big")
tx_b      = tx_power.to_bytes(1, signed=True, byteorder="big")
payload   = prefix + uuid_b + major_b + minor_b + tx_b
hex_bytes = " ".join(f"{b:02x}" for b in payload)
```

### Start sequence (subprocess calls, each checked for non-zero return)

1. `sudo hciconfig <adapter> leadv 3`
2. `sudo hcitool -i <adapter> cmd 0x08 0x0008 <hex_bytes>`
3. `sudo hciconfig <adapter> up`

### Stop sequence

1. `sudo hciconfig <adapter> noscan`
2. `sudo hcitool -i <adapter> cmd 0x08 0x000A 00`

Any non-zero return code raises an exception; the API route catches it and returns `{"error": "..."}` with HTTP 500.

---

## Frontend

### Component hierarchy

```
App.jsx
├── StatusBar          # inline in App — "Idle" | "Scanning..." | "Spoofing [UUID::Major::Minor]"
├── ErrorBanner        # inline in App — dismissable, shown on API error
├── AdapterSelector.jsx
├── ScanControls.jsx
├── BeaconList.jsx
└── SpoofControls.jsx
```

### State (all in `App.jsx`, passed as props)

- `status` — from `GET /api/status`; polled after every user action
- `beacons` — from `GET /api/beacons`; polled every 3s while `status.scanning === true`
- `selectedBeacon` — set by clicking a row in BeaconList; cleared on scan start
- `error` — string or null; set on API errors, cleared on dismiss or next successful action

### Interaction rules

| Condition | Disabled controls |
|---|---|
| Spoofing active | Start Scan, adapter selector |
| Scanning active | Start Spoof, adapter selector |
| No beacon selected AND manual UUID empty | Start Spoof |
| Scanning active | Start Spoof (regardless of selection) |

"Start Spoof" calls `/api/spoof/start` — the backend stops scanning automatically before advertising. No separate client-side stop-scan call needed.

### SpoofControls detail

Two sub-sections, always both visible:
1. **Selected beacon** — shows selected row summary (or "No beacon selected"); `Start Spoof` uses this if a row is selected
2. **Manual entry** — fields: UUID (text), Major (number), Minor (number), TX Power (number, default `-59`); `Start Spoof` uses these values if no row is selected and UUID field is non-empty

### Theme

CSS variables in `index.css`:
```css
--bg: #111;
--surface: #1e1e1e;
--accent: #4fc3f7;
--text: #e0e0e0;
--text-muted: #888;
--error: #ef5350;
--selected: #1a3a4a;
```

---

## Build Order

1. Scaffold folder structure, install deps (pip + npm)
2. `database.py` — SQLAlchemy model + SQLite init
3. `scanner.py` — subprocess management + `process_packet()`
4. `app.py` — `/api/scan/start`, `/api/scan/stop`, `/api/beacons`, `/api/adapters`, `/api/adapter`, `/api/status`
5. React skeleton — all four components wired to `api.js`
6. End-to-end: scan → parse → store → display
7. `spoofer.py` — payload builder + subprocess calls
8. `/api/spoof/start`, `/api/spoof/stop` routes
9. Wire `SpoofControls.jsx` (selection + manual entry)

---

## Sudoers & Setup

### Required sudoers entries (add via `visudo`)

```
<username> ALL=(ALL) NOPASSWD: /usr/bin/hciconfig
<username> ALL=(ALL) NOPASSWD: /usr/bin/hcitool
<username> ALL=(ALL) NOPASSWD: /usr/sbin/hcidump
```

### System packages

```bash
sudo apt install bluez bluez-hcidump
```

### Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
