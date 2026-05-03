const http = require('http');

http.get('http://localhost:5000/api/download/0de2a52e-3300-4646-bfe6-cb14c04669a2', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let size = 0;
  res.on('data', chunk => { size += chunk.length; });
  res.on('end', () => {
    console.log('Total bytes received:', size);
  });
}).on('error', err => {
  console.error('Error:', err.message);
});
