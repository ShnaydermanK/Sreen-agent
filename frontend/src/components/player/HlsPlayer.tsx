import { useEffect, useRef, RefObject } from "react";
import Hls from "hls.js";

interface Props {
  src: string;
  className?: string;
  autoPlay?: boolean;
  onTimeUpdate?: () => void;
  videoRef?: RefObject<HTMLVideoElement>;
}

export function HlsPlayer({ src, className, autoPlay = false, onTimeUpdate, videoRef: externalRef }: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef || internalRef;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;

    if (src.includes(".m3u8") && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(src);
      hls.attachMedia(video);
      if (autoPlay) {
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      }
    } else {
      video.src = src;
      if (autoPlay) video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [src, autoPlay]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls
      playsInline
      onTimeUpdate={onTimeUpdate}
    />
  );
}
