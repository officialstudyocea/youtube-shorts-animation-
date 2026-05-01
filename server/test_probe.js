const { probeVideo } = require('./services/ffmpegService');

async function check() {
  const meta = await probeVideo('outputs/short_0de2a52e-3300-4646-bfe6-cb14c04669a2.mp4');
  console.log(JSON.stringify(meta.streams[0], null, 2));
}

check().catch(console.error);
