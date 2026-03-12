"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type NegozioData = {
  nome: string; indirizzo: string; comune: string; provincia: string;
  cap: string; piva: string; telefono: string; email: string;
  firma_base64: string; logo_base64: string;
  numero_scheda_iniziale: number; testo_privacy: string;
  emailjs_service_id: string; emailjs_template_id: string; emailjs_public_key: string;
  email_oggetto: string; email_testo: string;
};

const empty: NegozioData = {
  nome: "", indirizzo: "", comune: "", provincia: "", cap: "",
  piva: "", telefono: "", email: "",
  firma_base64: "", logo_base64: "",
  numero_scheda_iniziale: 1, testo_privacy: "",
  emailjs_service_id: "", emailjs_template_id: "", emailjs_public_key: "",
  email_oggetto: "Ricevuta acquisto oro — Scheda N° {{numero_scheda}}",
  email_testo: "Gentile {{nome_cliente}},\n\nIn allegato trova la ricevuta relativa alla nostra operazione di acquisto del {{data}}.\n\nScheda N° {{numero_scheda}}\nTotale: €{{totale}}\n\nGrazie per la sua fiducia.\n\n{{nome_negozio}}\n{{telefono_negozio}}",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#6b7280" }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</span>}
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
  const [testEmailStatus, setTestEmailStatus] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);

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
        emailjs_service_id: row.emailjs_service_id || "",
        emailjs_template_id: row.emailjs_template_id || "",
        emailjs_public_key: row.emailjs_public_key || "",
        email_oggetto: row.email_oggetto || empty.email_oggetto,
        email_testo: row.email_testo || empty.email_testo,
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
        firma_base64: data.firma_base64, logo_base64: data.logo_base64,
        numero_scheda_iniziale: data.numero_scheda_iniziale,
        testo_privacy: data.testo_privacy,
        emailjs_service_id: data.emailjs_service_id,
        emailjs_template_id: data.emailjs_template_id,
        emailjs_public_key: data.emailjs_public_key,
        email_oggetto: data.email_oggetto,
        email_testo: data.email_testo,
      });
      if (error) throw new Error(error.message);
      setStatus({ text: "✅ Impostazioni salvate!", type: "success" });
    } catch (e: any) {
      setStatus({ text: `❌ Errore: ${e.message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function testEmail() {
    if (!data.emailjs_service_id || !data.emailjs_template_id || !data.emailjs_public_key) {
      setTestEmailStatus("❌ Inserisci prima i dati EmailJS");
      return;
    }
    if (!data.email) {
      setTestEmailStatus("❌ Inserisci l'email del negozio");
      return;
    }
    try {
      setTestEmailStatus("⏳ Invio email di test...");
      const emailjs = await import("@emailjs/browser");
      await emailjs.send(
        data.emailjs_service_id,
        data.emailjs_template_id,
        {
          to_email: data.email,
          to_name: "Test",
          subject: "Test configurazione email",
          message: "✅ La configurazione email funziona correttamente!",
          nome_negozio: data.nome,
          telefono_negozio: data.telefono,
        },
        data.emailjs_public_key
      );
      setTestEmailStatus("✅ Email di test inviata a " + data.email);
    } catch (e: any) {
      setTestEmailStatus("❌ Errore: " + (e.text || e.message || "controlla i dati EmailJS"));
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>⚙️ Impostazioni Negozio</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "6px 0 0" }}>Configura i dati del tuo compro oro</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/dashboard" style={{ ...btn("#2563eb"), textDecoration: "none", display: "inline-block" }}>📊 Dashboard</a>
            <a href="/" style={{ ...btn("#111827"), textDecoration: "none", display: "inline-block" }}>← Schede</a>
          </div>
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
            <Field label="Email negozio"><input style={inp} value={data.email} onChange={e => u("email", e.target.value)} /></Field>
            <Field label="Numero scheda iniziale" hint="Da quale numero partono le schede">
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
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Appare automaticamente su ogni scheda acquisti.</p>
          {firmaPreview && data.firma_base64 ? (
            <div>
              <img src={firmaPreview} alt="Firma titolare" style={{ maxWidth: "100%", height: 100, objectFit: "contain", border: "1.5px solid #059669", borderRadius: 10, background: "#fafafa", display: "block" }} />
              <button type="button" style={{ marginTop: 12, ...btn("#fee2e2", "#dc2626") }} onClick={() => { u("firma_base64", ""); setFirmaPreview(""); }}>🗑 Rifai la firma</button>
            </div>
          ) : (
            <SignaturePad
              hasFirma={!!data.firma_base64}
              onSave={(dataUrl) => { u("firma_base64", dataUrl.split(",")[1]); setFirmaPreview(dataUrl); }}
              onClear={() => { u("firma_base64", ""); setFirmaPreview(""); }}
            />
          )}
        </section>

        {/* Testo privacy */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Testo Informativa Privacy</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Mostrato al cliente prima della firma sulla scheda acquisti.</p>
          <textarea style={{ ...inp, height: 280, paddingTop: 12, lineHeight: 1.6, resize: "vertical" }}
            value={data.testo_privacy} onChange={e => u("testo_privacy", e.target.value)}
            placeholder="Inserisci qui il testo della tua informativa privacy..." />
        </section>

        {/* EmailJS */}
        <section style={{ background: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>📧 Configurazione Email (EmailJS)</h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
            Vai su <a href="https://emailjs.com" target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>emailjs.com</a> → Account → API Keys per trovare questi valori.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 16 }}>
            <Field label="Service ID" hint="Es. service_abc123"><input style={inp} value={data.emailjs_service_id} onChange={e => u("emailjs_service_id", e.target.value)} placeholder="service_xxxxxxx" /></Field>
            <Field label="Template ID" hint="Es. template_abc123"><input style={inp} value={data.emailjs_template_id} onChange={e => u("emailjs_template_id", e.target.value)} placeholder="template_xxxxxxx" /></Field>
            <Field label="Public Key" hint="In Account → API Keys"><input style={inp} value={data.emailjs_public_key} onChange={e => u("emailjs_public_key", e.target.value)} placeholder="xxxxxxxxxxxxxxx" /></Field>
          </div>

          <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
            <Field label="Oggetto email" hint="Usa {{numero_scheda}}, {{nome_cliente}}, {{data}}">
              <input style={inp} value={data.email_oggetto} onChange={e => u("email_oggetto", e.target.value)} />
            </Field>
            <Field label="Testo email" hint="Usa {{numero_scheda}}, {{nome_cliente}}, {{data}}, {{totale}}, {{nome_negozio}}, {{telefono_negozio}}">
              <textarea style={{ ...inp, height: 160, paddingTop: 12, lineHeight: 1.6, resize: "vertical" }} value={data.email_testo} onChange={e => u("email_testo", e.target.value)} />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button style={btn("#2563eb")} onClick={testEmail}>📨 Invia email di test</button>
            {testEmailStatus && <span style={{ fontSize: 13, fontWeight: 600, color: testEmailStatus.startsWith("✅") ? "#059669" : testEmailStatus.startsWith("⏳") ? "#2563eb" : "#dc2626" }}>{testEmailStatus}</span>}
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
            L'email di test verrà inviata a: <strong>{data.email || "nessuna email configurata"}</strong>
          </p>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 40 }}>
          <button style={{ ...btn(saving ? "#9ca3af" : "#059669"), fontSize: 16, padding: "14px 36px" }} onClick={salva} disabled={saving}>
            {saving ? "⏳ Salvataggio..." : "💾 Salva Impostazioni"}
          </button>
        </div>

      </div>
    </div>
  );
}
