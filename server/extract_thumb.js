const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

ffmpeg('outputs/short_0de2a52e-3300-4646-bfe6-cb14c04669a2.mp4')
  .screenshots({
    timestamps: ['50%'],
    filename: 'test_thumb.png',
    folder: __dirname
  })
  .on('end', () => console.log('Thumbnail extracted!'))
  .on('error', err => console.error('Error:', err));
