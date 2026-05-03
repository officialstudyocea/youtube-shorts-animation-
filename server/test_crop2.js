const { processVideo } = require('./services/ffmpegService');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

async function createDummy() {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('testsrc=duration=5:size=1920x1080:rate=30')
      .inputFormat('lavfi')
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt yuv420p'])
      .save('test_input.mp4')
      .on('end', resolve)
      .on('error', reject);
  });
}

async function test() {
  try {
    console.log('Creating dummy...');
    await createDummy();
    console.log('Processing...');
    await processVideo({
      inputPath: 'test_input.mp4',
      outputPath: 'test_output.mp4',
      startTime: 0,
      duration: 3,
      aspectRatio: '9:16'
    });
    console.log('Success!');
    const stat = fs.statSync('test_output.mp4');
    console.log('Output size:', stat.size);
  } catch (err) {
    console.error('Failed:', err.message);
  }
}
test();
