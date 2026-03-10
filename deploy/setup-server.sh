#!/bin/bash
# =============================================================================
# PieChat — Oracle Cloud Deploy Script
# =============================================================================
# This script automates the full deployment of PieChat on an Oracle Cloud
# Free Tier ARM instance (or any Ubuntu/Debian VPS).
#
# Prerequisites:
#   - Fresh Ubuntu 22.04+ instance
#   - SSH access as root or user with sudo
#   - Domain pointed to the server's public IP
#
# Usage:
#   chmod +x deploy/setup-server.sh
#   sudo ./deploy/setup-server.sh
# =============================================================================

set -euo pipefail

# ─── Colors ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No color

log() { echo -e "${GREEN}[PieChat]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Check root ─────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    error "Please run as root: sudo ./deploy/setup-server.sh"
fi

# ─── Prompt for configuration ──────────────────────────────────────────────
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           PieChat — Server Setup Wizard                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

read -rp "Enter your domain (e.g., chat.example.com): " DOMAIN
read -rp "Enter your email (for SSL certificate): " SSL_EMAIL
read -rp "Enter registration secret (leave empty for auto-generate): " REG_SECRET

if [ -z "$REG_SECRET" ]; then
    REG_SECRET=$(openssl rand -hex 32)
    log "Generated registration secret: $REG_SECRET"
fi

read -rp "Enter dev password for testing (leave empty to skip): " DEV_PASSWORD
DEV_PASSWORD=${DEV_PASSWORD:-""}

# ─── Step 1: System Update & Dependencies ──────────────────────────────────
log "Step 1/7: Updating system and installing dependencies..."
apt-get update -y
apt-get upgrade -y
apt-get install -y \
    curl wget git \
    ca-certificates gnupg lsb-release \
    ufw

# ─── Step 2: Install Docker ────────────────────────────────────────────────
log "Step 2/7: Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "Docker installed successfully"
else
    log "Docker already installed"
fi

# Install Docker Compose plugin if not available
if ! docker compose version &>/dev/null; then
    apt-get install -y docker-compose-plugin
fi

# ─── Step 3: Firewall ──────────────────────────────────────────────────────
log "Step 3/7: Configuring firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
log "Firewall configured (SSH, HTTP, HTTPS)"

# ─── Step 4: Clone/Update Project ──────────────────────────────────────────
log "Step 4/7: Setting up project directory..."
PROJECT_DIR="/opt/piechat"
if [ -d "$PROJECT_DIR" ]; then
    warn "Project directory exists. Pulling latest changes..."
    cd "$PROJECT_DIR"
    git pull || warn "Git pull failed, using existing files"
else
    read -rp "Enter Git repository URL (or leave empty to copy manually): " GIT_REPO
    if [ -n "$GIT_REPO" ]; then
        git clone "$GIT_REPO" "$PROJECT_DIR"
    else
        mkdir -p "$PROJECT_DIR"
        warn "Please copy project files to $PROJECT_DIR manually"
        warn "Then re-run this script"
        exit 0
    fi
fi
cd "$PROJECT_DIR"

# ─── Step 5: Generate Configuration ────────────────────────────────────────
log "Step 5/7: Generating configuration files..."

# Create .env file
cat > "$PROJECT_DIR/.env" <<EOF
DOMAIN=${DOMAIN}
MATRIX_SERVER_NAME=${DOMAIN}
SSL_EMAIL=${SSL_EMAIL}
REGISTRATION_SHARED_SECRET=${REG_SECRET}
CORS_ORIGINS=https://${DOMAIN}
DEV_MATRIX_PASSWORD=${DEV_PASSWORD}
EOF
log ".env file created"

# Generate Dendrite config from template
cp deploy/dendrite-production.yaml deploy/dendrite-runtime.yaml
sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" deploy/dendrite-runtime.yaml
sed -i "s/REGISTRATION_SECRET/${REG_SECRET}/g" deploy/dendrite-runtime.yaml
log "Dendrite config generated"

# Update Nginx config
cp deploy/nginx/conf.d/piechat.conf deploy/nginx/conf.d/piechat.conf.bak
sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" deploy/nginx/conf.d/piechat.conf
log "Nginx config updated with domain: ${DOMAIN}"

# ─── Step 6: Initialize Dendrite ────────────────────────────────────────────
log "Step 6/7: Initializing Dendrite..."

# Create dendrite config volume and copy config
DENDRITE_VOL="piechat_dendrite-config"
docker volume create $DENDRITE_VOL 2>/dev/null || true

# Build Dendrite image first to get the generate-keys binary
docker compose build dendrite

# Generate Matrix signing keys
docker compose run --rm dendrite /usr/bin/generate-keys --private-key /etc/dendrite/matrix_key.pem
log "Matrix signing keys generated"

# Copy the production config into the volume
docker compose run --rm -v "$PROJECT_DIR/deploy/dendrite-runtime.yaml:/tmp/dendrite.yaml:ro" \
    dendrite sh -c "cp /tmp/dendrite.yaml /etc/dendrite/dendrite.yaml"
log "Dendrite config copied to volume"

# ─── Step 7: SSL Certificate & Launch ──────────────────────────────────────
log "Step 7/7: Setting up SSL and launching services..."

# First, start nginx with HTTP only to get SSL cert
# Create a temporary nginx config for ACME challenge
mkdir -p deploy/nginx/conf.d
cat > deploy/nginx/conf.d/piechat-init.conf <<'INITEOF'
server {
    listen 80;
    server_name _;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'PieChat is setting up SSL...';
        add_header Content-Type text/plain;
    }
}
INITEOF

# Temporarily rename production conf
mv deploy/nginx/conf.d/piechat.conf deploy/nginx/conf.d/piechat.conf.ssl
mv deploy/nginx/conf.d/piechat-init.conf deploy/nginx/conf.d/piechat.conf

# Start nginx for ACME challenge
docker compose up -d nginx

# Request SSL certificate
log "Requesting SSL certificate for ${DOMAIN}..."
sleep 3
docker compose run --rm certbot certbot certonly \
    --webroot -w /var/www/certbot \
    --email "$SSL_EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

if [ $? -eq 0 ]; then
    log "SSL certificate obtained successfully!"
else
    error "Failed to obtain SSL certificate. Make sure your domain points to this server."
fi

# Restore production nginx config
docker compose down nginx
mv deploy/nginx/conf.d/piechat.conf.ssl deploy/nginx/conf.d/piechat.conf

# ─── Launch Everything ──────────────────────────────────────────────────────
log "Launching all services..."
docker compose up -d --build

# Wait for services to start
log "Waiting for services to start..."
sleep 10

# Health check
if curl -sf "http://localhost:8008/_matrix/client/versions" > /dev/null 2>&1; then
    log "Dendrite is running ✓"
else
    warn "Dendrite may still be starting up..."
fi

if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
    log "Frontend is running ✓"
else
    warn "Frontend may still be starting up..."
fi

# ─── Done ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           PieChat Deployment Complete! 🎉                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Web App:${NC}     https://${DOMAIN}"
echo -e "  ${BLUE}Matrix API:${NC}  https://${DOMAIN}/_matrix/client/versions"
echo -e "  ${BLUE}Auth API:${NC}    https://${DOMAIN}/auth/health"
echo ""
echo -e "  ${YELLOW}Registration Secret:${NC} ${REG_SECRET}"
echo ""
echo -e "  ${BLUE}Create test users:${NC}"
echo "    docker compose exec dendrite /usr/bin/create-account -config /etc/dendrite/dendrite.yaml -username testuser -password TestPass123"
echo ""
echo -e "  ${BLUE}View logs:${NC}"
echo "    docker compose logs -f"
echo ""
echo -e "  ${BLUE}Stop services:${NC}"
echo "    docker compose down"
echo ""
