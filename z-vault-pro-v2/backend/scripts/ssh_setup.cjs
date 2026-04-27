const { Client } = require('ssh2');

for (const key of ['VPS_HOST', 'VPS_USER', 'VPS_PASSWORD']) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const conn = new Client();
conn.on('ready', () => {
  console.log('Client :: ready');
  conn.exec(`
    apt update && apt upgrade -y
    apt install -y curl git nginx ufw
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt install -y nodejs
    npm install -g pm2
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    ufw --force enable
    mkdir -p /var/www
    cd /var/www
    if [ ! -d "trx" ]; then
      git clone https://github.com/ameennm/trx.git
    else
      cd trx
      git pull
    fi
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
  host: process.env.VPS_HOST,
  port: Number(process.env.VPS_PORT || 22),
  username: process.env.VPS_USER,
  password: process.env.VPS_PASSWORD
});
