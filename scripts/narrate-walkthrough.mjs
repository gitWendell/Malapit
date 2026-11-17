// Local narration. Install kokoro-js@1.2.1 into an ignored directory first.
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const tool = resolve(process.argv[2] || '.sites-runtime/narration-v2');
const output = resolve(process.argv[3] || '.sites-runtime/walkthrough-v2/voice');
const { env } = await import(pathToFileURL(resolve(tool,'node_modules/@huggingface/transformers/dist/transformers.node.mjs')));
env.cacheDir = resolve(tool,'model-cache');
const { KokoroTTS } = await import(pathToFileURL(resolve(tool,'node_modules/kokoro-js/dist/kokoro.js')));
mkdirSync(output,{recursive:true});
console.log('Loading Kokoro. First run downloads public model weights.');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'fp32',device:'cpu'});
for(const scene of JSON.parse(readFileSync('docs/walkthrough-scenes.json','utf8'))){
  const file = resolve(output,scene.id+'.wav'), identity = scene.narration+'\naf_heart\nfp32\n1.03';
  if(existsSync(file)&&existsSync(file+'.txt')&&readFileSync(file+'.txt','utf8')===identity){console.log('Kept narration: '+scene.id);continue;}
  const audio = await tts.generate(scene.narration.replaceAll('Malapit','Mah lah peet'),{voice:'af_heart',speed:1.03});
  await audio.save(file);writeFileSync(file+'.txt',identity);console.log('Generated narration: '+scene.id);
}
console.log('Narration saved in '+output);
