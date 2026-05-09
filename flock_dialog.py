#!/usr/bin/env python3

import subprocess
import os
import sys

FLOCK_PATH = os.path.expanduser("~/flock-cli/flock")

def show_dialog():
    """Show a popup dialog for voice command input"""
    try:
        # Use termux-dialog to get text input
        result = subprocess.run(
            ["termux-dialog", "text", "-t", "Flock Voice", "-p", "Say your command:"],
            capture_output=True, text=True
        )
        
        import json
        data = json.loads(result.stdout)
        
        if data['code'] == 0 and 'text' in data:
            return data['text'].lower()
        return None
    except Exception as e:
        print(f"❌ Dialog error: {e}")
        return None

def execute_flock_command(command_text):
    """Execute the flock command"""
    if not command_text:
        print("❌ No command to execute")
        return False
    
    print(f"⚡ Executing: '{command_text}'")
    
    if "run backup" in command_text:
        flock_cmd = f"{FLOCK_PATH} run #SCRIPT '~/flock-cli/scripts/backup-flock.sh'"
    elif "status" in command_text:
        flock_cmd = f"{FLOCK_PATH} status"
    elif "tags" in command_text:
        flock_cmd = f"{FLOCK_PATH} tag"
    else:
        flock_cmd = f"{FLOCK_PATH} run #VOICE '{command_text}'"
    
    try:
        result = subprocess.run(flock_cmd, shell=True, capture_output=True, text=True)
        print(f"✅ Output: {result.stdout}")
        return True
    except Exception as e:
        print(f"❌ Execution failed: {e}")
        return False

def main():
    print("🎤 Flock Voice Dialog Mode")
    print("Press Ctrl+C to exit")
    
    while True:
        print("\n🟢 Waiting for voice command (dialog will pop up)...")
        command = show_dialog()
        
        if command:
            print(f"📝 Received: '{command}'")
            execute_flock_command(command)
        else:
            print("⏳ No input received")
        
        import time
        time.sleep(1)

if __name__ == "__main__":
    main()
