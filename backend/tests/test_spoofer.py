from spoofer import build_payload


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
