"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

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


type Scheda = {
  id: number;
  cliente_id: number;
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
  const firmaRicevuta = scheda.foto.find(f => f.tipo === "firma_ricevuta");
  const firmaPrivacy = scheda.foto.find(f => f.tipo === "firma_privacy");
  const firmaPrivacy2 = scheda.foto.find(f => f.tipo === "firma_privacy2");
  const firmaPrivacy3 = scheda.foto.find(f => f.tipo === "firma_privacy3");
  const fotoOggetti = scheda.foto.filter(f => f.tipo.startsWith("oggetto_"));

  // Estrai consensi dalle note
  const noteOp = scheda.note_operazione || "";
  const matchConsenso = noteOp.match(/PRIVACY: consenso1=(SI|NO) consenso2=(SI|NO) consenso3=(SI|NO)/);
  const c1 = matchConsenso ? matchConsenso[1] : null;
  const c2 = matchConsenso ? matchConsenso[2] : null;
  const c3 = matchConsenso ? matchConsenso[3] : null;

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
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; background: #fff; padding: 28px 36px; }
  .top-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; }
  .top-bar-left { font-size: 12px; }
  .top-bar-scheda { font-size: 15px; font-weight: 800; }
  .logo-img { max-height: 55px; max-width: 150px; object-fit: contain; }
  .riga { display: flex; gap: 0; border-bottom: 1px solid #ccc; padding: 6px 0; align-items: baseline; }
  .riga label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #555; min-width: 130px; }
  .riga span { font-size: 12px; font-weight: 500; flex: 1; border-bottom: 1px dotted #aaa; min-height: 18px; padding-left: 6px; }
  .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #000; background: #f0f0f0; padding: 6px 10px; margin: 14px 0 8px; border-left: 4px solid #000; }
  .vende-a-box { border: 2px solid #000; border-radius: 6px; padding: 12px 16px; margin: 10px 0 14px; background: #fafafa; }
  .vende-a-title { font-size: 12px; font-weight: 800; text-transform: uppercase; text-align: center; margin-bottom: 8px; letter-spacing: 0.1em; }
  .vende-a-nome { font-size: 14px; font-weight: 800; text-align: center; }
  .vende-a-info { font-size: 11px; text-align: center; color: #333; margin-top: 4px; }
  .oggetti-box { border: 1px solid #ccc; border-radius: 4px; padding: 10px; min-height: 80px; margin-bottom: 10px; font-size: 12px; line-height: 1.8; }
  .riepilogo-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin: 10px 0; }
  .riepilogo-field { border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; }
  .riepilogo-field label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #555; display: block; }
  .riepilogo-field span { font-size: 13px; font-weight: 800; }
  .dichiarazione { border: 1.5px solid #000; border-radius: 6px; padding: 14px 16px; margin: 14px 0; font-size: 12px; line-height: 1.8; background: #fffef0; }
  .foto-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0; }
  .foto-doc { width: 160px; border-radius: 6px; border: 1px solid #ccc; }
  .foto-ogg { width: 90px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #ccc; }
  .firme-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 20px; }
  .firma-box { border: 1.5px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; }
  .firma-img { height: 65px; object-fit: contain; display: block; margin: 0 auto; }
  .firma-label { font-size: 9px; color: #555; margin-top: 6px; text-align: center; font-weight: 700; text-transform: uppercase; }
  .firma-linea { border-bottom: 1px solid #999; min-height: 50px; margin-bottom: 4px; }
  .privacy-badge { background: #d1fae5; border: 1px solid #059669; border-radius: 6px; padding: 6px 12px; font-size: 13px; color: #065f46; margin-bottom: 10px; }
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
    <div style="font-size:12px">${negozio?.comune || "TORINO"} &nbsp;&nbsp; <strong>${dataOra}</strong></div>
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
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Foto documento</div>
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
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#555;margin-bottom:6px">Foto oggetti</div>
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
    ${firmaRicevuta ? `<img src="data:image/png;base64,${firmaRicevuta.data_base64}" class="firma-img" alt="Firma ricevuta">` : `<div class="firma-linea"></div>`}
    <div class="firma-label">Per Consegna Ricevuta<br>Data e Firma</div>
  </div>
</div>

<div style="margin-top:16px;padding:10px 14px;border:1px solid #ccc;border-radius:4px;font-size:12px;color:#333;text-align:center">
  Tutti gli oggetti saranno ceduti per la fusione a <strong>Plus Valenza Srl</strong>, Via dell&apos;Artigianato 99 Zona D3 &nbsp; 15048 Valenza (AL) &nbsp; P.Iva: 02134200068
</div>
<div style="margin-top:10px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#888;text-align:center">
  SCHEDA PER CESSIONE DA PRIVATI DI BENI USATI — ${negozio?.nome || ""} — P.IVA ${negozio?.piva || ""} — Generata il ${new Date().toLocaleDateString("it-IT")}
</div>

<!-- SECONDA PAGINA: PRIVACY -->
<div style="page-break-before:always;padding-top:20px">

  <div style="text-align:center;margin-bottom:20px">
    <div style="font-size:22px;font-weight:800">${negozio?.nome || "GIOIE E ORO"}</div>
    ${negozio?.indirizzo ? `<div style="font-size:14px;color:#555">${negozio.indirizzo}, ${negozio.comune}</div>` : ""}
    <div style="font-size:18px;font-weight:700;margin-top:12px;text-transform:uppercase;letter-spacing:0.08em">Dichiarazione di Consenso</div>
  </div>

  <div style="font-size:15px;line-height:1.8;color:#222;border:1px solid #ccc;border-radius:8px;padding:16px;margin-bottom:20px">
    L'interessato dichiara di aver ricevuto debita informativa ai sensi dell'art. 13 del Regolamento Generale UE sulla
    protezione dei dati personali n. 679/2016, unitamente all'esposizione dei Diritti dell'Interessato ai sensi degli artt. 15, 16,
    17, 18 e 20 del Regolamento medesimo.<br><br>
    Esprime il pieno e libero consenso al trattamento dei dati personali e di categorie particolari di dati personali «dati sensibili»
    per la fornitura dei servizi richiesti ed alla comunicazione degli stessi nei limiti, per le finalità e per la durata precisati nell'informativa.<br><br>
    Le autorizzazioni potranno essere revocate in ogni momento rivolgendo richiesta al Titolare della Protezione dei Dati,
    mediante lettera raccomandata all'indirizzo della ${negozio?.nome || "società"} o inviando una e-mail alla casella di posta elettronica ${negozio?.email || ""}.
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
    <div style="border:1px solid #ccc;border-radius:6px;padding:10px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888">Data</div>
      <div style="font-size:16px;font-weight:600">${formatDate(scheda.data_operazione)}</div>
    </div>
    <div style="border:1px solid #ccc;border-radius:6px;padding:10px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888">Cognome e Nome</div>
      <div style="font-size:16px;font-weight:600">${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}</div>
    </div>
  </div>

  ${["a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario su prodotti o servizi offerti dalla società.",
     "a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario su prodotti o servizi offerti dalla " + (negozio?.nome || "società") + ".",
     "a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario di soggetti terzi (business partner)."]
    .map((testo, i) => {
      const firme = [firmaPrivacy, firmaPrivacy2, firmaPrivacy3];
      const consensi = [c1, c2, c3];
      const f = firme[i];
      const c = consensi[i];
      return `
  <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#6b7280;margin-bottom:8px">Consenso ${i+1}</div>
    <p style="font-size:15px;line-height:1.6;color:#374151;margin-bottom:12px">${testo}</p>
    <div style="display:flex;gap:24px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:${c==="SI"?"#059669":"#ccc"}">
        <div style="width:18px;height:18px;border:2px solid ${c==="SI"?"#059669":"#ccc"};border-radius:3px;background:${c==="SI"?"#059669":"#fff"};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">${c==="SI"?"✓":""}</div>
        Acconsento
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:${c==="NO"?"#dc2626":"#ccc"}">
        <div style="width:18px;height:18px;border:2px solid ${c==="NO"?"#dc2626":"#ccc"};border-radius:3px;background:${c==="NO"?"#dc2626":"#fff"};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">${c==="NO"?"✓":""}</div>
        Non Acconsento
      </div>
    </div>
    ${f ? `<img src="data:${f.mime_type};base64,${f.data_base64}" style="height:60px;object-fit:contain;border:1.5px solid #059669;border-radius:8px;background:#fafafa;display:block">` : `<div style="border-bottom:1px solid #999;height:50px"></div>`}
    <div style="font-size:11px;color:#9ca3af;margin-top:4px">Firma</div>
  </div>`; }).join("")}

</div>

</body></html>`;
}
function buildPrivacyHtml(scheda: Scheda, negozio: Negozio | null): string {
  const firmaPrivacy = scheda.foto.find(f => f.tipo === "firma_privacy");
  const firmaPrivacy2 = scheda.foto.find(f => f.tipo === "firma_privacy2");
  const firmaPrivacy3 = scheda.foto.find(f => f.tipo === "firma_privacy3");

  const noteOp = scheda.note_operazione || "";
  const matchConsenso = noteOp.match(/PRIVACY: consenso1=(SI|NO) consenso2=(SI|NO) consenso3=(SI|NO)/);
  const c1 = matchConsenso ? matchConsenso[1] : null;
  const c2 = matchConsenso ? matchConsenso[2] : null;
  const c3 = matchConsenso ? matchConsenso[3] : null;

  const sezioni = [
    { testo: "a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario su prodotti o servizi offerti dalla società.", firma: firmaPrivacy, c: c1 },
    { testo: `a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario su prodotti o servizi offerti dalla ${negozio?.nome || "società"}.`, firma: firmaPrivacy2, c: c2 },
    { testo: "a ricevere via e-mail, posta, WhatsApp, contatto telefonico, newsletter, comunicazioni commerciali e/o materiale pubblicitario di soggetti terzi (business partner).", firma: firmaPrivacy3, c: c3 },
  ];

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Privacy — Scheda N° ${scheda.numero_scheda}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 15px; color: #000; background: #fff; padding: 30px 40px; }
  .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #000; }
  .titolo { font-size: 22px; font-weight: 800; }
  .sottotitolo { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 8px; }
  .testo-principale { border: 1px solid #ccc; border-radius: 8px; padding: 16px; margin-bottom: 20px; font-size: 14px; line-height: 1.8; color: #333; }
  .dati-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .dato { border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px; }
  .dato label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #888; display: block; margin-bottom: 4px; }
  .dato span { font-size: 16px; font-weight: 600; }
  .sezione { border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .sezione-num { font-size: 12px; font-weight: 800; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
  .sezione-testo { font-size: 14px; line-height: 1.6; color: #374151; margin-bottom: 12px; }
  .checkbox-row { display: flex; gap: 24px; margin-bottom: 12px; }
  .checkbox-item { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
  .cb { width: 18px; height: 18px; border: 2px solid #ccc; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
  .cb-si { border-color: #059669; background: #059669; color: #fff; }
  .cb-no { border-color: #dc2626; background: #dc2626; color: #fff; }
  .firma-img { height: 65px; object-fit: contain; border: 1.5px solid #059669; border-radius: 8px; background: #fafafa; display: block; }
  .firma-linea { border-bottom: 1px solid #999; height: 50px; margin-bottom: 4px; }
  .firma-label { font-size: 9px; color: #9ca3af; margin-top: 4px; }
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 11px; color: #888; text-align: center; }
  @media print { body { padding: 15px 25px; } }
</style>
</head>
<body>

<div class="header">
  <div class="titolo">${negozio?.nome || "GIOIE E ORO"}</div>
  ${negozio?.indirizzo ? `<div style="font-size:11px;color:#555;margin-top:4px">${negozio.indirizzo}, ${negozio.comune}</div>` : ""}
  <div class="sottotitolo">Dichiarazione di Consenso — Privacy</div>
  <div style="font-size:11px;color:#555;margin-top:4px">Scheda N° ${scheda.numero_scheda} — ${formatDate(scheda.data_operazione)}</div>
</div>

<div class="testo-principale">
  L'interessato dichiara di aver ricevuto debita informativa ai sensi dell'art. 13 del Regolamento Generale UE sulla
  protezione dei dati personali n. 679/2016, unitamente all'esposizione dei Diritti dell'Interessato ai sensi degli artt. 15, 16,
  17, 18 e 20 del Regolamento medesimo.<br><br>
  Esprime il pieno e libero consenso al trattamento dei dati personali e di categorie particolari di dati personali «dati sensibili»
  per la fornitura dei servizi richiesti ed alla comunicazione degli stessi nei limiti, per le finalità e per la durata precisati nell'informativa.<br><br>
  Le autorizzazioni potranno essere revocate in ogni momento rivolgendo richiesta al Titolare della Protezione dei Dati,
  mediante lettera raccomandata all'indirizzo della ${negozio?.nome || "società"} o inviando una e-mail a ${negozio?.email || ""}.
  In merito sono comunque fatti salvi i trattamenti imposti in osservanza delle vigenti leggi.
</div>

<div class="dati-row">
  <div class="dato"><label>Data</label><span>${formatDate(scheda.data_operazione)}</span></div>
  <div class="dato"><label>Cognome e Nome</label><span>${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}</span></div>
</div>

${sezioni.map((s, i) => `
<div class="sezione">
  <div class="sezione-num">Consenso ${i+1}</div>
  <p class="sezione-testo">${s.testo}</p>
  <div class="checkbox-row">
    <div class="checkbox-item">
      <div class="cb ${s.c === "SI" ? "cb-si" : ""}">${s.c === "SI" ? "✓" : ""}</div>
      <span style="color:${s.c === "SI" ? "#059669" : "#ccc"}">Acconsento</span>
    </div>
    <div class="checkbox-item">
      <div class="cb ${s.c === "NO" ? "cb-no" : ""}">${s.c === "NO" ? "✓" : ""}</div>
      <span style="color:${s.c === "NO" ? "#dc2626" : "#ccc"}">Non Acconsento</span>
    </div>
  </div>
  ${s.firma ? `<img src="data:${s.firma.mime_type};base64,${s.firma.data_base64}" class="firma-img" alt="Firma">` : `<div class="firma-linea"></div>`}
  <div class="firma-label">Firma</div>
</div>`).join("")}

<div class="footer">
  Codice documento: CONSENSO — ${negozio?.nome || ""} — P.IVA ${negozio?.piva || ""} — Generato il ${new Date().toLocaleDateString("it-IT")}
</div>

</body></html>`;
}

function buildDocumentiHtml(scheda: Scheda): string {
  const fotoFronte = scheda.foto.find(f => f.tipo === "documento_fronte");
  const fotoRetro = scheda.foto.find(f => f.tipo === "documento_retro");
  return `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Documenti N° ${scheda.numero_scheda}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; }
  .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  .titolo { font-size: 14px; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; }
  .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .foto-section { margin-bottom: 20px; }
  .foto-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #374151; margin-bottom: 8px; letter-spacing: 1px; }
  .foto-grande { width: 100%; max-height: 340px; object-fit: contain; border: 1px solid #ccc; border-radius: 8px; display: block; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="hdr">
  <div style="font-size:16px;font-weight:800">Scheda N° ${scheda.numero_scheda}</div>
  <div style="text-align:right">${new Date(scheda.data_operazione).toLocaleDateString("it-IT")}</div>
</div>
<div class="titolo">Documenti di Identità</div>
<div class="info-box">
  <strong>${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}</strong> — CF: ${scheda.cliente?.codice_fiscale || "—"}<br>
  ${scheda.tipo_documento || ""} N° ${scheda.numero_documento || ""} — Scad.: ${scheda.data_scadenza ? new Date(scheda.data_scadenza).toLocaleDateString("it-IT") : "—"}
</div>
${fotoFronte ? `<div class="foto-section"><div class="foto-label">📄 Fronte documento</div><img src="data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}" class="foto-grande" alt="Fronte"></div>` : ""}
${fotoRetro ? `<div class="foto-section"><div class="foto-label">📄 Retro documento</div><img src="data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}" class="foto-grande" alt="Retro"></div>` : ""}
${!fotoFronte && !fotoRetro ? `<div style="text-align:center;padding:60px;color:#9ca3af">Nessuna foto documento allegata</div>` : ""}
</body></html>`;
}

function Lightbox({ src, tipo, onClose }: { src: string; tipo: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: "95vw", maxHeight: "95vh", textAlign: "center" }}>
        <img src={src} alt={tipo} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 10, display: "block", margin: "0 auto" }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
          <a href={src} download={tipo + ".jpg"} style={{ background: "#2563eb", color: "#fff", borderRadius: 8, padding: "9px 22px", fontSize: 14, fontWeight: 700, textDecoration: "none" }}>⬇ Scarica</a>
          <button onClick={onClose} style={{ background: "#374151", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✕ Chiudi</button>
        </div>
      </div>
    </div>
  );
}

function PopupOggetti({ scheda, onClose, onLightbox, onFotoAggiunta }: {
  scheda: Scheda; onClose: () => void;
  onLightbox: (src: string, tipo: string) => void;
  onFotoAggiunta: (operazioneId: number, nuovaFoto: { tipo: string; data_base64: string; mime_type: string }) => void;
}) {
  const [fotoLocali, setFotoLocali] = useState<{ tipo: string; data_base64: string; mime_type: string }[]>(
    scheda.foto.filter(f => f.tipo.startsWith("oggetto_"))
  );
  const [salvando, setSalvando] = useState(false);
  const [messaggioSalva, setMessaggioSalva] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function aggiungiPhoto(file: File) {
    if (!file) return;
    setSalvando(true);
    setMessaggioSalva("⏳ Salvataggio...");
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      // Prossimo numero oggetto
      const nextNum = fotoLocali.filter(f => f.tipo.startsWith("oggetto_")).length + 1;
      const tipo = `oggetto_${nextNum}`;
      const { error } = await supabase.from("foto_scheda").insert({
        operazione_id: scheda.id, tipo, nome_file: file.name,
        mime_type: file.type, data_base64: base64,
      });
      if (error) throw new Error(error.message);
      const nuova = { tipo, data_base64: base64, mime_type: file.type };
      setFotoLocali(prev => [...prev, nuova]);
      onFotoAggiunta(scheda.id, nuova);
      setMessaggioSalva("✅ Foto salvata!");
      setTimeout(() => setMessaggioSalva(""), 2500);
    } catch (e: any) {
      setMessaggioSalva("❌ Errore: " + e.message);
    } finally {
      setSalvando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function stampaFotoPDF() {
    const cliente = `${scheda.cliente?.cognome || ""} ${scheda.cliente?.nome || ""}`.trim();
    const data = new Date(scheda.data_operazione).toLocaleDateString("it-IT");
    const righe: string[] = [];
    for (let i = 0; i < fotoLocali.length; i += 3) {
      const gruppo = fotoLocali.slice(i, i + 3);
      righe.push(`<div class="riga">${gruppo.map((f, j) => `
        <div class="cella">
          <img src="data:${f.mime_type};base64,${f.data_base64}" alt="Oggetto ${i+j+1}">
          <div class="label">Oggetto ${i+j+1}</div>
        </div>`).join("")}</div>`);
    }
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
<title>Foto Oggetti — Scheda N° ${scheda.numero_scheda}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
  .header { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .header h1 { font-size: 18px; margin: 0 0 4px; }
  .header p { font-size: 13px; color: #555; margin: 0; }
  .riga { display: flex; gap: 10px; margin-bottom: 10px; }
  .cella { flex: 1; text-align: center; }
  .cella img { width: 100%; max-height: 230px; object-fit: contain; border: 1px solid #ccc; border-radius: 6px; display: block; }
  .label { font-size: 11px; font-weight: 700; color: #374151; margin-top: 4px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <h1>📦 Foto Oggetti — Scheda N° ${scheda.numero_scheda}</h1>
  <p>${cliente} — ${data} — ${fotoLocali.length} foto</p>
</div>
${righe.join("")}
</body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => { win.focus(); win.print(); }, 600); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 760, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>📦 Oggetti — Scheda N° {scheda.numero_scheda}</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>{scheda.cliente?.cognome} {scheda.cliente?.nome} — {new Date(scheda.data_operazione).toLocaleDateString("it-IT")}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {fotoLocali.length > 0 && (
              <button onClick={stampaFotoPDF} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>🖨️ Stampa Foto PDF</button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={salvando}
              style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              📷 Aggiungi Foto
            </button>
            <button onClick={onClose} style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>✕ Chiudi</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) aggiungiPhoto(f); }} />
        {messaggioSalva && (
          <div style={{ background: messaggioSalva.startsWith("✅") ? "#d1fae5" : messaggioSalva.startsWith("⏳") ? "#eff6ff" : "#fee2e2",
            color: messaggioSalva.startsWith("✅") ? "#065f46" : messaggioSalva.startsWith("⏳") ? "#1d4ed8" : "#dc2626",
            border: "1px solid", borderColor: messaggioSalva.startsWith("✅") ? "#059669" : messaggioSalva.startsWith("⏳") ? "#2563eb" : "#dc2626",
            borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontWeight: 600, fontSize: 14 }}>
            {messaggioSalva}
          </div>
        )}

        {/* Lista oggetti */}
        <div style={{ marginBottom: 20 }}>
          {scheda.oggetti.map((o, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f9fafb", borderRadius: 8, marginBottom: 8, border: "1px solid #e5e7eb" }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{i+1}. {o.descrizione || "Oggetto"}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: "#6b7280", textTransform: "uppercase" }}>{o.materiale}</span>
                {o.peso_au > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: "#9ca3af" }}>AU: {o.peso_au}g</span>}
                {o.peso_ag > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: "#9ca3af" }}>AG: {o.peso_ag}g</span>}
              </div>
              <span style={{ fontWeight: 700, color: "#059669", fontSize: 14 }}>{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(o.valore || 0)}</span>
            </div>
          ))}
        </div>

        {/* Foto oggetti */}
        <div style={{ borderTop: "1.5px solid #e5e7eb", paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 12, letterSpacing: "0.08em" }}>
            Foto ({fotoLocali.length})
          </div>
          {fotoLocali.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {fotoLocali.map((f, i) => (
                <div key={i} style={{ position: "relative", cursor: "zoom-in" }}
                  onClick={() => onLightbox(`data:${f.mime_type};base64,${f.data_base64}`, f.tipo)}>
                  <img src={`data:${f.mime_type};base64,${f.data_base64}`} alt={f.tipo}
                    style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, border: "2px solid #e5e7eb", display: "block" }} />
                  <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>
                    Oggetto {i+1}
                  </div>
                  <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 11, borderRadius: 4, padding: "2px 6px" }}>🔍</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", fontSize: 14, background: "#f9fafb", borderRadius: 10, border: "1.5px dashed #e5e7eb" }}>
              Nessuna foto. Premi 📷 Aggiungi Foto per iniziare.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PopupModifica({ scheda, onClose, onSalvato }: { scheda: Scheda; onClose: () => void; onSalvato: (s: Scheda) => void }) {
  const inp: React.CSSProperties = { height: 40, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, width: "100%", boxSizing: "border-box" as const, background: "#fff" };
  const DESCRIZIONI = ["Anello","Anello con pietre","Fede","Braccialetto","Braccialetto con pietre","Bracciale","Bracciale rigido","Bracciale multiplo","Bracciale con pietre","Bracciale con ciondoli","Collanina","Collanina con ciondoli","Collanina con pietre","Girocollo","Girocollo con pietre","Paia orecchini","Paia orecchini con pietre","Orecchino spaiato","Orecchino spaiato con pietre","Portachiavi","Fermacravatta","Spilla","Spilla con pietre","Spilla con ciondoli","Cassa fondello orologio","Cassa-fondello cinghietto orologio","Medaglia"];

  const [op, setOp] = useState({
    data_operazione: scheda.data_operazione || "",
    mezzo_pagamento: scheda.mezzo_pagamento || "contanti",
    cro_trn: scheda.cro_trn || "",
    totale_valore: String(scheda.totale_valore || ""),
    note_operazione: (scheda.note_operazione || "").replace(/\|?\s*PRIVACY:.*/, "").trim(),
    tipo_documento: scheda.tipo_documento || "",
    numero_documento: scheda.numero_documento || "",
    data_rilascio: scheda.data_rilascio || "",
    data_scadenza: scheda.data_scadenza || "",
    ente_rilascio: scheda.ente_rilascio || "",
  });
  const [cliente, setCliente] = useState({
    nome: scheda.cliente?.nome || "",
    cognome: scheda.cliente?.cognome || "",
    codice_fiscale: scheda.cliente?.codice_fiscale || "",
    luogo_nascita: scheda.cliente?.luogo_nascita || "",
    data_nascita: scheda.cliente?.data_nascita || "",
    indirizzo: scheda.cliente?.indirizzo || "",
    comune: scheda.cliente?.comune || "",
    provincia: scheda.cliente?.provincia || "",
    cap: scheda.cliente?.cap || "",
    email: scheda.cliente?.email || "",
  });
  const [oggetti, setOggetti] = useState(scheda.oggetti.map(o => ({ ...o, peso: String(o.peso_au || o.peso_ag || ""), valore: String(o.valore || "") })));
  const [fotoDoc, setFotoDoc] = useState(scheda.foto.filter(f => f.tipo === "documento_fronte" || f.tipo === "documento_retro" || f.tipo === "documento"));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"operazione"|"cliente"|"oggetti"|"foto">("operazione");
  const fileRef = useRef<HTMLInputElement>(null);
  const [tipoFotoNuova, setTipoFotoNuova] = useState("documento_fronte");

  async function aggiungiPhoto(file: File) {
    const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res((r.result as string).split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
    const { error } = await supabase.from("foto_scheda").insert({ operazione_id: scheda.id, tipo: tipoFotoNuova, nome_file: file.name, mime_type: file.type, data_base64: base64 });
    if (!error) setFotoDoc(prev => [...prev, { tipo: tipoFotoNuova, data_base64: base64, mime_type: file.type }]);
  }

  async function salva() {
    setSaving(true); setMsg("");
    try {
      const privacyNote = scheda.note_operazione?.match(/PRIVACY:.*/) ? " | " + scheda.note_operazione.match(/PRIVACY:.*/)?.[0] : "";
      await supabase.from("operazioni").update({
        data_operazione: op.data_operazione,
        mezzo_pagamento: op.mezzo_pagamento,
        cro_trn: op.cro_trn,
        totale_valore: Number(op.totale_valore) || null,
        note_operazione: op.note_operazione + privacyNote,
        tipo_documento: op.tipo_documento,
        numero_documento: op.numero_documento,
        data_rilascio: op.data_rilascio || null,
        data_scadenza: op.data_scadenza || null,
        ente_rilascio: op.ente_rilascio,
      }).eq("id", scheda.id);

      if (scheda.cliente_id) {
        await supabase.from("clienti").update({
          nome: cliente.nome, cognome: cliente.cognome,
          codice_fiscale: cliente.codice_fiscale || null,
          luogo_nascita: cliente.luogo_nascita,
          data_nascita: cliente.data_nascita || null,
          indirizzo: cliente.indirizzo, comune: cliente.comune,
          provincia: cliente.provincia, cap: cliente.cap, email: cliente.email,
        }).eq("id", scheda.cliente_id);
      }

      setMsg("✅ Salvato!");
      onSalvato({ ...scheda,
        data_operazione: op.data_operazione, mezzo_pagamento: op.mezzo_pagamento,
        cro_trn: op.cro_trn, totale_valore: Number(op.totale_valore),
        note_operazione: op.note_operazione + privacyNote,
        tipo_documento: op.tipo_documento, numero_documento: op.numero_documento,
        data_rilascio: op.data_rilascio, data_scadenza: op.data_scadenza, ente_rilascio: op.ente_rilascio,
        cliente: { ...scheda.cliente!, ...cliente },
        foto: [...scheda.foto.filter(f => !["documento_fronte","documento_retro","documento"].includes(f.tipo)), ...fotoDoc],
      });
      setTimeout(() => onClose(), 1000);
    } catch(e: any) { setMsg("❌ " + e.message); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, border: "none",
    background: tab === t ? "#111827" : "#f3f4f6", color: tab === t ? "#fff" : "#374151",
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 800, width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>✏️ Modifica Scheda N° {scheda.numero_scheda}</h2>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>{scheda.cliente?.cognome} {scheda.cliente?.nome}</p>
          </div>
          <button onClick={onClose} style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 700 }}>✕ Chiudi</button>
        </div>

        {/* Tab */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <button style={tabStyle("operazione")} onClick={() => setTab("operazione")}>📋 Operazione</button>
          <button style={tabStyle("cliente")} onClick={() => setTab("cliente")}>👤 Cliente</button>
          <button style={tabStyle("oggetti")} onClick={() => setTab("oggetti")}>📦 Oggetti</button>
          <button style={tabStyle("foto")} onClick={() => setTab("foto")}>📷 Foto Documento</button>
        </div>

        {/* TAB OPERAZIONE */}
        {tab === "operazione" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {([["Data operazione","data_operazione","date"],["Mezzo pagamento","mezzo_pagamento"],["CRO / TRN","cro_trn"],["Totale valore €","totale_valore"],["Tipo documento","tipo_documento"],["N° documento","numero_documento"],["Rilasciato da","ente_rilascio"],["Data rilascio","data_rilascio","date"],["Data scadenza","data_scadenza","date"]] as [string,string,string?][]).map(([label, field, type]) => (
              <div key={field}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#6b7280", marginBottom: 5 }}>{label}</div>
                {field === "mezzo_pagamento" ? (
                  <select style={inp} value={(op as any)[field]} onChange={e => setOp(p => ({ ...p, [field]: e.target.value }))}>
                    <option value="contanti">Contanti</option>
                    <option value="bonifico">Bonifico</option>
                    <option value="assegno">Assegno</option>
                  </select>
                ) : (
                  <input type={type || "text"} style={inp} value={(op as any)[field]} onChange={e => setOp(p => ({ ...p, [field]: e.target.value }))} />
                )}
              </div>
            ))}
            <div style={{ gridColumn: "1/-1" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#6b7280", marginBottom: 5 }}>Note operazione</div>
              <textarea style={{ ...inp, height: 80, paddingTop: 10 }} value={op.note_operazione} onChange={e => setOp(p => ({ ...p, note_operazione: e.target.value }))} />
            </div>
          </div>
        )}

        {/* TAB CLIENTE */}
        {tab === "cliente" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {([["Cognome","cognome"],["Nome","nome"],["Codice Fiscale","codice_fiscale"],["Nato a","luogo_nascita"],["Data nascita","data_nascita","date"],["Indirizzo","indirizzo"],["Comune","comune"],["Provincia","provincia"],["CAP","cap"],["Email","email"]] as [string,string,string?][]).map(([label, field, type]) => (
              <div key={field}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, color: "#6b7280", marginBottom: 5 }}>{label}</div>
                <input type={type || "text"} style={inp} value={(cliente as any)[field]} onChange={e => setCliente(p => ({ ...p, [field]: e.target.value }))} />
              </div>
            ))}
          </div>
        )}

        {/* TAB OGGETTI */}
        {tab === "oggetti" && (
          <div>
            {oggetti.map((o, i) => (
              <div key={i} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 14, marginBottom: 12, background: "#fafafa" }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#374151" }}>Oggetto {i+1}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 120px", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Descrizione</div>
                    <select style={{ ...inp, marginBottom: 6 }}
                      value={DESCRIZIONI.includes(o.descrizione) ? o.descrizione : ""}
                      onChange={e => { if (e.target.value) setOggetti(prev => prev.map((x,j) => j===i ? {...x, descrizione: e.target.value} : x)); }}>
                      <option value="">— Seleziona —</option>
                      {DESCRIZIONI.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input style={inp} value={o.descrizione} onChange={e => setOggetti(prev => prev.map((x,j) => j===i ? {...x, descrizione: e.target.value} : x))} placeholder="Testo libero..." />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Materiale</div>
                    <select style={inp} value={o.materiale} onChange={e => setOggetti(prev => prev.map((x,j) => j===i ? {...x, materiale: e.target.value} : x))}>
                      <option value="oro">AU – Oro</option>
                      <option value="argento">AG – Argento</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Peso (g)</div>
                    <input type="number" style={inp} value={o.peso}
                      onChange={e => setOggetti(prev => prev.map((x,j) => j===i ? {...x, peso: e.target.value, peso_au: o.materiale==="oro" ? Number(e.target.value) : 0, peso_ag: o.materiale==="argento" ? Number(e.target.value) : 0} : x))} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Valore €</div>
                    <input type="number" style={inp} value={o.valore} onChange={e => setOggetti(prev => prev.map((x,j) => j===i ? {...x, valore: e.target.value} : x))} />
                  </div>
                </div>
              </div>
            ))}
            <div style={{ textAlign: "right", fontSize: 16, fontWeight: 800, color: "#059669", marginTop: 8 }}>
              Totale: € {oggetti.reduce((a, o) => a + Number(o.valore||0), 0).toFixed(2)}
            </div>
          </div>
        )}

        {/* TAB FOTO DOCUMENTO */}
        {tab === "foto" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ ...inp, width: 220 }} value={tipoFotoNuova} onChange={e => setTipoFotoNuova(e.target.value)}>
                <option value="documento_fronte">Fronte documento</option>
                <option value="documento_retro">Retro documento</option>
                <option value="documento">Altro documento</option>
              </select>
              <button onClick={() => fileRef.current?.click()} style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                📷 Aggiungi foto
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) aggiungiPhoto(f); if (fileRef.current) fileRef.current.value = ""; }} />
            </div>
            {fotoDoc.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                {fotoDoc.map((f, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <img src={`data:${f.mime_type};base64,${f.data_base64}`} alt={f.tipo}
                      style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e5e7eb", display: "block" }} />
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, fontWeight: 600 }}>{f.tipo.replace("_", " ")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 30, color: "#9ca3af", background: "#f9fafb", borderRadius: 10 }}>
                Nessuna foto documento.
              </div>
            )}
          </div>
        )}

        {/* Footer salva */}
        {msg && (
          <div style={{ marginTop: 16, padding: "10px 16px", background: msg.startsWith("✅") ? "#d1fae5" : "#fee2e2", borderRadius: 8, fontSize: 14, fontWeight: 700, color: msg.startsWith("✅") ? "#065f46" : "#dc2626" }}>
            {msg}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
          <button onClick={onClose} style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, padding: "10px 22px", cursor: "pointer", fontWeight: 700 }}>Annulla</button>
          <button onClick={salva} disabled={saving} style={{ background: saving ? "#9ca3af" : "#111827", color: "#fff", border: "none", borderRadius: 8, padding: "10px 28px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15 }}>
            {saving ? "⏳ Salvataggio..." : "💾 Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

function scaricaExcel(schede: Scheda[]) {
  const rows = [
    ["N° Scheda","Data","Cognome","Nome","Codice Fiscale","Nato a","Data Nascita","Indirizzo","Comune","Provincia","CAP","Telefono","Email","Tipo Documento","N° Documento","Rilasciato da","Data Rilascio","Scadenza","Mezzo Pagamento","CRO/TRN","Totale €","Oggetti","Note"],
  ];
  schede.forEach(s => {
    const oggettiStr = s.oggetti.map(o => `${o.descrizione} (${o.materiale}) ${o.peso_au ? o.peso_au+"g AU" : ""} ${o.peso_ag ? o.peso_ag+"g AG" : ""} = €${o.valore}`).join(" | ");
    rows.push([
      String(s.numero_scheda),
      s.data_operazione ? new Date(s.data_operazione).toLocaleDateString("it-IT") : "",
      s.cliente?.cognome || "", s.cliente?.nome || "",
      s.cliente?.codice_fiscale || "",
      s.cliente?.luogo_nascita || "",
      s.cliente?.data_nascita ? new Date(s.cliente.data_nascita).toLocaleDateString("it-IT") : "",
      s.cliente?.indirizzo || "", s.cliente?.comune || "", s.cliente?.provincia || "", s.cliente?.cap || "",
      s.cliente?.email || "",
      s.tipo_documento || "", s.numero_documento || "", s.ente_rilascio || "",
      s.data_rilascio ? new Date(s.data_rilascio).toLocaleDateString("it-IT") : "",
      s.data_scadenza ? new Date(s.data_scadenza).toLocaleDateString("it-IT") : "",
      s.mezzo_pagamento || "", s.cro_trn || "",
      String(s.totale_valore || 0),
      oggettiStr,
      (s.note_operazione || "").replace(/PRIVACY:.*/, "").trim(),
    ]);
  });

  // Genera CSV con separatore ; (compatibile Excel italiano)
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  const bom = "\uFEFF"; // BOM per Excel italiano
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_schede_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [schede, setSchede] = useState<Scheda[]>([]);
  const [negozio, setNegozio] = useState<Negozio | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterData, setFilterData] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ [id: number]: string }>({});
  const [pdfStatus, setPdfStatus] = useState<{ [id: number]: string }>({});
  const [popupOggetti, setPopupOggetti] = useState<Scheda | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; tipo: string } | null>(null);
  const [popupModifica, setPopupModifica] = useState<Scheda | null>(null);

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
          id, cliente_id, numero_scheda, data_operazione, mezzo_pagamento, cro_trn, note_operazione, totale_valore,
          tipo_documento, numero_documento, data_rilascio, data_scadenza, ente_rilascio,
          clienti (nome, cognome, email, codice_fiscale, luogo_nascita, data_nascita, indirizzo, comune, provincia, cap),
          oggetti (descrizione, materiale, peso_au, peso_ag, valore)
        `)
        .order("numero_scheda", { ascending: false });

      if (error) console.error("Errore query schede:", JSON.stringify(error));
      if (ops && ops.length >= 0) {
        setSchede(ops.map((op: any) => ({
          id: op.id,
          cliente_id: op.cliente_id,
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
          foto: [],
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

  async function apriPDF(scheda: Scheda) {
    const s = await caricaFotoScheda(scheda);
    const html = buildPDFHtml(s, negozio);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  async function caricaFotoScheda(scheda: Scheda): Promise<Scheda> {
    if (scheda.foto.length > 0) return scheda; // già caricate
    const { data } = await supabase.from("foto_scheda")
      .select("tipo, data_base64, mime_type")
      .eq("operazione_id", scheda.id);
    return { ...scheda, foto: data || [] };
  }

  async function stampaPDF(scheda: Scheda) {
    const s = await caricaFotoScheda(scheda);
    const html = buildPDFHtml(s, negozio);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  function apriPrivacy(scheda: Scheda) {
    const html = buildPrivacyHtml(scheda, negozio);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  function stampaPrivacy(scheda: Scheda) {
    const html = buildPrivacyHtml(scheda, negozio);
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
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "76px 16px 24px" }}>
      <NavBar />
      {popupModifica && <PopupModifica
        scheda={popupModifica}
        onClose={() => setPopupModifica(null)}
        onSalvato={s => setSchede(prev => prev.map(x => x.id === s.id ? s : x))}
      />}
      {popupOggetti && <PopupOggetti
        scheda={popupOggetti}
        onClose={() => setPopupOggetti(null)}
        onLightbox={(src, tipo) => setLightbox({ src, tipo })}
        onFotoAggiunta={(opId, foto) => {
          setSchede(prev => prev.map(s => s.id === opId ? { ...s, foto: [...s.foto, foto] } : s));
          setPopupOggetti(prev => prev ? { ...prev, foto: [...prev.foto, foto] } : prev);
        }}
      />}
      {lightbox && <Lightbox src={lightbox.src} tipo={lightbox.tipo} onClose={() => setLightbox(null)} />}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "2px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>📊 Dashboard Schede</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>{schede.length} schede totali</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btn("#059669")} onClick={() => scaricaExcel(schede)}>⬇ Backup Excel</button>
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
                  <button style={btn("#f59e0b", "#fff")} onClick={async () => { const s = await caricaFotoScheda(scheda); setPopupModifica(s); }}>✏️ Modifica</button>
                  <button style={btn("#111827")} onClick={() => apriPDF(scheda)}>👁 Visualizza PDF</button>
                  <button style={btn("#2563eb")} onClick={() => stampaPDF(scheda)}>🖨️ Stampa</button>
                  <button style={btn("#0891b2")} onClick={async () => { const s = await caricaFotoScheda(scheda); const win = window.open("","_blank"); if(win){win.document.write(buildDocumentiHtml(s));win.document.close();setTimeout(()=>{win.focus();win.print();},600);} }}>🪪 Stampa Doc.</button>
                  <button style={btn("#059669")} onClick={async () => { const s = await caricaFotoScheda(scheda); setPopupOggetti(s); }}>📦 Oggetti</button>
                  <button style={btn("#7c3aed")} onClick={() => apriPrivacy(scheda)}>🔒 Privacy PDF</button>
                  <button style={btn("#6d28d9")} onClick={() => stampaPrivacy(scheda)}>🖨️ Stampa Privacy</button>
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
