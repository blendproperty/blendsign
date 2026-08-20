"use client";

import { useRef, useState } from "react";

export default function SignatureCanvas({
  onCapture,
  width = 640,
  height = 220,
  label = "signature",
}: {
  onCapture: (dataUrl: string) => void;
  width?: number;
  height?: number;
  label?: "signature" | "initials";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasRef.current!.width / rect.width),
      y: (e.clientY - rect.top) * (canvasRef.current!.height / rect.height),
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const clear = () => {
    const ctx = getCtx();
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasStroke(false);
  };

  const confirm = () => {
    if (!canvasRef.current || !hasStroke) return;
    onCapture(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className={`signature-pad signature-pad--${label}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="signature-canvas"
        aria-label={`Draw your ${label}`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="signature-actions">
        <button className="button button--quiet" onClick={clear} type="button">
          Clear
        </button>
        <button className="button button--dark" onClick={confirm} type="button" disabled={!hasStroke}>
          Use {label}
        </button>
      </div>
    </div>
  );
}
