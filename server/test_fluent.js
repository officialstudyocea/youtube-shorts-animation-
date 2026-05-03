const ffmpeg = require('fluent-ffmpeg');

let cmd = ffmpeg('input.mp4')
  .outputOptions([
    '-map 0:v:0',
    '-map 0:a:0?',
    '-preset fast'
  ])
  .videoFilters([
    "crop='ih*(9/16)':'ih'",
    "ass='sub.ass'"
  ])
  .output('output.mp4');

// We just want to see the command line args
cmd.on('start', (commandLine) => {
  console.log('Spawned Ffmpeg with command: ' + commandLine);
});

cmd.run();
