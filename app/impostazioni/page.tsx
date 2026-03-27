"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type NegozioData = {
  nome: string; indirizzo: string; comune: string; provincia: string;
  cap: string; piva: string; telefono: string; email: string;
  firma_base64: string; logo_base64: string;
  numero_scheda_iniziale: number; testo_privacy: string;
};

const empty: NegozioData = {
  nome: "", indirizzo: "", comune: "", provincia: "", cap: "",
  piva: "", telefono: "", email: "",
  firma_base64: "", logo_base64: "",
  numero_scheda_iniziale: 1, testo_privacy: "",
};

// Password per il reset — cambiala qui se vuoi
const RESET_PASSWORD = "dav1965883883";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#6b7280" }}>{label}</label>
      {children}
    </div>
  );
}

function SignaturePad({ onSave, onClear, hasFirma }: {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  hasFirma: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    drawing.current = true; lastPos.current = getPos(e, canvas);
  }
  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    lastPos.current = pos;
  }
  function stopDraw(e: React.MouseEvent | React.TouchEvent) { e.preventDefault(); drawing.current = false; lastPos.current = null; }

  function salva() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!data.some(v => v !== 0)) return;
    onSave(canvas.toDataURL("image/png"));
  }
  function pulisci() {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); onClear();
  }

  return (
    <div>
      <canvas ref={canvasRef} width={700} height={160}
        style={{ width: "100%", height: 160, border: hasFirma ? "2px solid #059669" : "2px dashed #6b7280", borderRadius: 10, background: "#fafafa", cursor: "crosshair", touchAction: "none", display: "block" }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button type="button" style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }} onClick={salva}>✅ Conferma firma</button>
        <button type="button" style={{ background: "#f3f4f6", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }} onClick={pulisci}>🗑 Cancella</button>
      </div>
    </div>
  );
}

export default function Impostazioni() {
  const [data, setData] = useState<NegozioData>({ ...empty });
  const [firmaPreview, setFirmaPreview] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [status, setStatus] = useState({ text: "Caricamento...", type: "idle" });
  const [saving, setSaving] = useState(false);
  const [firmaMode, setFirmaMode] = useState<"disegna" | "carica">("disegna");
  const logoRef = useRef<HTMLInputElement>(null);
  const firmaFileRef = useRef<HTMLInputElement>(null);

  // Reset state
  const [showReset, setShowReset] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetErrore, setResetErrore] = useState("");
  const [resetando, setResetando] = useState(false);
  const [resetOk, setResetOk] = useState(false);

  const inp: React.CSSProperties = { height: 40, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
  const btn = (bg: string, color = "#fff"): React.CSSProperties => ({ background: bg, color, border: "none", borderRadius: 9, padding: "11px 22px", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit" });
  const statusColors: any = { idle: "#6b7280", loading: "#2563eb", success: "#059669", error: "#dc2626" };

  useEffect(() => {
    async function load() {
      const { data: row, error } = await supabase.from("negozio").select("*").eq("id", 1).single();
      if (error || !row) { setStatus({ text: "Inserisci i dati del tuo negozio.", type: "idle" }); return; }
      setData({
        nome: row.nome || "", indirizzo: row.indirizzo || "",
        comune: row.comune || "", provincia: row.provincia || "",
        cap: row.cap || "", piva: row.piva || "",
        telefono: row.telefono || "", email: row.email || "",
        firma_base64: row.firma_base64 || "", logo_base64: row.logo_base64 || "",
        numero_scheda_iniziale: row.numero_scheda_iniziale || 1,
        testo_privacy: row.testo_privacy || "",
      });
      if (row.firma_base64) setFirmaPreview(`data:image/png;base64,${row.firma_base64}`);
      if (row.logo_base64) setLogoPreview(`data:image/png;base64,${row.logo_base64}`);
      setStatus({ text: "Dati caricati.", type: "success" });
    }
    load();
  }, []);

  const u = (f: keyof NegozioData, v: any) => setData(p => ({ ...p, [f]: v }));

  async function handleLogo(file: File | null) {
    if (!file) return;
    const b64 = await fileToBase64(file);
    u("logo_base64", b64);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleFirmaFile(file: File | null) {
    if (!file) return;
    const b64 = await fileToBase64(file);
    u("firma_base64", b64);
    setFirmaPreview(`data:${file.type};base64,${b64}`);
  }

  async function salva() {
    try {
      setSaving(true);
      setStatus({ text: "💾 Salvataggio...", type: "loading" });
      const { error } = await supabase.from("negozio").upsert({
        id: 1,
        nome: data.nome, indirizzo: data.indirizzo,
        comune: data.comune, provincia: data.provincia,
        cap: data.cap, piva: data.piva,
        telefono: data.telefono, email: data.email,
        firma_base64: data.firma_base64,
        logo_base64: data.logo_base64,
        numero_scheda_iniziale: data.numero_scheda_iniziale,
        testo_privacy: data.testo_privacy,
      });
      if (error) throw new Error(error.message);
      setStatus({ text: "✅ Impostazioni salvate!", type: "success" });
    } catch (e: any) {
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function eseguiReset() {
    if (resetPassword !== RESET_PASSWORD) {
      setResetErrore("❌ Password errata. Riprova.");
      return;
    }
    setResetErrore("");
    setResetando(true);
    try {
      // Cancella in ordine (rispettando le foreign key)
      await supabase.from("foto_scheda").delete().neq("id", 0);
      await supabase.from("oggetti").delete().neq("id", 0);
      await supabase.from("operazioni").delete().neq("id", 0);
      await supabase.from("clienti").delete().neq("id", 0);

      setResetOk(true);
      setShowReset(false);
      setResetPassword("");
      setStatus({ text: "✅ Tutti i dati clienti e schede sono stati eliminati.", type: "success" });
    } catch (e: any) {
      setResetErrore("❌ Errore durante il reset: " + e.message);
    } finally {
      setResetando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>⚙️ Impostazioni Negozio</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "6px 0 0" }}>Configura i dati del tuo compro oro — vengono usati su tutte le schede</p>
          </div>
          <a href="/" style={{ ...btn("#111827"), textDecoration: "none", display: "inline-block" }}>← Torna alle schede</a>
        </div>

        <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderLeft: `4px solid ${statusColors[status.type]}`, borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 14, color: statusColors[status.type], fontWeight: 500 }}>
          {status.text}
        </div>

        {/* Dati negozio */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 18px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Dati Negozio</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <Field label="Nome negozio"><input style={inp} value={data.nome} onChange={e => u("nome", e.target.value)} placeholder="Es. Compro Oro Torino" /></Field>
            <Field label="Indirizzo"><input style={inp} value={data.indirizzo} onChange={e => u("indirizzo", e.target.value)} /></Field>
            <Field label="Comune"><input style={inp} value={data.comune} onChange={e => u("comune", e.target.value)} /></Field>
            <Field label="Provincia"><input style={inp} value={data.provincia} onChange={e => u("provincia", e.target.value)} /></Field>
            <Field label="CAP"><input style={inp} value={data.cap} onChange={e => u("cap", e.target.value)} /></Field>
            <Field label="P.IVA / C.F."><input style={inp} value={data.piva} onChange={e => u("piva", e.target.value)} /></Field>
            <Field label="Telefono"><input style={inp} value={data.telefono} onChange={e => u("telefono", e.target.value)} /></Field>
            <Field label="Email"><input style={inp} value={data.email} onChange={e => u("email", e.target.value)} /></Field>
            <Field label="Numero scheda iniziale">
              <input type="number" style={inp} value={data.numero_scheda_iniziale} onChange={e => u("numero_scheda_iniziale", Number(e.target.value))} />
            </Field>
          </div>
        </section>

        {/* Logo */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 18px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Logo Negozio</h2>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            {logoPreview
              ? <img src={logoPreview} alt="Logo" style={{ height: 80, objectFit: "contain", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
              : <div style={{ width: 120, height: 80, border: "1.5px dashed #d1d5db", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>Nessun logo</div>
            }
            <div>
              <button style={btn("#111827")} onClick={() => logoRef.current?.click()}>📁 Carica logo</button>
              {logoPreview && <button style={{ ...btn("#fee2e2", "#dc2626"), marginLeft: 10 }} onClick={() => { u("logo_base64", ""); setLogoPreview(""); }}>Rimuovi</button>}
              <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleLogo(e.target.files?.[0] || null)} />
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>PNG o JPG, sfondo trasparente consigliato</p>
            </div>
          </div>
        </section>

        {/* Firma titolare */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Firma del Titolare</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Questa firma apparirà automaticamente su ogni scheda acquisti.</p>

          {firmaPreview && data.firma_base64 ? (
            <div>
              <img src={firmaPreview} alt="Firma titolare" style={{ maxWidth: "100%", height: 100, objectFit: "contain", border: "1.5px solid #059669", borderRadius: 10, background: "#fafafa", display: "block" }} />
              <button type="button" style={{ marginTop: 12, ...btn("#fee2e2", "#dc2626") }} onClick={() => { u("firma_base64", ""); setFirmaPreview(""); }}>🗑 Rimuovi firma</button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button type="button"
                  style={{ ...btn(firmaMode === "disegna" ? "#111827" : "#f3f4f6", firmaMode === "disegna" ? "#fff" : "#374151"), fontSize: 13, padding: "8px 18px" }}
                  onClick={() => setFirmaMode("disegna")}>✏️ Disegna</button>
                <button type="button"
                  style={{ ...btn(firmaMode === "carica" ? "#111827" : "#f3f4f6", firmaMode === "carica" ? "#fff" : "#374151"), fontSize: 13, padding: "8px 18px" }}
                  onClick={() => setFirmaMode("carica")}>📁 Carica file</button>
              </div>

              {firmaMode === "disegna" ? (
                <SignaturePad
                  hasFirma={!!data.firma_base64}
                  onSave={(dataUrl) => { const b64 = dataUrl.split(",")[1]; u("firma_base64", b64); setFirmaPreview(dataUrl); }}
                  onClear={() => { u("firma_base64", ""); setFirmaPreview(""); }}
                />
              ) : (
                <div style={{ border: "2px dashed #d1d5db", borderRadius: 10, padding: 32, textAlign: "center", background: "#fafafa" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🖊️</div>
                  <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>Carica un file immagine della firma del titolare</p>
                  <button type="button" style={btn("#2563eb")} onClick={() => firmaFileRef.current?.click()}>📁 Scegli file firma</button>
                  <input ref={firmaFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFirmaFile(e.target.files?.[0] || null)} />
                  <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 12 }}>PNG con sfondo trasparente consigliato — JPG accettato</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Testo privacy */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Testo Informativa Privacy</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Questo testo verrà mostrato al cliente prima della firma sulla scheda acquisti.</p>
          <textarea
            style={{ ...inp, height: 280, paddingTop: 12, lineHeight: 1.6, resize: "vertical" }}
            value={data.testo_privacy}
            onChange={e => u("testo_privacy", e.target.value)}
            placeholder="Inserisci qui il testo della tua informativa privacy..."
          />
        </section>

        {/* Salva */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 40 }}>
          <button style={{ ...btn(saving ? "#9ca3af" : "#059669"), fontSize: 16, padding: "14px 36px" }} onClick={salva} disabled={saving}>
            {saving ? "⏳ Salvataggio..." : "💾 Salva Impostazioni"}
          </button>
        </div>

        {/* ---- GUIDA CAMPI ---- */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "2px solid #2563eb" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#2563eb" }}>
            📖 Guida — Cosa appare nella scheda cliente
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
            Questa leggenda spiega cosa viene mostrato in ogni sezione della scheda acquisti e dove vengono usati i dati.
          </p>

          {[
            {
              sezione: "1 — Documenti",
              colore: "#111827",
              campi: [
                { nome: "📷 Carica Fronte / Retro", desc: "Foto della carta d'identità, patente o passaporto. Vengono usate per l'OCR automatico e salvate negli allegati della scheda." },
                { nome: "🤖 Leggi documenti con Claude AI", desc: "Analizza le foto caricate e compila automaticamente tutti i campi del cliente (nome, cognome, CF, data nascita, ecc.)." },
                { nome: "📸 Altre foto documento", desc: "Foto aggiuntive del documento (es. permesso di soggiorno). Appaiono nel tasto 🪪 Documenti della dashboard." },
              ]
            },
            {
              sezione: "2 — Dati Cliente",
              colore: "#2563eb",
              campi: [
                { nome: "Cognome / Nome", desc: "Nome completo del cliente. Mentre scrivi appare l'autocomplete con i clienti già registrati — cliccali per caricare tutti i dati automaticamente." },
                { nome: "Nato a / Data nascita", desc: "Luogo e data di nascita. Appaiono sulla scheda PDF e nella sezione 'Il Sottoscritto'." },
                { nome: "Residente in / Comune / Provincia / CAP", desc: "Indirizzo completo del cliente. Appare sulla scheda PDF." },
                { nome: "Tipo documento / Nr. documento", desc: "Tipo (Carta d'identità, Patente, Passaporto) e numero. Appaiono sulla scheda PDF nella riga 'Documento'." },
                { nome: "Rilasciato da / Data rilascio / Scadenza", desc: "Dati del documento. Se il documento è scaduto appare un avviso rosso automatico quando carichi il cliente." },
                { nome: "Codice Fiscale", desc: "Usato per identificare univocamente il cliente nel database. Se due clienti hanno lo stesso nome appare un avviso con il CF per distinguerli." },
                { nome: "Telefono / Email", desc: "Contatti del cliente. L'email viene usata per inviargli la ricevuta dalla dashboard." },
              ]
            },
            {
              sezione: "3 — Oggetti Acquistati",
              colore: "#d97706",
              campi: [
                { nome: "Descrizione", desc: "Tipo di oggetto. Inizia a scrivere e appare l'autocomplete con gli oggetti più comuni (anello, bracciale, collanina, ecc.)." },
                { nome: "AU / AG", desc: "Seleziona se l'oggetto è in oro (AU) o argento (AG). Influenza il calcolo del peso totale." },
                { nome: "Peso AU / Peso AG (g)", desc: "Grammi dell'oggetto. Vengono sommati automaticamente sotto la lista oggetti e mostrati nelle statistiche della dashboard." },
                { nome: "Valore €", desc: "Importo pagato per quell'oggetto. Viene sommato nel totale in fondo." },
                { nome: "📸 Foto oggetto", desc: "Foto dell'oggetto acquistato. Visibili dalla dashboard col tasto 📦 Oggetti. Non appaiono sulla scheda PDF principale." },
                { nome: "Riepilogo grammi", desc: "In fondo alla lista appare il totale grammi AU (oro, giallo) e AG (argento, grigio) separati, più il totale valore." },
              ]
            },
            {
              sezione: "4 — Firma del Cliente",
              colore: "#059669",
              campi: [
                { nome: "Testo dichiarazione", desc: "Il cliente legge e firma dichiarando che gli oggetti sono di sua proprietà. Testo fisso non modificabile." },
                { nome: "Firma cliente", desc: "Firma con il dito sullo schermo. Obbligatoria per salvare la scheda. Appare in fondo al PDF." },
                { nome: "Firma titolare", desc: "La firma del titolare del negozio caricata nelle Impostazioni. Appare automaticamente su ogni scheda senza che il titolare debba firmare ogni volta." },
              ]
            },
            {
              sezione: "5 — Dati Operazione",
              colore: "#7c3aed",
              campi: [
                { nome: "Data operazione", desc: "Data della transazione. Pre-compilata con oggi, modificabile se necessario." },
                { nome: "Mezzo di pagamento", desc: "Contanti, Bonifico o Assegno. Appare sulla scheda PDF e nella ricevuta riepilogativa." },
                { nome: "CRO / TRN", desc: "Codice del bonifico bancario. Appare solo se presente." },
                { nome: "Note operazione", desc: "Note libere sull'operazione. Non appaiono nel PDF pubblico ma sono visibili nella dashboard." },
              ]
            },
            {
              sezione: "7 — Firma Ricevuta Riepilogativa",
              colore: "#0284c7",
              campi: [
                { nome: "Firma per ricevuta", desc: "Seconda firma del cliente che conferma di aver ricevuto il pagamento. Obbligatoria. Appare in fondo al PDF come 'Per Consegna Ricevuta'." },
              ]
            },
            {
              sezione: "Privacy — Popup",
              colore: "#dc2626",
              campi: [
                { nome: "3 consensi con firma", desc: "Si apre automaticamente prima del salvataggio per i nuovi clienti. Il cliente seleziona Acconsento/Non Acconsento e firma per ognuno dei 3 punti. Se il cliente è già registrato con privacy firmata, il popup non appare." },
                { nome: "PDF Privacy separato", desc: "Dalla dashboard il tasto 🔒 Privacy PDF apre il documento privacy del cliente con i consensi e le firme. Non appare nella scheda principale." },
              ]
            },
            {
              sezione: "Dashboard — Tasti per ogni scheda",
              colore: "#374151",
              campi: [
                { nome: "👁 Visualizza PDF", desc: "Apre la scheda completa in PDF: titolo negozio, dati cliente, oggetti, dichiarazione, firme, Plus Valenza." },
                { nome: "🖨️ Stampa", desc: "Apre il PDF e lancia la stampa automaticamente." },
                { nome: "📦 Oggetti", desc: "Mostra la lista oggetti con descrizione e grammi, più le foto degli oggetti. Permette di aggiungere nuove foto anche dopo il salvataggio." },
                { nome: "🪪 Documenti", desc: "Mostra fronte, retro e allegati del documento di identità del cliente." },
                { nome: "🔒 Privacy PDF", desc: "Apre il documento privacy con i 3 consensi e le firme del cliente." },
                { nome: "📧 Invia Email", desc: "Invia la ricevuta all'email del cliente (richiede configurazione EmailJS nelle Impostazioni)." },
              ]
            },
          ].map(({ sezione, colore, campi }) => (
            <div key={sezione} style={{ marginBottom: 20, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ background: colore, color: "#fff", padding: "10px 16px", fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                {sezione}
              </div>
              <div style={{ padding: "12px 16px" }}>
                {campi.map(({ nome, desc }) => (
                  <div key={nome} style={{ display: "flex", gap: 12, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ minWidth: 200, fontSize: 13, fontWeight: 700, color: "#374151" }}>{nome}</div>
                    <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* ---- ZONA PERICOLOSA ---- */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 40, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "2px solid #dc2626" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#dc2626" }}>
            ⚠️ Zona Pericolosa
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
            Le operazioni qui sotto sono <strong>irreversibili</strong>. I dati cancellati non possono essere recuperati.
          </p>

          {resetOk && (
            <div style={{ background: "#d1fae5", border: "1px solid #059669", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 14, color: "#065f46", fontWeight: 600 }}>
              ✅ Reset completato — tutti i clienti e le schede sono stati eliminati.
            </div>
          )}

          {!showReset ? (
            <button
              style={{ ...btn("#dc2626"), fontSize: 14 }}
              onClick={() => { setShowReset(true); setResetOk(false); setResetErrore(""); setResetPassword(""); }}
            >
              🗑 Azzera clienti e schede
            </button>
          ) : (
            <div style={{ background: "#fef2f2", border: "1.5px solid #dc2626", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#dc2626", marginBottom: 8 }}>
                🚨 Sei sicuro di voler cancellare TUTTO?
              </div>
              <p style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 16, lineHeight: 1.6 }}>
                Verranno eliminati definitivamente:<br />
                • Tutti i clienti registrati<br />
                • Tutte le schede acquisto<br />
                • Tutti gli oggetti e le foto<br />
                • Tutte le firme e i documenti<br />
                <br />
                <strong>I dati del negozio e le impostazioni NON verranno toccati.</strong>
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, color: "#6b7280", display: "block", marginBottom: 6 }}>
                  Inserisci la password per confermare
                </label>
                <input
                  type="password"
                  style={{ ...inp, border: "1.5px solid #dc2626", maxWidth: 300 }}
                  value={resetPassword}
                  onChange={e => { setResetPassword(e.target.value); setResetErrore(""); }}
                  placeholder="Password..."
                  onKeyDown={e => { if (e.key === "Enter") eseguiReset(); }}
                />
              </div>

              {resetErrore && (
                <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{resetErrore}</div>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <button
                  style={{ ...btn(resetando ? "#9ca3af" : "#dc2626"), fontSize: 14 }}
                  onClick={eseguiReset}
                  disabled={resetando || !resetPassword}
                >
                  {resetando ? "⏳ Eliminazione in corso..." : "🗑 Conferma eliminazione"}
                </button>
                <button
                  style={{ ...btn("#f3f4f6", "#374151"), fontSize: 14 }}
                  onClick={() => { setShowReset(false); setResetPassword(""); setResetErrore(""); }}
                >
                  Annulla
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
