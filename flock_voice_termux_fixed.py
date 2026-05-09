#!/usr/bin/env python3

import subprocess
import os
import time
import json
import sys

FLOCK_PATH = os.path.expanduser("~/flock-cli/flock")
WAKE_WORDS = ["hey flock", "hey flok", "flock"]

class FlockVoiceTermux:
    def __init__(self):
        self.running = True
        print("🎤 Flock Voice (Termux Native) Started")
        print("Say 'Hey Flock' to activate")

    def listen_audio(self, timeout=3):
        """Use termux-microphone-record for audio capture"""
        audio_file = "/tmp/flock_voice.wav"
        
        # Remove old audio file
        if os.path.exists(audio_file):
            os.remove(audio_file)
        
        # Try multiple syntax variations
        # Variant 1: -f for file, -t for time
        commands = [
            ["termux-microphone-record", "-f", audio_file, "-t", str(timeout), "-l", "1"],
            ["termux-microphone-record", "-f", audio_file, "-d", str(timeout), "-l", "1"],
            ["termux-microphone-record", "-f", audio_file, "-s", str(timeout)],
            ["termux-microphone-record", audio_file, str(timeout)]
        ]
        
        for cmd in commands:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                # Check if file was created
                time.sleep(1)
                if os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
                    print(f"✅ Recorded using: {' '.join(cmd)}")
                    return audio_file
        
        # If all fail, try termux-recorder (alternative)
        try:
            import tempfile
            temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            alt_file = temp_file.name
            temp_file.close()
            
            # Try using termux-api directly
            result = subprocess.run(
                ["termux-api", "Microphone", "record", alt_file, str(timeout)],
                capture_output=True, text=True
            )
            if result.returncode == 0 and os.path.exists(alt_file):
                print(f"✅ Recorded using termux-api")
                return alt_file
        except:
            pass
            
        print("❌ All recording methods failed")
        return None

    def transcribe_audio(self, audio_file):
        """Use Google Speech API via curl"""
        if not audio_file or not os.path.exists(audio_file):
            return None
            
        try:
            # Convert to flac (Google API prefers flac)
            flac_file = "/tmp/flock_voice.flac"
            subprocess.run(["ffmpeg", "-i", audio_file, "-ac", "1", "-ar", "16000", flac_file, "-y"], 
                          capture_output=True, check=False)
            
            if not os.path.exists(flac_file):
                return None
                
            # Send to Google Speech API
            import requests
            
            with open(flac_file, 'rb') as f:
                audio_data = f.read()
            
            url = "https://www.google.com/speech-api/v1/recognize?client=chromium&lang=en-US"
            headers = {
                "Content-Type": "audio/x-flac; rate=16000;",
                "User-Agent": "Mozilla/5.0"
            }
            
            response = requests.post(url, headers=headers, data=audio_data)
            
            if response.status_code == 200:
                results = response.text.split('\n')
                for line in results:
                    if line.strip():
                        try:
                            data = json.loads(line)
                            if 'hypotheses' in data and len(data['hypotheses']) > 0:
                                return data['hypotheses'][0]['utterance'].lower()
                        except:
                            pass
            return None
            
        except Exception as e:
            print(f"❌ Transcription error: {e}")
            return None

    def check_wake_word(self, text):
        """Check if text contains wake word"""
        if text:
            text_lower = text.lower()
            for word in WAKE_WORDS:
                if word in text_lower:
                    return True
        return False

    def extract_command(self, text):
        """Extract command after wake word"""
        if not text:
            return None
        
        text_lower = text.lower()
        for word in WAKE_WORDS:
            if word in text_lower:
                parts = text_lower.split(word, 1)
                if len(parts) > 1:
                    return parts[1].strip()
        return None

    def execute_flock_command(self, command_text):
        """Execute the flock command"""
        if not command_text:
            print("❌ No command to execute")
            return False
        
        print(f"⚡ Executing: '{command_text}'")
        
        # Handle common commands
        if "run backup" in command_text:
            flock_cmd = f"{FLOCK_PATH} run #SCRIPT '~/flock-cli/scripts/backup-flock.sh'"
        elif "status" in command_text or "check status" in command_text:
            flock_cmd = f"{FLOCK_PATH} status"
        elif "list tags" in command_text or "tags" in command_text:
            flock_cmd = f"{FLOCK_PATH} tag"
        elif "run test" in command_text:
            flock_cmd = f"{FLOCK_PATH} run #UTIL 'echo \"Test from voice\" > ~/flock-cli/voice_test.txt'"
        else:
            flock_cmd = f"{FLOCK_PATH} run #VOICE '{command_text}'"
        
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
        """Main voice loop"""
        print("🎙️ Flock Voice Assistant (Termux Native) Ready")
        print("Say 'Hey Flock' then command")
        
        while self.running:
            print("\n🟢 Listening for wake word...")
            audio_file = self.listen_audio(timeout=3)
            
            if audio_file:
                print("🔴 Processing audio...")
                text = self.transcribe_audio(audio_file)
                
                if text:
                    print(f"📝 Heard: '{text}'")
                    
                    if self.check_wake_word(text):
                        print("🔥 Wake word detected!")
                        command = self.extract_command(text)
                        if command:
                            self.execute_flock_command(command)
                        else:
                            print("❌ No command detected in wake phrase")
                    else:
                        print("⏳ No wake word, waiting...")
                else:
                    print("❌ Could not transcribe audio")
                
                # Clean up
                if os.path.exists(audio_file):
                    os.remove(audio_file)
            else:
                print("⏳ No audio detected or recording failed...")

if __name__ == "__main__":
    voice = FlockVoiceTermux()
    voice.run()
