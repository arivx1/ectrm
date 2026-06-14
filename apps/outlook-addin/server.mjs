import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const CERT_PATH = process.env.SSL_CERT_PATH || "/Users/anthonyrivich/.office-addin-dev-certs/localhost.crt";
const KEY_PATH = process.env.SSL_KEY_PATH || "/Users/anthonyrivich/.office-addin-dev-certs/localhost.key";
const COMMODITYAI_AUTH_TEST_URL = process.env.COMMODITYAI_AUTH_TEST_URL || "https://commodityai.app/api/v1/sources/definitions";
const COMMODITYAI_DOCUMENTS_URL = process.env.COMMODITYAI_DOCUMENTS_URL || "https://commodityai.app/api/v1/documents";
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const VALID_PRIORITIES = new Set(["low", "normal", "high"]);

const MIME_TYPES = {
  ".css": "text/css; charset=UTF-8",
  ".html": "text/html; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".xml": "application/xml; charset=UTF-8",
};

const server = https.createServer(
  {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
  },
  async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `https://localhost:${PORT}`);

      if (requestUrl.pathname === "/commodityai/auth-test") {
        await proxyCommodityAIAuthTest(request, response);
        return;
      }

      if (requestUrl.pathname === "/commodityai/send-email") {
        await proxyCommodityAIEmailUpload(request, response);
        return;
      }

      serveStaticFile(requestUrl.pathname, response);
    } catch (error) {
      if (error && typeof error === "object" && "status" in error) {
        sendJson(response, error.status, {
          error: error.code || "request_error",
          message: error.message || "Request failed.",
        });
        return;
      }

      sendJson(response, 500, {
        error: "server_error",
        message: error instanceof Error ? error.message : "Unexpected local server error",
      });
    }
  },
);

server.listen(PORT, () => {
  console.log(`CommodityAI Outlook add-in dev server running at https://localhost:${PORT}`);
  console.log(`Serving ${__dirname}`);
});

async function proxyCommodityAIAuthTest(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, {
      error: "method_not_allowed",
      message: "Only GET is supported.",
    });
    return;
  }

  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    sendJson(response, 401, {
      error: "unauthorized",
      message: "Invalid or missing API key.",
    });
    return;
  }

  const upstreamResponse = await fetch(COMMODITYAI_AUTH_TEST_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
  });

  await forwardUpstreamResponse(upstreamResponse, response, "CommodityAI authentication test");
}

async function proxyCommodityAIEmailUpload(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, {
      error: "method_not_allowed",
      message: "Only POST is supported.",
    });
    return;
  }

  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    sendJson(response, 401, {
      error: "unauthorized",
      message: "Invalid or missing API key.",
    });
    return;
  }

  const payload = await readJsonRequest(request);
  const email = validateEmailPayload(payload.email);
  const priority = VALID_PRIORITIES.has(payload.priority) ? payload.priority : "normal";
  const pdfBuffer = generateEmailPdf(email);
  const filename = buildEmailPdfFilename(email);
  const metadata = buildCommodityAIEmailMetadata(email);
  const formData = new FormData();

  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);
  formData.append("metadata", JSON.stringify(metadata));
  formData.append("priority", priority);

  const upstreamResponse = await fetch(COMMODITYAI_DOCUMENTS_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
    body: formData,
  });

  await forwardUpstreamResponse(upstreamResponse, response, "CommodityAI document upload");
}

function serveStaticFile(pathname, response) {
  const relativePath = pathname === "/" ? "/taskpane.html" : pathname;
  const decodedPath = decodeURIComponent(relativePath);
  const filePath = path.normalize(path.join(__dirname, decodedPath));

  if (!filePath.startsWith(__dirname)) {
    sendJson(response, 403, {
      error: "forbidden",
      message: "Requested path is outside the add-in directory.",
    });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, {
        error: "not_found",
        message: "File not found.",
      });
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

function readJsonRequest(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > MAX_REQUEST_BYTES) {
        reject({
          status: 413,
          code: "payload_too_large",
          message: "Email payload is too large to upload.",
        });
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        reject({
          status: 400,
          code: "invalid_json",
          message: "Request body must be valid JSON.",
        });
      }
    });

    request.on("error", reject);
  });
}

function validateEmailPayload(email) {
  if (!email || typeof email !== "object") {
    throw {
      status: 400,
      code: "invalid_email",
      message: "Email payload is required.",
    };
  }

  const normalized = {
    subject: normalizeText(email.subject, "(No subject)"),
    from: normalizeText(email.from, ""),
    to: normalizeStringArray(email.to),
    cc: normalizeStringArray(email.cc),
    dateTimeCreated: normalizeText(email.dateTimeCreated, ""),
    dateTimeModified: normalizeText(email.dateTimeModified, ""),
    internetMessageId: normalizeText(email.internetMessageId, ""),
    itemId: normalizeText(email.itemId, ""),
    conversationId: normalizeText(email.conversationId, ""),
    attachments: normalizeAttachments(email.attachments),
    bodyText: normalizeText(email.bodyText, ""),
    internetHeaders: normalizeText(email.internetHeaders, ""),
  };

  if (!normalized.subject && !normalized.bodyText) {
    throw {
      status: 400,
      code: "invalid_email",
      message: "Email subject or body is required.",
    };
  }

  return normalized;
}

function normalizeText(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
}

function normalizeAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((attachment) => ({
    name: normalizeText(attachment.name, ""),
    contentType: normalizeText(attachment.contentType, ""),
    size: typeof attachment.size === "number" ? attachment.size : null,
    isInline: Boolean(attachment.isInline),
  })).filter((attachment) => attachment.name);
}

function buildCommodityAIEmailMetadata(email) {
  return {
    source_system: "outlook-addin",
    source_type: "email",
    submitted_at: new Date().toISOString(),
    subject: email.subject,
    from: email.from,
    to: email.to,
    cc: email.cc,
    sent_at: email.dateTimeCreated,
    outlook_item_id: email.itemId,
    outlook_conversation_id: email.conversationId,
    internet_message_id: email.internetMessageId,
    attachment_count: email.attachments.length,
    attachment_names: email.attachments.map((attachment) => attachment.name),
  };
}

function buildEmailPdfFilename(email) {
  const datePart = new Date().toISOString().slice(0, 10);
  const subjectPart = email.subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "outlook-email";

  return `commodityai-${datePart}-${subjectPart}.pdf`;
}

function generateEmailPdf(email) {
  const pages = [[]];
  const pageHeight = 792;
  const margin = 54;
  const lineHeight = 13;
  const bodyFontSize = 10;
  const headingFontSize = 16;
  const sectionFontSize = 11;
  const maxChars = 92;
  let y = pageHeight - margin;

  function currentPage() {
    return pages[pages.length - 1];
  }

  function addPage() {
    pages.push([]);
    y = pageHeight - margin;
  }

  function ensureSpace(lines = 1) {
    if (y - lines * lineHeight < margin) {
      addPage();
    }
  }

  function addLine(text, font, size) {
    ensureSpace();
    currentPage().push({ text, font, size, x: margin, y });
    y -= lineHeight;
  }

  function addBlankLine() {
    ensureSpace();
    y -= lineHeight;
  }

  function addWrapped(label, value) {
    const normalizedValue = value || "";
    const prefix = label ? `${label}: ` : "";
    const lines = wrapText(`${prefix}${normalizedValue}`, maxChars);

    for (const line of lines) {
      addLine(line, "F3", bodyFontSize);
    }
  }

  function addSection(title) {
    addBlankLine();
    addLine(title, "F2", sectionFontSize);
  }

  addLine("Outlook Email", "F2", headingFontSize);
  addWrapped("Subject", email.subject);
  addWrapped("From", email.from);
  addWrapped("To", email.to.join(", "));

  if (email.cc.length) {
    addWrapped("Cc", email.cc.join(", "));
  }

  addWrapped("Sent", email.dateTimeCreated);

  if (email.internetMessageId) {
    addWrapped("Message ID", email.internetMessageId);
  }

  if (email.conversationId) {
    addWrapped("Conversation ID", email.conversationId);
  }

  addSection("Attachments");

  if (email.attachments.length) {
    for (const attachment of email.attachments) {
      const size = attachment.size === null ? "unknown size" : `${attachment.size} bytes`;
      const contentType = attachment.contentType || "unknown type";
      addWrapped("", `- ${attachment.name} (${contentType}, ${size})`);
    }
  } else {
    addWrapped("", "No attachments reported by Outlook.");
  }

  addSection("Email Body");

  if (email.bodyText) {
    for (const paragraph of email.bodyText.split(/\r?\n/)) {
      if (!paragraph.trim()) {
        addBlankLine();
        continue;
      }

      for (const line of wrapText(paragraph, maxChars)) {
        addLine(line, "F3", bodyFontSize);
      }
    }
  } else {
    addWrapped("", "No readable body text was returned by Outlook.");
  }

  return buildPdfDocument(pages);
}

function wrapText(text, maxChars) {
  const words = String(text).replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    if (!word) {
      continue;
    }

    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }

      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }

      continue;
    }

    const nextLine = line ? `${line} ${word}` : word;

    if (nextLine.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function buildPdfDocument(pages) {
  const objects = [];
  const pageObjectNumbers = [];
  const contentObjectNumbers = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";

  let nextObjectNumber = 6;

  for (const page of pages) {
    const pageObjectNumber = nextObjectNumber++;
    const contentObjectNumber = nextObjectNumber++;
    pageObjectNumbers.push(pageObjectNumber);
    contentObjectNumbers.push(contentObjectNumber);

    const content = page.map((line) => (
      `BT /${line.font} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`
    )).join("\n");

    objects[contentObjectNumber] = `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`;
    objects[pageObjectNumber] = [
      "<< /Type /Page",
      "/Parent 2 0 R",
      "/MediaBox [0 0 612 792]",
      `/Contents ${contentObjectNumber} 0 R`,
      "/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>",
      ">>",
    ].join(" ");
  }

  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let number = 1; number < objects.length; number += 1) {
    offsets[number] = Buffer.byteLength(pdf, "binary");
    pdf += `${number} 0 obj\n${objects[number]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let number = 1; number < objects.length; number += 1) {
    pdf += `${String(offsets[number]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "binary");
}

function escapePdfText(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=UTF-8",
  });
  response.end(JSON.stringify(payload));
}

async function forwardUpstreamResponse(upstreamResponse, response, label) {
  const contentType = upstreamResponse.headers.get("content-type") || "";
  const responseText = await upstreamResponse.text();

  if (!contentType.includes("application/json")) {
    sendJson(response, upstreamResponse.status, {
      error: {
        code: "commodityai_upstream_error",
        message: `${label} returned HTTP ${upstreamResponse.status}.`,
      },
    });
    return;
  }

  response.writeHead(upstreamResponse.status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
  });
  response.end(responseText);
}
