import subprocess

process1 = subprocess.Popen(["python","server.py"])
process2 = subprocess.Popen(["python","aruco_id0_rpi_webflask.py"])

print("Both backend files are running")

process1.communicate()
process2.communicate()