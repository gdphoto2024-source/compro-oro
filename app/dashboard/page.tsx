"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type Scheda = {
  id: number;
  numero_scheda: number;
  data_operazione: string;
  mezzo_pagamento: string;
  cro_trn: string;
  note_operazione: string;
  totale_valore: number;
  tipo_documento: string;
  numero_documento: string;
  data_rilascio: string;
  data_scadenza: string;
  ente_rilascio: string;
  cliente: {
    nome: string; cognome: string; email: string; codice_fiscale: string;
    luogo_nascita: string; data_nascita: string;
    indirizzo: string; comune: string; provincia: string; cap: string;
  } | null;
  oggetti: { descrizione: string; materiale: string; peso_au: number; peso_ag: number; valore: number; }[];
  foto: { tipo: string; data_base64: string; mime_type: string; }[];
};

type Negozio = {
  nome: string; indirizzo: string; comune: string; provincia: string;
  cap: string; piva: string; telefono: string; email: string;
  firma_base64: string; logo_base64: string;
  emailjs_service_id: string; emailjs_template_id: string; emailjs_public_key: string;
  email_oggetto: string; email_testo: string;
};

function currency(v: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

function buildPDFHtml(scheda: Scheda, negozio: Negozio | null): string {
  const fotoFronte = scheda.foto.find(f => f.tipo === "documento_fronte");
  const fotoRetro = scheda.foto.find(f => f.tipo === "documento_retro");
  const firmaCliente = scheda.foto.find(f => f.tipo === "firma_cliente");
  const firmaPrivacy = scheda.foto.find(f => f.tipo === "firma_privacy");
  const fotoOggetti = scheda.foto.filter(f => f.tipo.startsWith("oggetto_"));

  const dataOra = scheda.data_operazione
    ? new Date(scheda.data_operazione).toLocaleDateString("it-IT")
    : "___/___/______";

  const pesoAuTot = scheda.oggetti.reduce((a, o) => a + (o.peso_au || 0), 0);
  const pesoAgTot = scheda.oggetti.reduce((a, o) => a + (o.peso_ag || 0), 0);

  const oggettiDesc = scheda.oggetti.map((o, i) =>
    `${i+1}. ${o.descrizione || ""}${o.materiale === "oro" ? " (AU)" : " (AG)"}  –  ${currency(o.valore)}`
  ).join("<br>");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Scheda N° ${scheda.numero_scheda}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 18px; color: #000; background: #fff; padding: 28px 36px; }
  .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; }
  .top-bar-left { font-size: 13px; }
  .top-bar-scheda { font-size: 16px; font-weight: 800; }
  .logo-img { max-height: 55px; max-width: 150px; object-fit: contain; }
  .riga { display: flex; gap: 0; border-bottom: 1px solid #ccc; padding: 6px 0; align-items: baseline; }
  .riga label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #555; min-width: 160px; }
  .riga span { font-size: 13px; font-weight: 500; flex: 1; border-bottom: 1px dotted #aaa; min-height: 18px; padding-left: 6px; }
  .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #000; background: #f0f0f0; padding: 6px 10px; margin: 14px 0 8px; border-left: 4px solid #000; }
  .vende-a-box { border: 2px solid #000; border-radius: 6px; padding: 12px 16px; margin: 10px 0 14px; background: #fafafa; }
  .vende-a-title { font-size: 14px; font-weight: 800; text-transform: uppercase; text-align: center; margin-bottom: 8px; letter-spacing: 0.1em; }
  .vende-a-nome { font-size: 15px; font-weight: 800; text-align: center; }
  .vende-a-info { font-size: 12px; text-align: center; color: #333; margin-top: 4px; }
  .oggetti-box { border: 1px solid #ccc; border-radius: 4px; padding: 10px; min-height: 80px; margin-bottom: 10px; font-size: 13px; line-height: 1.8; }
  .riepilogo-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin: 10px 0; }
  .riepilogo-field { border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; }
  .riepilogo-field label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #555; display: block; }
  .riepilogo-field span { font-size: 14px; font-weight: 800; }
  .dichiarazione { border: 1.5px solid #000; border-radius: 6px; padding: 14px 16px; margin: 14px 0; font-size: 13px; line-height: 1.8; background: #fffef0; }
  .foto-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
  .foto-doc { width: 160px; border-radius: 6px; border: 1px solid #ccc; }
  .foto-ogg { width: 90px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #ccc; }
  .firme-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 20px; }
  .firma-box { border: 1.5px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; }
  .firma-img { height: 65px; object-fit: contain; display: block; margin: 0 auto; }
  .firma-label { font-size: 10px; color: #555; margin-top: 6px; text-align: center; font-weight: 700; text-transform: uppercase; }
  .firma-linea { border-bottom: 1px solid #999; min-height: 50px; margin-bottom: 4px; }
  .privacy-badge { background: #d1fae5; border: 1px solid #059669; border-radius: 6px; padding: 6px 12px; font-size: 12px; color: #065f46; margin-bottom: 10px; }
  @media print { body { padding: 10px 20px; } .no-print { display: none !important; } }
</style>
</head>
<body>

<!-- TOP BAR -->
<div class="top-bar">
  <div class="top-bar-left">
    ${negozio?.logo_base64 ? `<img src="data:image/png;base64,${negozio.logo_base64}" class="logo-img" alt="Logo">` : `<span style="font-size:18px;font-weight:800">${negozio?.nome || "Compro Oro"}</span>`}
  </div>
  <div style="text-align:center">
    <div style="font-size:13px">${negozio?.comune || "TORINO"} &nbsp;&nbsp; <strong>${dataOra}</strong></div>
    <div style="font-size:11px;color:#555">Ora: ${new Date().toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"})}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#555">Scheda Acquisto</div>
    <div class="top-bar-scheda">N° ${scheda.numero_scheda}</div>
  </div>
</div>

<!-- DATI CLIENTE -->
<div class="section-title">Il Sottoscritto</div>
<div class="riga"><label>Cognome e Nome</label><span>${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}</span></div>
<div class="riga"><label>Nato a</label><span>${scheda.cliente?.luogo_nascita || "—"}</span><label style="min-width:80px;margin-left:20px">il</label><span>${formatDate(scheda.cliente?.data_nascita || "") || "—"}</span></div>
<div class="riga"><label>Residente in</label><span>${scheda.cliente?.indirizzo || "—"}</span><label style="min-width:30px;margin-left:10px">a</label><span>${scheda.cliente?.comune || "—"}${scheda.cliente?.provincia ? " (" + scheda.cliente.provincia + ")" : ""} ${scheda.cliente?.cap || ""}</span></div>
<div class="riga"><label>Documento</label><span>${scheda.tipo_documento || "—"} &nbsp; nr. ${scheda.numero_documento || "—"}</span><label style="min-width:100px;margin-left:10px">Rilasciato da</label><span>${scheda.ente_rilascio || "—"}</span><label style="min-width:30px;margin-left:10px">il</label><span>${formatDate(scheda.data_rilascio) || "—"}</span></div>
<div class="riga"><label>Scadenza</label><span>${formatDate(scheda.data_scadenza) || "—"}</span><label style="min-width:120px;margin-left:20px">Codice Fiscale</label><span>${scheda.cliente?.codice_fiscale || "—"}</span></div>

${fotoFronte || fotoRetro ? `
<div style="margin:10px 0">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Foto documento</div>
  <div class="foto-row">
    ${fotoFronte ? `<img src="data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}" class="foto-doc" alt="Fronte">` : ""}
    ${fotoRetro ? `<img src="data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}" class="foto-doc" alt="Retro">` : ""}
  </div>
</div>` : ""}

<!-- VENDE A -->
<div class="vende-a-box">
  <div class="vende-a-title">Vende A</div>
  <div class="vende-a-nome">${negozio?.nome || "Compro Oro"}</div>
  <div class="vende-a-info">
    ${negozio?.indirizzo ? negozio.indirizzo + " — " : ""}${negozio?.comune || ""}${negozio?.provincia ? " (" + negozio.provincia + ")" : ""} ${negozio?.cap || ""}
    ${negozio?.piva ? "<br>P.IVA: " + negozio.piva : ""}
  </div>
</div>

<!-- OGGETTI -->
<div class="section-title">I Seguenti Oggetti</div>
<div class="oggetti-box">
  ${oggettiDesc || "—"}
</div>

${fotoOggetti.length > 0 ? `
<div style="margin:8px 0">
  <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Foto oggetti</div>
  <div class="foto-row">${fotoOggetti.map(f => `<img src="data:${f.mime_type};base64,${f.data_base64}" class="foto-ogg" alt="Oggetto">`).join("")}</div>
</div>` : ""}

<!-- RIEPILOGO -->
<div class="riepilogo-row">
  <div class="riepilogo-field"><label>Peso AU (g)</label><span>${pesoAuTot || "—"}</span></div>
  <div class="riepilogo-field"><label>Peso AG (g)</label><span>${pesoAgTot || "—"}</span></div>
  <div class="riepilogo-field"><label>Mezzo Pagamento</label><span>${scheda.mezzo_pagamento || "contanti"}</span></div>
  <div class="riepilogo-field"><label>Totale Valore</label><span>${currency(scheda.totale_valore)}</span></div>
</div>
${scheda.cro_trn ? `<div class="riga"><label>CRO / TRN Bonifico</label><span>${scheda.cro_trn}</span></div>` : ""}
${scheda.note_operazione ? `<div class="riga"><label>Note</label><span>${scheda.note_operazione}</span></div>` : ""}

<!-- DICHIARAZIONE -->
<div class="dichiarazione">
  Il/La sottoscritto/a <strong>${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}</strong>,
  nato/a a <strong>${scheda.cliente?.luogo_nascita || "___"}</strong> il <strong>${formatDate(scheda.cliente?.data_nascita || "") || "___"}</strong>,
  residente in <strong>${scheda.cliente?.indirizzo || "___"}, ${scheda.cliente?.comune || "___"}</strong>,
  identificato/a tramite <strong>${scheda.tipo_documento || "___"} n. ${scheda.numero_documento || "___"}</strong>,
  <br><br>
  <strong>DICHIARA</strong> che l'oggetto/i sopraindicato/i è/sono di sua esclusiva proprietà
  e che sullo stesso/i non esistono vincoli, garanzie e/o pegni di qualsivoglia natura.
  <br><br>
  Autorizza inoltre il trattamento dei propri dati personali ai sensi del D.Lgs. 196/2003 e del GDPR 2016/679.
</div>

<!-- FIRME -->
${firmaPrivacy ? `<div class="privacy-badge">✅ Informativa privacy accettata dal cliente in data ${formatDate(scheda.data_operazione)}</div>` : ""}

<div class="firme-grid">
  <div class="firma-box">
    ${firmaCliente ? `<img src="data:image/png;base64,${firmaCliente.data_base64}" class="firma-img" alt="Firma venditore">` : `<div class="firma-linea"></div>`}
    <div class="firma-label">Firma Venditore</div>
  </div>
  <div class="firma-box">
    ${negozio?.firma_base64 ? `<img src="data:image/png;base64,${negozio.firma_base64}" class="firma-img" alt="Firma azienda">` : `<div class="firma-linea"></div>`}
    <div class="firma-label">Firma Azienda</div>
  </div>
  <div class="firma-box">
    ${firmaPrivacy ? `<img src="data:image/png;base64,${firmaPrivacy.data_base64}" class="firma-img" alt="Firma privacy">` : `<div class="firma-linea"></div>`}
    <div class="firma-label">Per Consegna Ricevuta<br>Data e Firma</div>
  </div>
</div>

<div style="margin-top:16px;padding:10px 14px;border:1px solid #ccc;border-radius:4px;font-size:12px;color:#333;text-align:center">
  Tutti gli oggetti saranno ceduti per la fusione a <strong>Plus Valenza Srl</strong>, Via dell&apos;Artigianato 99 Zona D3 &nbsp; 15048 Valenza (AL) &nbsp; P.Iva: 02134200068
</div>
<div style="margin-top:10px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#888;text-align:center">
  SCHEDA PER CESSIONE DA PRIVATI DI BENI USATI — ${negozio?.nome || ""} — P.IVA ${negozio?.piva || ""} — Generata il ${new Date().toLocaleDateString("it-IT")}
</div>

</body></html>`;
}
export default function Dashboard() {
  const [schede, setSchede] = useState<Scheda[]>([]);
  const [negozio, setNegozio] = useState<Negozio | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterData, setFilterData] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ [id: number]: string }>({});
  const [pdfStatus, setPdfStatus] = useState<{ [id: number]: string }>({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Carica negozio
      const { data: neg } = await supabase.from("negozio").select("*").eq("id", 1).single();
      if (neg) setNegozio(neg as Negozio);

      // Carica schede con cliente, oggetti, foto
      const { data: ops, error } = await supabase
        .from("operazioni")
        .select(`
          id, numero_scheda, data_operazione, mezzo_pagamento, cro_trn, note_operazione, totale_valore,
          tipo_documento, numero_documento, data_rilascio, data_scadenza, ente_rilascio,
          clienti (nome, cognome, email, codice_fiscale, luogo_nascita, data_nascita, indirizzo, comune, provincia, cap),
          oggetti (descrizione, materiale, peso_au, peso_ag, valore),
          foto_scheda (tipo, data_base64, mime_type)
        `)
        .order("numero_scheda", { ascending: false });

      if (!error && ops) {
        setSchede(ops.map((op: any) => ({
          id: op.id,
          numero_scheda: op.numero_scheda,
          data_operazione: op.data_operazione,
          mezzo_pagamento: op.mezzo_pagamento,
          cro_trn: op.cro_trn || "",
          note_operazione: op.note_operazione || "",
          totale_valore: op.totale_valore,
          tipo_documento: op.tipo_documento || "",
          numero_documento: op.numero_documento || "",
          data_rilascio: op.data_rilascio || "",
          data_scadenza: op.data_scadenza || "",
          ente_rilascio: op.ente_rilascio || "",
          cliente: op.clienti,
          oggetti: op.oggetti || [],
          foto: op.foto_scheda || [],
        })));
      }
      setLoading(false);
    }
    load();
  }, []);

  const schedeFiltered = schede.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      String(s.numero_scheda).includes(q) ||
      (s.cliente?.cognome || "").toLowerCase().includes(q) ||
      (s.cliente?.nome || "").toLowerCase().includes(q) ||
      (s.cliente?.codice_fiscale || "").toLowerCase().includes(q);
    const matchData = !filterData || s.data_operazione === filterData;
    return matchSearch && matchData;
  });

  function apriPDF(scheda: Scheda) {
    const html = buildPDFHtml(scheda, negozio);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  function stampaPDF(scheda: Scheda) {
    const html = buildPDFHtml(scheda, negozio);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  async function inviaEmail(scheda: Scheda) {
    if (!scheda.cliente?.email) {
      setEmailStatus(p => ({ ...p, [scheda.id]: "❌ Nessuna email cliente" }));
      return;
    }
    if (!negozio?.emailjs_service_id || !negozio?.emailjs_template_id || !negozio?.emailjs_public_key) {
      setEmailStatus(p => ({ ...p, [scheda.id]: "❌ Configura EmailJS nelle Impostazioni" }));
      return;
    }
    try {
      setEmailStatus(p => ({ ...p, [scheda.id]: "⏳ Invio..." }));
      const emailjs = await import("@emailjs/browser");

      // Sostituisci variabili nel testo
      const nomeCliente = `${scheda.cliente.cognome} ${scheda.cliente.nome}`;
      const testo = (negozio.email_testo || "")
        .replace(/{{nome_cliente}}/g, nomeCliente)
        .replace(/{{numero_scheda}}/g, String(scheda.numero_scheda))
        .replace(/{{data}}/g, formatDate(scheda.data_operazione))
        .replace(/{{totale}}/g, currency(scheda.totale_valore))
        .replace(/{{nome_negozio}}/g, negozio.nome || "")
        .replace(/{{telefono_negozio}}/g, negozio.telefono || "");

      const oggetto = (negozio.email_oggetto || "Ricevuta acquisto")
        .replace(/{{numero_scheda}}/g, String(scheda.numero_scheda))
        .replace(/{{nome_cliente}}/g, nomeCliente)
        .replace(/{{data}}/g, formatDate(scheda.data_operazione));

      await emailjs.send(
        negozio.emailjs_service_id,
        negozio.emailjs_template_id,
        {
          to_email: scheda.cliente.email,
          to_name: nomeCliente,
          subject: oggetto,
          message: testo,
          nome_negozio: negozio.nome,
          telefono_negozio: negozio.telefono,
        },
        negozio.emailjs_public_key
      );
      setEmailStatus(p => ({ ...p, [scheda.id]: "✅ Inviata!" }));
    } catch (e: any) {
      setEmailStatus(p => ({ ...p, [scheda.id]: "❌ " + (e.text || e.message || "Errore") }));
    }
  }

  const inp: React.CSSProperties = { height: 40, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
  const btn = (bg: string, color = "#fff"): React.CSSProperties => ({ background: bg, color, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit" });

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "2px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>📊 Dashboard Schede</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>{schede.length} schede totali</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/impostazioni" style={{ ...btn("#6b7280"), textDecoration: "none", display: "inline-block" }}>⚙️ Impostazioni</a>
            <a href="/" style={{ ...btn("#111827"), textDecoration: "none", display: "inline-block" }}>+ Nuova Scheda</a>
          </div>
        </div>

        {/* Filtri */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...inp, width: 280 }} placeholder="🔍 Cerca per nome, cognome, CF, n° scheda..." value={search} onChange={e => setSearch(e.target.value)} />
          <input type="date" style={{ ...inp, width: 180 }} value={filterData} onChange={e => setFilterData(e.target.value)} />
          {(search || filterData) && <button style={btn("#f3f4f6", "#374151")} onClick={() => { setSearch(""); setFilterData(""); }}>✕ Cancella filtri</button>}
          <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto" }}>{schedeFiltered.length} risultati</span>
        </div>

        {/* Statistiche rapide */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Schede totali", val: schede.length, color: "#2563eb" },
            { label: "Totale acquistato", val: currency(schede.reduce((a, s) => a + (s.totale_valore || 0), 0)), color: "#059669" },
            { label: "Oggi", val: schede.filter(s => s.data_operazione === new Date().toISOString().slice(0, 10)).length, color: "#d97706" },
            { label: "Questo mese", val: schede.filter(s => s.data_operazione?.slice(0, 7) === new Date().toISOString().slice(0, 7)).length, color: "#7c3aed" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 8px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}` }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Lista schede */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#6b7280", fontSize: 16 }}>⏳ Caricamento schede...</div>
        ) : schedeFiltered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#6b7280", fontSize: 16 }}>Nessuna scheda trovata.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {schedeFiltered.map(scheda => (
              <div key={scheda.id} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", border: "1.5px solid #e5e7eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>

                  {/* Info scheda */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{ background: "#111827", color: "#fff", borderRadius: 8, padding: "4px 14px", fontWeight: 800, fontSize: 16 }}>N° {scheda.numero_scheda}</div>
                      <div style={{ fontSize: 14, color: "#6b7280" }}>📅 {formatDate(scheda.data_operazione)}</div>
                      <div style={{ background: "#dbeafe", color: "#1e40af", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const }}>{scheda.mezzo_pagamento || "contanti"}</div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
                      {scheda.cliente ? `${scheda.cliente.cognome} ${scheda.cliente.nome}` : "Cliente sconosciuto"}
                    </div>
                    {scheda.cliente?.codice_fiscale && <div style={{ fontSize: 12, color: "#9ca3af" }}>CF: {scheda.cliente.codice_fiscale}</div>}
                    {scheda.cliente?.email && <div style={{ fontSize: 12, color: "#6b7280" }}>✉ {scheda.cliente.email}</div>}
                    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                      {scheda.oggetti.length} oggetti — {scheda.foto.filter(f => f.tipo.startsWith("oggetto")).length} foto oggetti —
                      {scheda.foto.find(f => f.tipo === "firma_cliente") ? " ✅ firmata" : " ⚠️ no firma"} —
                      {scheda.foto.find(f => f.tipo === "firma_privacy") ? " ✅ privacy" : " ⚠️ no privacy"}
                    </div>
                  </div>

                  {/* Totale */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#059669" }}>{currency(scheda.totale_valore)}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>totale acquisto</div>
                  </div>
                </div>

                {/* Bottoni azioni */}
                <div style={{ display: "flex", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6", flexWrap: "wrap", alignItems: "center" }}>
                  <button style={btn("#111827")} onClick={() => apriPDF(scheda)}>👁 Visualizza PDF</button>
                  <button style={btn("#2563eb")} onClick={() => stampaPDF(scheda)}>🖨️ Stampa</button>
                  <button
                    style={btn(scheda.cliente?.email ? "#059669" : "#9ca3af")}
                    onClick={() => inviaEmail(scheda)}
                    disabled={!scheda.cliente?.email}
                    title={scheda.cliente?.email ? `Invia a ${scheda.cliente.email}` : "Nessuna email cliente"}
                  >
                    📧 Invia Email
                  </button>
                  {emailStatus[scheda.id] && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: emailStatus[scheda.id].startsWith("✅") ? "#059669" : emailStatus[scheda.id].startsWith("⏳") ? "#2563eb" : "#dc2626" }}>
                      {emailStatus[scheda.id]}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ paddingBottom: 40 }} />
      </div>
    </div>
  );
}
