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
const emptyItem = { descrizione: "", materiale: "oro", pesoAu: "", pesoAg: "", valore: "", note: "", foto: [] as FotoAllegata[] };

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

function FotoUploader({ foto, onAdd, onRemove, label }: { foto: FotoAllegata[]; onAdd: (f: FotoAllegata) => void; onRemove: (i: number) => void; label: string }) {
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
              <img src={f.preview} alt={f.nome} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e5e7eb", display: "block" }} />
              <button onClick={() => onRemove(i)} style={{ position: "absolute", top: -6, right: -6, background: "#dc2626", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: "22px", padding: 0, textAlign: "center" }}>×</button>
            </div>
          ))}
        </div>
      )}
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
  const [customer, setCustomer] = useState({ ...emptyCustomer });
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [dataOperazione, setDataOperazione] = useState(todayISO());
  const [mezzoPagamento, setMezzoPagamento] = useState("contanti");
  const [croTrn, setCroTrn] = useState("");
  const [totaleValore, setTotaleValore] = useState("");
  const [noteOperazione, setNoteOperazione] = useState("");
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
  const [status, setStatus] = useState({ text: "Pronto. Carica i documenti per iniziare.", type: "idle" });
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

  const totale = useMemo(() => items.reduce((a, i) => a + Number(i.valore || 0), 0), [items]);

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

  function handleFile(file: File | null, setFile: any, setPreview: any, side: string) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setStatus({ text: "Il file deve essere un'immagine.", type: "error" }); return; }
    setFile(file);
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    fileToBase64(file).then(base64 => {
      const tipo = side === "Fronte" ? "fronte" : "retro";
      setFotoDocumento((prev: FotoAllegata[]) => [...prev.filter((f: FotoAllegata) => !f.nome.startsWith(tipo + "_")), { nome: `${tipo}_${file.name}`, mimeType: file.type, base64, preview: previewUrl }]);
    });
    setStatus({ text: `${side} caricato: ${file.name}`, type: "success" });
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
        const b64 = await fileToBase64(frontFile);
        content.push({ type: "image", source: { type: "base64", media_type: frontFile.type || "image/jpeg", data: b64 } });
        content.push({ type: "text", text: "Questa è la FRONTE del documento." });
      }
      if (backFile) {
        const b64 = await fileToBase64(backFile);
        content.push({ type: "image", source: { type: "base64", media_type: backFile.type || "image/jpeg", data: b64 } });
        content.push({ type: "text", text: "Questo è il RETRO del documento." });
      }
      content.push({ type: "text", text: `Sei un sistema OCR specializzato in documenti di identità italiani.
Analizza le immagini del documento e estrai TUTTI i dati visibili combinando fronte e retro.
Rispondi SOLO con un oggetto JSON valido (niente testo prima o dopo), con questi campi:
{
  "nome": "","cognome": "","luogoNascita": "","dataNascita": "YYYY-MM-DD",
  "indirizzo": "","comune": "","provincia": "","cap": "",
  "codiceFiscale": "","tipoDocumento": "","numeroDocumento": "",
  "dataRilascio": "YYYY-MM-DD","dataScadenza": "YYYY-MM-DD","enteRilascio": "",
  "rawTextFronte": "(testo visibile nel fronte)","rawTextRetro": "(testo visibile nel retro)"
}
Regole: date YYYY-MM-DD, campi non visibili stringa vuota, CF 16 caratteri,
tipoDocumento: "Carta di identità" o "Patente di guida" o "Passaporto".` });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1000, messages: [{ role: "user", content }] })
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
      const oggettiDaSalvare = items.filter(i => i.descrizione).map(i => ({
        operazione_id: operazioneId, descrizione: i.descrizione, materiale: i.materiale,
        peso_au: i.pesoAu ? Number(i.pesoAu) : null, peso_ag: i.pesoAg ? Number(i.pesoAg) : null,
        valore: i.valore ? Number(i.valore) : null, note: i.note,
      }));
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

      setSavedOk(true);
      setStatus({ text: `✅ Scheda n° ${numeroScheda} salvata con firma e privacy!`, type: "success" });
      setNumeroScheda(prev => (prev || 0) + 1);
    } catch (e: any) {
      console.error(e);
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setCustomer({ ...emptyCustomer }); setItems([{ ...emptyItem }]);
    setDataOperazione(todayISO()); setMezzoPagamento("contanti");
    setCroTrn(""); setTotaleValore(""); setNoteOperazione("");
    setFrontFile(null); setBackFile(null); setFrontPreview(""); setBackPreview("");
    setFrontRawText(""); setBackRawText(""); setFotoDocumento([]);
    setFirmaDataUrl(null); setFirmaPrivacyBase64(null); setSavedOk(false);
    setStatus({ text: "Nuova scheda pronta.", type: "idle" });
    if (frontRef.current) frontRef.current.value = "";
    if (backRef.current) backRef.current.value = "";
  }

  async function cercaClienti(query: string, campo: "cognome" | "nome") {
    if (query.length < 2) { setClientiSuggeriti([]); setShowSuggerimenti(false); return; }
    const { data } = await supabase.from("clienti")
      .select("id,nome,cognome,codice_fiscale,luogo_nascita,data_nascita,indirizzo,comune,provincia,cap,telefono,email,note,privacy_accettata")
      .ilike(campo, query + "%")
      .limit(6);
    if (data && data.length > 0) { setClientiSuggeriti(data); setShowSuggerimenti(true); }
    else { setClientiSuggeriti([]); setShowSuggerimenti(false); }
  }

  async function caricaCliente(cliente: ClienteDB) {
    setShowSuggerimenti(false);
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 16 }}>
            {[
              { label: "Fronte documento", file: frontFile, preview: frontPreview },
              { label: "Retro documento", file: backFile, preview: backPreview },
            ].map(({ label, file, preview }) => (
              <div key={label} style={{ border: "1.5px solid #e5e7eb", borderRadius: 12, padding: 16, background: "#fafafa" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>{file?.name || "Nessun file"}</div>
                {preview ? <img src={preview} alt={label} style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  : <div style={{ width: "100%", height: 180, borderRadius: 8, border: "1.5px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>Nessuna anteprima</div>}
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
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #2563eb", borderRadius: 8, zIndex: 100, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", maxHeight: 220, overflowY: "auto" }}>
                  {clientiSuggeriti.map(c => (
                    <div key={c.id} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: 14 }}
                      onMouseDown={() => caricaCliente(c)}>
                      <strong>{c.cognome} {c.nome}</strong>
                      {c.codice_fiscale && <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{c.codice_fiscale}</span>}
                      {c.comune && <span style={{ marginLeft: 8, fontSize: 12, color: "#9ca3af" }}>{c.comune}</span>}
                    </div>
                  ))}
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {([
              ["Nato a", "luogoNascita"],
              ["Data di nascita", "dataNascita", "date"], ["Residente in", "indirizzo"],
              ["Comune", "comune"], ["Provincia", "provincia"], ["CAP", "cap"],
              ["Tipo documento", "tipoDocumento"], ["Nr. documento", "numeroDocumento"],
              ["Rilasciato da", "enteRilascio"], ["Data rilascio", "dataRilascio", "date"],
              ["Scadenza", "dataScadenza", "date"], ["Codice Fiscale", "codiceFiscale"],
              ["Telefono", "telefono"], ["Email", "email"],
            ] as [string, string, string?][]).map(([label, field, type]) => (
              <Field key={field} label={label}>
                <input type={type || "text"} style={inp} value={(customer as any)[field]} onChange={e => uc(field, e.target.value)} />
              </Field>
            ))}
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
            <button style={btn("#111827")} onClick={() => setItems(p => [...p, { ...emptyItem, foto: [] }])}>+ Aggiungi riga</button>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 12, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontWeight: 700 }}>Oggetto {i + 1}</span>
                <button style={btn("#fee2e2", "#dc2626")} onClick={() => setItems(p => p.length > 1 ? p.filter((_, j) => j !== i) : p)}>Elimina</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
                <Field label="Descrizione"><input style={inp} value={item.descrizione} onChange={e => ui(i, "descrizione", e.target.value)} /></Field>
                <Field label="AU / AG">
                  <select style={inp} value={item.materiale} onChange={e => ui(i, "materiale", e.target.value)}>
                    <option value="oro">AU – Oro</option>
                    <option value="argento">AG – Argento</option>
                  </select>
                </Field>
                <Field label="Peso AU (g)"><input style={inp} value={item.pesoAu} onChange={e => ui(i, "pesoAu", e.target.value)} /></Field>
                <Field label="Peso AG (g)"><input style={inp} value={item.pesoAg} onChange={e => ui(i, "pesoAg", e.target.value)} /></Field>
                <Field label="Valore €"><input style={inp} value={item.valore} onChange={e => ui(i, "valore", e.target.value)} /></Field>
                <Field label="Note"><input style={inp} value={item.note} onChange={e => ui(i, "note", e.target.value)} /></Field>
              </div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                <FotoUploader foto={item.foto} onAdd={f => ui(i, "foto", [...item.foto, f])} onRemove={idx => ui(i, "foto", item.foto.filter((_, j) => j !== idx))} label={`Foto oggetto ${i + 1}`} />
              </div>
            </div>
          ))}
          <div style={{ textAlign: "right", fontSize: 22, fontWeight: 700, marginTop: 8 }}>Totale: {currency(totale)}</div>
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
