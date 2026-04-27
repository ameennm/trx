const { Client } = require('ssh2');

const required = [
  'VPS_HOST',
  'VPS_USER',
  'VPS_PASSWORD',
  'API_DOMAIN',
  'FRONTEND_ORIGIN',
  'TRONGRID_API_KEY',
  'NETTS_API_KEY',
  'NETTS_REAL_IP',
  'RELAYER_PRIVATE_KEY',
  'RELAYER_ADDRESS',
  'RELAYER_CONTRACT',
  'TREASURY_ADDRESS'
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const conn = new Client();
const apiDomain = process.env.API_DOMAIN;

conn.on('ready', () => {
  console.log('SSH connected. Deploying Z-Vault backend...');
  conn.exec(`
    set -e
    apt update
    apt install -y curl git nginx certbot python3-certbot-nginx

    if ! command -v node >/dev/null 2>&1; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
      apt install -y nodejs
    fi

    npm install -g pm2

    mkdir -p /var/www/trx
    cd /var/www/trx
    if [ ! -d z-vault-pro-v2 ]; then
      echo "Repository folder missing. Clone the repo into /var/www/trx/z-vault-pro-v2 first."
      exit 1
    fi

    cd z-vault-pro-v2
    git pull || true
    npm install

    cd backend
    mkdir -p data
    cat << 'EOF' > .env
PORT=8787
FRONTEND_ORIGIN=${process.env.FRONTEND_ORIGIN}
DATABASE_PATH=./data/zvault.sqlite

NETWORK=mainnet
ENERGY_PROVIDER_MODE=netts

TRONGRID_RPC_URL=https://api.trongrid.io
TRONGRID_API_KEY=${process.env.TRONGRID_API_KEY}

NETTS_API_URL=https://netts.io/apiv2
NETTS_API_KEY=${process.env.NETTS_API_KEY}
NETTS_REAL_IP=${process.env.NETTS_REAL_IP}

RELAYER_PRIVATE_KEY=${process.env.RELAYER_PRIVATE_KEY}
RELAYER_ADDRESS=${process.env.RELAYER_ADDRESS}
RELAYER_CONTRACT=${process.env.RELAYER_CONTRACT}

USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TREASURY_ADDRESS=${process.env.TREASURY_ADDRESS}

PLATFORM_FEE_USDT=1.20
FIRST_SEND_FEE_USDT=3.00
RELAYER_TRX_BUFFER=10
EOF

    cd ..
    npm run build --workspace backend

    pm2 delete z-vault-backend || true
    pm2 start backend/dist/index.js --name z-vault-backend
    pm2 save

    cat << 'EOF' > /etc/nginx/sites-available/z-vault-backend
server {
    listen 80;
    server_name ${apiDomain};

    client_max_body_size 1m;

    location /api/ {
        proxy_pass http://127.0.0.1:8787/api/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/z-vault-backend /etc/nginx/sites-enabled/
    nginx -t
    systemctl reload nginx

    certbot --nginx -d ${apiDomain} --non-interactive --agree-tos -m ${process.env.CERTBOT_EMAIL || 'admin@example.com'} || true

    curl -f http://127.0.0.1:8787/api/health
  `, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code) => {
      console.log(`Deploy finished with code ${code}`);
      conn.end();
      process.exit(code || 0);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).connect({
  host: process.env.VPS_HOST,
  port: Number(process.env.VPS_PORT || 22),
  username: process.env.VPS_USER,
  password: process.env.VPS_PASSWORD
});
