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
