// Assemble CUA-captured demo screens into a captioned, narrated MP4.
// Requires macOS Swift/AppKit, the installed Samantha voice, ffmpeg and ffprobe.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const captures = resolve(process.argv[2] || ""), work = resolve(process.argv[3] || ".sites-runtime/walkthrough"), out = resolve("public/tutorial");
const scenes = JSON.parse(readFileSync("docs/walkthrough-scenes.json", "utf8"));
if (!process.argv[2] || scenes.some(scene => !existsSync(resolve(captures, scene.image)))) throw new Error("Capture every listed demo screen before building the video.");
mkdirSync(work, { recursive: true }); mkdirSync(out, { recursive: true });
function run(command, args) { return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
const compositor = resolve(work, "walkthrough-frame");
run("swiftc", ["scripts/walkthrough-frame.swift", "-o", compositor]);
let elapsed = 0; const captions = ["WEBVTT", ""], transcript = [], clips = [];
function time(seconds) { const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return [h,m,s].map(value => String(value).padStart(2,"0")).join(":") + "." + String(ms % 1000).padStart(3,"0"); }
for (let index = 0; index < scenes.length; index++) {
  const scene = scenes[index], prefix = resolve(work, String(index + 1).padStart(2, "0")), description = prefix + ".json", frame = prefix + ".png", voice = prefix + ".aiff", script = prefix + ".txt", clip = prefix + ".mp4";
  writeFileSync(description, JSON.stringify({ image: resolve(captures, scene.image), output: frame, title: scene.title, caption: scene.caption, index: index + 1, total: scenes.length }));
  run(compositor, [description]); writeFileSync(script, scene.narration);
  run("say", ["-v", "Samantha", "-r", "155", "-f", script, "-o", voice]);
  const voiceSeconds = Number(run("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",voice]).trim());
  const duration = Math.max(6, voiceSeconds + 1.25);
  run("ffmpeg", ["-hide_banner","-loglevel","error","-y","-loop","1","-framerate","15","-i",frame,"-i",voice,"-t",String(duration),"-af","apad","-c:v","libx264","-preset","medium","-crf","21","-tune","stillimage","-profile:v","baseline","-level:v","3.1","-pix_fmt","yuv420p","-r","15","-c:a","aac","-b:a","64k","-ac","1","-ar","44100",clip]);
  const encodedDuration = Number(run("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",clip]).trim());
  captions.push(String(index + 1), time(elapsed) + " --> " + time(elapsed + encodedDuration), scene.narration, ""); transcript.push(scene.title + "\n" + scene.narration); clips.push(clip); elapsed += encodedDuration;
  console.log("Rendered scene " + (index + 1) + "/" + scenes.length + ": " + scene.title);
}
const manifest = resolve(work, "concat.txt");
writeFileSync(manifest, clips.map(file => "file '" + file.replaceAll("'", "'\\''") + "'").join("\n"));
const video = resolve(out, "malapit-how-to.mp4");
run("ffmpeg", ["-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",manifest,"-c","copy","-movflags","+faststart",video]);
run("ffmpeg", ["-hide_banner","-loglevel","error","-y","-i",resolve(work,"01.png"),"-frames:v","1","-q:v","3",resolve(out,"malapit-how-to-poster.jpg")]);
writeFileSync(resolve(out,"malapit-how-to.vtt"), captions.join("\n"));
writeFileSync(resolve(out,"malapit-how-to-transcript.txt"), "Malapit quick guide\nFictional demonstration data. No money transferred.\n\n" + transcript.join("\n\n") + "\n");
if (statSync(video).size > 20 * 1024 * 1024) throw new Error("Compress the tutorial below 20 MiB before publication.");
run("ffmpeg", ["-hide_banner","-loglevel","error","-i",video,"-f","null","-"]);
console.log(JSON.stringify({video,seconds:Math.round(elapsed),bytes:statSync(video).size,frames:scenes.length}));
