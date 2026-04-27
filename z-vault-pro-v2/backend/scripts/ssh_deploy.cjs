const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(`
    cd /var/www/trx/z-vault-pro-v2/backend
    npm install
    
    cat << 'EOF' > .env
PORT=8787
FRONTEND_ORIGIN=https://z-vault-pro-v2.pages.dev
DATABASE_PATH=./data/zvault.sqlite

NETWORK=mainnet
ENERGY_PROVIDER_MODE=netts

TRONGRID_RPC_URL=https://api.trongrid.io
TRONGRID_API_KEY=

NETTS_API_URL=https://netts.io/apiv2
NETTS_API_KEY=

RELAYER_PRIVATE_KEY=
RELAYER_ADDRESS=
RELAYER_CONTRACT=

USDT_CONTRACT=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TREASURY_ADDRESS=

PLATFORM_FEE_USDT=1.20
FIRST_SEND_FEE_USDT=3.00
RELAYER_TRX_BUFFER=500
EOF

    mkdir -p data
    npm run build
    
    pm2 delete z-vault-backend || true
    pm2 start dist/index.js --name z-vault-backend
    pm2 save
    pm2 startup
    
    cat << 'EOF' > /etc/nginx/sites-available/z-vault-backend
server {
    listen 80;
    server_name srv1616790.hstgr.cloud;

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
    nginx -t && systemctl reload nginx
    
    apt install -y certbot python3-certbot-nginx
    certbot --nginx -d srv1616790.hstgr.cloud --non-interactive --agree-tos -m ameennm71@gmail.com || true

  `, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).connect({
  host: '187.127.156.137',
  port: 22,
  username: 'root',
  password: 'Ameen@2026@Zpruners'
});
