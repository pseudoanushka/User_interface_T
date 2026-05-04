import { useCallback, useEffect, useRef, useState } from 'react';

import { getRpiWsUrl } from "../config";

const styles = `
  .gcs-root {
    width: 400px;
    height: 550px;
    display: flex;
    flex-direction: column;
    background: #000;
  }

  .gcs-feed-tile {
    position: relative;
    width: 400px;
    height: 550px;
    overflow: hidden;
    gap: 10;
    background: #000;
    border: 1px solid rgba(34, 211, 238, 0.55);
    box-sizing: border-box;
  }

  .gcs-feed-tile + .gcs-feed-tile {
    border-top: none;
  }

  .gcs-feed-tile img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .no-signal {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: 'Rajdhani', sans-serif;
    font-size: 10px;
    letter-spacing: 2px;
    color: #1a3040;
    text-transform: uppercase;
  }

  .no-signal-icon {
    font-size: 22px;
    opacity: 0.18;
  }
`;

function NoSignal({ label }: { label: string }) {
  return (
    <div className="no-signal">
      <div className="no-signal-icon">NO</div>
      {label}
    </div>
  );
}

export function CameraFeed() {
  const rpiImgRef = useRef<HTMLImageElement>(null);
  const baseStationImgRef = useRef<HTMLImageElement>(null);
  const [rpiCamActive, setRpiCamActive] = useState(false);
  const [baseStationCamActive, setBaseStationCamActive] = useState(false);

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!active) return;

      ws = new WebSocket(getRpiWsUrl());

      ws.onmessage = async (event) => {
        if (!active || !(event.data instanceof Blob)) return;

        try {
          const buffer = await event.data.arrayBuffer();
          if (buffer.byteLength < 4) return;

          const headerLength = new DataView(buffer).getUint32(0, true);
          if (headerLength > 4096 || buffer.byteLength < 4 + headerLength) return;

          const jpegBlob = new Blob([buffer.slice(4 + headerLength)], { type: 'image/jpeg' });
          const nextUrl = URL.createObjectURL(jpegBlob);
          const oldUrl = rpiImgRef.current?.src;

          if (rpiImgRef.current) {
            rpiImgRef.current.src = nextUrl;
            setRpiCamActive(true);
          } else {
            URL.revokeObjectURL(nextUrl);
          }

          if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        ws = null;
        if (active) reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();

      const oldUrl = rpiImgRef.current?.src;
      if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    };
  }, []);

  const onBaseStationFrame = useCallback((event: Event) => {
    const blob = (event as CustomEvent<Blob>).detail;
    if (!blob) return;

    const nextUrl = URL.createObjectURL(blob);
    const oldUrl = baseStationImgRef.current?.src;

    if (baseStationImgRef.current) {
      baseStationImgRef.current.src = nextUrl;
      setBaseStationCamActive(true);
    } else {
      URL.revokeObjectURL(nextUrl);
    }

    if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
  }, []);

  useEffect(() => {
    window.addEventListener('bs:camera_frame', onBaseStationFrame);

    return () => {
      window.removeEventListener('bs:camera_frame', onBaseStationFrame);

      const oldUrl = baseStationImgRef.current?.src;
      if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    };
  }, [onBaseStationFrame]);

  return (
    <>
      <style>{styles}</style>
      <div className="gcs-root">
        <div className="gcs-feed-tile">
          <img
            ref={rpiImgRef}
            alt="RPi Camera Feed"
            style={{ display: rpiCamActive ? 'block' : 'none' }}
          />
          {!rpiCamActive && <NoSignal label="CAM-01 NO SIGNAL" />}
        </div>

        <div className="gcs-feed-tile">
          <img
            ref={baseStationImgRef}
            alt="Base Station Feed"
            style={{ display: baseStationCamActive ? 'block' : 'none' }}
          />
          {!baseStationCamActive && <NoSignal label="CAM-02 NO SIGNAL" />}
        </div>
      </div>
    </>
  );
}
