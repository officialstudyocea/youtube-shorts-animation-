const { probeVideo } = require('./services/ffmpegService');

async function check() {
  const meta = await probeVideo('outputs/short_80f59d2b-cb16-423e-b4fc-50ef03135ef4_c2.mp4');
  console.log(JSON.stringify(meta.streams[0], null, 2));
}

check().catch(console.error);
