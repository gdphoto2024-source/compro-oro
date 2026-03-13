"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Foto = { tipo: string; data_base64: string; mime_type: string };
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

export default function Clienti() {
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [loadingDettagli, setLoadingDettagli] = useState(false);

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

    // Carica foto dell'ultima operazione
    let foto: Foto[] = [];
    if (ops && ops.length > 0) {
      const { data: fotoDB } = await supabase
        .from("foto_scheda")
        .select("tipo,data_base64,mime_type")
        .eq("operazione_id", ops[0].id);
      foto = fotoDB || [];
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
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "Arial, sans-serif", padding: "24px 16px" }}>
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

                  {/* Foto documento */}
                  {(fotoFronte || fotoRetro) && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>Documento d&apos;Identità (ultima scheda)</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {fotoFronte && <img src={`data:${fotoFronte.mime_type};base64,${fotoFronte.data_base64}`} alt="Fronte" style={{ width: 160, borderRadius: 8, border: "1px solid #e5e7eb" }} />}
                        {fotoRetro && <img src={`data:${fotoRetro.mime_type};base64,${fotoRetro.data_base64}`} alt="Retro" style={{ width: 160, borderRadius: 8, border: "1px solid #e5e7eb" }} />}
                      </div>
                    </div>
                  )}

                  {/* Firme */}
                  {(firmaCliente || firmaPrivacy) && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#6b7280", marginBottom: 10, letterSpacing: "0.08em" }}>Firme</div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {firmaCliente && (
                          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, textAlign: "center" }}>
                            <img src={`data:image/png;base64,${firmaCliente.data_base64}`} alt="Firma" style={{ height: 50, objectFit: "contain", display: "block" }} />
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Firma Cliente</div>
                          </div>
                        )}
                        {firmaPrivacy && (
                          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, textAlign: "center" }}>
                            <img src={`data:image/png;base64,${firmaPrivacy.data_base64}`} alt="Firma Privacy" style={{ height: 50, objectFit: "contain", display: "block" }} />
                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Firma Privacy</div>
                          </div>
                        )}
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
