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
  conn.exec(`sed -i "s/RELAYER_TRX_BUFFER=.*/RELAYER_TRX_BUFFER=10/" /var/www/trx/z-vault-pro-v2/backend/.env && pm2 restart z-vault-backend`, (err, stream) => {
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
