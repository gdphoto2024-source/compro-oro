import { NextResponse } from "next/server";
import vision from "@google-cloud/vision";

const client = new vision.ImageAnnotatorClient();

type ParsedDocument = {
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
  rawText: string;
};

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/["""]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function cleanValue(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+/, "")
    .replace(/[:\-\s]+$/, "")
    .trim();
}

/**
 * Converts dates in format DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY to YYYY-MM-DD
 */
function toInputDate(dateText: string): string {
  const parts = dateText.split(/[\/.\-]/);
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return "";
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function extractAllDates(text: string): string[] {
  return text.match(/\b\d{2}[\/.\-]\d{2}[\/.\-]\d{4}\b/g) || [];
}

// ─── CODICE FISCALE ──────────────────────────────────────────────────────────

function extractCodiceFiscale(text: string): string {
  const upper = text.toUpperCase();
  // Standard 16-char CF
  const match = upper.match(
    /\b([A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z])\b/
  );
  return match ? match[1] : "";
}

// ─── NUMERO DOCUMENTO ────────────────────────────────────────────────────────

function extractNumeroDocumento(text: string): string {
  const upper = text.toUpperCase();

  // Carta d'identità: CA/CB/CC/CD + 5 digits (e.g. CA12345AB or CA12345)
  const ci = upper.match(/\b(C[A-Z]\d{5}[A-Z]{0,2})\b/);
  if (ci) return ci[1];

  // Passaporto italiano: YA/YB/AA + 7 digits
  const passport = upper.match(/\b([A-Z]{2}\d{7})\b/);
  if (passport) return passport[1];

  // Patente: pattern like U0123456789AB or 2 letters + digits + letters
  const license = upper.match(/\b([A-Z]{1,2}[0-9]{7,10}[A-Z]{0,2})\b/);
  if (license) return license[1];

  // After label "N." or "NR" or "NUMERO"
  const afterLabel = upper.match(
    /(?:N\.\s*|NR\.?\s*|NUMERO\s+(?:DOCUMENTO\s*)?)([A-Z0-9]{5,15})/
  );
  if (afterLabel) return afterLabel[1];

  // Fallback generic alphanumeric 7-12 chars
  const generic = upper.match(/\b([A-Z0-9]{7,12})\b/);
  return generic ? generic[1] : "";
}

// ─── NOME & COGNOME ──────────────────────────────────────────────────────────

function extractNameSurname(text: string): { cognome: string; nome: string } {
  const upper = text.toUpperCase();

  // Pattern: COGNOME / SURNAME on same line, value follows
  const cognomePatterns = [
    /COGNOME\s*[\/]?\s*(?:SURNAME)?\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ''\- ]{2,40})/,
    /SURNAME\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ''\- ]{2,40})/,
    /^([A-ZÀÈÉÌÒÙÄ''\-]{2,40})\n/m, // first line all-caps for some docs
  ];

  const nomePatterns = [
    /NOME\s*[\/]?\s*(?:NAME)?\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ''\- ]{2,40})/,
    /GIVEN\s+NAMES?\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ''\- ]{2,40})/,
    /NAME\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ''\- ]{2,40})/,
  ];

  let cognome = "";
  let nome = "";

  for (const p of cognomePatterns) {
    const m = upper.match(p);
    if (m?.[1]) { cognome = cleanValue(m[1]); break; }
  }

  for (const p of nomePatterns) {
    const m = upper.match(p);
    if (m?.[1]) { nome = cleanValue(m[1]); break; }
  }

  // Inline: COGNOME xxx NOME yyy
  if (!cognome || !nome) {
    const inline = upper.match(
      /COGNOME\s+([A-ZÀÈÉÌÒÙÄ''\- ]{2,40?})\s+NOME\s+([A-ZÀÈÉÌÒÙÄ''\- ]{2,40})/
    );
    if (inline) {
      if (!cognome) cognome = cleanValue(inline[1]);
      if (!nome) nome = cleanValue(inline[2]);
    }
  }

  // MRZ line (passaporto): P<ITA<COGNOME<<NOME<<<...
  if (!cognome || !nome) {
    const mrz = upper.match(/P<ITA([A-Z<]{5,44})/);
    if (mrz) {
      const parts = mrz[1].split("<<");
      if (parts[0]) cognome = parts[0].replace(/</g, " ").trim();
      if (parts[1]) nome = parts[1].replace(/</g, " ").trim();
    }
  }

  // MRZ patente: cognome<<nome
  if (!cognome || !nome) {
    const mrzLine = upper.match(/([A-Z]{2,30})<<([A-Z<]{2,30})/);
    if (mrzLine) {
      if (!cognome) cognome = mrzLine[1].replace(/</g, " ").trim();
      if (!nome) nome = mrzLine[2].replace(/</g, " ").trim();
    }
  }

  return { cognome, nome };
}

// ─── LUOGO DI NASCITA ────────────────────────────────────────────────────────

function extractBirthPlace(text: string): string {
  const upper = text.toUpperCase();

  const patterns = [
    /LUOGO\s+DI\s+NASCITA\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ'()\-\. ]{2,60})/,
    /PLACE\s+OF\s+BIRTH\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ'()\-\. ]{2,60})/,
    /LUOGO\s+E\s+DATA\s+DI\s+NASCITA\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ'()\-\. ]{2,60})/,
    /NATO\s*[\/A]\s*([A-ZÀÈÉÌÒÙÄ'()\-\. ]{2,60})\s+IL\s+\d/,
    /NATA?\s+A\s+([A-ZÀÈÉÌÒÙÄ'()\-\. ]{2,60})\s+IL\s+\d/,
  ];

  for (const p of patterns) {
    const m = upper.match(p);
    if (m?.[1]) {
      // Remove trailing date fragments
      const val = cleanValue(m[1]).replace(/\d.*$/, "").trim();
      if (val.length >= 2) return val;
    }
  }

  return "";
}

// ─── INDIRIZZO ───────────────────────────────────────────────────────────────

function extractAddress(text: string): string {
  const upper = text.toUpperCase();

  const patterns = [
    /INDIRIZZO\s+DI\s+RESIDENZA\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.,\/\-\(\) ]{5,120})/,
    /RESIDENZA\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.,\/\-\(\) ]{5,120})/,
    /RESIDENTE\s+IN\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.,\/\-\(\) ]{5,120})/,
    /INDIRIZZO\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.,\/\-\(\) ]{5,120})/,
    /\b((?:VIA|VIALE|CORSO|PIAZZA|LARGO|STRADA|VICOLO|PIAZZALE|CONTRADA)\s+[A-ZÀÈÉÌÒÙÄ0-9'.,\/\-\(\) ]{3,100})/,
  ];

  for (const p of patterns) {
    const m = upper.match(p);
    if (m?.[1]) {
      // Stop at newline-equivalent keywords
      const val = cleanValue(m[1])
        .replace(/\s+(COMUNE|CITTA|CITTÀ|CAP|PROVINCIA|CODICE)\b.*$/i, "")
        .trim();
      if (val.length >= 5) return val;
    }
  }

  return "";
}

// ─── COMUNE & PROVINCIA ──────────────────────────────────────────────────────

function extractComuneProvincia(text: string, address: string): { comune: string; provincia: string } {
  const upper = text.toUpperCase();

  // Format: COMUNE (XX) anywhere in text
  const comuneProv =
    upper.match(/\b([A-ZÀÈÉÌÒÙÄ' ]{2,40})\s+\(([A-Z]{2})\)/) ||
    address.toUpperCase().match(/\b([A-ZÀÈÉÌÒÙÄ' ]{2,40})\s+\(([A-Z]{2})\)/);

  if (comuneProv) {
    return {
      comune: cleanValue(comuneProv[1]),
      provincia: cleanValue(comuneProv[2]),
    };
  }

  // Labelled fields
  const comuneMatch = upper.match(
    /COMUNE\s*(?:DI\s+RESIDENZA)?\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ' ]{2,50})/
  );
  const provMatch = upper.match(
    /PROVINCIA\s*[:\-]?\s*([A-Z]{2,30})/
  );

  return {
    comune: comuneMatch ? cleanValue(comuneMatch[1]) : "",
    provincia: provMatch ? cleanValue(provMatch[1]).substring(0, 2) : "",
  };
}

// ─── CAP ─────────────────────────────────────────────────────────────────────

function extractCap(text: string): string {
  // Italian CAP is exactly 5 digits, not part of CF or doc numbers
  const matches = text.match(/\b(\d{5})\b/g) || [];
  // Exclude year-like strings (19xx, 20xx)
  const cap = matches.find((m) => !/^(19|20)\d{2}$/.test(m) && !/^\d{4}$/.test(m));
  return cap || "";
}

// ─── ENTE RILASCIO ───────────────────────────────────────────────────────────

function extractEnteRilascio(text: string): string {
  const upper = text.toUpperCase();

  const patterns = [
    /RILASCIATO\s+DA\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.\- ]{3,80})/,
    /ENTE\s+(?:DI\s+)?RILASCIO\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.\- ]{3,80})/,
    /ISSUED\s+BY\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.\- ]{3,80})/,
    /ISSUING\s+AUTHORITY\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.\- ]{3,80})/,
    /AUTORIT[AÀ]\s+EMITTENTE\s*[:\-]?\s*([A-ZÀÈÉÌÒÙÄ0-9'.\- ]{3,80})/,
    // Comune di XXX (common in CIE)
    /(COMUNE\s+DI\s+[A-ZÀÈÉÌÒÙÄ' ]{2,50})/,
    // Questura di XXX (common in passaporti)
    /(QUESTURA\s+DI\s+[A-ZÀÈÉÌÒÙÄ' ]{2,50})/,
    // Motorizzazione (patente)
    /(MOTORIZZAZIONE\s+(?:CIVILE\s+)?(?:DI\s+)?[A-ZÀÈÉÌÒÙÄ' ]{0,50})/,
  ];

  for (const p of patterns) {
    const m = upper.match(p);
    if (m?.[1]) {
      const val = cleanValue(m[1]).replace(/\s+(IL|DATA)\b.*$/i, "").trim();
      if (val.length >= 3) return val;
    }
  }

  return "";
}

// ─── TIPO DOCUMENTO ──────────────────────────────────────────────────────────

function extractTipoDocumento(text: string): string {
  const upper = text.toUpperCase();

  if (/CARTA\s+(?:D[I']?\s+)?IDENTIT[AÀ]|IDENTITY\s+CARD|CIE/.test(upper))
    return "Carta di identità";
  if (/PASSAPORTO|PASSPORT/.test(upper)) return "Passaporto";
  if (/PATENTE\s+(?:DI\s+GUIDA)?|DRIVING\s+LICEN[CS]E/.test(upper))
    return "Patente di guida";
  if (/PERMESSO\s+DI\s+SOGGIORNO/.test(upper)) return "Permesso di soggiorno";

  return "Carta di identità"; // default
}

// ─── DATE MAPPING ────────────────────────────────────────────────────────────

/**
 * Tries to assign dates intelligently by searching labeled contexts.
 * Falls back to positional order (birth, issue, expiry).
 */
function extractDates(text: string): {
  dataNascita: string;
  dataRilascio: string;
  dataScadenza: string;
} {
  const upper = text.toUpperCase();

  function findLabeledDate(labels: string[]): string {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(
        `${escaped}\\s*[:\\-]?\\s*(\\d{2}[\\/.\\-]\\d{2}[\\/.\\-]\\d{4})`,
        "i"
      );
      const m = upper.match(rx);
      if (m?.[1]) return toInputDate(m[1]);
    }
    return "";
  }

  const dataNascita = findLabeledDate([
    "DATA DI NASCITA",
    "LUOGO E DATA DI NASCITA",
    "DATE OF BIRTH",
    "BORN",
    "NASCITA",
    "NATO IL",
    "NATA IL",
    "IL",
  ]);

  const dataRilascio = findLabeledDate([
    "DATA DI RILASCIO",
    "DATA RILASCIO",
    "RILASCIATA IL",
    "RILASCIATO IL",
    "DATE OF ISSUE",
    "ISSUED",
  ]);

  const dataScadenza = findLabeledDate([
    "DATA DI SCADENZA",
    "SCADENZA",
    "VALIDA FINO AL",
    "VALIDO FINO AL",
    "DATA SCADENZA",
    "EXPIRY DATE",
    "EXPIRES",
    "EXPIRATION",
  ]);

  // Positional fallback
  if (!dataNascita || !dataRilascio || !dataScadenza) {
    const allDates = extractAllDates(upper);
    return {
      dataNascita: dataNascita || toInputDate(allDates[0] || ""),
      dataRilascio: dataRilascio || toInputDate(allDates[1] || ""),
      dataScadenza: dataScadenza || toInputDate(allDates[2] || ""),
    };
  }

  return { dataNascita, dataRilascio, dataScadenza };
}

// ─── MAIN PARSER ─────────────────────────────────────────────────────────────

function parseDocument(text: string): ParsedDocument {
  const rawText = normalizeText(text);

  const { nome, cognome } = extractNameSurname(rawText);
  const luogoNascita = extractBirthPlace(rawText);
  const indirizzo = extractAddress(rawText);
  const enteRilascio = extractEnteRilascio(rawText);
  const tipoDocumento = extractTipoDocumento(rawText);
  const codiceFiscale = extractCodiceFiscale(rawText);
  const numeroDocumento = extractNumeroDocumento(rawText);
  const cap = extractCap(rawText);
  const { comune, provincia } = extractComuneProvincia(rawText, indirizzo);
  const { dataNascita, dataRilascio, dataScadenza } = extractDates(rawText);

  return {
    nome,
    cognome,
    luogoNascita,
    dataNascita,
    indirizzo,
    comune,
    provincia,
    cap,
    codiceFiscale,
    tipoDocumento,
    numeroDocumento,
    dataRilascio,
    dataScadenza,
    enteRilascio,
    rawText,
  };
}

// ─── BASE64 HELPER ───────────────────────────────────────────────────────────

function cleanBase64Image(image: string): string {
  if (!image) return "";
  if (image.startsWith("data:")) {
    const parts = image.split(",");
    return parts[1] || "";
  }
  return image;
}

// ─── ROUTE HANDLERS ──────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({ ok: true, message: "API OCR attiva" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const image = cleanBase64Image(body?.image || "");

    if (!image) {
      return NextResponse.json(
        { ok: false, error: "Immagine mancante nel body" },
        { status: 400 }
      );
    }

    const [result] = await client.documentTextDetection({
      image: { content: image },
      imageContext: { languageHints: ["it"] },
    });

    const text = result.fullTextAnnotation?.text || "";
    const parsed = parseDocument(text);

    return NextResponse.json({ ok: true, ...parsed });
  } catch (error: any) {
    console.error("OCR API ERROR:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Errore OCR", details: String(error) },
      { status: 500 }
    );
  }
}