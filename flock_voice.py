#!/usr/bin/env python3

import speech_recognition as sr
import subprocess
import os
import time
import sys

# Configuration
FLOCK_PATH = os.path.expanduser("~/flock-cli/flock")
WAKE_WORDS = ["hey flock", "hey flok", "hey flock", "flock"]  # Handles variations
LISTEN_TIMEOUT = 3   # Seconds to listen after wake word
SILENCE_DURATION = 1 # Seconds of silence to stop listening

class FlockVoice:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone()
        self.running = True
        
        # Calibrate microphone
        print("🎤 Calibrating microphone... speak normally")
        with self.microphone as source:
            self.recognizer.adjust_for_ambient_noise(source, duration=2)
        print("✅ Microphone calibrated")

    def listen_for_wake_word(self):
        """Listen continuously until wake word is detected"""
        with self.microphone as source:
            while self.running:
                try:
                    # Listen with timeout to prevent blocking forever
                    audio = self.recognizer.listen(source, timeout=1, phrase_time_limit=2)
                    text = self.recognizer.recognize_google(audio).lower()
                    
                    for word in WAKE_WORDS:
                        if word in text:
                            print(f"🔥 Wake word detected: '{text}'")
                            return True
                            
                except sr.WaitTimeoutError:
                    continue
                except sr.UnknownValueError:
                    continue
                except sr.RequestError as e:
                    print(f"❌ Recognition API error: {e}")
                    time.sleep(5)  # Wait before retry
                except Exception as e:
                    print(f"⚠️ Error: {e}")
                    time.sleep(2)
        return False

    def listen_for_command(self):
        """Listen for command after wake word"""
        print("🎤 Listening for command...")
        
        with self.microphone as source:
            try:
                # Listen for command with timeout
                audio = self.recognizer.listen(source, timeout=LISTEN_TIMEOUT, phrase_time_limit=5)
                command = self.recognizer.recognize_google(audio)
                print(f"📝 Command recognized: '{command}'")
                return command
            except sr.WaitTimeoutError:
                print("⏱️ No command detected (timeout)")
                return None
            except sr.UnknownValueError:
                print("❓ Could not understand audio")
                return None
            except Exception as e:
                print(f"⚠️ Command error: {e}")
                return None

    def execute_flock_command(self, command_text):
        """Convert speech to flock command and execute"""
        # Clean up command
        cmd = command_text.lower().strip()
        
        # Handle special cases
        if "run backup" in cmd:
            flock_cmd = f"{FLOCK_PATH} run #SCRIPT '~/flock-cli/scripts/backup-flock.sh'"
        elif "run test" in cmd:
            flock_cmd = f"{FLOCK_PATH} run #UTIL 'echo \"Test command from voice\" > ~/flock-cli/voice_test.txt'"
        elif "status" in cmd or "check status" in cmd:
            flock_cmd = f"{FLOCK_PATH} status"
        elif "list tags" in cmd or "tags" in cmd:
            flock_cmd = f"{FLOCK_PATH} tag"
        elif "run" in cmd and len(cmd.split()) > 2:
            # Generic run: "run something"
            parts = cmd.split()
            command_body = " ".join(parts[1:])
            flock_cmd = f"{FLOCK_PATH} run #MISC '{command_body}'"
        else:
            # Try direct execution
            flock_cmd = f"{FLOCK_PATH} run #VOICE '{cmd}'"
        
        print(f"⚡ Executing: {flock_cmd}")
        try:
            result = subprocess.run(flock_cmd, shell=True, capture_output=True, text=True)
            print(f"✅ Output: {result.stdout}")
            if result.stderr:
                print(f"⚠️ Errors: {result.stderr}")
            return True
        except Exception as e:
            print(f"❌ Execution failed: {e}")
            return False

    def run(self):
        print("🎙️ Flock Voice Assistant started")
        print("Say 'Hey Flock' to activate")
        
        try:
            while self.running:
                if self.listen_for_wake_word():
                    command = self.listen_for_command()
                    if command:
                        self.execute_flock_command(command)
                    else:
                        print("⌛ No command, returning to standby")
                time.sleep(0.5)
        except KeyboardInterrupt:
            print("\n👋 Shutting down...")
        except Exception as e:
            print(f"💥 Fatal error: {e}")

if __name__ == "__main__":
    voice = FlockVoice()
    voice.run()
