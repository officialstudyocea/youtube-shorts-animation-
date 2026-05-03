const mongoose = require('mongoose');
const Video = require('./models/Video');

mongoose.connect('mongodb://localhost:27017/shorts-automation').then(async () => {
  const latest = await Video.findOne().sort({ createdAt: -1 });
  console.log(JSON.stringify(latest, null, 2));
  process.exit(0);
});
