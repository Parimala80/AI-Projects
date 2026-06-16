import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { PageHeader } from "../components/Layout";
import { CloudArrowUp, Camera, Files, X, CheckCircle, Spinner } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function DocumentUpload() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  const [autoProcess, setAutoProcess] = useState(true);
  const [engineOverride, setEngineOverride] = useState("");
  const [asSingleDoc, setAsSingleDoc] = useState(false);
  const [usingCamera, setUsingCamera] = useState(false);
  const inputRef = useRef(null);
  const camRef = useRef(null);
  const videoRef = useRef(null);
  const navigate = useNavigate();

  const onPick = (e) => {
    const arr = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...arr]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    const arr = Array.from(e.dataTransfer.files || []);
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (i) => setFiles(files.filter((_, idx) => idx !== i));

  const upload = async () => {
    if (files.length === 0) return toast.error("No files selected");
    setUploading(true);
    try {
      if (files.length === 1 && !asSingleDoc) {
        const fd = new FormData();
        fd.append("file", files[0]);
        fd.append("auto_process", autoProcess);
        if (engineOverride) fd.append("engine_override", engineOverride);
        const r = await api.post("/documents/upload", fd);
        setUploaded([r.data]);
        toast.success("Uploaded. Processing...");
      } else {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        fd.append("auto_process", autoProcess);
        if (engineOverride) fd.append("engine_override", engineOverride);
        fd.append("as_single_document", asSingleDoc);
        const r = await api.post("/documents/upload-bulk", fd);
        setUploaded(r.data.documents);
        const msg = asSingleDoc
          ? `Uploaded ${files.length} pages as 1 document. Processing...`
          : `Uploaded ${r.data.uploaded} documents. Processing...`;
        toast.success(msg);
      }
      setFiles([]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setUsingCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 50);
    } catch (e) {
      toast.error("Camera access denied");
    }
  };

  const captureFrame = () => {
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    canvas.toBlob((blob) => {
      const f = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      setFiles((prev) => [...prev, f]);
      toast.success("Photo captured");
    }, "image/jpeg", 0.92);
  };

  const stopCamera = () => {
    const v = videoRef.current;
    const stream = v?.srcObject;
    stream?.getTracks?.().forEach((t) => t.stop());
    setUsingCamera(false);
  };

  return (
    <div data-testid="upload-page">
      <PageHeader
        kicker="INGEST"
        title="Upload Documents"
        description="Drag-drop scans and PDFs, snap photos with your camera, or bulk upload an entire batch."
      />
      <div className="px-8 py-8 grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="swiss-card p-12 text-center dot-bg cursor-pointer"
            onClick={() => inputRef.current?.click()}
            data-testid="dropzone"
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              hidden
              onChange={onPick}
              data-testid="file-input"
            />
            <div className="inline-flex items-center justify-center w-14 h-14 border border-[color:var(--border-line-strong)] mb-4">
              <CloudArrowUp size={28} weight="bold" />
            </div>
            <div className="font-display text-2xl">Drop files or click to browse</div>
            <div className="text-sm text-[color:var(--text-secondary)] mt-2">
              Images (PNG, JPG, WEBP) and PDFs · up to 15MB each
            </div>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="btn-secondary inline-flex items-center gap-2"
                data-testid="browse-button"
              >
                <Files size={14} weight="bold" /> Browse files
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); usingCamera ? stopCamera() : startCamera(); }}
                className="btn-secondary inline-flex items-center gap-2"
                data-testid="camera-button"
                ref={camRef}
              >
                <Camera size={14} weight="bold" /> {usingCamera ? "Stop camera" : "Use camera"}
              </button>
            </div>
          </div>

          {usingCamera && (
            <div className="swiss-card mt-4 p-4" data-testid="camera-panel">
              <div className="label-tag mb-2 flex items-center gap-2"><span className="dot dot-red animate-pulse" /> LIVE</div>
              <video ref={videoRef} className="w-full max-h-[420px] bg-black object-contain" />
              <div className="flex items-center justify-end gap-2 mt-3">
                <button onClick={captureFrame} className="btn-primary" data-testid="capture-button">Capture</button>
                <button onClick={stopCamera} className="btn-secondary">Close</button>
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="swiss-card mt-4" data-testid="staged-files">
              <div className="px-4 py-3 border-b border-[color:var(--border-line)] flex flex-wrap items-center justify-between gap-3">
                <div className="label-tag">STAGED · {files.length}</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={autoProcess} onChange={(e) => setAutoProcess(e.target.checked)} data-testid="auto-process-toggle" />
                    Auto-extract on upload
                  </label>
                  {files.length > 1 && (
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={asSingleDoc}
                        onChange={(e) => setAsSingleDoc(e.target.checked)}
                        data-testid="as-single-doc-toggle"
                      />
                      Combine as <strong>one multi-page document</strong>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-xs">
                    <span className="label-tag">ENGINE</span>
                    <select
                      value={engineOverride}
                      onChange={(e) => setEngineOverride(e.target.value)}
                      className="input-flat !py-1 !px-2 text-xs w-auto"
                      data-testid="upload-engine-select"
                    >
                      <option value="">tenant default</option>
                      <option value="gemini">Gemini</option>
                      <option value="olmocr">olmOCR</option>
                      <option value="auto">Auto-route</option>
                    </select>
                  </label>
                  <button onClick={upload} disabled={uploading} className="btn-primary" data-testid="upload-submit-button">
                    {uploading ? "Uploading…" : `Upload ${files.length} file${files.length > 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
              <ul>
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-[color:var(--border-line)] last:border-b-0 text-sm font-mono">
                    <span className="truncate">{f.name}</span>
                    <span className="flex items-center gap-3 text-xs text-[color:var(--text-secondary)]">
                      {(f.size / 1024).toFixed(0)} KB
                      <button onClick={() => removeFile(i)} className="hover:text-[color:var(--accent-red)]" data-testid={`remove-file-${i}`}>
                        <X size={14} weight="bold" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-4">
          <div className="swiss-card p-6">
            <div className="label-tag mb-3">PROCESSING NOTES</div>
            <ul className="space-y-3 text-sm leading-relaxed">
              <li className="flex gap-3"><span className="dot dot-green mt-2" /> Gemini 3 Pro extracts structured fields and line items.</li>
              <li className="flex gap-3"><span className="dot dot-blue mt-2" /> Validation runs automatically: GST, duplicates, totals.</li>
              <li className="flex gap-3"><span className="dot dot-yellow mt-2" /> Low-confidence fields are routed for human review.</li>
              <li className="flex gap-3"><span className="dot dot-grey mt-2" /> Images are stored encrypted within your tenant.</li>
            </ul>
          </div>

          {uploaded.length > 0 && (
            <div className="swiss-card mt-4" data-testid="uploaded-list">
              <div className="px-4 py-3 border-b border-[color:var(--border-line)] label-tag">UPLOADED · {uploaded.length}</div>
              <ul>
                {uploaded.map((d) => (
                  <li key={d.id || d.filename} className="px-4 py-3 border-b border-[color:var(--border-line)] last:border-b-0 flex items-center justify-between text-sm">
                    <span className="font-mono truncate">{d.filename}</span>
                    {d.id ? (
                      <button onClick={() => navigate(`/documents/${d.id}`)} className="text-xs underline" data-testid={`view-uploaded-${d.id}`}>
                        REVIEW
                      </button>
                    ) : (
                      <span className="text-xs text-[color:var(--accent-red)]">{d.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
