"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type NegozioData = {
  nome: string; indirizzo: string; comune: string; provincia: string;
  cap: string; piva: string; telefono: string; email: string;
  firma_base64: string; logo_base64: string;
  numero_scheda_iniziale: number; testo_privacy: string; testo_guida: string;
  mostra_foto_oggetti: boolean; mostra_foto_documenti: boolean;
  testo_dichiarazione: string;
};

const empty: NegozioData = {
  nome: "", indirizzo: "", comune: "", provincia: "", cap: "",
  piva: "", telefono: "", email: "",
  firma_base64: "", logo_base64: "",
  numero_scheda_iniziale: 1, testo_privacy: "", testo_guida: "",
  mostra_foto_oggetti: true, mostra_foto_documenti: true,
  testo_dichiarazione: "",
};

const TESTO_DICHIARAZIONE_DEFAULT = `Il/La sottoscritto/a {{cognome}} {{nome}}, nato/a a {{luogo_nascita}} il {{data_nascita}}, residente in {{indirizzo}}, {{comune}}, identificato/a tramite {{tipo_documento}} n. {{numero_documento}},

DICHIARA che l'oggetto/i sopraindicato/i è/sono di sua esclusiva proprietà e che sullo stesso/i non esistono vincoli, garanzie e/o pegni di qualsivoglia natura.

Autorizza inoltre il trattamento dei propri dati personali ai sensi del D.Lgs. 196/2003 e del GDPR 2016/679.`;

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

function Toggle({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: checked ? "#f0fdf4" : "#f9fafb", border: `1.5px solid ${checked ? "#059669" : "#e5e7eb"}`, borderRadius: 10, marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{label}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{desc}</div>
      </div>
      <div
        onClick={() => onChange(!checked)}
        style={{ width: 48, height: 26, borderRadius: 13, background: checked ? "#059669" : "#d1d5db", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
      >
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: checked ? 25 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
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
        testo_guida: row.testo_guida || "",
        mostra_foto_oggetti: row.mostra_foto_oggetti !== false,
        mostra_foto_documenti: row.mostra_foto_documenti !== false,
        testo_dichiarazione: row.testo_dichiarazione || TESTO_DICHIARAZIONE_DEFAULT,
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
    u("logo_base64", b64); setLogoPreview(URL.createObjectURL(file));
  }
  async function handleFirmaFile(file: File | null) {
    if (!file) return;
    const b64 = await fileToBase64(file);
    u("firma_base64", b64); setFirmaPreview(`data:${file.type};base64,${b64}`);
  }

  async function salva() {
    try {
      setSaving(true); setStatus({ text: "💾 Salvataggio...", type: "loading" });
      const { error } = await supabase.from("negozio").upsert({
        id: 1,
        nome: data.nome, indirizzo: data.indirizzo, comune: data.comune,
        provincia: data.provincia, cap: data.cap, piva: data.piva,
        telefono: data.telefono, email: data.email,
        firma_base64: data.firma_base64, logo_base64: data.logo_base64,
        numero_scheda_iniziale: data.numero_scheda_iniziale,
        testo_privacy: data.testo_privacy, testo_guida: data.testo_guida,
        mostra_foto_oggetti: data.mostra_foto_oggetti,
        mostra_foto_documenti: data.mostra_foto_documenti,
        testo_dichiarazione: data.testo_dichiarazione,
      });
      if (error) throw new Error(error.message);
      setStatus({ text: "✅ Impostazioni salvate!", type: "success" });
    } catch (e: any) {
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally { setSaving(false); }
  }

  async function eseguiReset() {
    if (resetPassword !== RESET_PASSWORD) { setResetErrore("❌ Password errata. Riprova."); return; }
    setResetErrore(""); setResetando(true);
    try {
      await supabase.from("foto_scheda").delete().neq("id", 0);
      await supabase.from("oggetti").delete().neq("id", 0);
      await supabase.from("operazioni").delete().neq("id", 0);
      await supabase.from("clienti").delete().neq("id", 0);
      setResetOk(true); setShowReset(false); setResetPassword("");
      setStatus({ text: "✅ Tutti i dati clienti e schede sono stati eliminati.", type: "success" });
    } catch (e: any) { setResetErrore("❌ Errore: " + e.message); }
    finally { setResetando(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>⚙️ Impostazioni Negozio</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "6px 0 0" }}>Configura i dati del tuo compro oro</p>
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
            <Field label="Nome negozio"><input style={inp} value={data.nome} onChange={e => u("nome", e.target.value)} /></Field>
            <Field label="Indirizzo"><input style={inp} value={data.indirizzo} onChange={e => u("indirizzo", e.target.value)} /></Field>
            <Field label="Comune"><input style={inp} value={data.comune} onChange={e => u("comune", e.target.value)} /></Field>
            <Field label="Provincia"><input style={inp} value={data.provincia} onChange={e => u("provincia", e.target.value)} /></Field>
            <Field label="CAP"><input style={inp} value={data.cap} onChange={e => u("cap", e.target.value)} /></Field>
            <Field label="P.IVA / C.F."><input style={inp} value={data.piva} onChange={e => u("piva", e.target.value)} /></Field>
            <Field label="Telefono"><input style={inp} value={data.telefono} onChange={e => u("telefono", e.target.value)} /></Field>
            <Field label="Email"><input style={inp} value={data.email} onChange={e => u("email", e.target.value)} /></Field>
            <Field label="Numero scheda iniziale"><input type="number" style={inp} value={data.numero_scheda_iniziale} onChange={e => u("numero_scheda_iniziale", Number(e.target.value))} /></Field>
          </div>
        </section>

        {/* Logo */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 18px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Logo Negozio</h2>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            {logoPreview ? <img src={logoPreview} alt="Logo" style={{ height: 80, objectFit: "contain", border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 8 }} />
              : <div style={{ width: 120, height: 80, border: "1.5px dashed #d1d5db", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 12 }}>Nessun logo</div>}
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
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Appare automaticamente su ogni scheda acquisti.</p>
          {firmaPreview && data.firma_base64 ? (
            <div>
              <img src={firmaPreview} alt="Firma" style={{ maxWidth: "100%", height: 100, objectFit: "contain", border: "1.5px solid #059669", borderRadius: 10, background: "#fafafa", display: "block" }} />
              <button type="button" style={{ marginTop: 12, ...btn("#fee2e2", "#dc2626") }} onClick={() => { u("firma_base64", ""); setFirmaPreview(""); }}>🗑 Rimuovi firma</button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button type="button" style={{ ...btn(firmaMode === "disegna" ? "#111827" : "#f3f4f6", firmaMode === "disegna" ? "#fff" : "#374151"), fontSize: 13, padding: "8px 18px" }} onClick={() => setFirmaMode("disegna")}>✏️ Disegna</button>
                <button type="button" style={{ ...btn(firmaMode === "carica" ? "#111827" : "#f3f4f6", firmaMode === "carica" ? "#fff" : "#374151"), fontSize: 13, padding: "8px 18px" }} onClick={() => setFirmaMode("carica")}>📁 Carica file</button>
              </div>
              {firmaMode === "disegna" ? (
                <SignaturePad hasFirma={!!data.firma_base64} onSave={(dataUrl) => { u("firma_base64", dataUrl.split(",")[1]); setFirmaPreview(dataUrl); }} onClear={() => { u("firma_base64", ""); setFirmaPreview(""); }} />
              ) : (
                <div style={{ border: "2px dashed #d1d5db", borderRadius: 10, padding: 32, textAlign: "center", background: "#fafafa" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🖊️</div>
                  <button type="button" style={btn("#2563eb")} onClick={() => firmaFileRef.current?.click()}>📁 Scegli file firma</button>
                  <input ref={firmaFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFirmaFile(e.target.files?.[0] || null)} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Testo privacy */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Testo Informativa Privacy</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Testo mostrato al cliente prima della firma.</p>
          <textarea style={{ ...inp, height: 280, paddingTop: 12, lineHeight: 1.6, resize: "vertical" }} value={data.testo_privacy} onChange={e => u("testo_privacy", e.target.value)} placeholder="Inserisci il testo della tua informativa privacy..." />
        </section>

        {/* ---- IMPOSTAZIONI PDF ---- */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "2px solid #7c3aed" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#7c3aed" }}>
            🖨️ Impostazioni PDF / Stampa
          </h2>

          {/* Toggle foto */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Elementi da mostrare nel PDF</div>
            <Toggle
              label="📸 Foto oggetti acquistati"
              desc="Mostra le foto degli oggetti nel PDF principale"
              checked={data.mostra_foto_oggetti}
              onChange={v => u("mostra_foto_oggetti", v)}
            />
            <Toggle
              label="🪪 Foto documenti cliente"
              desc="Mostra fronte/retro del documento nel PDF principale"
              checked={data.mostra_foto_documenti}
              onChange={v => u("mostra_foto_documenti", v)}
            />
          </div>

          {/* Testo dichiarazione modificabile */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Testo Dichiarazione nel PDF</div>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>
              Questo testo appare nel riquadro giallo della scheda PDF. Usa questi segnaposto che vengono sostituiti automaticamente con i dati del cliente:
              <br />
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{cognome}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{nome}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{luogo_nascita}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{data_nascita}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{indirizzo}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{comune}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{tipo_documento}}"}</code>{" "}
              <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{"{{numero_documento}}"}</code>
            </p>
            <textarea
              style={{ ...inp, height: 220, paddingTop: 12, lineHeight: 1.7, resize: "vertical", fontSize: 13, fontFamily: "Arial, sans-serif" }}
              value={data.testo_dichiarazione || TESTO_DICHIARAZIONE_DEFAULT}
              onChange={e => u("testo_dichiarazione", e.target.value)}
            />
            <button
              type="button"
              style={{ ...btn("#f3f4f6", "#374151"), fontSize: 12, padding: "6px 14px", marginTop: 8 }}
              onClick={() => u("testo_dichiarazione", TESTO_DICHIARAZIONE_DEFAULT)}
            >
              ↺ Ripristina testo predefinito
            </button>
          </div>
        </section>

        {/* Note operative */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "2px solid #2563eb" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#2563eb" }}>📖 Note Operative</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Note per i dipendenti, promemoria, istruzioni operative.</p>
          <textarea style={{ ...inp, height: 300, paddingTop: 12, lineHeight: 1.8, resize: "vertical", fontSize: 14 }} value={data.testo_guida} onChange={e => u("testo_guida", e.target.value)} placeholder={"Scrivi qui le tue note operative..."} />
        </section>

        {/* Salva */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 40 }}>
          <button style={{ ...btn(saving ? "#9ca3af" : "#059669"), fontSize: 16, padding: "14px 36px" }} onClick={salva} disabled={saving}>
            {saving ? "⏳ Salvataggio..." : "💾 Salva Impostazioni"}
          </button>
        </div>

        {/* Zona pericolosa */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 40, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "2px solid #dc2626" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 8px", textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#dc2626" }}>⚠️ Zona Pericolosa</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Le operazioni qui sotto sono <strong>irreversibili</strong>.</p>
          {resetOk && <div style={{ background: "#d1fae5", border: "1px solid #059669", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 14, color: "#065f46", fontWeight: 600 }}>✅ Reset completato.</div>}
          {!showReset ? (
            <button style={{ ...btn("#dc2626"), fontSize: 14 }} onClick={() => { setShowReset(true); setResetOk(false); setResetErrore(""); setResetPassword(""); }}>🗑 Azzera clienti e schede</button>
          ) : (
            <div style={{ background: "#fef2f2", border: "1.5px solid #dc2626", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#dc2626", marginBottom: 8 }}>🚨 Sei sicuro?</div>
              <p style={{ fontSize: 13, color: "#7f1d1d", marginBottom: 16, lineHeight: 1.6 }}>Verranno eliminati tutti i clienti, schede, oggetti, foto e firme.<br /><strong>I dati del negozio NON verranno toccati.</strong></p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6 }}>Password di conferma</label>
                <input type="password" style={{ ...inp, border: "1.5px solid #dc2626", maxWidth: 300 }} value={resetPassword} onChange={e => { setResetPassword(e.target.value); setResetErrore(""); }} placeholder="Password..." onKeyDown={e => { if (e.key === "Enter") eseguiReset(); }} />
              </div>
              {resetErrore && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{resetErrore}</div>}
              <div style={{ display: "flex", gap: 12 }}>
                <button style={{ ...btn(resetando ? "#9ca3af" : "#dc2626"), fontSize: 14 }} onClick={eseguiReset} disabled={resetando || !resetPassword}>{resetando ? "⏳ Eliminazione..." : "🗑 Conferma eliminazione"}</button>
                <button style={{ ...btn("#f3f4f6", "#374151"), fontSize: 14 }} onClick={() => { setShowReset(false); setResetPassword(""); setResetErrore(""); }}>Annulla</button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
