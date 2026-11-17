// Animate real CUA captures; narration is generated separately and stays local.
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
const captures=resolve(process.argv[2]||''),work=resolve(process.argv[3]||'.sites-runtime/walkthrough-v2'),voices=resolve(process.argv[4]||'.sites-runtime/walkthrough-v2/voice'),limit=Number(process.argv[5]||0);
if(!process.argv[2])throw new Error('Pass the CUA capture directory, work directory, and optional voice directory / preview chapter count.');
const out=limit?resolve(work,'preview'):resolve('public/tutorial');mkdirSync(work,{recursive:true});mkdirSync(out,{recursive:true});
const script=JSON.parse(readFileSync('docs/walkthrough-scenes.json','utf8')).slice(0,limit||undefined);
const captured=JSON.parse(readFileSync(resolve(captures,'capture.json'),'utf8'));
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const seconds=file=>Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]).trim());
const fps=24,scenes=[],audio=[],clicks=[];let elapsed=0;
function time(s){let ms=Math.round(s*1000);return [Math.floor(ms/3600000),Math.floor(ms/60000)%60,Math.floor(ms/1000)%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');}
const captions=['WEBVTT',''],chapters=['WEBVTT',''];
for(const scene of script){
 const steps=captured.scenes[scene.id],voice=resolve(voices,scene.id+'.wav');
 if(!steps?.length||!existsSync(voice))throw new Error('Capture and narrate chapter '+scene.id+' first.');
 const speechSeconds=seconds(voice),holdTotal=steps.reduce((sum,step)=>sum+step.hold,0);
 const duration=Math.ceil(Math.max(speechSeconds+.65,holdTotal)*fps)/fps,ratio=duration/holdTotal;
 let within=0;
 const planned=steps.map(step=>{const image=resolve(captures,step.image);if(!image.startsWith(captures+sep)||!existsSync(image))throw new Error('Missing capture: '+step.image);if(step.cursor&&(step.cursor[0]<0||step.cursor[0]>captured.width||step.cursor[1]<0||step.cursor[1]>captured.height))throw new Error('Cursor outside captured screen: '+step.image);const item={...step,image,duration:step.hold*ratio};if(item.click)clicks.push(elapsed+within+Math.max(.25,item.duration-.4));within+=item.duration;return item;});
 scenes.push({...scene,duration,steps:planned});
 const padded=resolve(work,scene.id+'-padded.wav');run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',voice,'-af','adelay=200,apad','-t',String(duration),'-ar','48000','-ac','1','-c:a','pcm_s16le',padded]);audio.push(padded);
 const sentences=scene.narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s=>s.trim()).filter(Boolean)||[scene.narration];let cue=elapsed+.2;const chars=sentences.reduce((n,s)=>n+s.length,0);
 for(const sentence of sentences){const span=speechSeconds*sentence.length/chars;captions.push(time(cue)+' --> '+time(cue+span),sentence,'');cue+=span;}
 chapters.push(time(elapsed)+' --> '+time(elapsed+duration),scene.title,'');elapsed+=duration;
}
const plan=resolve(work,'render-plan.json'),silent=resolve(work,'animated-silent.mp4');
const ffmpeg=run('/usr/bin/which',['ffmpeg']).trim();
writeFileSync(plan,JSON.stringify({output:silent,ffmpeg,width:captured.width,height:captured.height,fps,scenes}));
const renderer=resolve(work,'walkthrough-motion');run('swiftc',['scripts/walkthrough-motion.swift','-o',renderer]);
execFileSync(renderer,[plan],{stdio:'inherit'});
const manifest=resolve(work,'voice-concat.txt');writeFileSync(manifest,audio.map(file=>"file '"+file.replaceAll("'","'\\''")+"'").join('\n'));
const voiceTrack=resolve(work,'voice-track.wav');run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',manifest,'-c:a','pcm_s16le',voiceTrack]);
// Quiet, original click sounds timed to the animated pointer, underneath speech.
const rate=48000,clickTrack=resolve(work,'clicks.s16le'),samples=Buffer.alloc(Math.ceil(elapsed*rate)*2);
for(const at of clicks){for(let n=0;n<rate*.028;n++){const i=Math.floor(at*rate)+n;if(i*2+1>=samples.length)break;const t=n/rate,shape=Math.exp(-t*170),tone=Math.sin(2*Math.PI*920*t)+.35*Math.sin(2*Math.PI*1440*t);samples.writeInt16LE(Math.round(1100*shape*tone),i*2);}}
writeFileSync(clickTrack,samples);
const video=resolve(out,'malapit-how-to.mp4');
run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',voiceTrack,'-f','s16le','-ar',String(rate),'-ac','1','-i',clickTrack,'-filter_complex','[1:a]loudnorm=I=-17:TP=-1.5:LRA=9,aresample=48000[voice];[voice][2:a]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:level=false[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','96k','-ar','48000','-t',String(elapsed),'-movflags','+faststart',video]);
run('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss','0.7','-i',video,'-frames:v','1','-q:v','3',resolve(out,'malapit-how-to-poster.jpg')]);
writeFileSync(resolve(out,'malapit-how-to.vtt'),captions.join('\n'));writeFileSync(resolve(out,'malapit-how-to-chapters.vtt'),chapters.join('\n'));
writeFileSync(resolve(out,'malapit-how-to-transcript.txt'),'Malapit animated quick guide\nFictional demonstration. Synthetic narration. Money is paid directly.\n\n'+script.map(s=>s.title+'\n'+s.narration).join('\n\n')+'\n');
if(statSync(video).size>20*1024*1024)throw new Error('Compress the tutorial below 20 MiB before publication.');
run('ffmpeg',['-hide_banner','-loglevel','error','-i',video,'-f','null','-']);
console.log(JSON.stringify({video,seconds:seconds(video),bytes:statSync(video).size,chapters:scenes.length,captures:scenes.reduce((n,s)=>n+s.steps.length,0),animatedClicks:clicks.length,fps}));
