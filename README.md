# iBeacon Spoofer

A local web application for scanning nearby Bluetooth iBeacons and re-broadcasting (spoofing) them on Linux.

## Prerequisites

- Linux with BlueZ stack
- Python 3.10+
- Node.js 18+

### System packages

```bash
sudo apt install bluez bluez-hcidump
```

### Sudoers (passwordless access to BLE tools)

Add via `sudo visudo`:

```
<username> ALL=(ALL) NOPASSWD: /usr/bin/hciconfig
<username> ALL=(ALL) NOPASSWD: /usr/bin/hcitool
<username> ALL=(ALL) NOPASSWD: /usr/sbin/hcidump
```

> Verify `hcidump` path with `which hcidump` -- it may be `/usr/bin/hcidump` on some distros.

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

## Running

Start both servers in separate terminals:

```bash
# Terminal 1 - Backend (port 5000)
cd backend
./venv/bin/python app.py

# Terminal 2 - Frontend (port 5173, proxies /api to backend)
cd frontend
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

1. Select a Bluetooth adapter from the dropdown
2. Click **Start Scan** to discover nearby iBeacons
3. Select a beacon from the table, or enter one manually
4. Click **Start Spoof** to re-broadcast the beacon

## Tests

```bash
cd backend
./venv/bin/python -m pytest tests/ -v
```
