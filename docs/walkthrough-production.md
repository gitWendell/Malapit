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
node scripts/narrate-walkthrough.mjs .sites-runtime/narration-v2 .sites-runtime/walkthrough-v3/voice
node scripts/create-walkthrough.mjs /absolute/path/to/captures .sites-runtime/walkthrough-v3 .sites-runtime/walkthrough-v3/voice
```

The first narration run downloads the public Kokoro FP32 model. Later runs reuse its cache. The `af_heart` voice is synthetic; no person's voice is cloned. These tools run locally and add no speech service, subscription, API key or runtime dependency to Malapit. The generator keeps clips when the script and voice settings are unchanged.

The video builder creates the MP4, poster, English captions, chapter cues, chapter index JSON, media size/checksum JSON and transcript in `public/tutorial/`. The guide's jump buttons use the generated index, so section times follow the actual narration. The media metadata supplies the deployed video's size when the asset binding omits it; an automated check compares its checksum and size with the shipped MP4. An optional fifth argument limits the number of chapters and writes a preview inside the work directory. It checks the final file is below 20 MiB and fully decodes it with FFmpeg.

The November 18 update has 14 chapters and lasts 2 minutes 22 seconds. It includes optional full-month bills, the prefilled direct-payment form, the owner's payment review list, and the separate online checkout demo. Direct bank, wallet and cash payment remains available. Demo checkout is labelled "Preview only" and the persistent footer says no real money moved. Do not describe its reminder as a real push notification or its simulated result as a real payment. Proposed business prices do not belong in the user tutorial.

Cloudflare [Static Assets currently returns whole files for byte-range requests](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). The exact public MP4 route runs through a small Worker adapter to supply partial responses for seeking and phone playback. It streams slices of the public asset, cancels unused bytes and does not read rental data. Other assets retain normal asset delivery. This video route counts toward Worker request/CPU allowances; no paid plan is enabled. Keep the video compact and review delivery costs before substantial traffic.

Before publication, inspect the beginning, payment entry, confirmation and ending. Check cursor alignment, readable text, smooth motion, narration, caption timing and the example balances. Verify phone playback and the download. Update the asset version in `app/guide/page.tsx` when replacing a published video so browsers load the new edition. Commit the final public media and scripts; keep model files, raw captures, local databases and intermediate files outside Git.

Sources: [Kokoro model and Apache 2.0 license](https://huggingface.co/hexgrad/Kokoro-82M), [Kokoro JavaScript library](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), [ONNX model documentation](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX).
