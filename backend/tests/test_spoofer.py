import pytest
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


def test_build_payload_structure():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    # prefix (9) + UUID (16) + major (2) + minor (2) + tx (1) = 30 bytes
    assert len(parts) == 30


def test_build_payload_prefix():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    assert parts[:9] == ["02", "01", "06", "1a", "ff", "4c", "00", "02", "15"]


def test_build_payload_uuid():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    uuid_bytes = parts[9:25]
    assert uuid_bytes == [
        "12", "34", "56", "78", "12", "34", "12", "34",
        "12", "34", "12", "34", "56", "78", "9a", "bc"
    ]


def test_build_payload_major_minor():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    assert parts[25:27] == ["00", "01"]  # major = 1
    assert parts[27:29] == ["00", "02"]  # minor = 2


def test_build_payload_tx_power_negative():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    parts = result.split()
    assert parts[29] == "c5"  # -59 as signed byte = 0xC5


def test_build_payload_tx_power_positive():
    result = build_payload("12345678-1234-1234-1234-123456789ABC", 1, 2, 0)
    parts = result.split()
    assert parts[29] == "00"


def test_set_random_address_rejects_invalid_mac():
    spoofer = Spoofer()
    with pytest.raises(ValueError, match="Invalid MAC"):
        spoofer.set_random_address("hci0", "not-a-mac")
