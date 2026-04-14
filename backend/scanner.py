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
                    try:
                        self._upsert_fn(beacon)
                    except Exception:
                        pass  # DB errors must not kill the reader thread
        except (OSError, ValueError):
            pass  # stdout closed when process was killed
