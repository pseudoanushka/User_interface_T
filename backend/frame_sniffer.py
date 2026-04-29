"""
XBee Pro S2C 802.15.4 frame sniffer.

XBee API frame layout:
  7E [len_hi] [len_lo] [frame_type] [frame_data...] [checksum]
  checksum = 0xFF - (sum of frame_data bytes & 0xFF)

Receive frame types (data arriving from the drone over air):
  0x80  RX 64-bit address
  0x81  RX 16-bit address   ← most common in 802.15.4

If no 0x7E frames are found the module is likely in AT/transparent
mode (AP=0), in which case the drone's raw bytes appear directly on
the serial port.
"""
import serial
import struct

PORT = "COM11"
BAUD = 115200
READ_BYTES = 4096

FRAME_TYPES = {
    0x80: "RX 64-bit",
    0x81: "RX 16-bit",
    0x89: "TX Status",
    0x8A: "Modem Status",
    0x8B: "TX Status (enhanced)",
}


def _chk_ok(frame_data: bytes, chk: int) -> bool:
    return (sum(frame_data) + chk) & 0xFF == 0xFF


def parse_xbee_frames(data: bytes) -> None:
    count = 0
    offsets = []

    # First pass: collect all frame start offsets
    pos = 0
    while pos < len(data) - 4:
        if data[pos] == 0x7E:
            offsets.append(pos)
            length = (data[pos + 1] << 8) | data[pos + 2]
            pos += 3 + length + 1   # skip to byte after checksum
        else:
            pos += 1

    for offset in offsets:
        if offset + 3 >= len(data):
            break
        length     = (data[offset + 1] << 8) | data[offset + 2]
        end        = offset + 3 + length
        if end >= len(data):
            break
        frame_data = data[offset + 3 : end]
        chk        = data[end]
        ok         = _chk_ok(frame_data, chk)
        ftype      = frame_data[0] if frame_data else 0
        count += 1

        print(f"\n--- Frame {count}  offset={offset}  type={FRAME_TYPES.get(ftype, f'0x{ftype:02X}')}  "
              f"len={length}  chk={'OK' if ok else 'BAD'} ---")

        payload = b""

        if ftype == 0x81 and len(frame_data) >= 6:    # 16-bit RX
            src   = (frame_data[1] << 8) | frame_data[2]
            rssi  = frame_data[3]
            opts  = frame_data[4]
            payload = frame_data[5:]
            print(f"  src=0x{src:04X}  RSSI=-{rssi} dBm  options=0x{opts:02X}")

        elif ftype == 0x80 and len(frame_data) >= 12: # 64-bit RX
            src   = frame_data[1:9].hex()
            rssi  = frame_data[9]
            opts  = frame_data[10]
            payload = frame_data[11:]
            print(f"  src={src}  RSSI=-{rssi} dBm  options=0x{opts:02X}")

        elif ftype == 0x8A and len(frame_data) >= 2:  # Modem status
            codes = {0:"HW reset", 1:"WD reset", 2:"Associated",
                     3:"Disassociated", 6:"Coordinator started"}
            print(f"  modem: {codes.get(frame_data[1], frame_data[1])}")

        if payload:
            print(f"  raw     : {payload.hex()}")
            txt = payload.decode("ascii", errors="replace").strip()
            printable = sum(1 for c in txt if 0x20 <= ord(c) <= 0x7E)
            if printable > len(payload) * 0.6:
                print(f"  ASCII   : {txt!r}")
            elif len(payload) % 4 == 0:
                floats = struct.unpack_from(f"<{len(payload)//4}f", payload)
                if all(-1e6 < f < 1e6 and f == f for f in floats):
                    print(f"  floats  : {[round(f, 4) for f in floats]}")

    print(f"\n{'=' * 60}")
    print(f"XBee API frames found: {count}")

    if count == 0:
        print("\nNo 0x7E start bytes detected.")
        print("The module is probably in AT/transparent mode (AP=0).")
        printable = sum(1 for b in data if 0x20 <= b <= 0x7E)
        if printable > len(data) * 0.6:
            print("Data looks like ASCII — drone payload passes through directly:")
            print(repr(data[:300].decode("ascii", errors="replace")))
        else:
            print("Data is binary — drone is sending a binary struct protocol.")
            print(f"First 64 bytes: {data[:64].hex()}")
            # Check for common patterns: NaN floats = 0x7FC00000 (le: 00 00 C0 7F)
            nan_count = data.count(b'\x00\x00\xc0\x7f')
            if nan_count:
                print(f"Found {nan_count}× little-endian NaN (unset float fields) — likely a C struct.")


print(f"Reading {READ_BYTES} bytes from {PORT} @ {BAUD} baud ...")
with serial.Serial(PORT, BAUD, timeout=5) as s:
    raw = s.read(READ_BYTES)

print(f"Captured {len(raw)} bytes\n")
parse_xbee_frames(raw)
