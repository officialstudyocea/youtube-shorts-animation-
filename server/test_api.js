const http = require('http');

http.get('http://localhost:5000/api/result/80f59d2b-cb16-423e-b4fc-50ef03135ef4', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
  });
}).on('error', console.error);
