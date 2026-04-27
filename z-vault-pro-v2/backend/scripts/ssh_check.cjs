const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('ls -la /var/www/trx', (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
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
