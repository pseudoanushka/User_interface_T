import serial

PORT = "COM11"

for baud in [9600, 19200, 38400, 57600, 115200]:
    try:
        s = serial.Serial(PORT, baud, timeout=2)
        line = s.readline()
        s.close()
        print(f"{baud:>7}: {line!r}")
    except Exception as e:
        print(f"{baud:>7}: ERROR {e}")
