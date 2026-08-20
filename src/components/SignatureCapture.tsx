"use client";

import { useEffect, useMemo, useState } from "react";
import SignatureCanvas from "@/components/SignatureCanvas";

type CaptureMethod = "type" | "draw" | "upload";

const signatureFonts = [
  { label: "Classic", css: '"Brush Script MT", "Segoe Script", cursive' },
  { label: "Personal", css: '"Segoe Script", "Bradley Hand", cursive' },
  { label: "Simple", css: '"Lucida Handwriting", "Comic Sans MS", cursive' },
];

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function textAsPng(text: string, fontFamily: string, label: "signature" | "initials") {
  const canvas = document.createElement("canvas");
  canvas.width = label === "initials" ? 520 : 1100;
  canvas.height = 300;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not create a signature preview.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111111";
  context.textAlign = "center";
  context.textBaseline = "middle";
  let size = label === "initials" ? 160 : 142;
  do {
    context.font = `${size}px ${fontFamily}`;
    if (context.measureText(text).width <= canvas.width - 80) break;
    size -= 5;
  } while (size > 42);
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}

async function imageAsPng(file: File, label: "signature" | "initials") {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) throw new Error("Upload a PNG, JPG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The image must be smaller than 5 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("The signature image could not be read."));
      next.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = label === "initials" ? 520 : 1100;
    canvas.height = 300;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not process the signature image.");
    const scale = Math.min((canvas.width - 50) / image.naturalWidth, (canvas.height - 40) / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SignatureCapture({
  signerName,
  label,
  onCapture,
}: {
  signerName: string;
  label: "signature" | "initials";
  onCapture: (dataUrl: string) => void;
}) {
  const defaultText = useMemo(() => label === "initials" ? initialsFor(signerName) : signerName, [label, signerName]);
  const [method, setMethod] = useState<CaptureMethod>("type");
  const [typedText, setTypedText] = useState(defaultText);
  const [fontIndex, setFontIndex] = useState(0);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const displayLabel = label === "initials" ? "initials" : "signature";

  useEffect(() => setTypedText(defaultText), [defaultText]);

  function confirmTyped() {
    if (!typedText.trim()) return setError(`Enter the ${displayLabel} text first.`);
    setError(null);
    onCapture(textAsPng(typedText.trim(), signatureFonts[fontIndex].css, label));
  }

  async function chooseUpload(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      setUploadPreview(await imageAsPng(file, label));
    } catch (caught) {
      setUploadPreview(null);
      setError(caught instanceof Error ? caught.message : "The image could not be processed.");
    }
  }

  return (
    <div className={`signature-capture signature-capture--${label}`}>
      <div className="signature-method-tabs" role="tablist" aria-label={`Choose ${displayLabel} method`}>
        {(["type", "draw", "upload"] as CaptureMethod[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={method === item} className={method === item ? "is-active" : ""} onClick={() => { setMethod(item); setError(null); }}>
            {item}
          </button>
        ))}
      </div>

      {method === "type" && (
        <div className="typed-signature-panel">
          <label className="field-label">{label === "initials" ? "Initials" : "Name shown as signature"}
            <input className="field-input" value={typedText} onChange={(event) => setTypedText(event.target.value)} autoComplete="name" />
          </label>
          <div className="typed-signature-options">
            {signatureFonts.map((font, index) => (
              <button type="button" key={font.label} className={fontIndex === index ? "is-active" : ""} onClick={() => setFontIndex(index)}>
                <span style={{ fontFamily: font.css }}>{typedText || defaultText || (label === "initials" ? "AB" : "Your name")}</span>
                <small>{font.label}</small>
              </button>
            ))}
          </div>
          <button className="button button--dark" type="button" onClick={confirmTyped}>Use typed {displayLabel}</button>
        </div>
      )}

      {method === "draw" && (
        <SignatureCanvas
          width={label === "initials" ? 520 : 1100}
          height={300}
          label={label}
          onCapture={onCapture}
        />
      )}

      {method === "upload" && (
        <div className="signature-upload-panel">
          <label className={`signature-upload-zone ${uploadPreview ? "has-preview" : ""}`}>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseUpload(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
            {uploadPreview ? <img src={uploadPreview} alt={`${displayLabel} upload preview`} /> : <span><strong>Choose a {displayLabel} image</strong><small>PNG, JPG or WebP, up to 5 MB</small></span>}
          </label>
          <div className="signature-actions">
            {uploadPreview && <button className="button button--quiet" type="button" onClick={() => setUploadPreview(null)}>Choose another</button>}
            <button className="button button--dark" type="button" disabled={!uploadPreview} onClick={() => uploadPreview && onCapture(uploadPreview)}>Use uploaded {displayLabel}</button>
          </div>
        </div>
      )}

      {error && <p className="signature-capture-error">{error}</p>}
    </div>
  );
}
