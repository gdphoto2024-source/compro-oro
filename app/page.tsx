"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";


function NavBar() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const links = [
    { href: "/", label: "📋 Scheda" },
    { href: "/dashboard", label: "📊 Dashboard" },
    { href: "/clienti", label: "👥 Clienti" },
    { href: "/impostazioni", label: "⚙️ Impostazioni" },
  ];
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
      background: "#111827", borderBottom: "2px solid #1f2937",
      display: "flex", alignItems: "center", height: 52,
      padding: "0 20px", gap: 4, boxShadow: "0 2px 12px rgba(0,0,0,0.3)"
    }}>
      <span style={{ color: "#f9fafb", fontWeight: 800, fontSize: 15, marginRight: 16, letterSpacing: "0.03em" }}>
        🏅 Compro Oro
      </span>
      {links.map(l => {
        const active = pathname === l.href;
        return (
          <a key={l.href} href={l.href} style={{
            color: active ? "#111827" : "#d1d5db",
            background: active ? "#f9fafb" : "transparent",
            borderRadius: 7, padding: "6px 14px",
            fontWeight: active ? 700 : 500,
            fontSize: 13, textDecoration: "none",
          }}>
            {l.label}
          </a>
        );
      })}
      <button
        style={{ marginLeft: "auto", background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}
      >🚪 Logout</button>
    </nav>
  );
}

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const emptyCustomer = {
  nome: "", cognome: "", luogoNascita: "", dataNascita: "",
  indirizzo: "", comune: "", provincia: "", cap: "",
  codiceFiscale: "", tipoDocumento: "Carta di identità",
  numeroDocumento: "", dataRilascio: "", dataScadenza: "",
  enteRilascio: "", telefono: "", email: "", note: "",
};

type FotoAllegata = { nome: string; mimeType: string; base64: string; preview: string };
const emptyItem = {
  nrArticoli: "1",
  descrizione: "",
  materiale: "oro",
  pesiPezzi: [""] as string[],   // un campo peso per ogni articolo
  valore: "",
  note: "",
  foto: [] as FotoAllegata[],
};

type NegozioInfo = {
  nome: string; indirizzo: string; comune: string; provincia: string;
  cap: string; piva: string; telefono: string; email: string;
  firma_base64: string; logo_base64: string; testo_privacy: string;
};

type ClienteDB = {
  id: number; nome: string; cognome: string; codice_fiscale: string;
  luogo_nascita: string; data_nascita: string; indirizzo: string;
  comune: string; provincia: string; cap: string;
  telefono: string; email: string; note: string;
  privacy_accettata?: boolean;
  tipo_documento?: string; numero_documento?: string;
  data_rilascio?: string; data_scadenza?: string; ente_rilascio?: string;
  foto?: { tipo: string; data_base64: string; mime_type: string }[];
  schede?: { numero_scheda: number; data_operazione: string; totale_valore: number }[];
};

function todayISO() { return new Date().toISOString().slice(0, 10); }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Corregge orientamento EXIF delle foto scattate da iPad/iPhone
async function fixOrientation(file: File): Promise<{ base64: string; previewUrl: string; mimeType: string }> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const arrayBuffer = e.target!.result as ArrayBuffer;
      const view = new DataView(arrayBuffer);
      let orientation = 1;
      // Leggi EXIF orientation
      if (view.getUint16(0, false) === 0xFFD8) {
        let offset = 2;
        while (offset < view.byteLength) {
          const marker = view.getUint16(offset, false);
          offset += 2;
          if (marker === 0xFFE1) {
            if (view.getUint32(offset + 2, false) === 0x45786966) {
              const little = view.getUint16(offset + 8, false) === 0x4949;
              const tags = view.getUint16(offset + 14, little);
              for (let i = 0; i < tags; i++) {
                if (view.getUint16(offset + 16 + i * 12, little) === 0x0112) {
                  orientation = view.getUint16(offset + 16 + i * 12 + 8, little);
                  break;
                }
              }
            }
            break;
          }
          if ((marker & 0xFF00) !== 0xFF00) break;
          offset += view.getUint16(offset, false);
        }
      }
      // Disegna su canvas con rotazione corretta
      const img = new Image();
      const blob = new Blob([arrayBuffer], { type: file.type });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        const { width: w, height: h } = img;
        if ([5,6,7,8].includes(orientation)) { canvas.width = h; canvas.height = w; }
        else { canvas.width = w; canvas.height = h; }
        switch (orientation) {
          case 2: ctx.transform(-1,0,0,1,w,0); break;
          case 3: ctx.transform(-1,0,0,-1,w,h); break;
          case 4: ctx.transform(1,0,0,-1,0,h); break;
          case 5: ctx.transform(0,1,1,0,0,0); break;
          case 6: ctx.transform(0,1,-1,0,h,0); break;
          case 7: ctx.transform(0,-1,-1,0,h,w); break;
          case 8: ctx.transform(0,-1,1,0,0,w); break;
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob2 => {
          if (!blob2) { resolve({ base64: "", previewUrl: url, mimeType: file.type }); return; }
          const previewUrl2 = URL.createObjectURL(blob2);
          const r2 = new FileReader();
          r2.onload = () => resolve({ base64: (r2.result as string).split(",")[1], previewUrl: previewUrl2, mimeType: "image/jpeg" });
          r2.readAsDataURL(blob2);
        }, "image/jpeg", 0.92);
      };
      img.src = url;
    };
    reader.readAsArrayBuffer(file);
  });
}

function currency(v: string | number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(v || 0));
}

async function callClaudeOCR(base64Image: string, mediaType: string) {
  const prompt = `Sei un sistema OCR specializzato in documenti di identità italiani.
Analizza questa immagine del documento e estrai TUTTI i dati visibili.
Rispondi SOLO con un oggetto JSON valido (niente testo prima o dopo), con questi campi:
{
  "nome": "","cognome": "","luogoNascita": "","dataNascita": "YYYY-MM-DD",
  "indirizzo": "","comune": "","provincia": "","cap": "",
  "codiceFiscale": "","tipoDocumento": "","numeroDocumento": "",
  "dataRilascio": "YYYY-MM-DD","dataScadenza": "YYYY-MM-DD","enteRilascio": "",
  "rawText": "(tutto il testo visibile nel documento)"
}
Regole: date YYYY-MM-DD, campi non visibili stringa vuota, CF 16 caratteri,
tipoDocumento: "Carta di identità" o "Patente di guida" o "Passaporto", non inventare dati`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
        { type: "text", text: prompt }
      ]}]
    })
  });
  if (!response.ok) { const err = await response.json(); throw new Error(err?.error?.message || "Errore API Claude"); }
  const data = await response.json();
  const text = data.content?.map((b: any) => b.text || "").join("") || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#6b7280" }}>{label}</label>
      {children}
    </div>
  );
}

function TextBox({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, color: "#6b7280", marginBottom: 8 }}>{title}</div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, minHeight: 120, border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", background: "#f9fafb", fontSize: 13 }}>{text}</div>
    </div>
  );
}

function FotoUploader({ foto, onAdd, onRemove, label, onOpen }: { foto: FotoAllegata[]; onAdd: (f: FotoAllegata) => void; onRemove: (i: number) => void; label: string; onOpen?: (src: string, nome: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  async function handleFile(file: File | null) {
    if (!file) return;
    const base64 = await fileToBase64(file);
    onAdd({ nome: file.name, mimeType: file.type, base64, preview: URL.createObjectURL(file) });
    if (ref.current) ref.current.value = "";
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, color: "#6b7280" }}>{label}</span>
        <button style={{ background: "#f3f4f6", border: "1.5px solid #e5e7eb", borderRadius: 7, padding: "5px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }} onClick={() => ref.current?.click()} type="button">📎 Aggiungi foto</button>
        {foto.length > 0 && <span style={{ fontSize: 12, color: "#6b7280" }}>{foto.length} foto</span>}
        <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] || null)} />
      </div>
      {foto.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {foto.map((f, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={f.preview} alt={f.nome}
                style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e5e7eb", display: "block", cursor: onOpen ? "zoom-in" : "default" }}
                onClick={() => onOpen && onOpen(f.preview, f.nome)} />
              <button onClick={() => onRemove(i)} style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: "22px", padding: 0, textAlign: "center" }}>×</button>
              {onOpen && <div style={{ position: "absolute", bottom: 2, left: 2, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, borderRadius: 4, padding: "1px 4px" }}>🔍</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Lightbox({ src, nome, onClose }: { src: string; nome: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: "95vw", maxHeight: "95vh" }}>
        <img src={src} alt={nome} style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 10, display: "block" }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 12 }}>
          <a href={src} download={nome} style={{ background: "#2563eb", color: "#fff", borderRadius: 8, padding: "8px 20px", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>⬇ Scarica</a>
          <button onClick={onClose} style={{ background: "#374151", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✕ Chiudi</button>
        </div>
      </div>
    </div>
  );
}

function SignaturePad({ onSave, onClear, hasFirma }: { onSave: (dataUrl: string) => void; onClear: () => void; hasFirma: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    if ("touches" in e) { const t = e.touches[0]; return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }; }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }
  function startDraw(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); const c = canvasRef.current; if (!c) return; drawing.current = true; lastPos.current = getPos(e, c); }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); if (!drawing.current) return;
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, c);
    ctx.beginPath(); ctx.moveTo(lastPos.current!.x, lastPos.current!.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a2e"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    lastPos.current = pos;
  }
  function stopDraw(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); drawing.current = false; lastPos.current = null; }
  function salva() {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext("2d"); if (!ctx) return;
    if (!ctx.getImageData(0, 0, c.width, c.height).data.some(v => v !== 0)) return;
    onSave(c.toDataURL("image/png"));
  }
  function pulisci() { const c = canvasRef.current; if (!c) return; c.getContext("2d")?.clearRect(0, 0, c.width, c.height); onClear(); }

  return (
    <div>
      <canvas ref={canvasRef} width={700} height={200}
        style={{ width: "100%", height: 200, border: hasFirma ? "2px solid #059669" : "2px dashed #6b7280", borderRadius: 10, background: "#fafafa", cursor: "crosshair", touchAction: "none", display: "block" }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button type="button" style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: 14 }} onClick={salva}>✅ Conferma firma</button>
        <button type="button" style={{ background: "#f3f4f6", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }} onClick={pulisci}>🗑 Cancella</button>
        {hasFirma && <span style={{ alignSelf: "center", fontSize: 13, color: "#059669", fontWeight: 700 }}>✔ Firma acquisita</span>}
      </div>
    </div>
  );
}

// ---- POPUP PRIVACY ----
function ConsensoBox({ testo, consenso, onConsenso, firma, onFirma }: {
  testo: string; consenso: boolean | null; onConsenso: (v: boolean) => void;
  firma: string | null; onFirma: (v: string) => void;
}) {
  return (
    <div style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 18 }}>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: "#374151", marginBottom: 14 }}>{testo}</p>
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, color: consenso === true ? "#059669" : "#374151" }}>
          <input type="checkbox" checked={consenso === true} onChange={() => onConsenso(true)}
            style={{ width: 20, height: 20, accentColor: "#059669", cursor: "pointer" }} />
          ✅ Acconsento
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, color: consenso === false ? "#dc2626" : "#374151" }}>
          <input type="checkbox" checked={consenso === false} onChange={() => onConsenso(false)}
            style={{ width: 20, height: 20, accentColor: "#dc2626", cursor: "pointer" }} />
          ❌ Non Acconsento
        </label>
      </div>
      {consenso !== null && (
        firma ? (
          <div>
            <img src={firma} alt="Firma" style={{ height: 70, objectFit: "contain", border: "1.5px solid #059669", borderRadius: 8, background: "#fafafa", display: "block" }} />
            <button type="button" style={{ marginTop: 8, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12 }} onClick={() => onFirma("")}>🗑 Rifai</button>
          </div>
        ) : (
          <SignaturePad hasFirma={false} onSave={onFirma} onClear={() => onFirma("")} />
        )
      )}
    </div>
  );
}

function PrivacyPopup({ negozio, cliente, onConferma, onAnnulla }: {
  negozio: NegozioInfo | null;
  cliente: { nome: string; cognome: string };
  onConferma: (dati: { firma1: string; firma2: string; firma3: string; consenso1: boolean; consenso2: boolean; consenso3: boolean }) => void;
  onAnnulla: () => void;
}) {
  const [consenso1, setConsenso1] = useState<boolean | null>(null);
  const [consenso2, setConsenso2] = useState<boolean | null>(null);
  const [consenso3, setConsenso3] = useState<boolean | null>(null);
  const [firma1, setFirma1] = useState("");
  const [firma2, setFirma2] = useState("");
  const [firma3, setFirma3] = useState("");

  const oggi = new Date().toLocaleDateString("it-IT");
  const nomeCliente = `${cliente.cognome} ${cliente.nome}`.trim();
  const tutteCompilate = consenso1 !== null && firma1 && consenso2 !== null && firma2 && consenso3 !== null && firma3;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, maxWidth: 750, width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>

        <div style={{ background: "#111827", color: "#fff", padding: "20px 24px", borderRadius: "16px 16px 0 0", position: "sticky", top: 0, zIndex: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>📋 Dichiarazione di Consenso — Privacy</h2>
          {negozio?.nome && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af" }}>{negozio.nome} — {negozio.indirizzo}, {negozio.comune}</p>}
        </div>

        <div style={{ padding: 24 }}>

          {/* Intestazione documento */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{negozio?.nome || "GIOIE E ORO"}</div>
            {negozio?.indirizzo && <div style={{ fontSize: 13, color: "#555" }}>{negozio.indirizzo}, {negozio.comune}</div>}
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Dichiarazione di Consenso</div>
          </div>

          {/* Testo principale */}
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 1.7, color: "#374151" }}>
            L&apos;interessato dichiara di aver ricevuto debita informativa ai sensi dell&apos;art. 13 del Regolamento Generale UE sulla protezione dei dati personali n. 679/2016, unitamente all&apos;esposizione dei Diritti dell&apos;Interessato ai sensi degli artt. 15, 16, 17, 18 e 20 del Regolamento medesimo.<br /><br />
            Esprime il pieno e libero consenso al trattamento dei dati personali e di categorie particolari di dati personali «dati sensibili» per la fornitura dei servizi richiesti ed alla comunicazione degli stessi nei limiti, per le finalità e per la durata precisati nell&apos;informativa.<br /><br />
            Le autorizzazioni potranno essere revocate in ogni momento rivolgendo richiesta al Titolare mediante lettera raccomandata o e-mail.
          </div>

          {/* Dati cliente auto-compilati */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>Data</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{oggi}</div>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>Cognome e Nome</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{nomeCliente || "—"}</div>
            </div>
          </div>

          {/* Sezione 1 */}
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>Consenso 1 — Trattamento dati per servizi richiesti</div>
          <ConsensoBox
            testo="a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario su prodotti o servizi offerti dalla società."
            consenso={consenso1} onConsenso={setConsenso1}
            firma={firma1} onFirma={setFirma1}
          />

          {/* Sezione 2 */}
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>Consenso 2 — Comunicazioni commerciali</div>
          <ConsensoBox
            testo="a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario su prodotti o servizi offerti dalla GIOIE E ORO di De Pandis Davide."
            consenso={consenso2} onConsenso={setConsenso2}
            firma={firma2} onFirma={setFirma2}
          />

          {/* Sezione 3 */}
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 6 }}>Consenso 3 — Comunicazioni soggetti terzi</div>
          <ConsensoBox
            testo="a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario di soggetti terzi (business partner)."
            consenso={consenso3} onConsenso={setConsenso3}
            firma={firma3} onFirma={setFirma3}
          />

          {!tutteCompilate && (
            <p style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>⚠️ Seleziona Acconsento o Non Acconsento e firma per tutte e 3 le sezioni.</p>
          )}

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
            <button style={{ background: "#f3f4f6", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 9, padding: "11px 22px", cursor: "pointer", fontWeight: 700, fontSize: 14 }} onClick={onAnnulla}>
              Annulla
            </button>
            <button
              style={{ background: tutteCompilate ? "#059669" : "#9ca3af", color: "#fff", border: "none", borderRadius: 9, padding: "11px 28px", cursor: tutteCompilate ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14 }}
              onClick={() => { if (tutteCompilate) onConferma({
                firma1: firma1.split(",")[1] || firma1,
                firma2: firma2.split(",")[1] || firma2,
                firma3: firma3.split(",")[1] || firma3,
                consenso1: consenso1!,
                consenso2: consenso2!,
                consenso3: consenso3!,
              }); }}
              disabled={!tutteCompilate}
            >
              ✅ Conferma e prosegui
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SchedaAcquisti() {
  // Carica bozza salvata dal localStorage
  const bozza = typeof window !== "undefined" ? (() => { try { return JSON.parse(localStorage.getItem("scheda_bozza") || "null"); } catch { return null; } })() : null;
  const [customer, setCustomer] = useState(bozza?.customer || { ...emptyCustomer });
  const [items, setItems] = useState(bozza?.items || [{ ...emptyItem }]);
  const [dataOperazione, setDataOperazione] = useState(bozza?.dataOperazione || todayISO());
  const [mezzoPagamento, setMezzoPagamento] = useState(bozza?.mezzoPagamento || "contanti");
  const [croTrn, setCroTrn] = useState(bozza?.croTrn || "");
  const [totaleValore, setTotaleValore] = useState(bozza?.totaleValore || "");
  const [noteOperazione, setNoteOperazione] = useState(bozza?.noteOperazione || "");
  const [numeroScheda, setNumeroScheda] = useState<number | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backPreview, setBackPreview] = useState("");
  const [frontRawText, setFrontRawText] = useState("");
  const [backRawText, setBackRawText] = useState("");
  const [fotoDocumento, setFotoDocumento] = useState<FotoAllegata[]>([]);
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);
  const [firmaRicevutaDataUrl, setFirmaRicevutaDataUrl] = useState<string | null>(null);
  const [negozio, setNegozio] = useState<NegozioInfo | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [firmaPrivacyBase64, setFirmaPrivacyBase64] = useState<string | null>(null);
  const _bozzaData = typeof window !== "undefined" ? (() => { try { return JSON.parse(localStorage.getItem("scheda_bozza") || "null"); } catch { return null; } })() : null;
  const [status, setStatus] = useState(_bozzaData?.customer?.cognome
    ? { text: `📝 Bozza recuperata: ${_bozzaData.customer.cognome} ${_bozzaData.customer.nome} — salvata il ${new Date(_bozzaData.salvato).toLocaleString("it-IT")}. Premi "🔄 Nuova scheda" per azzerarla.`, type: "success" }
    : { text: "Pronto. Carica i documenti per iniziare.", type: "idle" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const firmaRef = useRef<HTMLDivElement>(null);
  const firmaRicevutaRef = useRef<HTMLDivElement>(null);
  const [clientiSuggeriti, setClientiSuggeriti] = useState<ClienteDB[]>([]);
  const [showSuggerimenti, setShowSuggerimenti] = useState(false);
  const [clienteSelezionato, setClienteSelezionato] = useState<ClienteDB | null>(null);
  const [avvisoOmonimi, setAvvisoOmonimi] = useState<ClienteDB[]>([]);
  const [suggerimentiIndirizzo, setSuggerimentiIndirizzo] = useState<any[]>([]);
  const [showSuggerimentiInd, setShowSuggerimentiInd] = useState(false);

  const [lightbox, setLightbox] = useState<{ src: string; nome: string } | null>(null);

  const totale = useMemo(() => items.reduce((a, i) => a + Number(i.valore || 0), 0), [items]);

  // Salva bozza automaticamente nel localStorage (escluse foto per spazio)
  useEffect(() => {
    try {
      const itemsSenzaFoto = items.map(it => ({ ...it, foto: [] }));
      localStorage.setItem("scheda_bozza", JSON.stringify({
        customer, items: itemsSenzaFoto,
        dataOperazione, mezzoPagamento, croTrn, totaleValore, noteOperazione,
        salvato: new Date().toISOString(),
      }));
    } catch {}
  }, [customer, items, dataOperazione, mezzoPagamento, croTrn, totaleValore, noteOperazione]);

  // Funzione per aggiornare nr articoli e ridimensionare pesiPezzi
  function uiNrArticoli(idx: number, nr: string) {
    // Permetti digitazione libera, aggiorna pesi solo se numero valido
    setItems(p => p.map((it, j) => {
      if (j !== idx) return it;
      const parsed = parseInt(nr);
      if (!nr || isNaN(parsed)) return { ...it, nrArticoli: nr }; // lascia digitare
      const n = Math.max(1, Math.min(99, parsed));
      const nuoviPesi = Array.from({ length: n }, (_, k) => it.pesiPezzi[k] || "");
      return { ...it, nrArticoli: String(n), pesiPezzi: nuoviPesi };
    }));
  }

  useEffect(() => {
    async function init() {
      // Carica numero scheda
      const { data: ops } = await supabase.from("operazioni").select("numero_scheda").order("numero_scheda", { ascending: false }).limit(1);
      setNumeroScheda((ops?.[0]?.numero_scheda || 0) + 1);
      // Carica dati negozio
      const { data: neg } = await supabase.from("negozio").select("*").eq("id", 1).single();
      if (neg) setNegozio({
        nome: neg.nome || "", indirizzo: neg.indirizzo || "",
        comune: neg.comune || "", provincia: neg.provincia || "",
        cap: neg.cap || "", piva: neg.piva || "",
        telefono: neg.telefono || "", email: neg.email || "",
        firma_base64: neg.firma_base64 || "", logo_base64: neg.logo_base64 || "",
        testo_privacy: neg.testo_privacy || "",
      });
    }
    init();
  }, []);

  const uc = (f: string, v: string) => setCustomer((p: any) => ({ ...p, [f]: v }));
  const ui = (i: number, f: string, v: any) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [f]: v } : it));

  async function handleFile(file: File | null, setFile: any, setPreview: any, side: string) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setStatus({ text: "Il file deve essere un'immagine.", type: "error" }); return; }
    setFile(file);
    setStatus({ text: `⏳ Elaborazione ${side}...`, type: "loading" });
    const { base64, previewUrl, mimeType } = await fixOrientation(file);
    setPreview(previewUrl);
    const tipo = side === "Fronte" ? "fronte" : "retro";
    setFotoDocumento((prev: FotoAllegata[]) => [...prev.filter((f: FotoAllegata) => !f.nome.startsWith(tipo + "_")),
      { nome: `${tipo}_${file.name}`, mimeType, base64, preview: previewUrl }]);
    setStatus({ text: `✅ ${side} caricato e orientato correttamente.`, type: "success" });
  }

  async function runOCR(file: File | null, side: string) {
    if (!file || loading) return;
    try {
      setLoading(true);
      setStatus({ text: `Analisi ${side === "front" ? "fronte" : "retro"} con Claude AI...`, type: "loading" });
      const b64 = await fileToBase64(file);
      const parsed = await callClaudeOCR(b64, file.type || "image/jpeg");
      if (side === "front") setFrontRawText(parsed.rawText || "");
      else setBackRawText(parsed.rawText || "");
      setCustomer((prev: any) => ({
        ...prev,
        nome: parsed.nome || prev.nome, cognome: parsed.cognome || prev.cognome,
        luogoNascita: parsed.luogoNascita || prev.luogoNascita, dataNascita: parsed.dataNascita || prev.dataNascita,
        indirizzo: parsed.indirizzo || prev.indirizzo, comune: parsed.comune || prev.comune,
        provincia: parsed.provincia || prev.provincia, cap: parsed.cap || prev.cap,
        codiceFiscale: parsed.codiceFiscale || prev.codiceFiscale,
        tipoDocumento: parsed.tipoDocumento || prev.tipoDocumento,
        numeroDocumento: parsed.numeroDocumento || prev.numeroDocumento,
        dataRilascio: parsed.dataRilascio || prev.dataRilascio,
        dataScadenza: parsed.dataScadenza || prev.dataScadenza,
        enteRilascio: parsed.enteRilascio || prev.enteRilascio,
      }));
      setStatus({ text: `✅ ${side === "front" ? "Fronte" : "Retro"} elaborato!`, type: "success" });
    } catch (e: any) {
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function runOCREntrambi() {
    if (loading) return;
    if (!frontFile && !backFile) {
      setStatus({ text: "⚠️ Carica almeno un documento (fronte o retro) prima di procedere.", type: "error" });
      return;
    }
    try {
      setLoading(true);
      setStatus({ text: "🤖 Analisi documento con Claude AI...", type: "loading" });

      const content: any[] = [];
      if (frontFile) {
        const { base64: b64, mimeType: mt } = await fixOrientation(frontFile);
        content.push({ type: "image", source: { type: "base64", media_type: mt, data: b64 } });
        content.push({ type: "text", text: "Questa è la FRONTE del documento di identità." });
      }
      if (backFile) {
        const { base64: b64, mimeType: mt } = await fixOrientation(backFile);
        content.push({ type: "image", source: { type: "base64", media_type: mt, data: b64 } });
        content.push({ type: "text", text: "Questo è il RETRO del documento di identità." });
      }
      content.push({ type: "text", text: `Sei un sistema OCR specializzato ESCLUSIVAMENTE in documenti di identità italiani. Il tuo compito è estrarre dati con la massima precisione possibile.

IDENTIFICA PRIMA IL TIPO DI DOCUMENTO osservando le immagini, poi applica le regole specifiche:

━━━ CARTA D'IDENTITÀ ITALIANA (CIE) — ELETTRONICA (dal 2016) ━━━
FRONTE: In alto a destra il NUMERO documento (formato: AA 00000 AA, es. CA 12345 BC — 2 lettere, 5 cifre, 2 lettere).
Sotto trovi in ordine: COGNOME, NOME, LUOGO DI NASCITA, DATA DI NASCITA, SESSO, STATURA, CITTADINANZA.
In basso: INDIRIZZO di residenza, COMUNE, e il CODICE FISCALE (16 caratteri).
RETRO: DATA DI SCADENZA (in alto), ENTE CHE HA RILASCIATO (es. "COMUNE DI TORINO"), e la striscia MRZ in fondo.
Dalla MRZ (2 righe da 30 caratteri): riga 1 inizia con IDITA, riga 2 ha data nascita (AAMMGG), scadenza, CF.

━━━ CARTA D'IDENTITÀ ITALIANA — CARTACEA VECCHIO TIPO (prima 2016) ━━━
Formato orizzontale o verticale, con foto incollata. Dati scritti a mano o stampati.
NUMERO: in genere inizia con lettere seguite da numeri (es. TO1234567).
Cerca: cognome, nome, luogo e data di nascita, residenza, data rilascio, data scadenza, comune che ha rilasciato.
Il CODICE FISCALE potrebbe essere assente — non inventarlo.

━━━ PATENTE DI GUIDA ITALIANA ━━━
FRONTE: In alto "UNIONE EUROPEA — ITALIA — PATENTE DI GUIDA".
Campo 1: COGNOME. Campo 2: NOME. Campo 3: DATA NASCITA (GG.MM.AAAA) / luogo nascita.
Campo 4a: DATA RILASCIO. Campo 4b: DATA SCADENZA. Campo 4c: ENTE RILASCIO (es. MIT — UMC TORINO).
Campo 5: NUMERO PATENTE (es. TO0123456A).
Il CODICE FISCALE non è sulla patente — lascia vuoto se non visibile.

━━━ PASSAPORTO ITALIANO ━━━
Dati nella pagina dati. MRZ in fondo (2 righe da 44 caratteri).
Riga MRZ 1: P<ITA seguito da COGNOME<<NOME.
Riga MRZ 2: NUMERO(9) + ITA + DATANASCITA(AAMMGG) + SESSO + SCADENZA(AAMMGG) + CF(16 caratteri) + cifre.

━━━ REGOLE UNIVERSALI ━━━
DATE: Converti SEMPRE in YYYY-MM-DD.
  "15 MAR 1990" → "1990-03-15"
  "15/03/1990" → "1990-03-15"
  "15.03.90" → "1990-03-15"
  "150390" (MRZ) → "1990-03-15"
CODICE FISCALE: esattamente 16 caratteri (6 lettere + 2 cifre + 1 lettera + 2 cifre + 1 lettera + 3 cifre/lettere + 1 lettera). Se non sei sicuro al 100%, lascia vuoto.
INDIRIZZO: separa via/piazza dal comune. Es: indirizzo="Via Roma 1", comune="Torino", provincia="TO".
NON INVENTARE MAI dati non visibili. Se non leggibile → stringa vuota "".
tipoDocumento: usa ESATTAMENTE "Carta di identità" oppure "Patente di guida" oppure "Passaporto".

Rispondi SOLO con questo JSON (nessun testo prima/dopo, nessun markdown, nessun commento):
{
  "nome": "",
  "cognome": "",
  "luogoNascita": "",
  "dataNascita": "YYYY-MM-DD",
  "indirizzo": "",
  "comune": "",
  "provincia": "",
  "cap": "",
  "codiceFiscale": "",
  "tipoDocumento": "",
  "numeroDocumento": "",
  "dataRilascio": "YYYY-MM-DD",
  "dataScadenza": "YYYY-MM-DD",
  "enteRilascio": "",
  "rawTextFronte": "",
  "rawTextRetro": ""
}` });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2000, messages: [{ role: "user", content }] })
      });
      if (!response.ok) { const err = await response.json(); throw new Error(err?.error?.message || "Errore API Claude"); }
      const data = await response.json();
      const text = data.content?.map((b: any) => b.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      setFrontRawText(parsed.rawTextFronte || "");
      setBackRawText(parsed.rawTextRetro || "");
      setCustomer((prev: any) => ({
        ...prev,
        nome: parsed.nome || prev.nome, cognome: parsed.cognome || prev.cognome,
        luogoNascita: parsed.luogoNascita || prev.luogoNascita, dataNascita: parsed.dataNascita || prev.dataNascita,
        indirizzo: parsed.indirizzo || prev.indirizzo, comune: parsed.comune || prev.comune,
        provincia: parsed.provincia || prev.provincia, cap: parsed.cap || prev.cap,
        codiceFiscale: parsed.codiceFiscale || prev.codiceFiscale,
        tipoDocumento: parsed.tipoDocumento || prev.tipoDocumento,
        numeroDocumento: parsed.numeroDocumento || prev.numeroDocumento,
        dataRilascio: parsed.dataRilascio || prev.dataRilascio,
        dataScadenza: parsed.dataScadenza || prev.dataScadenza,
        enteRilascio: parsed.enteRilascio || prev.enteRilascio,
      }));
      setStatus({ text: "✅ Documento analizzato! Verifica i dati compilati automaticamente.", type: "success" });
    } catch (e: any) {
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  }

  // Primo click su Salva → apre popup privacy
  function handleSalvaClick() {
    if (!customer.cognome || !customer.nome) {
      setStatus({ text: "⚠️ Inserisci almeno nome e cognome del cliente.", type: "error" });
      return;
    }
    if (!firmaDataUrl) {
      setStatus({ text: "✍️ La firma del cliente è obbligatoria. Fai firmare il cliente nella sezione 4.", type: "error" });
      firmaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!firmaRicevutaDataUrl) {
      setStatus({ text: "✍️ La firma per la ricevuta riepilogativa è obbligatoria (ultima sezione).", type: "error" });
      firmaRicevutaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // Salta privacy se cliente già registrato con privacy accettata
    if (clienteSelezionato?.privacy_accettata) {
      const datiPrivacyVuoti = { firma1: "", firma2: "", firma3: "", consenso1: true, consenso2: true, consenso3: true };
      salvaScheda(datiPrivacyVuoti);
      return;
    }
    // Apre popup privacy
    setShowPrivacy(true);
  }

  // Dopo conferma privacy → salva tutto
  function buildSchedaHTML(numScheda: number, privacyDati: { firma1: string; firma2: string; firma3: string; consenso1: boolean; consenso2: boolean; consenso3: boolean }) {
    const dataOra = new Date(dataOperazione).toLocaleDateString("it-IT");
    const pesoAuTot = items.filter(i => i.materiale === "oro").reduce((a, i) => a + i.pesiPezzi.reduce((b, p) => b + Number(p||0), 0), 0);
    const pesoAgTot = items.filter(i => i.materiale === "argento").reduce((a, i) => a + i.pesiPezzi.reduce((b, p) => b + Number(p||0), 0), 0);
    const oggettiRows = items.filter(i => i.descrizione).map((o, idx) => {
      const peso = o.pesiPezzi.reduce((a, p) => a + Number(p||0), 0);
      return `<tr>
        <td style="font-weight:700">${idx+1}. ${o.descrizione}</td>
        <td style="text-align:center">${o.nrArticoli} pz</td>
        <td style="text-align:center">${o.materiale === "oro" ? "🟡 AU" : "⚪ AG"}</td>
        <td style="text-align:center">${peso.toFixed(2)} g</td>
        <td style="text-align:right;font-weight:700">${currency(o.valore)}</td>
      </tr>`;
    }).join("");
    const firmaClienteB64 = firmaDataUrl ? firmaDataUrl.split(",")[1] || firmaDataUrl : "";
    const firmaRicevutaB64 = firmaRicevutaDataUrl ? firmaRicevutaDataUrl.split(",")[1] || firmaRicevutaDataUrl : "";
    const logoHtml = negozio?.logo_base64 ? `<img src="data:image/png;base64,${negozio.logo_base64}" style="max-height:50px;max-width:100px;object-fit:contain" alt="Logo">` : `<span style="font-size:16px;font-weight:800">${negozio?.nome || "Compro Oro"}</span>`;
    return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Scheda N° ${numScheda}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10.5px; color: #111; margin: 0; padding: 0; line-height: 1.25; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #111; padding-bottom: 6px; margin-bottom: 6px; }
  .hdr-info { font-size: 10px; line-height: 1.5; color: #444; margin-top: 3px; }
  .scheda-num { font-size: 26px; font-weight: 900; color: #111; text-align: right; line-height: 1; }
  .scheda-data { font-size: 11px; color: #444; text-align: right; }
  .titolo { font-size: 12px; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: 2px; margin: 4px 0; border: 1px solid #111; padding: 2px; }
  .sec { font-size: 9.5px; font-weight: 900; text-transform: uppercase; color: #fff; background: #374151; padding: 2px 8px; margin: 4px 0 2px; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  td, th { border: 0.5px solid #bbb; padding: 2px 5px; font-size: 10.5px; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 700; width: 130px; white-space: nowrap; }
  .ogg-th { background: #374151; color: #fff; font-size: 10px; font-weight: 700; }
  .totale-row td { font-weight: 900; font-size: 13px; background: #f9fafb; }
  .firma-box { border: 0.5px solid #bbb; border-radius: 4px; padding: 3px 6px; display: inline-block; }
  .firma-img { max-height: 38px; max-width: 140px; object-fit: contain; display: block; }
  .dichiarazione { font-size: 9px; line-height: 1.4; border: 0.5px solid #bbb; padding: 4px 8px; background: #fffef0; margin: 3px 0; }
  .two-col { display: flex; gap: 8px; }
  .two-col > div { flex: 1; }
  /* .foto-doc rimossa dalla scheda - le foto sono in fogli separati */
  .consensi { font-size: 10px; }
  .footer { font-size: 9px; color: #9ca3af; text-align: center; margin-top: 6px; border-top: 0.5px solid #e5e7eb; padding-top: 4px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>

<!-- HEADER -->
<div class="hdr">
  <div>${logoHtml}<div class="hdr-info">${negozio?.indirizzo || ""} — ${negozio?.comune || ""} (${negozio?.provincia || ""})<br>P.IVA: ${negozio?.piva || ""} | Tel: ${negozio?.telefono || ""}</div></div>
  <div><div class="scheda-num">N° ${numScheda}</div><div class="scheda-data">${dataOra}</div></div>
</div>

<div class="titolo">Scheda Cessione Beni Usati</div>

<!-- CLIENTE + DOCUMENTO su 2 colonne -->
<div class="two-col">
  <div>
    <div class="sec">👤 Dati Cliente</div>
    <table>
      <tr><th>Cognome e Nome</th><td><strong>${customer.cognome} ${customer.nome}</strong></td></tr>
      <tr><th>Nato/a a</th><td>${customer.luogoNascita}${customer.dataNascita ? " il " + new Date(customer.dataNascita).toLocaleDateString("it-IT") : ""}</td></tr>
      <tr><th>Residenza</th><td>${customer.indirizzo}${customer.comune ? ", " + customer.comune : ""}${customer.provincia ? " (" + customer.provincia + ")" : ""}${customer.cap ? " " + customer.cap : ""}</td></tr>
      <tr><th>Cod. Fiscale</th><td style="font-family:monospace;font-weight:700">${customer.codiceFiscale}</td></tr>
      ${customer.telefono ? `<tr><th>Telefono</th><td>${customer.telefono}</td></tr>` : ""}
    </table>
  </div>
  <div>
    <div class="sec">🪪 Documento Identità</div>
    <table>
      <tr><th>Tipo</th><td>${customer.tipoDocumento}</td></tr>
      <tr><th>Numero</th><td style="font-family:monospace;font-weight:700">${customer.numeroDocumento}</td></tr>
      <tr><th>Rilasciato da</th><td>${customer.enteRilascio}</td></tr>
      <tr><th>Data rilascio</th><td>${customer.dataRilascio ? new Date(customer.dataRilascio).toLocaleDateString("it-IT") : "—"}</td></tr>
      <tr><th>Scadenza</th><td>${customer.dataScadenza ? new Date(customer.dataScadenza).toLocaleDateString("it-IT") : "—"}</td></tr>
    </table>
  </div>
</div>

<!-- OGGETTI -->
<div class="sec">📦 Oggetti Ceduti</div>
<table>
  <tr><th class="ogg-th">Descrizione</th><th class="ogg-th" style="width:50px">Pezzi</th><th class="ogg-th" style="width:60px">Tipo</th><th class="ogg-th" style="width:70px">Peso</th><th class="ogg-th" style="width:80px">Valore</th></tr>
  ${oggettiRows}
  <tr class="totale-row">
    <td colspan="3">TOTALE — ${mezzoPagamento.toUpperCase()}${croTrn ? " | CRO/TRN: " + croTrn : ""}</td>
    <td>${pesoAuTot > 0 ? pesoAuTot.toFixed(2) + "g AU" : ""}${pesoAgTot > 0 ? (pesoAuTot > 0 ? " / " : "") + pesoAgTot.toFixed(2) + "g AG" : ""}</td>
    <td style="text-align:right;font-size:14px">${currency(totale)}</td>
  </tr>
</table>

<!-- DICHIARAZIONE + FIRME su 2 colonne -->
<div class="two-col" style="margin-top:4px">
  <div>
    <div class="sec">✍️ Dichiarazione</div>
    <div class="dichiarazione">
      DICHIARA che l'oggetto/i sopraindicato/i è/sono di sua esclusiva proprietà e che sullo stesso/i non esistono vincoli, garanzie e/o pegni di qualsivoglia natura. Autorizza inoltre il trattamento dei propri dati personali ai sensi del D.Lgs. 196/2003 e del GDPR 2016/679.
    </div>
    <div style="margin-top:4px">
      <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:2px">Firma Cliente:</div>
      ${firmaClienteB64 ? `<img src="data:image/png;base64,${firmaClienteB64}" class="firma-img">` : "<div style='height:40px;border:0.5px dashed #ccc'></div>"}
    </div>
  </div>
  <div>
    <div class="sec">🧾 Ricevuta Pagamento</div>
    <div class="dichiarazione">
      Il cliente firma per ricevuta della presente scheda e conferma di aver ricevuto <strong>${currency(totale)}</strong> mediante <strong>${mezzoPagamento}</strong>${croTrn ? " (CRO/TRN: " + croTrn + ")" : ""}.
    </div>
    <div style="margin-top:4px">
      <div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:2px">Firma Ricevuta:</div>
      ${firmaRicevutaB64 ? `<img src="data:image/png;base64,${firmaRicevutaB64}" class="firma-img">` : "<div style='height:40px;border:0.5px dashed #ccc'></div>"}
    </div>
    ${negozio?.firma_base64 ? `<div style="margin-top:6px"><div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:2px">Firma Titolare:</div><img src="data:image/png;base64,${negozio.firma_base64}" class="firma-img"></div>` : ""}
  </div>
</div>

<div class="footer">Scheda N° ${numScheda} — ${negozio?.nome || ""} — P.IVA ${negozio?.piva || ""} — ${new Date().toLocaleDateString("it-IT")}</div>
</body></html>`;
  }

  function buildFotoHTML(titolo: string, numScheda: number, fotografie: { base64: string; mimeType: string; label: string }[]) {
    const logoHtml = negozio?.logo_base64 ? `<img src="data:image/png;base64,${negozio.logo_base64}" style="max-height:40px;object-fit:contain" alt="Logo">` : `<span style="font-size:15px;font-weight:800">${negozio?.nome || "Compro Oro"}</span>`;
    if (fotografie.length === 0) return "";
    // 2 foto per pagina, grandi
    const pagine: { base64: string; mimeType: string; label: string }[][] = [];
    for (let i = 0; i < fotografie.length; i += 2) pagine.push(fotografie.slice(i, i + 2));
    const paginaHTML = (foto: { base64: string; mimeType: string; label: string }[], isFirst: boolean) => `
<div style="page-break-after:always;height:277mm;display:flex;flex-direction:column;padding:8mm 10mm;box-sizing:border-box;">
  ${isFirst ? `<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px;flex-shrink:0">
    <div>${logoHtml}</div>
    <div style="text-align:right;font-size:11px"><strong>Scheda N° ${numScheda}</strong> — ${new Date(dataOperazione).toLocaleDateString("it-IT")}<br><strong>${customer.cognome} ${customer.nome}</strong></div>
  </div>
  <div style="font-size:13px;font-weight:900;text-align:center;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;flex-shrink:0">${titolo}</div>` : ""}
  <div style="flex:1;display:flex;flex-direction:column;gap:10px;min-height:0">
    ${foto.map(f => `<div style="flex:1;display:flex;flex-direction:column;min-height:0">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#374151;margin-bottom:4px;flex-shrink:0">${f.label}</div>
      <img src="data:${f.mimeType};base64,${f.base64}" style="width:100%;flex:1;min-height:0;object-fit:contain;border:1px solid #aaa;border-radius:6px;display:block">
    </div>`).join("")}
  </div>
</div>`;
    return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${titolo} N° ${numScheda}</title>
<style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
${pagine.map((p, i) => paginaHTML(p, i === 0)).join("")}
</body></html>`;
  }

  function buildDocumentiHTML(numScheda: number) {
    const fotoFronteB64 = fotoDocumento.find(f => f.nome.startsWith("fronte_"))?.base64 || "";
    const fotoRetroB64 = fotoDocumento.find(f => f.nome.startsWith("retro_"))?.base64 || "";
    const fotografie = [
      fotoFronteB64 ? { base64: fotoFronteB64, mimeType: "image/jpeg", label: "Fronte documento" } : null,
      fotoRetroB64 ? { base64: fotoRetroB64, mimeType: "image/jpeg", label: "Retro documento" } : null,
    ].filter(Boolean) as { base64: string; mimeType: string; label: string }[];
    return buildFotoHTML("📄 Foto Documento di Identità", numScheda, fotografie);
  }

  function buildOggettiHTML(numScheda: number) {
    const fotografie = items.flatMap((it, idx) =>
      it.foto.map((f, j) => ({
        base64: f.base64,
        mimeType: f.mimeType,
        label: `Oggetto ${idx+1}${it.foto.length > 1 ? " — foto " + (j+1) : ""}${it.descrizione ? ": " + it.descrizione : ""}`,
      }))
    );
    return buildFotoHTML("📦 Foto Oggetti Acquistati", numScheda, fotografie);
  }

  function buildPrivacyHTMLScheda(numScheda: number, privacyDati: { firma1: string; firma2: string; firma3: string; consenso1: boolean; consenso2: boolean; consenso3: boolean }) {
    const logoHtml = negozio?.logo_base64 ? `<img src="data:image/png;base64,${negozio.logo_base64}" style="max-height:45px;object-fit:contain" alt="Logo">` : `<span style="font-size:15px;font-weight:800">${negozio?.nome || "Compro Oro"}</span>`;
    const oggi = new Date().toLocaleDateString("it-IT");
    const nomeCliente = `${customer.cognome} ${customer.nome}`.trim();
    const firmaImg = (b64: string) => b64 ? `<img src="data:image/png;base64,${b64}" style="max-height:55px;max-width:200px;object-fit:contain;border:1px solid #ccc;border-radius:4px;background:#fafafa;display:block">` : "<div style='height:55px;border:1px dashed #ccc;border-radius:4px'></div>";
    const consensoRow = (n: number, testo: string, si: boolean, firma: string) => `
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Consenso ${n}</div>
        <div style="font-size:11px;line-height:1.6;color:#374151;margin-bottom:8px">${testo}</div>
        <div style="display:flex;gap:20px;margin-bottom:8px">
          <span style="font-weight:700;color:${si ? "#059669" : "#dc2626"}">${si ? "✅ ACCONSENTO" : "❌ NON ACCONSENTO"}</span>
        </div>
        ${firmaImg(firma)}
      </div>`;
    return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Privacy N° ${numScheda}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 12mm; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="hdr">
  <div>${logoHtml}<div style="font-size:10px;color:#444;margin-top:3px">${negozio?.indirizzo || ""} — ${negozio?.comune || ""} | P.IVA: ${negozio?.piva || ""}</div></div>
  <div style="text-align:right"><strong>Scheda N° ${numScheda}</strong><br>${oggi}</div>
</div>
<div style="font-size:14px;font-weight:900;text-align:center;text-transform:uppercase;letter-spacing:2px;border:1px solid #111;padding:3px;margin-bottom:10px">Dichiarazione di Consenso — Privacy</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px">
  <div><span style="font-size:10px;color:#6b7280">Data</span><br><strong>${oggi}</strong></div>
  <div><span style="font-size:10px;color:#6b7280">Cognome e Nome</span><br><strong>${nomeCliente}</strong></div>
</div>
<div style="font-size:10px;line-height:1.6;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;margin-bottom:10px">
  L'interessato dichiara di aver ricevuto debita informativa ai sensi dell'art. 13 del Regolamento UE 679/2016 (GDPR) ed esprime il pieno e libero consenso al trattamento dei propri dati personali per la fornitura dei servizi richiesti.
</div>
${consensoRow(1, "a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali su prodotti o servizi offerti dalla società.", privacyDati.consenso1, privacyDati.firma1)}
${consensoRow(2, `a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali su prodotti o servizi offerti da ${negozio?.nome || "GIOIE E ORO"}.`, privacyDati.consenso2, privacyDati.firma2)}
${consensoRow(3, "a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali di soggetti terzi (business partner).", privacyDati.consenso3, privacyDati.firma3)}
<div style="font-size:9px;color:#9ca3af;text-align:center;margin-top:10px;border-top:1px solid #e5e7eb;padding-top:6px">
  Privacy — Scheda N° ${numScheda} — ${negozio?.nome || ""} — P.IVA ${negozio?.piva || ""} — ${oggi}
</div>
</body></html>`;
  }

  function apriInNuovaFinestra(html: string, titolo: string, stampa: boolean, copie = 1) {
    const win = window.open("", "_blank");
    if (!win) return;
    // Inietta CSS per 3 copie se richiesto
    const htmlConCopie = copie > 1
      ? html.replace("</style>", `  @page { size: A4 portrait; } </style>`) + `<script>window._copie=${copie};</script>`
      : html;
    win.document.write(htmlConCopie);
    win.document.close();
    if (stampa) {
      if (copie > 1) {
        // Apri dialogo stampa nativo con copies pre-impostato
        setTimeout(() => {
          win.focus();
          // Tenta di pre-impostare le copie tramite CSS @page (funziona su alcuni browser)
          const style = win.document.createElement("style");
          style.textContent = \`@page { size: A4; }\`;
          win.document.head.appendChild(style);
          win.print();
        }, 800);
      } else {
        setTimeout(() => { win.focus(); win.print(); }, 800);
      }
    }
  }

  function scaricaHTMLComePDF(html: string, nomeFile: string) {
    // Crea blob HTML e scarica — apribile con qualsiasi app di stampa inclusa Epson iPrint
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function stampaPDFDopoSalvataggio(privacyDati: { firma1: string; firma2: string; firma3: string; consenso1: boolean; consenso2: boolean; consenso3: boolean }, numScheda: number, isNuovoCliente: boolean) {
    const htmlScheda = buildSchedaHTML(numScheda, privacyDati);
    const htmlDoc = buildDocumentiHTML(numScheda);
    const htmlOgg = buildOggettiHTML(numScheda);
    const htmlPriv = buildPrivacyHTMLScheda(numScheda, privacyDati);
    const isAndroid = /android/i.test(navigator.userAgent);

    // Foglio 1: Scheda (sempre) — 3 copie
    apriInNuovaFinestra(htmlScheda, "Scheda", true, 3);

    // Foglio 2: Foto documento (sempre se ci sono)
    const hasFotoDoc = fotoDocumento.some(f => f.nome.startsWith("fronte_") || f.nome.startsWith("retro_"));
    if (hasFotoDoc && htmlDoc) setTimeout(() => apriInNuovaFinestra(htmlDoc, "Documenti", true), 1800);

    // Foglio 3: Foto oggetti (sempre se ci sono)
    const hasFotoOgg = items.some(it => it.foto.length > 0);
    if (hasFotoOgg && htmlOgg) setTimeout(() => apriInNuovaFinestra(htmlOgg, "Oggetti", true), 3600);

    // Foglio 4: Privacy NON si stampa automaticamente — solo da dashboard

    // Android: scarica anche i file
    if (isAndroid) {
      setTimeout(() => {
        scaricaHTMLComePDF(htmlScheda, `scheda_${numScheda}.html`);
        if (hasFotoDoc) setTimeout(() => scaricaHTMLComePDF(htmlDoc, `documenti_${numScheda}.html`), 500);
        if (hasFotoOgg) setTimeout(() => scaricaHTMLComePDF(htmlOgg, `oggetti_${numScheda}.html`), 1000);
        if (isNuovoCliente) setTimeout(() => scaricaHTMLComePDF(htmlPriv, `privacy_${numScheda}.html`), 1500);
      }, 1000);
    }
  }

  async function salvaScheda(privacyDati: { firma1: string; firma2: string; firma3: string; consenso1: boolean; consenso2: boolean; consenso3: boolean }) {
    setShowPrivacy(false);
    const firmaPrivB64 = privacyDati.firma1;
    setFirmaPrivacyBase64(firmaPrivB64);
    try {
      setSaving(true);
      setStatus({ text: "💾 Salvataggio in corso...", type: "loading" });

      // 1. Cliente
      let clienteId: number | null = null;
      if (customer.codiceFiscale) {
        const { data: existing } = await supabase.from("clienti").select("id").eq("codice_fiscale", customer.codiceFiscale).single();
        if (existing) {
          clienteId = existing.id;
          await supabase.from("clienti").update({
            nome: customer.nome, cognome: customer.cognome,
            luogo_nascita: customer.luogoNascita, data_nascita: customer.dataNascita || null,
            indirizzo: customer.indirizzo, comune: customer.comune,
            provincia: customer.provincia, cap: customer.cap,
            telefono: customer.telefono, email: customer.email, note: customer.note,
            privacy_accettata: true, privacy_data: todayISO(),
            firma_privacy_base64: firmaPrivB64,
          }).eq("id", clienteId);
        }
      }
      if (!clienteId) {
        const { data: newCliente, error: errCliente } = await supabase.from("clienti").insert({
          nome: customer.nome, cognome: customer.cognome,
          luogo_nascita: customer.luogoNascita, data_nascita: customer.dataNascita || null,
          indirizzo: customer.indirizzo, comune: customer.comune,
          provincia: customer.provincia, cap: customer.cap,
          codice_fiscale: customer.codiceFiscale || null,
          telefono: customer.telefono, email: customer.email, note: customer.note,
          privacy_accettata: true, privacy_data: todayISO(),
          firma_privacy_base64: firmaPrivB64,
        }).select("id").single();
        if (errCliente) throw new Error("Errore salvataggio cliente: " + errCliente.message);
        clienteId = newCliente.id;
      }

      // 2. Operazione
      const { data: operazione, error: errOp } = await supabase.from("operazioni").insert({
        numero_scheda: numeroScheda, data_operazione: dataOperazione,
        cliente_id: clienteId, tipo_documento: customer.tipoDocumento,
        numero_documento: customer.numeroDocumento,
        data_rilascio: customer.dataRilascio || null,
        data_scadenza: customer.dataScadenza || null,
        ente_rilascio: customer.enteRilascio,
        mezzo_pagamento: mezzoPagamento, cro_trn: croTrn,
        totale_valore: totale || null, note_operazione: noteOperazione,
      }).select("id").single();
      if (errOp) throw new Error("Errore salvataggio operazione: " + errOp.message);
      const operazioneId = operazione.id;

      // 3. Oggetti
      const oggettiDaSalvare = items.filter(i => i.descrizione).map(i => {
        const pesoTot = i.pesiPezzi.reduce((a, p) => a + Number(p || 0), 0);
        return {
          operazione_id: operazioneId,
          descrizione: `[${i.nrArticoli} pz] ${i.descrizione}`,
          materiale: i.materiale,
          peso_au: i.materiale === "oro" ? pesoTot : null,
          peso_ag: i.materiale === "argento" ? pesoTot : null,
          valore: i.valore ? Number(i.valore) : null,
          note: i.note,
        };
      });
      if (oggettiDaSalvare.length > 0) {
        const { error: errOgg } = await supabase.from("oggetti").insert(oggettiDaSalvare);
        if (errOgg) throw new Error("Errore oggetti: " + errOgg.message);
      }

      // 4. Foto documento
      if (fotoDocumento.length > 0) {
        await supabase.from("foto_scheda").insert(fotoDocumento.map(f => ({
          operazione_id: operazioneId,
          tipo: f.nome.startsWith("fronte_") ? "documento_fronte" : f.nome.startsWith("retro_") ? "documento_retro" : "documento",
          nome_file: f.nome, mime_type: f.mimeType, data_base64: f.base64,
        })));
      }

      // 5. Foto oggetti
      const fotoOggetti: any[] = [];
      items.forEach((item, idx) => { item.foto.forEach(f => { fotoOggetti.push({ operazione_id: operazioneId, tipo: `oggetto_${idx + 1}`, nome_file: f.nome, mime_type: f.mimeType, data_base64: f.base64 }); }); });
      if (fotoOggetti.length > 0) await supabase.from("foto_scheda").insert(fotoOggetti);

      // 6. Firma cliente scheda
      if (firmaDataUrl) {
        await supabase.from("foto_scheda").insert({ operazione_id: operazioneId, tipo: "firma_cliente", nome_file: "firma.png", mime_type: "image/png", data_base64: firmaDataUrl.split(",")[1] });
      }
      if (firmaRicevutaDataUrl) {
        await supabase.from("foto_scheda").insert({ operazione_id: operazioneId, tipo: "firma_ricevuta", nome_file: "firma_ricevuta.png", mime_type: "image/png", data_base64: firmaRicevutaDataUrl.split(",")[1] });
      }

      // 7. Firme privacy
      await supabase.from("foto_scheda").insert({ operazione_id: operazioneId, tipo: "firma_privacy", nome_file: "firma_privacy.png", mime_type: "image/png", data_base64: privacyDati.firma1 });
      if (privacyDati.firma2) await supabase.from("foto_scheda").insert({ operazione_id: operazioneId, tipo: "firma_privacy2", nome_file: "firma_privacy2.png", mime_type: "image/png", data_base64: privacyDati.firma2 });
      if (privacyDati.firma3) await supabase.from("foto_scheda").insert({ operazione_id: operazioneId, tipo: "firma_privacy3", nome_file: "firma_privacy3.png", mime_type: "image/png", data_base64: privacyDati.firma3 });
      // Salva consensi nelle note operazione
      const privacyNote = "PRIVACY: consenso1=" + (privacyDati.consenso1?"SI":"NO") + " consenso2=" + (privacyDati.consenso2?"SI":"NO") + " consenso3=" + (privacyDati.consenso3?"SI":"NO");
      await supabase.from("operazioni").update({ note_operazione: (noteOperazione ? noteOperazione + " | " : "") + privacyNote }).eq("id", operazioneId);

      try { localStorage.removeItem("scheda_bozza"); } catch {}
      setSavedOk(true);
      const isAndroid = /android/i.test(navigator.userAgent);
      setStatus({ text: isAndroid ? `✅ Scheda n° ${numeroScheda} salvata! File scaricati — aprili con Epson iPrint per stampare.` : `✅ Scheda n° ${numeroScheda} salvata! Apertura stampa...`, type: "success" });
      const numAttuale = numeroScheda || 1;
      setNumeroScheda(prev => (prev || 0) + 1);
      setTimeout(() => stampaPDFDopoSalvataggio(privacyDati, numAttuale, !clienteSelezionato), 300);
    } catch (e: any) {
      console.error(e);
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    try { localStorage.removeItem("scheda_bozza"); } catch {}
    setCustomer({ ...emptyCustomer }); setItems([{ ...emptyItem, pesiPezzi: [""] }]);
    setDataOperazione(todayISO()); setMezzoPagamento("contanti");
    setCroTrn(""); setTotaleValore(""); setNoteOperazione("");
    setFrontFile(null); setBackFile(null); setFrontPreview(""); setBackPreview("");
    setFrontRawText(""); setBackRawText(""); setFotoDocumento([]);
    setFirmaDataUrl(null); setFirmaPrivacyBase64(null); setSavedOk(false);
    setClienteSelezionato(null); setAvvisoOmonimi([]);
    setStatus({ text: "Nuova scheda pronta.", type: "idle" });
    if (frontRef.current) frontRef.current.value = "";
    if (backRef.current) backRef.current.value = "";
  }

  async function cercaIndirizzo(query: string) {
    if (query.length < 4) { setSuggerimentiIndirizzo([]); setShowSuggerimentiInd(false); return; }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", Italia")}&format=json&addressdetails=1&limit=5&countrycodes=it`, {
        headers: { "Accept-Language": "it" }
      });
      const data = await res.json();
      if (data?.length > 0) { setSuggerimentiIndirizzo(data); setShowSuggerimentiInd(true); }
      else { setSuggerimentiIndirizzo([]); setShowSuggerimentiInd(false); }
    } catch { setSuggerimentiIndirizzo([]); setShowSuggerimentiInd(false); }
  }

  function selezionaIndirizzo(item: any) {
    const addr = item.address || {};
    const via = [addr.road, addr.house_number].filter(Boolean).join(" ");
    const comune = addr.city || addr.town || addr.village || addr.municipality || "";
    const provincia = addr.county || addr.state_district || "";
    const cap = addr.postcode || "";
    // Estrai sigla provincia (2 lettere)
    const sigla = provincia.length > 2 ? "" : provincia;
    setCustomer((p: any) => ({ ...p,
      indirizzo: via || p.indirizzo,
      comune: comune || p.comune,
      provincia: sigla || p.provincia,
      cap: cap || p.cap,
    }));
    setShowSuggerimentiInd(false);
    setSuggerimentiIndirizzo([]);
  }

  async function cercaClienti(query: string, campo: "cognome" | "nome") {
    if (query.length < 2) { setClientiSuggeriti([]); setShowSuggerimenti(false); setAvvisoOmonimi([]); return; }
    const { data } = await supabase.from("clienti")
      .select("id,nome,cognome,codice_fiscale,luogo_nascita,data_nascita,indirizzo,comune,provincia,cap,telefono,email,note,privacy_accettata")
      .ilike(campo, query + "%")
      .limit(10);
    if (data && data.length > 0) {
      setClientiSuggeriti(data);
      setShowSuggerimenti(true);
      // Rileva omonimi: stessa coppia nome+cognome con CF diverso
      const gruppi: Record<string, ClienteDB[]> = {};
      data.forEach(c => {
        const key = `${c.cognome.toLowerCase().trim()} ${c.nome.toLowerCase().trim()}`;
        if (!gruppi[key]) gruppi[key] = [];
        gruppi[key].push(c);
      });
      const omonimi = Object.values(gruppi).filter(g => g.length > 1).flat();
      setAvvisoOmonimi(omonimi);
    } else {
      setClientiSuggeriti([]);
      setShowSuggerimenti(false);
      setAvvisoOmonimi([]);
    }
  }

  async function caricaCliente(cliente: ClienteDB) {
    setShowSuggerimenti(false);
    setAvvisoOmonimi([]);
    setClienteSelezionato(cliente);
    // Carica ultima operazione con dati documento
    const { data: ops } = await supabase.from("operazioni")
      .select("tipo_documento,numero_documento,data_rilascio,data_scadenza,ente_rilascio,numero_scheda,data_operazione,totale_valore")
      .eq("cliente_id", cliente.id)
      .order("numero_scheda", { ascending: false })
      .limit(1);
    const lastOp = ops?.[0];
    // Foto documento NON caricate automaticamente (cliente porta il documento fisico ogni volta)
    setCustomer({
      nome: cliente.nome || "",
      cognome: cliente.cognome || "",
      luogoNascita: cliente.luogo_nascita || "",
      dataNascita: cliente.data_nascita || "",
      indirizzo: cliente.indirizzo || "",
      comune: cliente.comune || "",
      provincia: cliente.provincia || "",
      cap: cliente.cap || "",
      codiceFiscale: cliente.codice_fiscale || "",
      tipoDocumento: lastOp?.tipo_documento || "Carta di identità",
      numeroDocumento: lastOp?.numero_documento || "",
      dataRilascio: lastOp?.data_rilascio || "",
      dataScadenza: lastOp?.data_scadenza || "",
      enteRilascio: lastOp?.ente_rilascio || "",
      telefono: cliente.telefono || "",
      email: cliente.email || "",
      note: cliente.note || "",
    });

    const privacyMsg = cliente.privacy_accettata ? " — ✅ privacy già firmata, non verrà richiesta." : " — ⚠️ privacy da firmare.";
    setStatus({ text: `👤 Cliente caricato: ${cliente.cognome} ${cliente.nome}${privacyMsg}`, type: "success" });
  }

  const inp: React.CSSProperties = { height: 40, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
  const btn = (bg: string, color = "#fff"): React.CSSProperties => ({ background: bg, color, border: "none", borderRadius: 9, padding: "11px 20px", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit" });
  const statusColors: any = { idle: "#6b7280", loading: "#2563eb", success: "#059669", error: "#dc2626" };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "76px 16px 24px" }}>
      <NavBar />
      {lightbox && <Lightbox src={lightbox.src} nome={lightbox.nome} onClose={() => setLightbox(null)} />}
      {showPrivacy && (
        <PrivacyPopup
          negozio={negozio}
          cliente={{ nome: customer.nome, cognome: customer.cognome }}
          onConferma={(dati) => salvaScheda(dati)}
          onAnnulla={() => setShowPrivacy(false)}
        />
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {negozio?.logo_base64 && <img src={`data:image/png;base64,${negozio.logo_base64}`} alt="Logo" style={{ height: 50, objectFit: "contain" }} />}
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>{negozio?.nome || "📋 Scheda Acquisti"}</h1>
              <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>{negozio?.indirizzo ? `${negozio.indirizzo}, ${negozio.comune} — P.IVA ${negozio.piva}` : "Fotografia documento → riconoscimento automatico con Claude AI"}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ background: "#111827", color: "#fff", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 20 }}>N° {numeroScheda ?? "..."}</div>
            <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: "10px 16px", fontSize: 14, color: "#374151", fontWeight: 600 }}>
              📅 {new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
            <a href="/impostazioni" style={{ ...btn("#6b7280"), textDecoration: "none", padding: "10px 16px", fontSize: 13 }}>⚙️ Impostazioni</a>
          </div>
        </div>

        {/* Status */}
        <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderLeft: `4px solid ${statusColors[status.type]}`, borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 14, color: statusColors[status.type], fontWeight: 500 }}>
          {status.text}
        </div>

        {/* Bottoni */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          <button style={btn("#111827")} onClick={() => frontRef.current?.click()}>📷 Carica Fronte</button>
          <button style={btn("#111827")} onClick={() => backRef.current?.click()}>📷 Carica Retro</button>
          <button style={btn(saving ? "#9ca3af" : "#059669")} onClick={handleSalvaClick} disabled={saving}>{saving ? "⏳ Salvataggio..." : "💾 Salva Scheda"}</button>
          <button style={btn("#f3f4f6", "#374151")} onClick={reset}>🔄 Nuova scheda</button>
        </div>

        {savedOk && (
          <div style={{ background: "#d1fae5", border: "1.5px solid #059669", borderRadius: 10, padding: "14px 20px", marginBottom: 20, fontSize: 15, color: "#065f46", fontWeight: 600 }}>
            ✅ Scheda salvata con firma e privacy! Premi "Nuova scheda" per continuare.
          </div>
        )}

        <input ref={frontRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] || null, setFrontFile, setFrontPreview, "Fronte")} />
        <input ref={backRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0] || null, setBackFile, setBackPreview, "Retro")} />

        {/* 1. Documenti */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 18px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>1 — Documenti</h2>
          {/* Guida fotocamera iPad */}
          <div style={{ background: "#eff6ff", border: "1.5px solid #2563eb", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#1d4ed8" }}>
            <strong>📱 Guida scatto documento:</strong> Posiziona il documento su una superficie piana e luminosa. Inquadra tutto il documento dentro il rettangolo. Tieni il tablet/telefono parallelo al documento (non inclinato). Scatta in orizzontale per risultati migliori.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 16 }}>
            {[
              { label: "Fronte documento", file: frontFile, preview: frontPreview, ref: frontRef, side: "Fronte" },
              { label: "Retro documento", file: backFile, preview: backPreview, ref: backRef, side: "Retro" },
            ].map(({ label, file, preview, ref, side }) => (
              <div key={label} style={{ border: "1.5px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fafafa" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{label}</div>
                {preview ? (
                  <div style={{ position: "relative" }}>
                    <img src={preview} alt={label} style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb", display: "block" }} />
                    <button onClick={() => ref.current?.click()}
                      style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      🔄 Ricarica
                    </button>
                  </div>
                ) : (
                  <div onClick={() => ref.current?.click()}
                    style={{ width: "100%", height: 200, borderRadius: 8, border: "2px dashed #dc2626", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 13, cursor: "pointer", background: "#fff5f5", gap: 8, position: "relative" }}>
                    <div style={{ fontSize: 32 }}>📷</div>
                    <div style={{ fontWeight: 700 }}>Tocca per fotografare</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", padding: "0 10px" }}>Inquadra il documento nel rettangolo rosso</div>
                    {/* Cornice guida */}
                    <div style={{ position: "absolute", border: "2px solid #dc2626", borderRadius: 6, width: "75%", height: "65%", top: "50%", left: "50%", transform: "translate(-50%,-50%)", opacity: 0.4, pointerEvents: "none" }} />
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>{file?.name || "Nessun file caricato"}</div>
              </div>
            ))}
          </div>
          <button
            style={{ ...btn((frontFile || backFile) && !loading ? "#2563eb" : "#9ca3af"), width: "100%", fontSize: 15, padding: "13px 20px" }}
            onClick={runOCREntrambi}
            disabled={(!frontFile && !backFile) || loading}
          >
            {loading ? "⏳ Elaborazione in corso..." : "🤖 Leggi documenti con Claude AI"}
          </button>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1.5px solid #e5e7eb" }}>
            <FotoUploader
              foto={fotoDocumento.filter(f => !f.nome.startsWith("fronte_") && !f.nome.startsWith("retro_"))}
              onAdd={f => setFotoDocumento(prev => [...prev, f])}
              onRemove={i => { const extra = fotoDocumento.filter(f => !f.nome.startsWith("fronte_") && !f.nome.startsWith("retro_")); setFotoDocumento(prev => prev.filter(f => f !== extra[i])); }}
              label="Altre foto documento"
              onOpen={(src, nome) => setLightbox({ src, nome })}
            />
            {fotoDocumento.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>📎 {fotoDocumento.length} foto documento</div>}
          </div>
        </section>

        {/* 2. Dati Cliente */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>2 — Dati Cliente</h2>
            {clienteSelezionato && (
              <span style={{ fontSize: 12, background: "#d1fae5", color: "#065f46", padding: "4px 10px", borderRadius: 6, fontWeight: 700 }}>
                👤 Cliente esistente caricato
              </span>
            )}
          </div>

          {/* Autocomplete Cognome + Nome */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ position: "relative" }}>
              <Field label="Cognome">
                <input style={inp} value={customer.cognome}
                  onChange={e => { uc("cognome", e.target.value); cercaClienti(e.target.value, "cognome"); }}
                  onBlur={() => setTimeout(() => setShowSuggerimenti(false), 200)}
                  placeholder="Inizia a scrivere..." autoComplete="off" />
              </Field>
              {showSuggerimenti && clientiSuggeriti.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #2563eb", borderRadius: 8, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxHeight: 260, overflowY: "auto" }}>
                  {avvisoOmonimi.length > 0 && (
                    <div style={{ background: "#fffbeb", borderBottom: "1.5px solid #fbbf24", padding: "8px 14px", fontSize: 12, color: "#92400e", fontWeight: 700 }}>
                      ⚠️ Attenzione: esistono {avvisoOmonimi.length} clienti con lo stesso nome — verifica il Codice Fiscale!
                    </div>
                  )}
                  {clientiSuggeriti.map(c => {
                    const isOmonimo = avvisoOmonimi.some(o => o.id === c.id);
                    return (
                      <div key={c.id}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: 14, background: isOmonimo ? "#fffbeb" : "#fff" }}
                        onMouseDown={() => caricaCliente(c)}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isOmonimo && <span style={{ fontSize: 13 }}>⚠️</span>}
                          <strong>{c.cognome} {c.nome}</strong>
                        </div>
                        <div style={{ marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {c.codice_fiscale
                            ? <span style={{ fontSize: 12, fontWeight: 700, color: isOmonimo ? "#d97706" : "#2563eb", fontFamily: "monospace" }}>CF: {c.codice_fiscale}</span>
                            : <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>⚠ CF mancante</span>}
                          {c.data_nascita && <span style={{ fontSize: 12, color: "#6b7280" }}>Nato: {new Date(c.data_nascita).toLocaleDateString("it-IT")}</span>}
                          {c.comune && <span style={{ fontSize: 12, color: "#9ca3af" }}>{c.comune}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <Field label="Nome">
                <input style={inp} value={customer.nome}
                  onChange={e => { uc("nome", e.target.value); cercaClienti(e.target.value, "nome"); }}
                  onBlur={() => setTimeout(() => setShowSuggerimenti(false), 200)}
                  placeholder="Inizia a scrivere..." autoComplete="off" />
              </Field>
            </div>
          </div>

          {avvisoOmonimi.length > 0 && (
            <div style={{ background: "#fffbeb", border: "2px solid #f59e0b", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e", marginBottom: 8 }}>
                ⚠️ ATTENZIONE — Esistono {avvisoOmonimi.length} clienti con questo nome!
              </div>
              <div style={{ fontSize: 13, color: "#78350f", marginBottom: 8 }}>
                Verifica di aver selezionato il cliente corretto controllando il <strong>Codice Fiscale</strong>:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {avvisoOmonimi.map(o => (
                  <div key={o.id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: clienteSelezionato?.id === o.id ? "#fef3c7" : "#fff", border: clienteSelezionato?.id === o.id ? "2px solid #f59e0b" : "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}
                    onClick={() => caricaCliente(o)}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{o.cognome} {o.nome}</span>
                      {o.data_nascita && <span style={{ marginLeft: 10, fontSize: 12, color: "#78350f" }}>Nato: {new Date(o.data_nascita).toLocaleDateString("it-IT")}</span>}
                      {o.comune && <span style={{ marginLeft: 10, fontSize: 12, color: "#9ca3af" }}>{o.comune}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 13, color: "#d97706" }}>{o.codice_fiscale || "CF mancante"}</span>
                      {clienteSelezionato?.id === o.id && <span style={{ fontSize: 12, background: "#f59e0b", color: "#fff", borderRadius: 4, padding: "2px 8px", fontWeight: 700 }}>✓ Selezionato</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {([
              ["Nato a", "luogoNascita"],
              ["Data di nascita", "dataNascita", "date"],
              ["Tipo documento", "tipoDocumento"], ["Nr. documento", "numeroDocumento"],
              ["Rilasciato da", "enteRilascio"], ["Data rilascio", "dataRilascio", "date"],
              ["Scadenza", "dataScadenza", "date"],
              ["Telefono", "telefono"], ["Email", "email"],
            ] as [string, string, string?][]).map(([label, field, type]) => (
              <Field key={field} label={label}>
                <input type={type || "text"} style={inp} value={(customer as any)[field]}
                  onChange={e => uc(field, e.target.value)} />
              </Field>
            ))}
          </div>

          {/* Codice Fiscale manuale */}
          <div style={{ marginTop: 14 }}>
            <Field label="Codice Fiscale">
              <input style={{ ...inp, fontFamily: "monospace", fontWeight: 700, fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}
                value={customer.codiceFiscale}
                onChange={e => uc("codiceFiscale", e.target.value.toUpperCase())}
                maxLength={16} placeholder="Es. RSSMRA80A01L219K" />
            </Field>
          </div>

          {/* Indirizzo con autocomplete OpenStreetMap */}
          <div style={{ marginTop: 14, position: "relative" }}>
            <Field label="Residente in — via/piazza (inizia a scrivere per suggerimenti)">
              <input style={inp} value={customer.indirizzo}
                onChange={e => { uc("indirizzo", e.target.value); cercaIndirizzo(e.target.value); }}
                onBlur={() => setTimeout(() => setShowSuggerimentiInd(false), 200)}
                placeholder="Es. Via Roma 1, Torino..." autoComplete="off" />
            </Field>
            {showSuggerimentiInd && suggerimentiIndirizzo.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #2563eb", borderRadius: 8, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxHeight: 220, overflowY: "auto" }}>
                {suggerimentiIndirizzo.map((item, idx) => (
                  <div key={idx} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}
                    onMouseDown={() => selezionaIndirizzo(item)}>
                    <div style={{ fontWeight: 600 }}>{item.display_name?.split(",").slice(0, 3).join(", ")}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{item.address?.postcode} {item.address?.city || item.address?.town || item.address?.village}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 80px 100px", gap: 14 }}>
            <Field label="Comune">
              <input style={inp} value={customer.comune} onChange={e => uc("comune", e.target.value)} />
            </Field>
            <Field label="Prov.">
              <input style={inp} value={customer.provincia} onChange={e => uc("provincia", e.target.value)} maxLength={2} />
            </Field>
            <Field label="CAP">
              <input style={inp} value={customer.cap} onChange={e => uc("cap", e.target.value)} maxLength={5} />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Note cliente"><textarea style={{ ...inp, height: 80, paddingTop: 10 }} value={customer.note} onChange={e => uc("note", e.target.value)} /></Field>
          </div>
          {firmaPrivacyBase64 && (
            <div style={{ marginTop: 16, padding: 12, background: "#d1fae5", borderRadius: 10, border: "1px solid #059669" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>✅ PRIVACY ACCETTATA — {new Date().toLocaleDateString("it-IT")}</div>
              <img src={`data:image/png;base64,${firmaPrivacyBase64}`} alt="Firma privacy" style={{ height: 60, objectFit: "contain", background: "#fff", borderRadius: 6, border: "1px solid #a7f3d0" }} />
            </div>
          )}
          {clienteSelezionato?.privacy_accettata && !firmaPrivacyBase64 && (
            <div style={{ marginTop: 16, padding: 12, background: "#eff6ff", borderRadius: 10, border: "1px solid #2563eb" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>✅ Privacy già firmata in precedenza — non verrà richiesta nuovamente al salvataggio.</div>
            </div>
          )}
        </section>

        {/* 3. Oggetti */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>3 — Oggetti Acquistati</h2>
            <button style={btn("#111827")} onClick={() => setItems(p => [...p, { ...emptyItem, pesiPezzi: [""], foto: [] }])}>+ Aggiungi riga</button>
          </div>
          {items.map((item, i) => {
            const pesoTotale = item.pesiPezzi.reduce((a, p) => a + Number(p || 0), 0);
            const isOro = item.materiale === "oro";
            return (
            <div key={i} style={{ border: "1.5px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16, background: "#fafafa" }}>
              {/* Header riga */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>Articolo {i + 1}</span>
                <button style={btn("#fee2e2", "#dc2626")} onClick={() => setItems(p => p.length > 1 ? p.filter((_, j) => j !== i) : p)}>🗑 Elimina</button>
              </div>

              {/* Riga 1: Nr articoli + Descrizione + Materiale */}
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 160px", gap: 12, marginBottom: 14 }}>
                <Field label="N° Articoli">
                  <input type="number" min="1" max="99" style={inp} value={item.nrArticoli}
                    onChange={e => uiNrArticoli(i, e.target.value)} />
                </Field>
                <Field label="Descrizione">
                  <select style={{ ...inp, marginBottom: 6 }}
                    value={[
                      "Anello","Anello con pietre","Fede",
                      "Braccialetto","Braccialetto con pietre","Bracciale","Bracciale rigido","Bracciale multiplo","Bracciale con pietre","Bracciale con ciondoli",
                      "Collanina","Collanina con ciondoli","Collanina con pietre","Girocollo","Girocollo con pietre",
                      "Paia orecchini","Paia orecchini con pietre","Orecchino spaiato","Orecchino spaiato con pietre",
                      "Portachiavi","Fermacravatta","Spilla","Spilla con pietre","Spilla con ciondoli",
                      "Cassa fondello orologio","Cassa-fondello cinghietto orologio","Medaglia",
                    ].includes(item.descrizione) ? item.descrizione : ""}
                    onChange={e => { if (e.target.value) ui(i, "descrizione", e.target.value); }}>
                    <option value="">— Seleziona dalla lista —</option>
                    {[
                      "Anello","Anello con pietre","Fede",
                      "Braccialetto","Braccialetto con pietre","Bracciale","Bracciale rigido","Bracciale multiplo","Bracciale con pietre","Bracciale con ciondoli",
                      "Collanina","Collanina con ciondoli","Collanina con pietre","Girocollo","Girocollo con pietre",
                      "Paia orecchini","Paia orecchini con pietre","Orecchino spaiato","Orecchino spaiato con pietre",
                      "Portachiavi","Fermacravatta","Spilla","Spilla con pietre","Spilla con ciondoli",
                      "Cassa fondello orologio","Cassa-fondello cinghietto orologio","Medaglia",
                    ].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input style={inp} value={item.descrizione}
                    onChange={e => ui(i, "descrizione", e.target.value)}
                    placeholder="Oppure scrivi descrizione libera..." />
                </Field>
                <Field label="Materiale">
                  <select style={{ ...inp, background: isOro ? "#fef9c3" : "#eff6ff", fontWeight: 700 }}
                    value={item.materiale} onChange={e => ui(i, "materiale", e.target.value)}>
                    <option value="oro">🟡 AU – Oro</option>
                    <option value="argento">⚪ AG – Argento</option>
                  </select>
                </Field>
              </div>

              {/* Riga 2: Pesi per ogni pezzo */}
              <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, color: isOro ? "#d97706" : "#6b7280", marginBottom: 10, letterSpacing: "0.05em" }}>
                  {isOro ? "🟡 Peso AU (g) per ogni pezzo" : "⚪ Peso AG (g) per ogni pezzo"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  {item.pesiPezzi.map((p, k) => (
                    <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Pz {k + 1}</span>
                      <input
                        type="number" step="0.01" min="0"
                        style={{ ...inp, width: 80, textAlign: "center", background: p ? (isOro ? "#fef9c3" : "#eff6ff") : "#fff", fontWeight: p ? 700 : 400 }}
                        value={p}
                        onChange={e => {
                          const nuovi = [...item.pesiPezzi];
                          nuovi[k] = e.target.value;
                          ui(i, "pesiPezzi", nuovi);
                        }}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: isOro ? "#d97706" : "#374151", borderTop: "1px solid #e5e7eb", paddingTop: 8 }}>
                  Totale grammi: <span style={{ fontSize: 16 }}>{pesoTotale.toFixed(2)} g</span>
                </div>
              </div>

              {/* Riga 3: Note + Valore totale */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12, marginBottom: 14 }}>
                <Field label="Note">
                  <input style={inp} value={item.note} onChange={e => ui(i, "note", e.target.value)} placeholder="Note aggiuntive..." />
                </Field>
                <Field label="💰 Valore Totale Articoli €">
                  <input type="number" step="0.01" min="0"
                    style={{ ...inp, fontWeight: 700, fontSize: 16, background: "#f0fdf4", border: "2px solid #059669", color: "#065f46" }}
                    value={item.valore}
                    onChange={e => ui(i, "valore", e.target.value)}
                    placeholder="0.00" />
                </Field>
              </div>

              {/* Riepilogo riga */}
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
                <span><strong>{item.nrArticoli} pz</strong> — {item.descrizione || "—"}</span>
                <span style={{ color: isOro ? "#d97706" : "#374151", fontWeight: 700 }}>{isOro ? "AU" : "AG"}: {pesoTotale.toFixed(2)} g</span>
                <span style={{ color: "#059669", fontWeight: 700 }}>€ {Number(item.valore || 0).toFixed(2)}</span>
              </div>

              {/* Foto */}
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                <FotoUploader foto={item.foto} onAdd={f => ui(i, "foto", [...item.foto, f])} onRemove={idx => ui(i, "foto", item.foto.filter((_, j) => j !== idx))} label={`Foto articolo ${i + 1}`} onOpen={(src, nome) => setLightbox({ src, nome })} />
              </div>
            </div>
            );
          })}
          {/* Totale globale */}
          <div style={{ background: "#111827", color: "#fff", borderRadius: 10, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {items.length} articol{items.length === 1 ? "o" : "i"} —&nbsp;
              AU: {items.filter(it => it.materiale === "oro").reduce((a, it) => a + it.pesiPezzi.reduce((b, p) => b + Number(p||0), 0), 0).toFixed(2)} g&nbsp;|&nbsp;
              AG: {items.filter(it => it.materiale === "argento").reduce((a, it) => a + it.pesiPezzi.reduce((b, p) => b + Number(p||0), 0), 0).toFixed(2)} g
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Totale: {currency(totale)}</div>
          </div>
        </section>

        {/* 4. Firma cliente */}
        <section ref={firmaRef} style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: !firmaDataUrl ? "2px solid #fbbf24" : "2px solid #059669" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
              4 — Firma del Cliente {!firmaDataUrl && <span style={{ color: "#dc2626", fontSize: 13 }}>* obbligatoria</span>}
            </h2>
            {firmaDataUrl && <span style={{ fontSize: 13, color: "#059669", fontWeight: 700 }}>✔ Acquisita</span>}
          </div>
          {/* Testo dichiarazione */}
          <div style={{ background: "#fffef0", border: "1.5px solid #d97706", borderRadius: 10, padding: "14px 18px", marginBottom: 16, fontSize: 14, lineHeight: 1.7, color: "#1a1a1a" }}>
            <strong>Il/La sottoscritto/a dichiara che:</strong><br />
            • gli oggetti indicati nella presente scheda sono di sua esclusiva proprietà;<br />
            • sugli stessi non esistono vincoli, garanzie e/o pegni di qualsivoglia natura;<br />
            • autorizza il trattamento dei propri dati personali ai sensi del GDPR 2016/679;<br />
            • prende atto che gli oggetti saranno ceduti per la fusione a <strong>Plus Valenza Srl</strong>, Via dell&apos;Artigianato 99, 15048 Valenza (AL).
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16, marginTop: 4 }}>Il cliente firma con il dito (o mouse). Premere "Conferma firma".</p>
          {firmaDataUrl ? (
            <div>
              <img src={firmaDataUrl} alt="Firma" style={{ maxWidth: "100%", height: 120, objectFit: "contain", border: "1.5px solid #059669", borderRadius: 10, background: "#fafafa", display: "block" }} />
              <button type="button" style={{ marginTop: 12, background: "#f3f4f6", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }} onClick={() => setFirmaDataUrl(null)}>🗑 Rifai la firma</button>
            </div>
          ) : (
            <SignaturePad onSave={setFirmaDataUrl} onClear={() => setFirmaDataUrl(null)} hasFirma={false} />
          )}

          {/* Firma titolare negozio */}
          {negozio?.firma_base64 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1.5px solid #e5e7eb" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" as const }}>Firma del Titolare ({negozio.nome})</div>
              <img src={`data:image/png;base64,${negozio.firma_base64}`} alt="Firma titolare" style={{ height: 80, objectFit: "contain", background: "#fafafa", borderRadius: 8, border: "1px solid #e5e7eb" }} />
            </div>
          )}
        </section>

        {/* 5. Dati Operazione */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 18px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>5 — Dati Operazione</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            <Field label="Data operazione"><input type="date" style={inp} value={dataOperazione} onChange={e => setDataOperazione(e.target.value)} /></Field>
            <Field label="Mezzo di pagamento">
              <select style={inp} value={mezzoPagamento} onChange={e => setMezzoPagamento(e.target.value)}>
                <option value="contanti">Contanti</option>
                <option value="bonifico">Bonifico</option>
                <option value="assegno">Assegno</option>
              </select>
            </Field>
            <Field label="CRO / TRN"><input style={inp} value={croTrn} onChange={e => setCroTrn(e.target.value)} /></Field>
            <Field label="Tot. Valore €"><input style={inp} value={totaleValore || String(totale || "")} onChange={e => setTotaleValore(e.target.value)} /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="Note operazione"><textarea style={{ ...inp, height: 80, paddingTop: 10 }} value={noteOperazione} onChange={e => setNoteOperazione(e.target.value)} /></Field>
          </div>
          <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, marginTop: 16 }}>Totale calcolato: {currency(totale)}</div>
        </section>

        {/* 6. Testo OCR */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 18px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>6 — Testo letto da Claude AI</h2>
          {loading && <p style={{ color: "#2563eb", fontWeight: 600, marginBottom: 12 }}>⏳ Elaborazione in corso...</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            <TextBox title="Testo fronte" text={frontRawText || "Nessun testo estratto."} />
            <TextBox title="Testo retro" text={backRawText || "Nessun testo estratto."} />
          </div>
        </section>

        {/* 7. Firma Ricevuta Riepilogativa */}
        <section ref={firmaRicevutaRef} style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: !firmaRicevutaDataUrl ? "2px solid #fbbf24" : "2px solid #059669" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
              7 — Per Consegna Ricevuta Riepilogativa {!firmaRicevutaDataUrl && <span style={{ color: "#dc2626", fontSize: 13 }}>* obbligatoria</span>}
            </h2>
            {firmaRicevutaDataUrl && <span style={{ fontSize: 13, color: "#059669", fontWeight: 700 }}>✔ Acquisita</span>}
          </div>
          <div style={{ background: "#f0f9ff", border: "1.5px solid #2563eb", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 14, lineHeight: 1.7, color: "#1a1a1a" }}>
            Il cliente firma per <strong>ricevuta della presente scheda riepilogativa</strong> e conferma di aver ricevuto il pagamento di <strong>{currency(totale)}</strong> mediante <strong>{mezzoPagamento || "contanti"}</strong>{croTrn ? ` (CRO/TRN: ${croTrn})` : ""}.
          </div>
          {firmaRicevutaDataUrl ? (
            <div>
              <img src={firmaRicevutaDataUrl} alt="Firma ricevuta" style={{ maxWidth: "100%", height: 120, objectFit: "contain", border: "1.5px solid #059669", borderRadius: 10, background: "#fafafa", display: "block" }} />
              <button type="button" style={{ marginTop: 12, background: "#f3f4f6", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "9px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14 }} onClick={() => setFirmaRicevutaDataUrl(null)}>🗑 Rifai la firma</button>
            </div>
          ) : (
            <SignaturePad onSave={setFirmaRicevutaDataUrl} onClear={() => setFirmaRicevutaDataUrl(null)} hasFirma={false} />
          )}
        </section>

        {/* Bottoni fondo */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingBottom: 40, flexWrap: "wrap" }}>
          <button style={btn("#f3f4f6", "#374151")} onClick={reset}>🔄 Nuova scheda</button>
          <button style={{ ...btn(saving ? "#9ca3af" : "#059669"), fontSize: 16, padding: "14px 32px" }} onClick={handleSalvaClick} disabled={saving}>
            {saving ? "⏳ Salvataggio..." : "💾 Salva Scheda nel Database"}
          </button>
        </div>

      </div>
    </div>
  );
}
