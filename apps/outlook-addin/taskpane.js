"use strict";

const API_KEY_SETTING_NAME = "CommodityAI_API_Key";
const COMMODITYAI_AUTH_TEST_URL = "/commodityai/auth-test";
const COMMODITYAI_SEND_EMAIL_URL = "/commodityai/send-email";
const VALID_API_KEY_PREFIXES = ["cai_live_", "cai_test_"];

let apiKeyInput;
let saveAuthButton;
let clearAuthButton;
let sendEmailButton;
let priorityInput;
let emailSummaryText;
let statusMessage;
let loadingSpinner;

Office.onReady((info) => {
  // Office.js calls this only after the host has initialized enough for safe API access.
  cacheDomReferences();

  if (info.host !== Office.HostType.Outlook) {
    showSideloadMessage();
    return;
  }

  // The taskpane can now show its real body and safely read Outlook roaming settings.
  document.getElementById("sideload-message").classList.remove("visible");
  document.getElementById("app-body").hidden = false;

  loadKey();
  refreshCurrentEmailSummary();

  saveAuthButton.addEventListener("click", saveAndTestKey);
  clearAuthButton.addEventListener("click", clearKey);
  sendEmailButton.addEventListener("click", sendCurrentEmail);
  apiKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveAndTestKey();
    }
  });

  if (Office.context.mailbox.addHandlerAsync && Office.EventType && Office.EventType.ItemChanged) {
    Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, refreshCurrentEmailSummary);
  }
});

function cacheDomReferences() {
  apiKeyInput = document.getElementById("api-key-input");
  saveAuthButton = document.getElementById("save-auth-btn");
  clearAuthButton = document.getElementById("clear-auth-btn");
  sendEmailButton = document.getElementById("send-email-btn");
  priorityInput = document.getElementById("priority-input");
  emailSummaryText = document.getElementById("email-summary-text");
  statusMessage = document.getElementById("status-message");
  loadingSpinner = document.getElementById("loading-spinner");
}

function loadKey() {
  // RoamingSettings follows the user's Exchange account and avoids browser storage.
  const savedKey = Office.context.roamingSettings.get(API_KEY_SETTING_NAME);

  if (typeof savedKey === "string" && savedKey.length > 0) {
    apiKeyInput.value = savedKey;
    setStatus("Saved API key loaded.", "neutral");
  }
}

function refreshCurrentEmailSummary() {
  const item = Office.context.mailbox.item;

  if (!item) {
    emailSummaryText.textContent = "Open an email to send it to CommodityAI.";
    sendEmailButton.disabled = true;
    return;
  }

  const sender = formatEmailAddress(item.from);
  const subject = item.subject || "(No subject)";
  const attachmentCount = Array.isArray(item.attachments) ? item.attachments.length : 0;
  const attachmentText = attachmentCount === 1 ? "1 attachment" : `${attachmentCount} attachments`;

  emailSummaryText.textContent = `${subject}${sender ? ` from ${sender}` : ""}. ${attachmentText}.`;
  sendEmailButton.disabled = false;
}

async function saveAndTestKey() {
  const key = apiKeyInput.value.trim();

  if (!hasValidApiKeyPrefix(key)) {
    setStatus("API key must start with cai_live_ or cai_test_.", "error");
    return;
  }

  setLoading(true);
  setStatus("Testing CommodityAI authentication...", "neutral");

  try {
    // The local dev server proxies this same-origin request to CommodityAI.
    // CommodityAI still receives the API key in the Authorization header as a Bearer token.
    const response = await fetch(COMMODITYAI_AUTH_TEST_URL, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${key}`,
      },
    });

    if (response.status === 200) {
      await saveKey(key);
      setStatus("Authentication successful.", "success");
      return;
    }

    setStatus(getMappedAuthError(response.status), getStatusTone(response.status));
  } catch (error) {
    setStatus(`Request failed: ${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(false);
  }
}

async function sendCurrentEmail() {
  const key = apiKeyInput.value.trim();

  if (!hasValidApiKeyPrefix(key)) {
    setStatus("API key must start with cai_live_ or cai_test_.", "error");
    apiKeyInput.focus();
    return;
  }

  if (!Office.context.mailbox.item) {
    setStatus("Open an email before sending to CommodityAI.", "error");
    return;
  }

  setLoading(true);
  setStatus("Preparing email for CommodityAI...", "neutral");

  try {
    const emailPayload = await buildCurrentEmailPayload();
    setStatus("Uploading email to CommodityAI...", "neutral");

    const response = await fetch(COMMODITYAI_SEND_EMAIL_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailPayload,
        priority: priorityInput.value || "normal",
      }),
    });

    const responsePayload = await parseJsonResponse(response);

    if (response.status === 200 || response.status === 201 || response.status === 202) {
      await saveKey(key);
      setStatus(buildSuccessfulSendMessage(responsePayload), "success");
      return;
    }

    setStatus(getMappedSendError(response.status, responsePayload), getStatusTone(response.status));
  } catch (error) {
    setStatus(`Request failed: ${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(false);
    refreshCurrentEmailSummary();
  }
}

async function clearKey() {
  apiKeyInput.value = "";
  setLoading(true);

  try {
    Office.context.roamingSettings.remove(API_KEY_SETTING_NAME);
    await saveRoamingSettings();
    setStatus("Saved API key cleared.", "success");
  } catch (error) {
    setStatus(`Unable to clear saved API key: ${getErrorMessage(error)}`, "error");
  } finally {
    setLoading(false);
    apiKeyInput.focus();
  }
}

function hasValidApiKeyPrefix(key) {
  return VALID_API_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function saveKey(key) {
  Office.context.roamingSettings.set(API_KEY_SETTING_NAME, key);
  return saveRoamingSettings();
}

function saveRoamingSettings() {
  // saveAsync is callback-based, so wrap it to keep the authentication flow readable.
  return new Promise((resolve, reject) => {
    Office.context.roamingSettings.saveAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve();
        return;
      }

      reject(new Error(result.error && result.error.message ? result.error.message : "Roaming settings save failed."));
    });
  });
}

function getMappedAuthError(status) {
  if (status === 401) {
    return "Invalid or missing API key.";
  }

  if (status === 403) {
    return "API key lacks required permissions.";
  }

  if (status === 429) {
    return "Rate limit exceeded. Please try again later.";
  }

  return `Authentication test failed with HTTP ${status}.`;
}

function getStatusTone(status) {
  return status === 429 ? "warning" : "error";
}

function setLoading(isLoading) {
  loadingSpinner.hidden = !isLoading;
  saveAuthButton.disabled = isLoading;
  clearAuthButton.disabled = isLoading;
  sendEmailButton.disabled = isLoading || !Office.context.mailbox.item;
  priorityInput.disabled = isLoading;
  apiKeyInput.disabled = isLoading;
}

function setStatus(message, tone) {
  statusMessage.textContent = message;
  statusMessage.className = tone === "neutral" ? "" : tone;
}

function getErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : "Unknown error";
}

function showSideloadMessage() {
  document.getElementById("sideload-message").classList.add("visible");
  document.getElementById("app-body").hidden = true;
}

async function buildCurrentEmailPayload() {
  const item = Office.context.mailbox.item;
  const bodyText = await getBodyText(item);
  const internetHeaders = await getInternetHeaders(item);

  return {
    subject: item.subject || "",
    from: serializeEmailAddress(item.from),
    to: serializeEmailAddressList(item.to),
    cc: serializeEmailAddressList(item.cc),
    dateTimeCreated: serializeDate(item.dateTimeCreated),
    dateTimeModified: serializeDate(item.dateTimeModified),
    internetMessageId: item.internetMessageId || null,
    itemId: item.itemId || null,
    conversationId: item.conversationId || null,
    attachments: serializeAttachments(item.attachments),
    bodyText,
    internetHeaders,
  };
}

function getBodyText(item) {
  return new Promise((resolve, reject) => {
    item.body.getAsync(Office.CoercionType.Text, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value || "");
        return;
      }

      reject(new Error(result.error && result.error.message ? result.error.message : "Unable to read email body."));
    });
  });
}

function getInternetHeaders(item) {
  if (!item.getAllInternetHeadersAsync) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    item.getAllInternetHeadersAsync((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value || null);
        return;
      }

      resolve(null);
    });
  });
}

function serializeEmailAddressList(addresses) {
  if (!Array.isArray(addresses)) {
    return [];
  }

  return addresses.map(serializeEmailAddress).filter(Boolean);
}

function serializeEmailAddress(address) {
  if (!address) {
    return null;
  }

  if (typeof address === "string") {
    return address;
  }

  const displayName = address.displayName || "";
  const emailAddress = address.emailAddress || "";

  if (displayName && emailAddress) {
    return `${displayName} <${emailAddress}>`;
  }

  return emailAddress || displayName || null;
}

function formatEmailAddress(address) {
  return serializeEmailAddress(address) || "";
}

function serializeAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.map((attachment) => ({
    id: attachment.id || null,
    name: attachment.name || "",
    contentType: attachment.contentType || null,
    size: typeof attachment.size === "number" ? attachment.size : null,
    isInline: Boolean(attachment.isInline),
  }));
}

function serializeDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function buildSuccessfulSendMessage(payload) {
  const documentId = payload && payload.data && payload.data.id;

  if (documentId) {
    return `Email sent to CommodityAI. Document ID: ${documentId}`;
  }

  return "Email sent to CommodityAI.";
}

function getMappedSendError(status, payload) {
  if (status === 400) {
    return getPayloadErrorMessage(payload, "CommodityAI rejected the email upload request.");
  }

  if (status === 401) {
    return "Invalid or missing API key.";
  }

  if (status === 403) {
    return "API key lacks required permissions.";
  }

  if (status === 413) {
    return "Email is too large to upload.";
  }

  if (status === 422) {
    return getPayloadErrorMessage(payload, "CommodityAI could not process the generated email document.");
  }

  if (status === 429) {
    return "Rate limit exceeded. Please try again later.";
  }

  return getPayloadErrorMessage(payload, `Email upload failed with HTTP ${status}.`);
}

function getPayloadErrorMessage(payload, fallback) {
  if (payload && payload.error && payload.error.message) {
    return payload.error.message;
  }

  if (payload && payload.message) {
    return payload.message;
  }

  return fallback;
}
