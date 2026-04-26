#!/bin/bash
# Z-Vault Pro — VPS Proxy Setup Script
# Run this on your Hostinger VPS after SSH-ing in:
#   ssh root@187.127.156.137
#   bash <(curl -s https://raw.githubusercontent.com/yourrepo/z-vault-pro/main/vps-proxy/setup.sh)
#
# Or copy-paste each section manually.

set -e

echo "=== Z-Vault Pro VPS Proxy Setup ==="

# ─── 1. Install Node.js (if not already) ────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "[1/6] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  echo "[1/6] Node.js already installed: $(node --version)"
fi

# ─── 2. Install PM2 for process management ──────────────────────────────────
echo "[2/6] Installing PM2..."
npm install -g pm2

# ─── 3. Create proxy directory ──────────────────────────────────────────────
echo "[3/6] Setting up /opt/zvault-proxy..."
mkdir -p /opt/zvault-proxy
cd /opt/zvault-proxy

# Copy server.js here manually, or use the file from your repo
# scp vps-proxy/server.js root@187.127.156.137:/opt/zvault-proxy/

# ─── 4. Install dependencies ────────────────────────────────────────────────
echo "[4/6] Installing dependencies..."
npm install express

# ─── 5. Create .env ─────────────────────────────────────────────────────────
echo "[5/6] Creating .env..."
cat > /opt/zvault-proxy/.env << 'EOF'
# CHANGE THESE VALUES:
VPS_SHARED_SECRET=REPLACE_WITH_YOUR_SECRET_32CHARS_MIN
NETTS_API_URL=https://netts.io/apiv2
PORT=3000
EOF

echo ""
echo ">>> IMPORTANT: Edit /opt/zvault-proxy/.env and set VPS_SHARED_SECRET to"
echo ">>> a strong random string (32+ chars). Use the same value in Cloudflare secrets."
echo ""

# ─── 6. Start with PM2 ──────────────────────────────────────────────────────
echo "[6/6] Starting proxy with PM2..."
# Load .env into environment before starting
export $(cat /opt/zvault-proxy/.env | grep -v '^#' | xargs)
pm2 start /opt/zvault-proxy/server.js --name zvault-proxy
pm2 save
pm2 startup

echo ""
echo "=== Proxy running on port 3000 ==="
echo ""
echo "Next steps:"
echo "  1. Point a domain to this VPS IP (187.127.156.137)"
echo "     e.g. api.yourdomain.com → 187.127.156.137 (A record in DNS)"
echo ""
echo "  2. Install Nginx + SSL:"
echo "     apt install nginx certbot python3-certbot-nginx -y"
echo "     certbot --nginx -d api.yourdomain.com"
echo ""
echo "  3. Set up Nginx reverse proxy to port 3000:"
echo "     See nginx.conf.example in vps-proxy/"
echo ""
echo "  4. Register the VPS IP with Netts.io:"
echo "     Dashboard → API Settings → IP Whitelist → Add 187.127.156.137"
echo ""
echo "  5. Set Cloudflare Worker secrets:"
echo "     wrangler secret put VPS_PROXY_URL"
echo "     # Enter: https://api.yourdomain.com/rent"
echo "     wrangler secret put VPS_SHARED_SECRET"
echo "     # Enter: (same as .env VPS_SHARED_SECRET)"
