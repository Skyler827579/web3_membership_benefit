#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/chainpulse}"
REPO_URL="${REPO_URL:-https://github.com/Skyler827579/web3_membership_benefit.git}"
DOMAIN="${DOMAIN:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-change-this-password}"
WECHAT_QR_PATH="${WECHAT_QR_PATH:-/assets/wechat-qr-placeholder.svg}"

if [ "$(id -u)" -ne 0 ]; then
  echo "请用 root 执行，或使用 sudo bash scripts/vps_install_ubuntu.sh"
  exit 1
fi

apt update
apt install -y curl git nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi

npm install -g pm2

mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
npm install --omit=dev

cat > .env <<EOF
HOST=127.0.0.1
PORT=4173
ADMIN_PASSWORD=${ADMIN_PASSWORD}
WECHAT_QR_PATH=${WECHAT_QR_PATH}
EOF

pm2 delete chainpulse >/dev/null 2>&1 || true
pm2 start server.js --name chainpulse --update-env --env production
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

if [ -n "$DOMAIN" ]; then
  cat > /etc/nginx/sites-available/chainpulse <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/chainpulse /etc/nginx/sites-enabled/chainpulse
  nginx -t
  systemctl reload nginx
fi

echo "ChainPulse 已部署。"
if [ -n "$DOMAIN" ]; then
  echo "访问：http://${DOMAIN}"
else
  echo "访问：http://服务器IP"
fi
