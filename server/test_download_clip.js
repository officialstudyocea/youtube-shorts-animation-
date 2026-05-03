const http = require('http');

http.get('http://localhost:5000/api/download/80f59d2b-cb16-423e-b4fc-50ef03135ef4?clip=0', (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', res.headers);
  let size = 0;
  res.on('data', chunk => size += chunk.length);
  res.on('end', () => console.log('Downloaded size:', size));
});
