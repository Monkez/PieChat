#!/bin/bash
# PieChat Deploy Script — Auto-prune Docker after build
set -e

cd /opt/piechat

echo "=== Pulling latest code ==="
sudo git pull

echo "=== Building containers ==="
sudo docker compose build --no-cache auth-service frontend

echo "=== Restarting services ==="
sudo docker compose up -d auth-service frontend

echo "=== Cleaning up Docker garbage ==="
sudo docker image prune -f
sudo docker builder prune -f --filter "until=1h"

echo "=== Disk usage after deploy ==="
df -h /

echo "=== Done! ==="
