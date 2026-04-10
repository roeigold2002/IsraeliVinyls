#!/usr/bin/env python3
"""
Launch Electron app with diagnostic output
"""

import subprocess
import time
import sys
import os

# Change to project directory
os.chdir(r"e:\Code\Project V")

print("\n" + "=" * 70)
print("LAUNCHING VINYL STORE ELECTRON APP")
print("=" * 70 + "\n")

# Launch the app
exe_path = r"e:\Code\Project V\dist\win-unpacked\Vinyl Store.exe"

print(f"Launching: {exe_path}\n")

try:
    # Launch app
    process = subprocess.Popen(
        [exe_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Give it time to start Flask
    print("Waiting 8 seconds for app to start Flask...")
    time.sleep(8)
    
    # Read any output
    try:
        stdout, stderr = process.communicate(timeout=1)
        if stdout:
            print(f"\nStdout:\n{stdout}")
        if stderr:
            print(f"\nStderr:\n{stderr}")
    except:
        pass
    
    # Check if process is running
    if process.poll() is None:
        print("✅ App is running (process still active)")
        process.terminate()
    else:
        print(f"❌ App not running (exit code: {process.returncode})")
        
except Exception as e:
    print(f"❌ Error launching app: {e}")

print("\n" + "=" * 70 + "\n")
