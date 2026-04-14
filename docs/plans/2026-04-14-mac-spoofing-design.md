# MAC Address Spoofing — Design

## Goal

Add the ability to spoof the Bluetooth adapter's MAC address independently of beacon spoofing. Users can clone a scanned beacon's MAC, enter a custom MAC, or generate a random one. The MAC persists until manually reset.

## Technical Approach

BLE adapters support two address modes via HCI:

- **Public (0x00)** — the adapter's real/hardware MAC (current default)
- **Random (0x01)** — a user-defined address set via `LE Set Random Address`

### HCI Commands

- **Set random address**: `hcitool cmd 0x08 0x0005 <6 MAC bytes in reverse order>`
- **Advertising params**: existing `cmd 0x08 0x0006` — change own address type byte from `0x00` to `0x01` when a spoofed MAC is active
- **Read original MAC**: parsed from `hciconfig <adapter>` output (`BD Address: XX:XX:XX:XX:XX:XX`)

### Constraints

- Random address can only be set when the adapter is **not** scanning or advertising
- No HCI command needed to "undo" — just stop using the random address type in advertising params

## State Changes

Add to `app.py` state dict:

```python
state = {
    "adapter": "hci0",
    "scanning": False,
    "spoofing": False,
    "spoof_target": None,
    "original_mac": None,   # read from hciconfig on first access
    "spoofed_mac": None,     # user-set random MAC, or None
}
```

## API Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/mac` | — | Returns `{original_mac, spoofed_mac}` |
| PUT | `/api/mac` | `{mac: "AA:BB:CC:DD:EE:FF"}` | Sets random address. 409 if scanning/spoofing active. |
| DELETE | `/api/mac` | — | Clears spoofed_mac (reset to original). 409 if scanning/spoofing active. |

## Spoofer Changes

In `spoofer.py`, the `start()` method:

1. If `spoofed_mac` is set:
   - Run `hcitool cmd 0x08 0x0005 <reversed MAC bytes>` to set the random address
   - Use own address type `0x01` in advertising parameters
2. If `spoofed_mac` is None:
   - Use own address type `0x00` (public) — current behavior

## Frontend Changes

### api.js

```javascript
getMac()           // GET /api/mac
setMac(mac)        // PUT /api/mac
resetMac()         // DELETE /api/mac
```

### UI — MAC Controls (below adapter selector)

- Display current effective MAC with "Original" / "Spoofed" badge
- **Custom input**: text field with `XX:XX:XX:XX:XX:XX` validation
- **Random button**: generates a valid random MAC and PUTs it
- **Clone button**: added to each beacon row in BeaconList — PUTs that beacon's MAC
- **Reset button**: visible only when spoofed, calls DELETE
- All controls disabled when scanning or spoofing is active

### Polling

`App.jsx` adds `GET /api/mac` alongside the existing `/api/status` poll to keep MAC display current.

## Decisions

- MAC spoofing is **independent** of beacon spoofing (separate adapter setting)
- MAC persists until **manual reset** only (no auto-revert)
- Random MAC generation happens **client-side** (no server endpoint needed)
- UI lives **next to adapter selector** (adapter-level setting)
