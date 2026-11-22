const http = require('http');
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if (req.url === '/' || req.url === '/about') return res.end('<html><body><h1>ok ' + req.url + '</h1></body></html>');
  res.statusCode = 404; res.end('not found');
}).listen(process.env.PORT);
