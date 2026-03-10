#!/bin/bash
# =============================================================================
# PieChat — Create Test Users Script
# =============================================================================
# Run this on the server after deployment to create test accounts.
#
# Usage:
#   chmod +x deploy/create-users.sh
#   sudo ./deploy/create-users.sh
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[PieChat]${NC} $1"; }

PROJECT_DIR="/opt/piechat"
cd "$PROJECT_DIR"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════"
echo "║  PieChat — Create Test Users"
echo "╚═══════════════════════════════════════════════════════"
echo -e "${NC}"

# Default test users
USERS=(
    "admin:Admin@2026"
    "testuser1:Pass@12345"
    "testuser2:Pass@12345"
    "testuser3:Pass@12345"
)

read -rp "Create default test users? (y/n): " CREATE_DEFAULT

if [ "$CREATE_DEFAULT" = "y" ] || [ "$CREATE_DEFAULT" = "Y" ]; then
    for user_pass in "${USERS[@]}"; do
        USERNAME="${user_pass%%:*}"
        PASSWORD="${user_pass##*:}"
        
        log "Creating user: $USERNAME"
        docker compose exec -T dendrite /usr/bin/create-account \
            -config /etc/dendrite/dendrite.yaml \
            -username "$USERNAME" \
            -password "$PASSWORD" 2>/dev/null || \
            echo "  (user may already exist)"
    done
    
    echo ""
    log "Test users created:"
    for user_pass in "${USERS[@]}"; do
        USERNAME="${user_pass%%:*}"
        PASSWORD="${user_pass##*:}"
        echo "  @${USERNAME} / ${PASSWORD}"
    done
fi

echo ""
read -rp "Create a custom user? (y/n): " CREATE_CUSTOM

while [ "$CREATE_CUSTOM" = "y" ] || [ "$CREATE_CUSTOM" = "Y" ]; do
    read -rp "  Username: " CUSTOM_USER
    read -rsp "  Password: " CUSTOM_PASS
    echo ""
    
    docker compose exec -T dendrite /usr/bin/create-account \
        -config /etc/dendrite/dendrite.yaml \
        -username "$CUSTOM_USER" \
        -password "$CUSTOM_PASS"
    
    log "User @${CUSTOM_USER} created!"
    read -rp "Create another user? (y/n): " CREATE_CUSTOM
done

echo ""
log "Done! Users can now login at your PieChat instance."
