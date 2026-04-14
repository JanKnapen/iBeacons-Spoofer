import subprocess


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
    def start(self, adapter: str, uuid: str, major: int, minor: int, tx_power: int):
        hex_bytes = build_payload(uuid, major, minor, tx_power)
        payload_parts = hex_bytes.split()
        length = f"{len(payload_parts):02x}"
        # Set advertising parameters: 100ms interval, non-connectable, all channels
        self._run(["sudo", "hcitool", "-i", adapter, "cmd",
                   "0x08", "0x0006",
                   "a0", "00", "a0", "00", "03",
                   "00", "00", "00", "00", "00", "00", "00", "00", "07", "00"])
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
