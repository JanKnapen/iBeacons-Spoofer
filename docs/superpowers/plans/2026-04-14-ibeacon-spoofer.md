# iBeacon Spoofer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Flask + React web app that scans for nearby iBeacons via hcidump, displays them in a table, and re-broadcasts any selected (or manually entered) beacon using hcitool/hciconfig.

**Architecture:** A standalone Flask backend owns a global state dict (adapter, scanning, spoofing) and exposes a REST API; a React/Vite frontend polls status and beacons and renders three control panels. SQLAlchemy with SQLite (no Flask-SQLAlchemy) is used directly so the scanner's background thread can upsert without Flask app-context overhead.

**Tech Stack:** Python 3.10+, Flask, Flask-CORS, SQLAlchemy, pytest; React 18, Vite, Axios; bluez + bluez-hcidump system packages.

---

## File Map

```
backend/
  requirements.txt
  database.py          # engine, Beacon model, init_db(), upsert_beacon(), get_all_beacons()
  scanner.py           # process_packet(), Scanner class (subprocess + reader thread)
  spoofer.py           # build_payload(), Spoofer class (subprocess calls)
  app.py               # Flask routes, global state dict
  tests/
    __init__.py
    test_database.py
    test_scanner.py
    test_spoofer.py
    test_app.py

frontend/
  package.json
  vite.config.js
  index.html
  src/
    main.jsx
    index.css
    App.jsx
    api.js
    components/
      AdapterSelector.jsx
      ScanControls.jsx
      BeaconList.jsx
      SpoofControls.jsx

README.md
```

---

## Task 1: Scaffold project and install dependencies

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/tests/__init__.py`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`

- [ ] **Step 1: Create backend directory and requirements.txt**

```
flask
flask-cors
sqlalchemy
pytest
```

Save as `backend/requirements.txt`.

- [ ] **Step 2: Install Python dependencies**

Run from project root:
```bash
cd backend && pip install -r requirements.txt
```
Expected: packages install without errors.

- [ ] **Step 3: Create tests package**

Create empty `backend/tests/__init__.py`.

- [ ] **Step 4: Scaffold Vite + React frontend**

Run from project root:
```bash
cd frontend && npm create vite@latest . -- --template react && npm install && npm install axios
```
Expected: `node_modules/` created, `src/App.jsx` and `src/main.jsx` exist.

- [ ] **Step 5: Configure Vite proxy**

Replace the generated `frontend/vite.config.js` with:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000'
    }
  }
})
```

- [ ] **Step 6: Commit scaffold**

```bash
git add backend/ frontend/ && git commit -m "chore: scaffold project structure"
```

---

## Task 2: database.py — Beacon model, init, upsert, query

**Files:**
- Create: `backend/database.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_database.py`:

```python
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Point at an in-memory DB for tests
os.environ["DB_URL"] = "sqlite:///:memory:"

from database import Base, Beacon, init_db, upsert_beacon, get_all_beacons


@pytest.fixture(autouse=True)
def fresh_db():
    init_db()
    yield
    # Drop all tables after each test so state doesn't bleed
    Base.metadata.drop_all(bind=__import__("database").engine)


def test_upsert_inserts_new_beacon():
    beacon = {
        "uuid": "12345678-1234-1234-1234-123456789ABC",
        "major": 1, "minor": 2, "mac": "AA:BB:CC:DD:EE:FF",
        "tx_power": -59, "rssi": -61, "distance": "~1.3m",
        "last_seen": "2026-04-14T10:00:00"
    }
    upsert_beacon(beacon)
    rows = get_all_beacons()
    assert len(rows) == 1
    assert rows[0]["uuid"] == "12345678-1234-1234-1234-123456789ABC"
    assert rows[0]["major"] == 1


def test_upsert_updates_on_conflict():
    beacon = {
        "uuid": "12345678-1234-1234-1234-123456789ABC",
        "major": 1, "minor": 2, "mac": "AA:BB:CC:DD:EE:FF",
        "tx_power": -59, "rssi": -61, "distance": "~1.3m",
        "last_seen": "2026-04-14T10:00:00"
    }
    upsert_beacon(beacon)
    beacon["rssi"] = -50
    beacon["distance"] = "~0.5m"
    beacon["last_seen"] = "2026-04-14T11:00:00"
    upsert_beacon(beacon)
    rows = get_all_beacons()
    assert len(rows) == 1
    assert rows[0]["rssi"] == -50
    assert rows[0]["distance"] == "~0.5m"


def test_two_distinct_beacons_both_stored():
    b1 = {"uuid": "A", "major": 1, "minor": 1, "mac": "AA:BB:CC:DD:EE:FF",
          "tx_power": -59, "rssi": -61, "distance": "~1m", "last_seen": "2026-04-14T10:00:00"}
    b2 = {"uuid": "B", "major": 2, "minor": 2, "mac": "11:22:33:44:55:66",
          "tx_power": -59, "rssi": -70, "distance": "~3m", "last_seen": "2026-04-14T10:00:00"}
    upsert_beacon(b1)
    upsert_beacon(b2)
    rows = get_all_beacons()
    assert len(rows) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_database.py -v
```
Expected: ImportError or ModuleNotFoundError (database.py doesn't exist yet).

- [ ] **Step 3: Implement database.py**

Create `backend/database.py`:

```python
import os
from sqlalchemy import create_engine, Column, Integer, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Session

_default_url = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'beacons.db')}"
DATABASE_URL = os.environ.get("DB_URL", _default_url)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class Base(DeclarativeBase):
    pass


class Beacon(Base):
    __tablename__ = "beacons"
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(Text, nullable=False)
    major = Column(Integer, nullable=False)
    minor = Column(Integer, nullable=False)
    mac = Column(Text)
    tx_power = Column(Integer)
    rssi = Column(Integer)
    distance = Column(Text)
    last_seen = Column(Text)
    __table_args__ = (UniqueConstraint("uuid", "major", "minor", "mac"),)


def init_db():
    Base.metadata.create_all(engine)


def upsert_beacon(beacon_dict):
    with Session(engine) as session:
        existing = session.query(Beacon).filter_by(
            uuid=beacon_dict["uuid"],
            major=beacon_dict["major"],
            minor=beacon_dict["minor"],
            mac=beacon_dict["mac"],
        ).first()
        if existing:
            existing.rssi = beacon_dict["rssi"]
            existing.distance = beacon_dict["distance"]
            existing.last_seen = beacon_dict["last_seen"]
        else:
            session.add(Beacon(**beacon_dict))
        session.commit()


def get_all_beacons():
    with Session(engine) as session:
        rows = session.query(Beacon).all()
        return [
            {
                "id": b.id, "uuid": b.uuid, "major": b.major, "minor": b.minor,
                "mac": b.mac, "tx_power": b.tx_power, "rssi": b.rssi,
                "distance": b.distance, "last_seen": b.last_seen,
            }
            for b in rows
        ]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_database.py -v
```
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/database.py backend/tests/ && git commit -m "feat: add Beacon model, upsert, and query"
```

---

## Task 3: process_packet() in scanner.py

**Files:**
- Create: `backend/scanner.py` (process_packet only — Scanner class added in Task 4)
- Create: `backend/tests/test_scanner.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_scanner.py`:

```python
import math
from scanner import process_packet

# Full iBeacon HCI packet (hcidump -R output, stripped + uppercased):
#  043E2B02010001  — HCI header
#  AABBCCDDEEFF   — MAC bytes (raw, little-endian → display reversed)
#  1A0201061AFF4C000215  — AD structure including iBeacon signature FF4C000215
#  12345678123412341234123456789ABC  — UUID (32 hex chars)
#  0001  — major = 1
#  0002  — minor = 2
#  C5    — TX power = -59 (0xC5 = 197, signed → -59)
#  C3    — RSSI = -61 (0xC3 = 195, signed → -61)
GOOD_PACKET = (
    "043E2B02010001"
    "AABBCCDDEEFF"
    "1A0201061AFF4C000215"
    "12345678123412341234123456789ABC"
    "0001"
    "0002"
    "C5"
    "C3"
)


def test_process_packet_returns_none_without_signature():
    assert process_packet("043E120200AABBCCDDEEFF06020106C3") is None


def test_process_packet_returns_none_when_too_short():
    # Signature present but not enough data after it
    assert process_packet("FF4C000215AABBCC") is None


def test_process_packet_uuid():
    result = process_packet(GOOD_PACKET)
    assert result is not None
    assert result["uuid"] == "12345678-1234-1234-1234-123456789ABC"


def test_process_packet_major_minor():
    result = process_packet(GOOD_PACKET)
    assert result["major"] == 1
    assert result["minor"] == 2


def test_process_packet_tx_power_signed():
    result = process_packet(GOOD_PACKET)
    assert result["tx_power"] == -59


def test_process_packet_rssi_signed():
    result = process_packet(GOOD_PACKET)
    assert result["rssi"] == -61


def test_process_packet_mac_reversed():
    result = process_packet(GOOD_PACKET)
    assert result["mac"] == "FF:EE:DD:CC:BB:AA"


def test_process_packet_distance():
    result = process_packet(GOOD_PACKET)
    # tx=-59, rssi=-61 → d = 10^((-59 - -61)/20) = 10^0.1 ≈ 1.26
    assert result["distance"] == "~1.3m"


def test_process_packet_zero_tx_gives_unknown_distance():
    # Build a packet with TX = 0x00 (0 decimal, not > 127, so tx stays 0)
    packet = (
        "043E2B02010001"
        "AABBCCDDEEFF"
        "1A0201061AFF4C000215"
        "12345678123412341234123456789ABC"
        "0001"
        "0002"
        "00"   # TX = 0
        "C3"
    )
    result = process_packet(packet)
    assert result["distance"] == "?m"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_scanner.py -v
```
Expected: ImportError (scanner.py doesn't exist yet).

- [ ] **Step 3: Implement process_packet() in scanner.py**

Create `backend/scanner.py`:

```python
import math
import re
import subprocess
import threading
from datetime import datetime

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
        b = [hex_str[14 + i * 2:16 + i * 2] for i in range(6)]
        mac = ":".join(reversed(b)).upper()

    rssi = int(hex_str[-2:], 16)
    if rssi > 127:
        rssi -= 256

    dist_str = "?m"
    if tx != 0:
        d = 10 ** ((tx - rssi) / 20.0)
        dist_str = f"~{d:.1f}m" if d < 10 else f"~{d:.0f}m" if d < 100 else ">100m"

    return {
        "uuid": uuid,
        "major": major,
        "minor": minor,
        "tx_power": tx,
        "rssi": rssi,
        "mac": mac,
        "distance": dist_str,
        "last_seen": datetime.utcnow().isoformat(),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python -m pytest tests/test_scanner.py -v
```
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scanner.py backend/tests/test_scanner.py && git commit -m "feat: implement process_packet() with full iBeacon parsing"
```

---

## Task 4: Scanner class in scanner.py

**Files:**
- Modify: `backend/scanner.py` (append Scanner class)
- Modify: `backend/tests/test_scanner.py` (append Scanner tests)

- [ ] **Step 1: Write failing Scanner tests**

Append to `backend/tests/test_scanner.py`:

```python
from unittest.mock import patch, MagicMock, call
from scanner import Scanner


def _make_hcidump_lines(packet_lines):
    """Convert list of str lines to bytes as hcidump would emit."""
    return [line.encode() for line in packet_lines]


def test_scanner_start_calls_correct_subprocesses():
    with patch("scanner.subprocess.run") as mock_run, \
         patch("scanner.subprocess.Popen") as mock_popen:

        mock_popen.return_value.stdout = iter([])
        mock_popen.return_value.kill = MagicMock()

        scanner = Scanner(upsert_fn=lambda x: None)
        scanner.start("hci0")
        scanner.stop()

        mock_run.assert_called_once_with(
            ["sudo", "hciconfig", "hci0", "up"], check=True
        )
        popen_calls = mock_popen.call_args_list
        assert popen_calls[0][0][0] == [
            "sudo", "hcitool", "-i", "hci0", "lescan", "--passive", "--duplicates"
        ]
        assert popen_calls[1][0][0] == ["sudo", "hcidump", "-i", "hci0", "-R"]


def test_scanner_process_lines_reconstructs_packet():
    scanner = Scanner(upsert_fn=lambda x: None)
    lines = [
        "> 04 3E 2B 02 01 00 01",
        "  AA BB CC DD EE FF 1A",
        "> NEXT LINE STARTS NEW PACKET",
    ]
    packets = list(scanner._process_lines(iter(lines)))
    assert packets == [
        "043E2B020100 01AABBCCDDEEFF1A".replace(" ", ""),
        "NEXTLINESTARTSNEWPACKET",
    ]


def test_scanner_upserts_parsed_beacon():
    upserted = []

    good_lines = _make_hcidump_lines([
        "> 04 3E 2B 02 01 00 01 AA BB CC DD EE FF 1A 02 01 06 1A FF 4C 00",
        "  02 15 12 34 56 78 12 34 12 34 12 34 12 34 56 78 9A BC 00 01 00",
        "  02 C5 C3",
        "> FF",  # trigger processing of previous packet
    ])

    with patch("scanner.subprocess.run"), \
         patch("scanner.subprocess.Popen") as mock_popen:

        mock_proc = MagicMock()
        mock_proc.stdout = iter(good_lines)
        mock_proc.kill = MagicMock()
        mock_popen.return_value = mock_proc

        scanner = Scanner(upsert_fn=upserted.append)
        scanner.start("hci0")
        scanner._thread.join(timeout=2.0)

    assert len(upserted) == 1
    assert upserted[0]["uuid"] == "12345678-1234-1234-1234-123456789ABC"
    assert upserted[0]["major"] == 1
    assert upserted[0]["minor"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_scanner.py::test_scanner_start_calls_correct_subprocesses -v
```
Expected: AttributeError or ImportError (Scanner class not defined).

- [ ] **Step 3: Append Scanner class to scanner.py**

Append to `backend/scanner.py` (after `process_packet`):

```python

class Scanner:
    def __init__(self, upsert_fn):
        self._upsert_fn = upsert_fn
        self._stop_event = threading.Event()
        self._lescan_proc = None
        self._hcidump_proc = None
        self._thread = None

    def start(self, adapter: str):
        self._stop_event.clear()
        subprocess.run(["sudo", "hciconfig", adapter, "up"], check=True)
        self._lescan_proc = subprocess.Popen(
            ["sudo", "hcitool", "-i", adapter, "lescan", "--passive", "--duplicates"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self._hcidump_proc = subprocess.Popen(
            ["sudo", "hcidump", "-i", adapter, "-R"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        self._thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        for proc in (self._lescan_proc, self._hcidump_proc):
            if proc:
                proc.kill()
        if self._thread:
            self._thread.join(timeout=3.0)
        self._lescan_proc = None
        self._hcidump_proc = None
        self._thread = None

    def _process_lines(self, lines_iter):
        """Yield complete uppercase hex strings, one per HCI packet."""
        current = ""
        for line in lines_iter:
            if self._stop_event.is_set():
                break
            if line.startswith(">"):
                if current:
                    yield current
                current = re.sub(r"\s", "", line[1:]).upper()
            else:
                current += re.sub(r"\s", "", line).upper()
        if current and not self._stop_event.is_set():
            yield current

    def _reader_loop(self):
        try:
            lines = (
                raw.decode("utf-8", errors="replace")
                for raw in self._hcidump_proc.stdout
            )
            for hex_str in self._process_lines(lines):
                if self._stop_event.is_set():
                    break
                beacon = process_packet(hex_str)
                if beacon:
                    self._upsert_fn(beacon)
        except (OSError, ValueError):
            pass  # stdout closed when process was killed
```

- [ ] **Step 4: Run all scanner tests**

```bash
cd backend && python -m pytest tests/test_scanner.py -v
```
Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scanner.py backend/tests/test_scanner.py && git commit -m "feat: add Scanner class with subprocess management and reader thread"
```

---

## Task 5: app.py skeleton — state, adapters, status endpoints

**Files:**
- Create: `backend/app.py`
- Create: `backend/tests/test_app.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_app.py`:

```python
import os
os.environ["DB_URL"] = "sqlite:///:memory:"

import pytest
from unittest.mock import patch
import json

from app import app, state
from database import init_db, Base, engine


@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def reset_state():
    state.update({"adapter": "hci0", "scanning": False, "spoofing": False, "spoof_target": None})
    yield


def test_get_status(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["adapter"] == "hci0"
    assert data["scanning"] is False
    assert data["spoofing"] is False


def test_put_adapter_success(client):
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.put("/api/adapter", json={"adapter": "hci1"})
    assert res.status_code == 200
    assert state["adapter"] == "hci1"


def test_put_adapter_rejected_while_scanning(client):
    state["scanning"] = True
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.put("/api/adapter", json={"adapter": "hci1"})
    assert res.status_code == 409


def test_put_adapter_rejected_while_spoofing(client):
    state["spoofing"] = True
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.put("/api/adapter", json={"adapter": "hci1"})
    assert res.status_code == 409


def test_put_adapter_unknown_adapter_rejected(client):
    with patch("app.list_adapters", return_value=["hci0"]):
        res = client.put("/api/adapter", json={"adapter": "hci99"})
    assert res.status_code == 400


def test_get_adapters(client):
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.get("/api/adapters")
    assert res.status_code == 200
    assert json.loads(res.data) == ["hci0", "hci1"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_app.py -v
```
Expected: ImportError (app.py doesn't exist).

- [ ] **Step 3: Implement app.py skeleton with state and adapter endpoints**

Create `backend/app.py`:

```python
import re
import subprocess

from flask import Flask, jsonify, request
from flask_cors import CORS

from database import init_db, get_all_beacons, upsert_beacon
from scanner import Scanner
from spoofer import Spoofer

app = Flask(__name__)
CORS(app)

state = {
    "adapter": "hci0",
    "scanning": False,
    "spoofing": False,
    "spoof_target": None,
}

_scanner = Scanner(upsert_fn=upsert_beacon)
_spoofer = Spoofer()


def list_adapters():
    result = subprocess.run(
        ["sudo", "hciconfig"], capture_output=True, text=True
    )
    return re.findall(r"^(hci\d+):", result.stdout, re.MULTILINE)


@app.get("/api/status")
def get_status():
    return jsonify(state)


@app.get("/api/adapters")
def get_adapters():
    return jsonify(list_adapters())


@app.put("/api/adapter")
def put_adapter():
    if state["scanning"] or state["spoofing"]:
        return jsonify({"error": "Cannot change adapter while scanning or spoofing"}), 409
    adapter = request.json.get("adapter")
    available = list_adapters()
    if adapter not in available:
        return jsonify({"error": f"Adapter {adapter!r} not found. Available: {available}"}), 400
    state["adapter"] = adapter
    return jsonify(state)


# ── Scan endpoints ──────────────────────────────────────────────────────────

@app.post("/api/scan/start")
def scan_start():
    if state["spoofing"]:
        return jsonify({"error": "Cannot scan while spoofing"}), 409
    if state["scanning"]:
        return jsonify(state)
    try:
        _scanner.start(state["adapter"])
        state["scanning"] = True
        return jsonify(state)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/scan/stop")
def scan_stop():
    _scanner.stop()
    state["scanning"] = False
    return jsonify(state)


@app.get("/api/beacons")
def get_beacons():
    return jsonify(get_all_beacons())


# ── Spoof endpoints ─────────────────────────────────────────────────────────

@app.post("/api/spoof/start")
def spoof_start():
    body = request.json or {}
    uuid = body.get("uuid")
    major = body.get("major")
    minor = body.get("minor")
    tx_power = body.get("tx_power", -59)
    if not uuid or major is None or minor is None:
        return jsonify({"error": "uuid, major, and minor are required"}), 400
    # Auto-stop scanning before advertising
    if state["scanning"]:
        _scanner.stop()
        state["scanning"] = False
    try:
        _spoofer.start(state["adapter"], uuid, int(major), int(minor), int(tx_power))
        state["spoofing"] = True
        state["spoof_target"] = {"uuid": uuid, "major": major, "minor": minor}
        return jsonify(state)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/spoof/stop")
def spoof_stop():
    try:
        _spoofer.stop(state["adapter"])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    state["spoofing"] = False
    state["spoof_target"] = None
    return jsonify(state)


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
```

> Note: `app.py` imports `Spoofer` from `spoofer.py`, which doesn't exist yet. Create a stub `backend/spoofer.py` now so imports work:

```python
# backend/spoofer.py — stub (full implementation in Task 8)
class Spoofer:
    def start(self, adapter, uuid, major, minor, tx_power):
        raise NotImplementedError

    def stop(self, adapter):
        raise NotImplementedError
```

- [ ] **Step 4: Run failing tests to verify app imports work**

```bash
cd backend && python -m pytest tests/test_app.py -v
```
Expected: 7 tests PASS (spoof endpoints not tested yet).

- [ ] **Step 5: Commit**

```bash
git add backend/app.py backend/spoofer.py backend/tests/test_app.py && git commit -m "feat: Flask skeleton with state, adapter, and status endpoints"
```

---

## Task 6: Scan API endpoints — tests

**Files:**
- Modify: `backend/tests/test_app.py` (append scan endpoint tests)

- [ ] **Step 1: Append scan endpoint tests**

Append to `backend/tests/test_app.py`:

```python
def test_scan_start_sets_state(client):
    with patch("app._scanner.start") as mock_start:
        res = client.post("/api/scan/start")
    assert res.status_code == 200
    mock_start.assert_called_once_with("hci0")
    assert state["scanning"] is True


def test_scan_start_rejected_while_spoofing(client):
    state["spoofing"] = True
    res = client.post("/api/scan/start")
    assert res.status_code == 409


def test_scan_start_idempotent_when_already_scanning(client):
    state["scanning"] = True
    with patch("app._scanner.start") as mock_start:
        res = client.post("/api/scan/start")
    mock_start.assert_not_called()
    assert res.status_code == 200


def test_scan_stop_clears_state(client):
    state["scanning"] = True
    with patch("app._scanner.stop"):
        res = client.post("/api/scan/stop")
    assert res.status_code == 200
    assert state["scanning"] is False


def test_get_beacons_returns_list(client):
    from database import upsert_beacon
    upsert_beacon({
        "uuid": "AAAA-1234-1234-1234-123456789ABC",
        "major": 1, "minor": 2, "mac": "AA:BB:CC:DD:EE:FF",
        "tx_power": -59, "rssi": -61, "distance": "~1m",
        "last_seen": "2026-04-14T10:00:00"
    })
    res = client.get("/api/beacons")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert len(data) == 1
    assert data[0]["major"] == 1


def test_scan_start_returns_error_on_subprocess_failure(client):
    with patch("app._scanner.start", side_effect=Exception("hci0: no such device")):
        res = client.post("/api/scan/start")
    assert res.status_code == 500
    assert "hci0: no such device" in json.loads(res.data)["error"]
```

- [ ] **Step 2: Run all app tests**

```bash
cd backend && python -m pytest tests/test_app.py -v
```
Expected: all 13 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_app.py && git commit -m "test: scan API endpoint coverage"
```

---

## Task 7: build_payload() in spoofer.py

**Files:**
- Modify: `backend/spoofer.py` (replace stub, add build_payload)
- Create: `backend/tests/test_spoofer.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_spoofer.py`:

```python
from spoofer import build_payload


def test_build_payload_structure():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    # prefix (10) + UUID (16) + major (2) + minor (2) + tx (1) = 31 bytes
    assert len(parts) == 31


def test_build_payload_prefix():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    assert parts[:10] == ["02", "01", "06", "1a", "ff", "00", "4c", "00", "02", "15"]


def test_build_payload_uuid():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    uuid_bytes = parts[10:26]
    assert uuid_bytes == [
        "12", "34", "56", "78", "12", "34", "12", "34",
        "12", "34", "12", "34", "56", "78", "9a", "bc"
    ]


def test_build_payload_major_minor():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    assert parts[26:28] == ["00", "01"]  # major = 1
    assert parts[28:30] == ["00", "02"]  # minor = 2


def test_build_payload_tx_power_negative():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    assert parts[30] == "c5"  # -59 as signed byte = 0xC5


def test_build_payload_tx_power_positive():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, 0)
    parts = result.split()
    assert parts[30] == "00"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python -m pytest tests/test_spoofer.py -v
```
Expected: ImportError (build_payload not defined).

- [ ] **Step 3: Implement build_payload and Spoofer class in spoofer.py**

Replace `backend/spoofer.py` entirely:

```python
import subprocess


def build_payload(uuid: str, major: int, minor: int, tx_power: int) -> str:
    """Return space-separated lowercase hex bytes for HCI advertising payload."""
    prefix = bytes.fromhex("0201061AFF004C000215")
    uuid_b = bytes.fromhex(uuid.replace("-", ""))
    major_b = major.to_bytes(2, "big")
    minor_b = minor.to_bytes(2, "big")
    tx_b = tx_power.to_bytes(1, "big", signed=True)
    payload = prefix + uuid_b + major_b + minor_b + tx_b
    return " ".join(f"{b:02x}" for b in payload)


class Spoofer:
    def start(self, adapter: str, uuid: str, major: int, minor: int, tx_power: int):
        hex_bytes = build_payload(uuid, major, minor, tx_power)
        self._run(["sudo", "hciconfig", adapter, "leadv", "3"])
        self._run(["sudo", "hcitool", "-i", adapter, "cmd",
                   "0x08", "0x0008"] + hex_bytes.split())
        self._run(["sudo", "hciconfig", adapter, "up"])

    def stop(self, adapter: str):
        self._run(["sudo", "hciconfig", adapter, "noscan"])
        self._run(["sudo", "hcitool", "-i", adapter, "cmd", "0x08", "0x000A", "00"])

    def _run(self, cmd: list):
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(
                f"Command {cmd} failed (rc={result.returncode}): "
                f"{result.stderr.decode(errors='replace').strip()}"
            )
```

- [ ] **Step 4: Run spoofer tests**

```bash
cd backend && python -m pytest tests/test_spoofer.py -v
```
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/spoofer.py backend/tests/test_spoofer.py && git commit -m "feat: implement build_payload() and Spoofer class"
```

---

## Task 8: Spoof API endpoint tests

**Files:**
- Modify: `backend/tests/test_app.py` (append spoof tests)

- [ ] **Step 1: Append spoof endpoint tests**

Append to `backend/tests/test_app.py`:

```python
def test_spoof_start_sets_state(client):
    with patch("app._spoofer.start") as mock_start:
        res = client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    assert res.status_code == 200
    mock_start.assert_called_once_with("hci0", "12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    assert state["spoofing"] is True
    assert state["spoof_target"]["major"] == 1


def test_spoof_start_auto_stops_scan(client):
    state["scanning"] = True
    with patch("app._scanner.stop") as mock_stop, \
         patch("app._spoofer.start"):
        client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    mock_stop.assert_called_once()
    assert state["scanning"] is False


def test_spoof_start_requires_uuid(client):
    res = client.post("/api/spoof/start", json={"major": 1, "minor": 2})
    assert res.status_code == 400


def test_spoof_stop_clears_state(client):
    state["spoofing"] = True
    state["spoof_target"] = {"uuid": "X", "major": 1, "minor": 1}
    with patch("app._spoofer.stop"):
        res = client.post("/api/spoof/stop")
    assert res.status_code == 200
    assert state["spoofing"] is False
    assert state["spoof_target"] is None


def test_spoof_start_returns_error_on_failure(client):
    with patch("app._spoofer.start", side_effect=RuntimeError("no adapter")):
        res = client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    assert res.status_code == 500
    assert "no adapter" in json.loads(res.data)["error"]
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: all tests PASS (approximately 31 tests).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_app.py && git commit -m "test: spoof API endpoint coverage"
```

---

## Task 9: Frontend — Vite setup, api.js, App.jsx, index.css

**Files:**
- Create: `frontend/src/index.css`
- Modify: `frontend/src/main.jsx`
- Create: `frontend/src/api.js`
- Create: `frontend/src/App.jsx`

- [ ] **Step 1: Write index.css with dark theme**

Replace `frontend/src/index.css` entirely:

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #111;
  --surface: #1e1e1e;
  --surface2: #272727;
  --accent: #4fc3f7;
  --text: #e0e0e0;
  --text-muted: #888;
  --error: #ef5350;
  --selected: #1a3a4a;
  --border: #333;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  min-height: 100vh;
}

button {
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
}

button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
button:disabled { opacity: 0.4; cursor: not-allowed; }

input, select {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 13px;
}

input:focus, select:focus {
  outline: none;
  border-color: var(--accent);
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 16px;
}

label { color: var(--text-muted); font-size: 12px; margin-right: 6px; }
```

- [ ] **Step 2: Update main.jsx**

Replace `frontend/src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: Create api.js**

Create `frontend/src/api.js`:

```js
import axios from 'axios'

export const getStatus  = ()          => axios.get('/api/status').then(r => r.data)
export const getAdapters = ()         => axios.get('/api/adapters').then(r => r.data)
export const setAdapter = (adapter)   => axios.put('/api/adapter', { adapter }).then(r => r.data)
export const getBeacons = ()          => axios.get('/api/beacons').then(r => r.data)
export const startScan  = ()          => axios.post('/api/scan/start').then(r => r.data)
export const stopScan   = ()          => axios.post('/api/scan/stop').then(r => r.data)
export const startSpoof = (payload)   => axios.post('/api/spoof/start', payload).then(r => r.data)
export const stopSpoof  = ()          => axios.post('/api/spoof/stop').then(r => r.data)
```

- [ ] **Step 4: Create App.jsx**

Create `frontend/src/App.jsx`:

```jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { getStatus, getBeacons } from './api'
import AdapterSelector from './components/AdapterSelector'
import ScanControls from './components/ScanControls'
import BeaconList from './components/BeaconList'
import SpoofControls from './components/SpoofControls'

function statusLabel(status) {
  if (!status) return 'Idle'
  if (status.spoofing && status.spoof_target) {
    const { uuid, major, minor } = status.spoof_target
    return `Spoofing [${uuid}::${major}::${minor}]`
  }
  if (status.scanning) return 'Scanning...'
  return 'Idle'
}

export default function App() {
  const [status, setStatus]               = useState(null)
  const [beacons, setBeacons]             = useState([])
  const [selectedBeacon, setSelectedBeacon] = useState(null)
  const [error, setError]                 = useState(null)
  const pollRef = useRef(null)

  const refreshStatus = useCallback(async () => {
    try {
      const s = await getStatus()
      setStatus(s)
      return s
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }, [])

  const refreshBeacons = useCallback(async () => {
    try {
      setBeacons(await getBeacons())
    } catch (e) {
      setError(e?.response?.data?.error || e.message)
    }
  }, [])

  // Start / stop beacon polling based on scanning state
  useEffect(() => {
    if (status?.scanning) {
      pollRef.current = setInterval(refreshBeacons, 3000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [status?.scanning, refreshBeacons])

  useEffect(() => { refreshStatus() }, [refreshStatus])

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
  }, [refreshStatus, refreshBeacons])

  const handleSelectBeacon = useCallback((beacon) => {
    setSelectedBeacon(prev => prev?.id === beacon.id ? null : beacon)
  }, [])

  const label = statusLabel(status)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 40px' }}>

      {/* Status bar */}
      <div style={{
        background: status?.spoofing ? '#1a3a1a' : status?.scanning ? '#1a2a3a' : 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <span style={{
          color: status?.spoofing ? '#81c784' : status?.scanning ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: 500,
          fontSize: 13,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        {status && (
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {status.adapter}
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          background: '#2a1a1a', border: '1px solid var(--error)',
          color: 'var(--error)', padding: '8px 14px', borderRadius: 4,
          marginBottom: 12, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: 12, padding: '2px 8px' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <AdapterSelector
          status={status}
          onAction={handleAction}
          onError={setError}
        />
        <ScanControls status={status} onAction={handleAction} />
        <BeaconList
          beacons={beacons}
          selectedBeacon={selectedBeacon}
          onSelect={handleSelectBeacon}
        />
        <SpoofControls
          status={status}
          selectedBeacon={selectedBeacon}
          onAction={handleAction}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ && git commit -m "feat: App.jsx skeleton with status bar, error banner, polling"
```

---

## Task 10: AdapterSelector.jsx and ScanControls.jsx

**Files:**
- Create: `frontend/src/components/AdapterSelector.jsx`
- Create: `frontend/src/components/ScanControls.jsx`

- [ ] **Step 1: Create AdapterSelector.jsx**

Create `frontend/src/components/AdapterSelector.jsx`:

```jsx
import { useState, useEffect } from 'react'
import { getAdapters, setAdapter } from '../api'

export default function AdapterSelector({ status, onAction, onError }) {
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
    <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
  )
}
```

- [ ] **Step 2: Create ScanControls.jsx**

Create `frontend/src/components/ScanControls.jsx`:

```jsx
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
```

- [ ] **Step 3: Verify frontend starts**

```bash
cd frontend && npm run dev
```
Open `http://localhost:5173` in a browser. Verify the dark background renders without console errors. The adapter selector and scan buttons should appear. (Flask doesn't need to be running — 404 on `/api/*` is expected at this stage.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ && git commit -m "feat: AdapterSelector and ScanControls components"
```

---

## Task 11: BeaconList.jsx

**Files:**
- Create: `frontend/src/components/BeaconList.jsx`

- [ ] **Step 1: Create BeaconList.jsx**

Create `frontend/src/components/BeaconList.jsx`:

```jsx
export default function BeaconList({ beacons, selectedBeacon, onSelect }) {
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
              {['MAC', 'UUID', 'Major', 'Minor', 'RSSI', 'TX Power', 'Distance', 'Last Seen'].map(h => (
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
                <td colSpan={8} style={{ padding: '16px 10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No beacons found. Start scanning to discover nearby iBeacons.
                </td>
              </tr>
            ) : (
              beacons.map(b => (
                <tr
                  key={b.id}
                  onClick={() => onSelect(b)}
                  style={{
                    background: selectedBeacon?.id === b.id ? 'var(--selected)' : 'transparent',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => {
                    if (selectedBeacon?.id !== b.id) e.currentTarget.style.background = 'var(--surface2)'
                  }}
                  onMouseLeave={e => {
                    if (selectedBeacon?.id !== b.id) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {[b.mac, b.uuid, b.major, b.minor, b.rssi, b.tx_power, b.distance,
                    b.last_seen ? b.last_seen.replace('T', ' ').slice(0, 19) : '—'
                  ].map((val, i) => (
                    <td key={i} style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      {val ?? '—'}
                    </td>
                  ))}
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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/BeaconList.jsx && git commit -m "feat: BeaconList table with row selection"
```

---

## Task 12: SpoofControls.jsx

**Files:**
- Create: `frontend/src/components/SpoofControls.jsx`

- [ ] **Step 1: Create SpoofControls.jsx**

Create `frontend/src/components/SpoofControls.jsx`:

```jsx
import { useState } from 'react'
import { startSpoof, stopSpoof } from '../api'

const DEFAULT_TX = -59

export default function SpoofControls({ status, selectedBeacon, onAction }) {
  const [manualUUID, setManualUUID]   = useState('')
  const [manualMajor, setManualMajor] = useState('')
  const [manualMinor, setManualMinor] = useState('')
  const [manualTX, setManualTX]       = useState(String(DEFAULT_TX))

  const scanning = status?.scanning ?? false
  const spoofing = status?.spoofing ?? false

  // Payload priority: selected beacon row > manual fields
  const canSpoof = !scanning && (
    selectedBeacon !== null || manualUUID.trim() !== ''
  )

  const handleStart = () => {
    const payload = selectedBeacon
      ? {
          uuid: selectedBeacon.uuid,
          major: selectedBeacon.major,
          minor: selectedBeacon.minor,
          tx_power: selectedBeacon.tx_power ?? DEFAULT_TX,
        }
      : {
          uuid: manualUUID.trim(),
          major: parseInt(manualMajor, 10) || 0,
          minor: parseInt(manualMinor, 10) || 0,
          tx_power: parseInt(manualTX, 10) || DEFAULT_TX,
        }
    onAction(() => startSpoof(payload))
  }

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Selected beacon row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 90 }}>Selected</span>
        <span style={{
          color: selectedBeacon ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 12, flex: 1,
        }}>
          {selectedBeacon
            ? `${selectedBeacon.uuid}  ·  ${selectedBeacon.major}  ·  ${selectedBeacon.minor}`
            : 'No beacon selected — click a table row or use manual entry below'
          }
        </span>
      </div>

      {/* Manual entry fields */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 90 }}>Manual entry</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          <div>
            <label>UUID</label>
            <input
              value={manualUUID}
              onChange={e => setManualUUID(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ width: 280 }}
              disabled={spoofing}
            />
          </div>
          <div>
            <label>Major</label>
            <input
              type="number" min={0} max={65535}
              value={manualMajor}
              onChange={e => setManualMajor(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
          </div>
          <div>
            <label>Minor</label>
            <input
              type="number" min={0} max={65535}
              value={manualMinor}
              onChange={e => setManualMinor(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
          </div>
          <div>
            <label>TX Power</label>
            <input
              type="number" min={-128} max={127}
              value={manualTX}
              onChange={e => setManualTX(e.target.value)}
              style={{ width: 70 }}
              disabled={spoofing}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleStart} disabled={!canSpoof || spoofing}>
          Start Spoof
        </button>
        <button onClick={() => onAction(stopSpoof)} disabled={!spoofing}>
          Stop Spoof
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SpoofControls.jsx && git commit -m "feat: SpoofControls with row-select and manual entry"
```

---

## Task 13: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

Create `README.md` at the project root:

```markdown
# iBeacon Spoofer

Local web app for scanning and spoofing iBeacons on Linux. No internet access or authentication required.

## Requirements

### System packages
```bash
sudo apt install bluez bluez-hcidump
```

### Sudoers configuration

Run `sudo visudo` and add the following (replace `<username>` with your Linux username):

```
<username> ALL=(ALL) NOPASSWD: /usr/bin/hciconfig
<username> ALL=(ALL) NOPASSWD: /usr/bin/hcitool
<username> ALL=(ALL) NOPASSWD: /usr/sbin/hcidump
```

> Verify the hcidump path first: `which hcidump` (may be `/usr/bin/hcidump` on some distros)

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Flask runs on `http://127.0.0.1:5000`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Vite dev server runs on `http://localhost:5173`.

## Usage

1. Open `http://localhost:5173`
2. Select a Bluetooth adapter from the dropdown
3. Click **Start Scan** — nearby iBeacons appear in the table
4. Click a table row to select a beacon for spoofing, or fill in UUID/Major/Minor/TX manually
5. Click **Start Spoof** — scanning stops automatically and your adapter starts broadcasting
6. Click **Stop Spoof** to end broadcasting

## Running tests

```bash
cd backend
python -m pytest tests/ -v
```
```

- [ ] **Step 2: Commit README**

```bash
git add README.md && git commit -m "docs: add README with setup and sudoers instructions"
```

---

## Task 14: End-to-end smoke test

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: all tests PASS, 0 failures.

- [ ] **Step 2: Start backend and frontend**

In terminal 1:
```bash
cd backend && python app.py
```
Expected: `Running on http://127.0.0.1:5000`

In terminal 2:
```bash
cd frontend && npm run dev
```
Expected: `Local: http://localhost:5173/`

- [ ] **Step 3: Verify UI in browser**

Open `http://localhost:5173`. Confirm:
- Dark background renders
- Status bar shows "Idle"
- Adapter dropdown populates (or shows an error banner if no BT adapter)
- "Start Scan" is enabled, "Start Spoof" is disabled
- "Start Spoof" enables after typing a UUID in the manual entry field
- No JavaScript console errors

- [ ] **Step 4: Final commit**

```bash
git add . && git commit -m "chore: end-to-end smoke test confirmed"
```
