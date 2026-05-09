import os
import time
import subprocess
import signal
import logging
import re
from pathlib import Path

# Paths
BASE_DIR = Path.home() / "flock-cli"
PID_FILE = BASE_DIR / ".flock.pid"
COMMANDS_DIR = BASE_DIR / "commands"
BACKUP_SCRIPT = BASE_DIR / "scripts" / "backup-flock.sh"
KNOWLEDGE_SCRIPT = BASE_DIR / "flock_knowledge.py"
EXECUTED_LOG = BASE_DIR / "executed.log"
ERRORS_LOG = BASE_DIR / "errors.log"

# Logging Setup
def setup_logger(name, log_file, level=logging.INFO):
    handler = logging.FileHandler(log_file)
    handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger = logging.getLogger(name)
    logger.setLevel(level)
    logger.addHandler(handler)
    return logger

exec_logger = setup_logger('executed', EXECUTED_LOG)
error_logger = setup_logger('errors', ERRORS_LOG)

def is_process_running(pid):
    """Check if a process with the given PID is running."""
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True

def handle_process_monitoring():
    """Manages the PID file and ensures the backup script/task is 'active'."""
    try:
        if PID_FILE.exists():
            pid_str = PID_FILE.read_text().strip()
            if pid_str:
                pid = int(pid_str)
                if not is_process_running(pid):
                    error_logger.warning(f"Process {pid} found in PID file but is dead. Removing PID file.")
                    PID_FILE.unlink()
            else:
                PID_FILE.unlink()

        if not PID_FILE.exists():
            exec_logger.info("PID file missing. Restarting main backup task.")
            process = subprocess.Popen([str(BACKUP_SCRIPT)], 
                                     stdout=subprocess.PIPE, 
                                     stderr=subprocess.PIPE, 
                                     text=True)
            PID_FILE.write_text(str(process.pid))
            exec_logger.info(f"Started backup task with PID {process.pid}")
            
    except Exception as e:
        error_logger.error(f"Error in process monitoring: {str(e)}")

def infer_tag(command):
    """Infers the tag based on command content."""
    cmd_lower = command.lower()
    if any(x in cmd_lower for x in ["bash", ".sh"]):
        return "#SCRIPT"
    if any(x in cmd_lower for x in ["apt", "pkg", "install"]):
        return "#SYS"
    if any(x in cmd_lower for x in ["grep", "sed", "awk", "jq"]):
        return "#UTIL"
    if any(x in cmd_lower for x in ["cron", "systemd"]):
        return "#CONFIG"
    if any(x in cmd_lower for x in ["curl", "wget"]):
        return "#NETWORK"
    return "#MISC"

def process_command_files():
    """Checks for .cmd files and executes the command with tag processing."""
    try:
        if not COMMANDS_DIR.exists():
            return

        for cmd_file in COMMANDS_DIR.glob("*.cmd"):
            try:
                lines = cmd_file.read_text().splitlines()
                if not lines:
                    cmd_file.rename(cmd_file.with_suffix(".done"))
                    continue

                tag = None
                command = None

                # Check first line for #TAG:
                first_line = lines[0].strip()
                tag_match = re.match(r"^#TAG:\s*(\w+)", first_line)
                
                if tag_match:
                    tag = f"#{tag_match.group(1)}"
                    # Use second line as command if it exists
                    if len(lines) > 1:
                        command = lines[1].strip()
                else:
                    command = first_line
                    tag = infer_tag(command)

                if not command:
                    # In case of #TAG line but no command line
                    cmd_file.rename(cmd_file.with_suffix(".done"))
                    continue

                exec_logger.info(f"Executing command from {cmd_file.name} with tag {tag}: {command}")
                
                result = subprocess.run(command, shell=True, capture_output=True, text=True)
                
                output_str = ""
                if result.returncode == 0:
                    output_str = f"Success: {command} {tag}\nOutput: {result.stdout}"
                    exec_logger.info(output_str)
                else:
                    output_str = f"Command failed: {command} {tag}\nError: {result.stderr}"
                    error_logger.error(output_str)

                # Call flock_knowledge.py to store result
                # We append the tag to the log line so knowledge vault can pick it up
                # Or we can just call the vault directly. 
                # Since the vault daemon is already running and monitoring logs, 
                # ensuring the tag is in the log line is the most efficient way.
                # The log already contains the success/fail message.

                # Rename to .done
                cmd_file.rename(cmd_file.with_suffix(".done"))

            except Exception as e:
                error_logger.error(f"Failed to process {cmd_file.name}: {str(e)}")

    except Exception as e:
        error_logger.error(f"Error scanning commands directory: {str(e)}")

def main():
    exec_logger.info("Flock Guardian started.")
    while True:
        handle_process_monitoring()
        process_command_files()
        time.sleep(30)

if __name__ == "__main__":
    main()
