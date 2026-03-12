import { NextResponse } from "next/server";
import { Pool } from "pg";

// ─── DB CONNECTION ────────────────────────────────────────────────────────────
// Set DATABASE_URL in your .env.local:
// DATABASE_URL=postgresql://user:password@host:5432/dbname

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ─── TYPES ────────────────────────────────────────────────────────────────────

type SaveBody = {
  customer: {
    nome: string;
    cognome: string;
    luogoNascita: string;
    dataNascita: string;
    indirizzo: string;
    comune: string;
    provincia: string;
    cap: string;
    codiceFiscale: string;
    tipoDocumento: string;
    numeroDocumento: string;
    dataRilascio: string;
    dataScadenza: string;
    enteRilascio: string;
    telefono: string;
    email: string;
    note: string;
  };
  practice: {
    dataOperazione: string;
    mezzoPagamento: string;
    croTrn: string;
    totaleValore: string;
    firmaVenditore: string;
    firmaAzienda: string;
    firmaPrivacy: string;
    firmaRicevuta: string;
    noteOperazione: string;
  };
  items: Array<{
    descrizione: string;
    materiale: string;
    pesoAu: string;
    pesoAg: string;
    valore: string;
    note: string;
  }>;
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toDate(s: string): string | null {
  if (!s) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function toDecimal(s: string): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

// ─── HANDLER ─────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const client = await pool.connect();

  try {
    const body: SaveBody = await req.json();
    const { customer, practice, items } = body;

    if (!customer?.cognome || !customer?.nome) {
      return NextResponse.json(
        { ok: false, error: "Nome e cognome obbligatori" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    // ── 1. UPSERT cliente ────────────────────────────────────
    // Se esiste già un cliente con lo stesso CF, aggiorna i dati.
    // Se non c'è CF, inserisce sempre un nuovo record.
    let clienteId: number;

    if (customer.codiceFiscale) {
      const upsert = await client.query(
        `INSERT INTO clienti
           (nome, cognome, luogo_nascita, data_nascita, indirizzo, comune, provincia, cap,
            codice_fiscale, telefono, email, note, aggiornato_il)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (codice_fiscale) DO UPDATE SET
           nome          = EXCLUDED.nome,
           cognome       = EXCLUDED.cognome,
           luogo_nascita = EXCLUDED.luogo_nascita,
           data_nascita  = EXCLUDED.data_nascita,
           indirizzo     = EXCLUDED.indirizzo,
           comune        = EXCLUDED.comune,
           provincia     = EXCLUDED.provincia,
           cap           = EXCLUDED.cap,
           telefono      = COALESCE(EXCLUDED.telefono, clienti.telefono),
           email         = COALESCE(EXCLUDED.email, clienti.email),
           note          = COALESCE(EXCLUDED.note, clienti.note),
           aggiornato_il = NOW()
         RETURNING id`,
        [
          customer.nome,
          customer.cognome,
          customer.luogoNascita || null,
          toDate(customer.dataNascita),
          customer.indirizzo || null,
          customer.comune || null,
          customer.provincia || null,
          customer.cap || null,
          customer.codiceFiscale,
          customer.telefono || null,
          customer.email || null,
          customer.note || null,
        ]
      );
      clienteId = upsert.rows[0].id;
    } else {
      // No CF — always insert new
      const ins = await client.query(
        `INSERT INTO clienti
           (nome, cognome, luogo_nascita, data_nascita, indirizzo, comune, provincia, cap,
            telefono, email, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          customer.nome,
          customer.cognome,
          customer.luogoNascita || null,
          toDate(customer.dataNascita),
          customer.indirizzo || null,
          customer.comune || null,
          customer.provincia || null,
          customer.cap || null,
          customer.telefono || null,
          customer.email || null,
          customer.note || null,
        ]
      );
      clienteId = ins.rows[0].id;
    }

    // ── 2. INSERT documento ──────────────────────────────────
    let documentoId: number | null = null;

    if (customer.numeroDocumento) {
      const docIns = await client.query(
        `INSERT INTO documenti
           (cliente_id, tipo_documento, numero_documento, ente_rilascio, data_rilascio, data_scadenza)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          clienteId,
          customer.tipoDocumento || "Carta di identità",
          customer.numeroDocumento,
          customer.enteRilascio || null,
          toDate(customer.dataRilascio),
          toDate(customer.dataScadenza),
        ]
      );
      documentoId = docIns.rows[0].id;
    }

    // ── 3. INSERT operazione ─────────────────────────────────
    const totale =
      toDecimal(practice.totaleValore) ||
      items.reduce((acc, it) => acc + (toDecimal(it.valore) || 0), 0) ||
      null;

    const opIns = await client.query(
      `INSERT INTO operazioni
         (cliente_id, documento_id, data_operazione, mezzo_pagamento, cro_trn,
          totale_valore, firma_venditore, firma_azienda, firma_privacy, firma_ricevuta, note_operazione)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        clienteId,
        documentoId,
        toDate(practice.dataOperazione) || new Date().toISOString().slice(0, 10),
        practice.mezzoPagamento || "contanti",
        practice.croTrn || null,
        totale,
        practice.firmaVenditore || null,
        practice.firmaAzienda || null,
        practice.firmaPrivacy || null,
        practice.firmaRicevuta || null,
        practice.noteOperazione || null,
      ]
    );
    const operazioneId: number = opIns.rows[0].id;

    // ── 4. INSERT oggetti ────────────────────────────────────
    for (const item of items) {
      if (!item.descrizione && !item.valore) continue; // skip empty rows
      await client.query(
        `INSERT INTO oggetti
           (operazione_id, descrizione, materiale, peso_au, peso_ag, valore, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          operazioneId,
          item.descrizione || null,
          item.materiale || "oro",
          toDecimal(item.pesoAu),
          toDecimal(item.pesoAg),
          toDecimal(item.valore),
          item.note || null,
        ]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      operazioneId,
      clienteId,
      documentoId,
      message: "Scheda salvata con successo",
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("SAVE API ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Errore salvataggio", details: String(error) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}