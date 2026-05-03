const { processVideo } = require('./services/ffmpegService');
const fs = require('fs');

async function test() {
  // Let's create a dummy 10-second video first
  const { execSync } = require('child_process');
  execSync('npx ffmpeg -y -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 test_input.mp4');

  try {
    await processVideo({
      inputPath: 'test_input.mp4',
      outputPath: 'test_output.mp4',
      startTime: 0,
      duration: 5,
      aspectRatio: '9:16'
    });
    console.log('Success! Probe output:');
    execSync('npx ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 test_output.mp4', { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed:', err.message);
  }
}
test();
