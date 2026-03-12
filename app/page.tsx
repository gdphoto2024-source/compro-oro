"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Scheda = {
  id: number;
  numero_scheda: number;
  data_operazione: string;
  mezzo_pagamento: string;
  totale_valore: number;
  cliente: { nome: string; cognome: string; email: string; codice_fiscale: string; } | null;
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

  const oggettiRows = scheda.oggetti.map((o, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${o.descrizione || ""}</td>
      <td>${o.materiale === "oro" ? "AU – Oro" : "AG – Argento"}</td>
      <td>${o.peso_au ? o.peso_au + " g" : "-"}</td>
      <td>${o.peso_ag ? o.peso_ag + " g" : "-"}</td>
      <td style="text-align:right;font-weight:bold">${currency(o.valore)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Scheda N° ${scheda.numero_scheda}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 30px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111827; padding-bottom: 16px; margin-bottom: 20px; }
  .header-left { flex: 1; }
  .header-logo { max-height: 60px; max-width: 160px; object-fit: contain; }
  .negozio-nome { font-size: 20px; font-weight: 800; color: #111827; }
  .negozio-info { font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.5; }
  .scheda-num { background: #111827; color: #fff; border-radius: 10px; padding: 10px 20px; text-align: center; }
  .scheda-num-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .scheda-num-val { font-size: 28px; font-weight: 800; }
  .scheda-data { font-size: 12px; margin-top: 4px; }
  section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 16px; }
  .field label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #9ca3af; display: block; margin-bottom: 2px; }
  .field span { font-size: 13px; color: #111827; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f9fafb; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
  .totale-row { background: #111827; color: #fff; font-weight: 800; font-size: 15px; }
  .totale-row td { padding: 12px 10px; }
  .foto-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .foto-doc { width: 180px; border-radius: 8px; border: 1px solid #e5e7eb; }
  .foto-ogg { width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb; }
  .firma-box { border: 1.5px solid #e5e7eb; border-radius: 8px; padding: 12px; display: inline-block; min-width: 200px; }
  .firma-img { height: 70px; object-fit: contain; display: block; }
  .firma-label { font-size: 10px; color: #9ca3af; margin-top: 6px; text-align: center; }
  .firme-row { display: flex; gap: 30px; flex-wrap: wrap; margin-top: 16px; }
  .privacy-badge { background: #d1fae5; border: 1px solid #059669; border-radius: 8px; padding: 8px 14px; font-size: 12px; color: #065f46; margin-bottom: 12px; }
  .mezzo-badge { display: inline-block; background: #dbeafe; color: #1e40af; border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  @media print {
    body { padding: 10px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    ${negozio?.logo_base64 ? `<img src="data:image/png;base64,${negozio.logo_base64}" class="header-logo" alt="Logo" style="margin-bottom:8px;display:block">` : ""}
    <div class="negozio-nome">${negozio?.nome || "Compro Oro"}</div>
    <div class="negozio-info">
      ${negozio?.indirizzo ? negozio.indirizzo + ", " : ""}${negozio?.comune || ""}${negozio?.provincia ? " (" + negozio.provincia + ")" : ""} ${negozio?.cap || ""}<br>
      ${negozio?.piva ? "P.IVA: " + negozio.piva : ""}${negozio?.telefono ? " · Tel: " + negozio.telefono : ""}${negozio?.email ? " · " + negozio.email : ""}
    </div>
  </div>
  <div class="scheda-num">
    <div class="scheda-num-label">Scheda Acquisto</div>
    <div class="scheda-num-val">N° ${scheda.numero_scheda}</div>
    <div class="scheda-data">${formatDate(scheda.data_operazione)}</div>
  </div>
</div>

<section>
  <div class="section-title">Dati Cliente</div>
  <div class="grid3">
    <div class="field"><label>Cognome e Nome</label><span>${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}</span></div>
    <div class="field"><label>Codice Fiscale</label><span>${scheda.cliente?.codice_fiscale || "—"}</span></div>
    <div class="field"><label>Email</label><span>${scheda.cliente?.email || "—"}</span></div>
  </div>
</section>

${fotoFronte || fotoRetro ? `
<section>
  <div class="section-title">Documento d'Identità</div>
  <div class="foto-row">
    ${fotoFronte ? `<img src="data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}" class="foto-doc" alt="Fronte">` : ""}
    ${fotoRetro ? `<img src="data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}" class="foto-doc" alt="Retro">` : ""}
  </div>
</section>` : ""}

<section>
  <div class="section-title">Oggetti Acquistati</div>
  <table>
    <thead><tr><th>#</th><th>Descrizione</th><th>Materiale</th><th>Peso AU</th><th>Peso AG</th><th style="text-align:right">Valore</th></tr></thead>
    <tbody>${oggettiRows}</tbody>
    <tfoot><tr class="totale-row"><td colspan="5">TOTALE</td><td style="text-align:right">${currency(scheda.totale_valore)}</td></tr></tfoot>
  </table>
  ${fotoOggetti.length > 0 ? `
  <div style="margin-top:12px;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;margin-bottom:6px">Foto oggetti</div>
  <div class="foto-row">${fotoOggetti.map(f => `<img src="data:${f.mime_type};base64,${f.data_base64}" class="foto-ogg" alt="Oggetto">`).join("")}</div>
  ` : ""}
</section>

<section>
  <div class="section-title">Pagamento</div>
  <span class="mezzo-badge">${scheda.mezzo_pagamento || "contanti"}</span>
</section>

<section>
  <div class="section-title">Firme</div>
  ${firmaPrivacy ? `<div class="privacy-badge">✅ Informativa privacy accettata dal cliente in data ${formatDate(scheda.data_operazione)}</div>` : ""}
  <div class="firme-row">
    ${firmaCliente ? `
    <div class="firma-box">
      <img src="data:image/png;base64,${firmaCliente.data_base64}" class="firma-img" alt="Firma cliente">
      <div class="firma-label">Firma del Cliente</div>
    </div>` : ""}
    ${negozio?.firma_base64 ? `
    <div class="firma-box">
      <img src="data:image/png;base64,${negozio.firma_base64}" class="firma-img" alt="Firma titolare">
      <div class="firma-label">Firma del Titolare</div>
    </div>` : ""}
    ${firmaPrivacy ? `
    <div class="firma-box">
      <img src="data:image/png;base64,${firmaPrivacy.data_base64}" class="firma-img" alt="Firma privacy">
      <div class="firma-label">Firma Privacy</div>
    </div>` : ""}
  </div>
</section>

<div style="margin-top:30px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
  Documento generato il ${new Date().toLocaleDateString("it-IT")} — ${negozio?.nome || ""} — P.IVA ${negozio?.piva || ""}
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
          id, numero_scheda, data_operazione, mezzo_pagamento, totale_valore,
          clienti (nome, cognome, email, codice_fiscale),
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
          totale_valore: op.totale_valore,
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
