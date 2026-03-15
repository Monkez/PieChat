#!/bin/bash
# PieChat Deploy Script v2.1 — Auto-prune Docker after build
set -e

DEPLOY_DIR="/opt/piechat"
LOG_FILE="/var/log/piechat-deploy.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] PieChat Deploy Started" | tee -a "$LOG_FILE"

cd "$DEPLOY_DIR"

echo "=== Pulling latest code ==="
sudo git pull 2>&1 | tee -a "$LOG_FILE"

echo "=== Building containers ==="
sudo docker compose build --no-cache auth-service frontend 2>&1 | tee -a "$LOG_FILE"

echo "=== Restarting services ==="
sudo docker compose up -d auth-service frontend 2>&1 | tee -a "$LOG_FILE"

echo "=== Verifying services ==="
sleep 5
sudo docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>&1 | tee -a "$LOG_FILE"

echo "=== Cleaning up Docker garbage ==="
sudo docker image prune -f 2>&1 | tee -a "$LOG_FILE"
sudo docker builder prune -f --filter "until=1h" 2>&1 | tee -a "$LOG_FILE"

echo "=== Disk usage after deploy ==="
df -h / 2>&1 | tee -a "$LOG_FILE"

echo "[$DATE] PieChat Deploy Completed Successfully ✅" | tee -a "$LOG_FILE"
