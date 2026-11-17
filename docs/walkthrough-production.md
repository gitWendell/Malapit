# Making the animated guide

The public guide is a 720 × 1280, 24 fps MP4. Its screens come from real browser interactions with the local app. Cursor motion, click pulses, quiet original click sounds and transitions are added during editing. Typing uses successive captures of the real form. This is an edited animated demonstration, not a claim of a continuous recording or a human narrator.

Use CUA for browser input and screen captures. Use only fictional local accounts and records. Keep test-account controls out of the captured screens, keep map attribution visible, and never record credentials, provider dashboards or live rental information. Remove only the fixtures created for the recording afterward. No messages or money transfers should be made.

`docs/walkthrough-scenes.json` contains the narration, chapter titles, owner/renter labels and short on-screen captions. An ignored capture directory supplies `capture.json`:

```json
{
  "width": 480,
  "height": 780,
  "scenes": {
    "map": [
      { "image": "map-browse.png", "hold": 2, "cursor": null, "click": false },
      { "image": "map-select.png", "hold": 1.5, "cursor": [138, 505], "click": true }
    ]
  }
}
```

Include each chapter ID from the script. `hold` is a relative duration; chapters expand to fit the narration. Cursor coordinates use the screenshot's top-left origin. Capture a target only when it is visible and unobstructed. A click pulse occurs just before the next state. Short successive captures preserve visible typing without blending letters together.

Requires Node.js 22+, macOS Swift/AppKit, FFmpeg and FFprobe. Keep the speech tool and downloaded model in ignored checkout-local storage:

```sh
npm install --prefix .sites-runtime/narration-v2 --no-audit --no-fund kokoro-js@1.2.1
node scripts/narrate-walkthrough.mjs
node scripts/create-walkthrough.mjs /absolute/path/to/captures .sites-runtime/walkthrough-v2 .sites-runtime/walkthrough-v2/voice
```

The first narration run downloads the public Kokoro FP32 model. Later runs reuse its cache. The `af_heart` voice is synthetic; no person's voice is cloned. These tools run locally and add no speech service, subscription, API key or runtime dependency to Malapit. The generator keeps clips when the script and voice settings are unchanged.

The video builder creates the MP4, poster, English captions, chapter cues and transcript in `public/tutorial/`. An optional fifth argument limits the number of chapters and writes a preview inside the work directory. It checks the final file is below 20 MiB and fully decodes it with FFmpeg.

Before publication, inspect the beginning, payment entry, confirmation and ending. Check cursor alignment, readable text, smooth motion, narration, caption timing and the example balances. Verify phone playback and the download. Update the asset version in `app/guide/page.tsx` when replacing a published video so browsers load the new edition. Commit the final public media and scripts; keep model files, raw captures, local databases and intermediate files outside Git.

Sources: [Kokoro model and Apache 2.0 license](https://huggingface.co/hexgrad/Kokoro-82M), [Kokoro JavaScript library](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), [ONNX model documentation](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
