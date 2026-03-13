"use client";
import { useEffect, useState } from "react";
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
    </nav>
  );
}


type Foto = { tipo: string; data_base64: string; mime_type: string; nome_file?: string };
type Scheda = { numero_scheda: number; data_operazione: string; totale_valore: number; mezzo_pagamento: string };
type Cliente = {
  id: number; nome: string; cognome: string; codice_fiscale: string;
  luogo_nascita: string; data_nascita: string; indirizzo: string;
  comune: string; provincia: string; cap: string;
  telefono: string; email: string; note: string;
  privacy_accettata: boolean; privacy_data: string;
  schede: Scheda[];
  foto: Foto[];
};

function formatDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT");
}
function currency(v: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
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

function buildPrivacyHtml(cliente: Cliente, negozioNome: string, firmaPrivacyB64?: string) {
  const data = cliente.privacy_data ? new Date(cliente.privacy_data).toLocaleDateString("it-IT") : new Date().toLocaleDateString("it-IT");
  const nomeCompleto = `${cliente.cognome} ${cliente.nome}`;
  const checkSI = (v: boolean) => v ? "☑ SI" : "☐ SI";
  const checkNO = (v: boolean) => !v ? "☑ NO" : "☐ NO";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 30px 40px; }
    h1 { font-size: 16px; text-align: center; text-transform: uppercase; margin-bottom: 4px; }
    h2 { font-size: 13px; text-align: center; color: #555; margin-bottom: 20px; }
    .section { border: 1px solid #ccc; border-radius: 6px; padding: 14px; margin-bottom: 14px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    .consenso { display: flex; justify-content: space-between; align-items: center; margin-top: 10px; }
    .check { font-size: 14px; font-weight: 700; }
    .firma-box { border: 1px solid #ccc; border-radius: 6px; padding: 10px; margin-top: 8px; min-height: 60px; display: flex; align-items: center; justify-content: center; }
    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #9ca3af; }
  </style></head><body>
  <h1>${negozioNome || "Compro Oro"}</h1>
  <h2>Informativa Privacy — GDPR Reg. UE 2016/679</h2>
  <p style="margin-bottom:16px">Il/La sottoscritto/a <strong>${nomeCompleto}</strong>
  ${cliente.codice_fiscale ? `(CF: ${cliente.codice_fiscale})` : ""}
  dichiara di aver ricevuto l'informativa sul trattamento dei dati personali ai sensi dell'art. 13 del GDPR.</p>

  <div class="section">
    <div class="section-title">1 — Trattamento dati per finalità contrattuali</div>
    <p>Il trattamento dei dati personali è necessario per l'esecuzione del contratto di compravendita e per adempiere agli obblighi di legge (D.Lgs. 231/2007 antiriciclaggio, normativa antiusura).</p>
    <p style="font-size:11px;color:#555">Base giuridica: art. 6 c.1 lett. b) e c) GDPR — il consenso non è richiesto.</p>
    <div class="consenso">
      <span>Presa visione:</span>
      <span class="check" style="color:#059669">☑ CONFERMO</span>
    </div>
    ${firmaPrivacyB64 ? `<div class="firma-box"><img src="data:image/png;base64,${firmaPrivacyB64}" style="height:50px;object-fit:contain"></div>` : `<div class="firma-box" style="color:#9ca3af;font-size:11px">Firma</div>`}
  </div>

  <div class="section">
    <div class="section-title">2 — Trattamento dati per finalità di marketing (facoltativo)</div>
    <p>Invio di comunicazioni commerciali, promozioni e offerte tramite email, SMS o altri canali digitali.</p>
    <div class="consenso">
      <span>Consenso marketing:</span>
      <span class="check">${checkSI(cliente.privacy_accettata)} &nbsp;&nbsp; ${checkNO(cliente.privacy_accettata)}</span>
    </div>
    <div class="firma-box" style="color:#9ca3af;font-size:11px">Firma</div>
  </div>

  <div class="section">
    <div class="section-title">3 — Cessione dati a terzi (facoltativo)</div>
    <p>Comunicazione dei dati personali a società partner per finalità di marketing o ricerche di mercato.</p>
    <div class="consenso">
      <span>Consenso cessione:</span>
      <span class="check">${checkSI(false)} &nbsp;&nbsp; ${checkNO(false)}</span>
    </div>
    <div class="firma-box" style="color:#9ca3af;font-size:11px">Firma</div>
  </div>

  <div style="margin-top:20px;display:flex;justify-content:space-between">
    <div>Data: <strong>${data}</strong></div>
    <div>Luogo: <strong>${cliente.comune || "_______________"}</strong></div>
  </div>
  <div class="footer">Documento generato automaticamente — ${negozioNome}</div>
  </body></html>`;
}

export default function Clienti() {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [loadingDettagli, setLoadingDettagli] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; nome: string } | null>(null);
  const [negozioNome, setNegozioNome] = useState("");

  useEffect(() => {
    supabase.from("negozio").select("nome").limit(1).single().then(({ data }) => {
      if (data) setNegozioNome(data.nome || "");
    });
  }, []);

  function scaricaPrivacyPdf(cliente: Cliente) {
    const firmaPrivacy = cliente.foto?.find(f => f.tipo === "firma_privacy");
    const html = buildPrivacyHtml(cliente, negozioNome, firmaPrivacy?.data_base64);
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600); }
  }

  const inp: React.CSSProperties = { height: 40, padding: "0 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, width: "100%", boxSizing: "border-box", background: "#fff" };
  const btn = (bg: string, color = "#fff"): React.CSSProperties => ({ background: bg, color, border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 });

  useEffect(() => { caricaClienti(); }, []);

  async function caricaClienti() {
    setLoading(true);
    const { data } = await supabase
      .from("clienti")
      .select("id,nome,cognome,codice_fiscale,luogo_nascita,data_nascita,indirizzo,comune,provincia,cap,telefono,email,note,privacy_accettata,privacy_data")
      .order("cognome", { ascending: true });
    setClienti((data || []).map(c => ({ ...c, schede: [], foto: [] })));
    setLoading(false);
  }

  async function apriDettagli(cliente: Cliente) {
    setLoadingDettagli(true);
    setSelectedCliente({ ...cliente, schede: [], foto: [] });

    // Carica schede del cliente
    const { data: ops } = await supabase
      .from("operazioni")
      .select("id,numero_scheda,data_operazione,totale_valore,mezzo_pagamento")
      .eq("cliente_id", cliente.id)
      .order("numero_scheda", { ascending: false });

    // Cerca foto documento (fronte/retro) in tutte le operazioni, dalla più recente
    let foto: Foto[] = [];
    if (ops && ops.length > 0) {
      for (const op of ops) {
        const { data: fotoDB } = await supabase
          .from("foto_scheda")
          .select("tipo,data_base64,mime_type,nome_file")
          .eq("operazione_id", op.id);
        if (fotoDB && fotoDB.length > 0) {
          // Prendi tutte le foto trovate, merge senza duplicare tipo
          for (const f of fotoDB) {
            if (!foto.find(x => x.tipo === f.tipo)) foto.push(f);
          }
        }
        // Se abbiamo già fronte e retro, non serve continuare
        if (foto.find(f => f.tipo === "documento_fronte") && foto.find(f => f.tipo === "documento_retro")) break;
      }
    }

    setSelectedCliente({
      ...cliente,
      schede: ops || [],
      foto,
    });
    setLoadingDettagli(false);
  }

  const clientiFiltrati = clienti.filter(c =>
    `${c.cognome} ${c.nome} ${c.codice_fiscale} ${c.comune} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const fotoFronte = selectedCliente?.foto.find(f => f.tipo === "documento_fronte");
  const fotoRetro = selectedCliente?.foto.find(f => f.tipo === "documento_retro");
  const firmaCliente = selectedCliente?.foto.find(f => f.tipo === "firma_cliente");
  const firmaPrivacy = selectedCliente?.foto.find(f => f.tipo === "firma_privacy");

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "76px 16px 24px" }}>
      <NavBar />
      {lightbox && <Lightbox src={lightbox.src} nome={lightbox.nome} onClose={() => setLightbox(null)} />}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111827" }}>👥 Anagrafica Clienti</h1>
            <p style={{ color: "#6b7280", fontSize: 13, margin: "4px 0 0" }}>{clienti.length} clienti registrati</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href="/" style={{ ...btn("#111827"), textDecoration: "none" }}>📋 Nuova Scheda</a>
            <a href="/dashboard" style={{ ...btn("#6b7280"), textDecoration: "none" }}>📊 Dashboard</a>
          </div>
        </div>

        {/* Ricerca */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <input style={{ ...inp, maxWidth: 400 }} placeholder="🔍 Cerca per nome, CF, comune, email..." value={search} onChange={e => setSearch(e.target.value)} />
          <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 12 }}>{clientiFiltrati.length} risultati</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: selectedCliente ? "1fr 1.4fr" : "1fr", gap: 20 }}>

          {/* Lista clienti */}
          <div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>⏳ Caricamento...</div>
            ) : clientiFiltrati.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#6b7280" }}>Nessun cliente trovato.</div>
            ) : (
              clientiFiltrati.map(c => (
                <div key={c.id}
                  onClick={() => apriDettagli(c)}
                  style={{
                    background: selectedCliente?.id === c.id ? "#eff6ff" : "#fff",
                    border: selectedCliente?.id === c.id ? "2px solid #2563eb" : "1.5px solid #e5e7eb",
                    borderRadius: 12, padding: 16, marginBottom: 10, cursor: "pointer",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)", transition: "all 0.15s"
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{c.cognome} {c.nome}</div>
                      {c.codice_fiscale && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>CF: {c.codice_fiscale}</div>}
                      {c.comune && <div style={{ fontSize: 12, color: "#9ca3af" }}>📍 {c.comune}{c.provincia ? ` (${c.provincia})` : ""}</div>}
                      {c.telefono && <div style={{ fontSize: 12, color: "#6b7280" }}>📞 {c.telefono}</div>}
                      {c.email && <div style={{ fontSize: 12, color: "#6b7280" }}>✉ {c.email}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {c.privacy_accettata && <div style={{ fontSize: 11, background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>✅ Privacy</div>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Dettagli cliente */}
          {selectedCliente && (
            <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", position: "sticky", top: 20, maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{selectedCliente.cognome} {selectedCliente.nome}</h2>
                <button style={btn("#f3f4f6", "#374151")} onClick={() => setSelectedCliente(null)}>✕ Chiudi</button>
              </div>

              {loadingDettagli ? (
                <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>⏳ Caricamento dettagli...</div>
              ) : (
                <>
                  {/* Dati anagrafici */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>Dati Anagrafici</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[
                        ["Codice Fiscale", selectedCliente.codice_fiscale],
                        ["Nato a", selectedCliente.luogo_nascita],
                        ["Data nascita", formatDate(selectedCliente.data_nascita)],
                        ["Indirizzo", selectedCliente.indirizzo],
                        ["Comune", `${selectedCliente.comune || ""}${selectedCliente.provincia ? ` (${selectedCliente.provincia})` : ""} ${selectedCliente.cap || ""}`],
                        ["Telefono", selectedCliente.telefono],
                        ["Email", selectedCliente.email],
                      ].map(([label, val]) => val ? (
                        <div key={label} style={{ padding: "6px 10px", background: "#f9fafb", borderRadius: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#9ca3af" }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{val}</div>
                        </div>
                      ) : null)}
                    </div>
                    {selectedCliente.note && (
                      <div style={{ marginTop: 8, padding: "8px 10px", background: "#fffef0", borderRadius: 6, fontSize: 13, color: "#374151" }}>
                        <strong>Note:</strong> {selectedCliente.note}
                      </div>
                    )}
                  </div>

                  {/* Documento d'identità */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>
                      📄 Documento d&apos;Identità
                    </div>
                    {(fotoFronte || fotoRetro) ? (
                      <div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                          {fotoFronte && (
                            <div style={{ textAlign: "center" }}>
                              <img src={`data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}`} alt="Fronte"
                                style={{ width: 200, borderRadius: 8, border: "1.5px solid #e5e7eb", display: "block", cursor: "pointer" }}
                                onClick={() => { const w = window.open(); w?.document.write(`<img src="data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}" style="max-width:100%">`); }} />
                              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Fronte</div>
                              <a href={`data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}`} download={`documento_fronte_${selectedCliente.cognome}.jpg`}
                                style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>⬇ Scarica</a>
                            </div>
                          )}
                          {fotoRetro && (
                            <div style={{ textAlign: "center" }}>
                              <img src={`data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}`} alt="Retro"
                                style={{ width: 200, borderRadius: 8, border: "1.5px solid #e5e7eb", display: "block", cursor: "pointer" }}
                                onClick={() => { const w = window.open(); w?.document.write(`<img src="data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}" style="max-width:100%">`); }} />
                              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Retro</div>
                              <a href={`data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}`} download={`documento_retro_${selectedCliente.cognome}.jpg`}
                                style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>⬇ Scarica</a>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: "#9ca3af", padding: "10px", background: "#f9fafb", borderRadius: 8 }}>
                        Nessun documento caricato per questo cliente.
                      </div>
                    )}
                  </div>

                  {/* Privacy e Firme */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>
                      🔒 Privacy e Firme
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      {selectedCliente.privacy_accettata ? (
                        <div style={{ background: "#d1fae5", border: "1px solid #059669", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#065f46", fontWeight: 600, flex: 1, marginRight: 10 }}>
                          ✅ Privacy accettata il {formatDate(selectedCliente.privacy_data)}
                        </div>
                      ) : (
                        <div style={{ background: "#fef3c7", border: "1px solid #d97706", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400e", flex: 1, marginRight: 10 }}>
                          ⚠️ Privacy non ancora accettata
                        </div>
                      )}
                      <button style={{ ...btn("#7c3aed"), whiteSpace: "nowrap" as const }} onClick={() => scaricaPrivacyPdf(selectedCliente)}>
                        🔒 Stampa Privacy PDF
                      </button>
                    </div>
                    {(firmaCliente || firmaPrivacy) && (
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {firmaCliente && (
                          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, textAlign: "center", background: "#f9fafb" }}>
                            <img src={`data:image/png;base64,${firmaCliente.data_base64}`} alt="Firma"
                              style={{ height: 60, objectFit: "contain", display: "block", cursor: "pointer" }}
                              onClick={() => { const w = window.open(); w?.document.write(`<img src="data:image/png;base64,${firmaCliente.data_base64}" style="max-width:100%">`); }} />
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Firma Cliente</div>
                            <a href={`data:image/png;base64,${firmaCliente.data_base64}`} download={`firma_${selectedCliente.cognome}.png`}
                              style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>⬇ Scarica</a>
                          </div>
                        )}
                        {firmaPrivacy && (
                          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, textAlign: "center", background: "#f9fafb" }}>
                            <img src={`data:image/png;base64,${firmaPrivacy.data_base64}`} alt="Firma Privacy"
                              style={{ height: 60, objectFit: "contain", display: "block", cursor: "pointer" }}
                              onClick={() => { const w = window.open(); w?.document.write(`<img src="data:image/png;base64,${firmaPrivacy.data_base64}" style="max-width:100%">`); }} />
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Firma Privacy</div>
                            <a href={`data:image/png;base64,${firmaPrivacy.data_base64}`} download={`firma_privacy_${selectedCliente.cognome}.png`}
                              style={{ fontSize: 11, color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>⬇ Scarica</a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Foto oggetti */}
                  {selectedCliente.foto.filter(f => f.tipo.startsWith("oggetto_")).length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>
                        📦 Foto Oggetti (ultima scheda)
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {selectedCliente.foto.filter(f => f.tipo.startsWith("oggetto_")).map((f, i) => (
                          <div key={i} style={{ position: "relative", cursor: "zoom-in" }}
                            onClick={() => setLightbox({ src: `data:${f.mime_type};base64,${f.data_base64}`, nome: f.nome_file || f.tipo + ".jpg" })}>
                            <img src={`data:${f.mime_type};base64,${f.data_base64}`} alt={f.tipo}
                              style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1.5px solid #e5e7eb", display: "block" }} />
                            <div style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, borderRadius: 4, padding: "1px 5px" }}>🔍</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Storico schede */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>
                      Storico Schede ({selectedCliente.schede.length})
                    </div>
                    {selectedCliente.schede.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#9ca3af" }}>Nessuna scheda trovata.</div>
                    ) : (
                      selectedCliente.schede.map(s => (
                        <div key={s.numero_scheda} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f9fafb", borderRadius: 8, marginBottom: 6 }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>N° {s.numero_scheda}</span>
                            <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 8 }}>{formatDate(s.data_operazione)}</span>
                            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8, textTransform: "uppercase" }}>{s.mezzo_pagamento}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: "#059669", fontSize: 14 }}>{currency(s.totale_valore)}</span>
                        </div>
                      ))
                    )}
                    {selectedCliente.schede.length > 0 && (
                      <div style={{ marginTop: 8, textAlign: "right", fontSize: 13, fontWeight: 700, color: "#111827" }}>
                        Totale acquistato: {currency(selectedCliente.schede.reduce((a, s) => a + (s.totale_valore || 0), 0))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
