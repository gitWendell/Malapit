"use client";

import { useRef, useState } from "react";

type Chapter = { id: string; title: string; start: number; end: number };
const shortcuts = [
  ["map", "Find a home"],
  ["unit", "Owner setup"],
  ["autobill", "Monthly bills"],
  ["report", "Pay owner directly"],
  ["checkout", "Checkout demo"],
] as const;

export function GuideVideo({ chapters, assetVersion }: { chapters: Chapter[]; assetVersion: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  const asset = (suffix: string) => `/tutorial/malapit-how-to${suffix}?v=${assetVersion}`;

  function jumpTo(chapter: Chapter) {
    const player = video.current;
    if (!player) return;
    setMessage(chapter.title);
    if (player.readyState >= 1) player.currentTime = chapter.start;
    else pendingSeek.current = chapter.start;
    void player.play().catch(() => setMessage(`${chapter.title}. Press Play to watch.`));
  }

  return <>
    <video ref={video} controls playsInline preload="metadata" poster={asset("-poster.jpg")} aria-label="Animated Malapit walkthrough with English narration and captions" onLoadedMetadata={() => {
      if (video.current && pendingSeek.current !== null) {
        video.current.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
    }}>
      <source src={asset(".mp4")} type="video/mp4" />
      <track kind="captions" src={asset(".vtt")} srcLang="en" label="English" />
      <track kind="chapters" src={asset("-chapters.vtt")} srcLang="en" label="Guide sections" />
      Your browser cannot play this video. <a href={asset(".mp4")}>Download the walkthrough</a>.
    </video>
    <nav className="guide-chapters" aria-label="Jump to a video section">
      <p>Jump to the steps you need</p>
      <div>{shortcuts.map(([id, label]) => {
        const chapter = chapters.find(item => item.id === id);
        return chapter ? <button key={id} type="button" onClick={() => jumpTo(chapter)}>{label}</button> : null;
      })}</div>
    </nav>
    <p className="guide-video-status" role="status">{message}</p>
  </>;
}
