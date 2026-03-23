#!/bin/sh

LOG_DIR="/app/logs"

# Usuń codziennie bot-combined.log
> "$LOG_DIR/bot-combined.log"

# Usuń bot-error.log starsze niż 180 dni
find "$LOG_DIR" -name "bot-error.log" -type f -mtime +180 -exec rm -f {} \;