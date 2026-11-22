const http = require('http');
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url === '/') return res.end('<html><body><script>null.user</script></body></html>');
  if (req.url === '/api') { res.statusCode = 500; return res.end('boom'); }
  res.statusCode = 404; res.end('nf');
}).listen(process.env.PORT);
