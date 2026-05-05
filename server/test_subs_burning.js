const { processVideo } = require('./services/ffmpegService');
const path = require('path');
const fs = require('fs');

async function test() {
  const input = path.join(__dirname, 'test_input.mp4');
  const output = path.join(__dirname, 'test_output_with_subs.mp4');
  const sub = path.join(__dirname, 'test_subs.ass');

  // Create a dummy subtitle file
  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,64,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Testing Subtitles
`;
  fs.writeFileSync(sub, assContent);

  console.log('Starting test...');
  try {
    await processVideo({
      inputPath: input,
      outputPath: output,
      subtitlePath: sub,
      duration: 5,
      subscribeButton: false
    });
    console.log('✅ Test successful!');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

test();
