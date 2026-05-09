#!/bin/bash

# Configuration
SOURCE_DIR="$HOME/flock-cli"
BACKUP_DIR="$HOME/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/flock-cli_backup_$TIMESTAMP.tar.gz"

# Create backup
echo "Starting backup of $SOURCE_DIR to $BACKUP_FILE..."
tar -czf "$BACKUP_FILE" -C "$HOME" flock-cli

# Verify success
if [ $? -eq 0 ]; then
    echo "Backup successful: $BACKUP_FILE"
    # Optional: Keep only the last 24 backups (1 day of hourly backups)
    ls -dt $BACKUP_DIR/flock-cli_backup_*.tar.gz | tail -n +25 | xargs -r rm
else
    echo "Backup failed!"
    exit 1
fi
