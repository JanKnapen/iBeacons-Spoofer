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
