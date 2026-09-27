import { createBrowserTrackerWorkflow, TrackerWorkflowState } from "./src/tracker-workflow/index.js";
import {
  initialReadProgress,
  nextReadProgressForSerialStatus,
  readButtonText,
  readWorkflowCard,
  statusMessageForSerialStatus,
  statusMessageForWorkflowStatus,
} from "./src/ui/read-workflow-view.js";
import { aprsLayoutSections } from "./src/ui/aprs-layout.js";
import { beaconingLayoutSections } from "./src/ui/beaconing-layout.js";
import { deviceLayoutSections } from "./src/ui/device-layout.js";
import { radioLayoutSections } from "./src/ui/radio-layout.js";
import { configChangeSummary } from "./src/ui/change-summary.js";
import { formatTrackerIdentity } from "./src/ui/tracker-identity.js";
import { hasRiskAcknowledgement, storeRiskAcknowledgement } from "./src/ui/risk-acknowledgement.js";
import { supportsWebSerial } from "./src/ui/browser-capabilities.js";
import { applyDigipeaterSelector, clearAdvancedRawPacket, formatFixedPositionPacket } from "./src/tracker-config/index.js";
import { applyTrackerTemplate, createTemplateRepository, createTrackerTemplate } from "./src/tracker-template/index.js";
import { templateTargetChanged } from "./src/tracker-template/preflight.js";
import { createTemplateHistoryRepository } from "./src/tracker-template/history.js";
import { generalHelpHtml } from "./src/ui/help-content.js";
import { APP_METADATA } from "./src/app-metadata.js";

const configureCategories = [
  { id: "aprs", label: "APRS", title: "APRS", subtitle: "Identity, symbol, paths and APRS network behavior." },
  { id: "beaconing", label: "Beaconing", title: "Beaconing", subtitle: "Position reporting, transmit cadence and Smart Beaconing." },
  { id: "radio", label: "Radio", title: "Radio", subtitle: "Frequency, RF power, audio and receiver settings." },
  { id: "device", label: "Device", title: "Device", subtitle: "Firmware, telemetry, logging, LEDs and device-specific options." },
];

const elements = {
  appVersions: document.querySelectorAll("[data-app-version]"),
  appNames: document.querySelectorAll("[data-app-name]"),
  workspaceButtons: document.querySelectorAll("[data-workspace]"),
  workspacePanels: document.querySelectorAll("[data-workspace-panel]"),
  categoryNav: document.querySelector("#category-nav"),
  categoryTitle: document.querySelector("#category-title"),
  categorySubtitle: document.querySelector("#category-subtitle"),
  categoryContent: document.querySelector("#category-content"),
  workflowCard: document.querySelector("#workflow-card"),
  workflowStep: document.querySelector("#workflow-step"),
  workflowTitle: document.querySelector("#workflow-title"),
  workflowMessage: document.querySelector("#workflow-message"),
  workflowProgress: document.querySelector("#workflow-progress"),
  workflowProgressBar: document.querySelector("#workflow-progress-bar"),
  trackerIdentity: document.querySelector("#tracker-identity"),
  connect: document.querySelector("#connect"),
  read: document.querySelector("#read"),
  write: document.querySelector("#write"),
  cancel: document.querySelector("#cancel"),
  discard: document.querySelector("#discard"),
  disconnect: document.querySelector("#disconnect"),
  changeSummary: document.querySelector("#change-summary"),
  changeList: document.querySelector("#change-list"),
  connectionDot: document.querySelector("#connection-dot"),
  connectionText: document.querySelector("#connection-text"),
  installApp: document.querySelector("#install-app"),
  appUpdate: document.querySelector("#app-update"),
  appUpdateReload: document.querySelector("#app-update-reload"),
  status: document.querySelector("#status"),
  debug: document.querySelector("#debug"),
  log: document.querySelector("#log"),
  riskDialog: document.querySelector("#risk-dialog"),
  riskConfirm: document.querySelector("#risk-confirm"),
  browserSupportWarning: document.querySelector("#browser-support-warning"),
  saveTemplate: document.querySelector("#save-template"),
  templateDialog: document.querySelector("#template-dialog"),
  templateName: document.querySelector("#template-name"),
  templateDescriptionInput: document.querySelector("#template-description-input"),
  templateKeepFields: document.querySelector("#template-keep-fields"),
  templateCancel: document.querySelector("#template-cancel"),
  templateConfirm: document.querySelector("#template-confirm"),
  templateSelect: document.querySelector("#template-select"),
  templateDescription: document.querySelector("#template-description"),
  templateSummary: document.querySelector("#template-summary"),
  templateRead: document.querySelector("#template-read"),
  templateWrite: document.querySelector("#template-write"),
  templateDelete: document.querySelector("#template-delete"),
  templateExport: document.querySelector("#template-export"),
  templateImport: document.querySelector("#template-import"),
  templateImportFile: document.querySelector("#template-import-file"),
  templateStatus: document.querySelector("#template-status"),
  templateContent: document.querySelector("#template-content"),
  templateProgramContent: document.querySelector("#template-program-content"),
  templateSettingsContent: document.querySelector("#template-settings-content"),
  templateTrackerIdentity: document.querySelector("#template-tracker-identity"),
  templateWorkflowCard: document.querySelector("#template-workflow-card"),
  templateWorkflowStep: document.querySelector("#template-workflow-step"),
  templateWorkflowTitle: document.querySelector("#template-workflow-title"),
  templateWorkflowMessage: document.querySelector("#template-workflow-message"),
  templateWorkflowProgress: document.querySelector("#template-workflow-progress"),
  templateWorkflowProgressBar: document.querySelector("#template-workflow-progress-bar"),
  templateDevices: document.querySelector("#template-devices"),
  templateDevicesEmpty: document.querySelector("#template-devices-empty"),
  templateProgramView: document.querySelector("#template-program-view"),
  templateManageView: document.querySelector("#template-manage-view"),
  templateManageContent: document.querySelector("#template-manage-content"),
  templateManageList: document.querySelector("#template-manage-list"),
  templateManageSelect: document.querySelector("#template-manage-select"),
  templateManageEditor: document.querySelector("#template-manage-editor"),
  templateManageName: document.querySelector("#template-manage-name"),
  templateManageDescription: document.querySelector("#template-manage-description"),
  templateManageKeepFields: document.querySelector("#template-manage-keep-fields"),
  templateManageSave: document.querySelector("#template-manage-save"),
  templateWorkspaceGrid: document.querySelector("#template-workspace-grid"),
  templateWorkflowColumn: document.querySelector("#template-workflow-column"),
  templateWorkflowPanel: document.querySelector("#template-workflow-panel"),
  templateDevicesPanel: document.querySelector("#template-devices-panel"),
  templateManageActions: document.querySelector("#template-manage-actions"),
  helpContent: document.querySelector("#help-content"),
  helpTocList: document.querySelector("#help-toc-list"),
};

let latestConfig = null;
let activeWorkspace = "configure";
let activeCategory = "aprs";
let readProgress = null;
let writeVerified = false;
let selectedTemplateId = "";
let templatePrepared = false;
let templateWrittenDevices = [];
let templateWriteVerified = false;
let templateView = "program";
let templateBaselineRaw = null;
let templateNeedsReview = false;
let templateTargetDto = null;
let templateOverrides = {};
let templateCandidateDto = null;
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;
let reloadingForServiceWorker = false;

const buildId = typeof __AP510_BUILD_ID__ === "undefined" ? "static" : __AP510_BUILD_ID__;
const displayBuildId = String(buildId).replace(/^v/, "");
document.title = APP_METADATA.name;
document.querySelector('meta[name="description"]')?.setAttribute("content", APP_METADATA.description);
elements.appNames.forEach((element) => { element.textContent = APP_METADATA.name; });
elements.appVersions.forEach((element) => {
  element.textContent = `Version: ${displayBuildId}`;
  element.title = `Build ${displayBuildId}`;
});

const mockTracker = new URLSearchParams(window.location.search).get("mockTracker");
const browserSupportsSerial = Boolean(mockTracker) || supportsWebSerial();
const workflow = createBrowserTrackerWorkflow({
  mockTracker: mockTracker || false,
  onEvent: handleWorkflowEvent,
});
const configSchema = workflow.getConfigSchema();
const templateRepository = createTemplateRepository(getLocalStorage(), undefined, { schema: configSchema });
const templateHistory = createTemplateHistoryRepository(getLocalStorage());

function showServiceWorkerUpdate(registration) {
  serviceWorkerRegistration = registration;
  elements.appUpdate.hidden = false;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const serviceWorkerUrl = new URL(`./sw.js?v=${encodeURIComponent(buildId)}`, document.baseURI);
  try {
    const response = await fetch(serviceWorkerUrl, { cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("javascript")) return;
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl);
    serviceWorkerRegistration = registration;
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showServiceWorkerUpdate(registration);
      });
    });
    if (registration.waiting && navigator.serviceWorker.controller) showServiceWorkerUpdate(registration);
  } catch {
    // The app remains fully usable when service workers are unavailable.
  }
}

registerServiceWorker();

elements.appUpdateReload.addEventListener("click", () => {
  const waiting = serviceWorkerRegistration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  reloadingForServiceWorker = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
});

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (reloadingForServiceWorker) window.location.reload();
});

navigator.serviceWorker?.addEventListener("message", (event) => {
  if (reloadingForServiceWorker && event.data?.type === "SKIP_WAITING_DONE") window.location.reload();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  elements.installApp.hidden = false;
});

elements.installApp.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  elements.installApp.hidden = true;
  await prompt.prompt();
  await prompt.userChoice;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  elements.installApp.hidden = true;
});

renderCategoryNav();
renderWorkspace();
renderControls();
renderConfig(null);
renderTemplates();
showRiskAcknowledgement();

elements.riskDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
});

elements.riskConfirm.addEventListener("click", () => {
  storeRiskAcknowledgement(getLocalStorage());
  elements.riskDialog.close();
});

elements.saveTemplate.addEventListener("click", () => {
  if (!workflow.draft) return;
  elements.templateName.value = "";
  elements.templateDescriptionInput.value = "";
  renderTemplateKeepFields();
  elements.templateDialog.showModal();
});
elements.templateCancel.addEventListener("click", () => elements.templateDialog.close());
elements.templateConfirm.addEventListener("click", () => {
  try {
    const keepPaths = [...elements.templateKeepFields.querySelectorAll("input:checked")].map((input) => input.dataset.path);
    const template = createTrackerTemplate({
      name: elements.templateName.value,
      description: elements.templateDescriptionInput.value,
      dto: workflow.draft,
      keepPaths,
      schema: configSchema,
    });
    templateRepository.save(template);
    selectedTemplateId = template.id;
    elements.templateDialog.close();
    renderTemplates();
    setStatus(`Template “${template.name}” saved`);
  } catch (error) {
    setStatus(error.message, "error");
  }
});
elements.templateSelect.addEventListener("change", () => {
  selectedTemplateId = elements.templateSelect.value;
  templatePrepared = false;
  templateWriteVerified = false;
  templateBaselineRaw = null;
  templateNeedsReview = false;
  templateTargetDto = workflow.originalConfig?.toDTO?.() ?? null;
  templateOverrides = {};
  templateCandidateDto = null;
  templateWrittenDevices = loadTemplateHistory(selectedTemplateId);
  prepareSelectedTemplate();
  renderTemplates();
});
elements.templateProgramView.addEventListener("click", () => {
  templateView = "program";
  renderTemplates();
});
elements.templateManageView.addEventListener("click", () => {
  templateView = "manage";
  renderTemplates();
});
elements.templateManageSelect.addEventListener("change", () => {
  selectedTemplateId = elements.templateManageSelect.value;
  templatePrepared = false;
  templateWriteVerified = false;
  templateBaselineRaw = null;
  templateNeedsReview = false;
  templateWrittenDevices = loadTemplateHistory(selectedTemplateId);
  renderTemplates();
});
elements.templateManageSave.addEventListener("click", () => {
  const existing = listTemplates().find((template) => template.id === selectedTemplateId);
  if (!existing) return;
  try {
    const keepPaths = [...elements.templateManageKeepFields.querySelectorAll("input:checked")].map((input) => input.dataset.path);
    const preservedLegacyKeepPaths = existing.keepPaths.filter((path) => configSchema.fields[path]?.templateKeepAllowed !== true);
    const updated = createTrackerTemplate({
      name: elements.templateManageName.value,
      description: elements.templateManageDescription.value,
      dto: applyTrackerTemplate({}, existing, { schema: configSchema }),
      keepPaths: [...new Set([...keepPaths, ...preservedLegacyKeepPaths])],
      schema: null,
    });
    updated.id = existing.id;
    updated.compatibility = structuredClone(existing.compatibility ?? { profile: null });
    templateRepository.save(updated);
    elements.templateStatus.textContent = "Template changes saved";
    renderTemplates();
  } catch (error) { elements.templateStatus.textContent = error.message; }
});
elements.templateManageName.addEventListener("input", updateManageSaveState);
elements.templateManageDescription.addEventListener("input", updateManageSaveState);
elements.templateManageKeepFields.addEventListener("change", updateManageSaveState);

elements.templateRead.addEventListener("click", async () => {
  await runUiAction(async () => {
    activeWorkspace = "program";
    renderWorkspace();
    templatePrepared = false;
    templateWriteVerified = false;
    templateCandidateDto = null;
    templateTargetDto = null;
    const config = await workflow.readTrackerConfig({ updateDraft: false });
    templateWriteVerified = false;
    templateBaselineRaw = workflow.originalConfig?.rawConfig ?? null;
    templateNeedsReview = false;
    templateTargetDto = config.toDTO();
    templateOverrides = {};
    prepareSelectedTemplate();
    renderTemplates();
  });
});
elements.templateWrite.addEventListener("click", async () => {
  await runUiAction(async () => {
    if (!templatePrepared) throw new Error("Read tracker before writing the template");
    const missing = getMissingTemplateFields();
    if (missing.length > 0) throw new Error(`Enter values for: ${missing.map((path) => configSchema.fields[path]?.label ?? path).join(", ")}`);
    const baseline = templateBaselineRaw;
    templatePrepared = false;
    templateWriteVerified = false;
    templateCandidateDto = null;
    templateTargetDto = null;
    templateOverrides = {};
    const config = await workflow.readTrackerConfig({ updateDraft: false });
    const current = config.rawConfig;
    templateTargetDto = config.toDTO();
    prepareSelectedTemplate();
    if (templateTargetChanged(baseline, current)) {
      templateBaselineRaw = current;
      templateWriteVerified = false;
      templatePrepared = false;
      templateNeedsReview = true;
      templateOverrides = {};
      templateCandidateDto = null;
      elements.templateStatus.textContent = "The tracker changed since the preview. Review the refreshed settings before writing.";
      renderTemplates();
      return;
    }
    latestConfig = await workflow.writeTrackerConfig({ draft: templateCandidateDto, updateDraft: false });
    templatePrepared = false;
    templateCandidateDto = null;
    templateWriteVerified = true;
    renderTemplates();
  });
});
elements.templateDelete.addEventListener("click", () => {
  if (!selectedTemplateId) return;
  const selected = listTemplates().find((template) => template.id === selectedTemplateId);
  if (selected && !window.confirm(`Delete template “${selected.name}”?`)) return;
  const deletedTemplateId = selectedTemplateId;
  templateRepository.remove(deletedTemplateId);
  selectedTemplateId = "";
  templatePrepared = false;
  templateWriteVerified = false;
  templateBaselineRaw = null;
  templateNeedsReview = false;
  templateTargetDto = null;
  templateOverrides = {};
  templateCandidateDto = null;
  try { templateHistory.clear(deletedTemplateId); } catch (error) { elements.templateStatus.textContent = error.message; }
  templateWrittenDevices = [];
  renderTemplates();
});
elements.templateExport.addEventListener("click", () => {
  try {
    const blob = new Blob([templateRepository.export()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ap510-templates.json";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) { elements.templateStatus.textContent = error.message; }
});
elements.templateImport.addEventListener("click", () => elements.templateImportFile.click());
elements.templateImportFile.addEventListener("change", async () => {
  const file = elements.templateImportFile.files?.[0];
  if (!file) return;
  try {
    templateRepository.import(await file.text());
    renderTemplates();
    elements.templateStatus.textContent = "Templates imported";
  } catch (error) { elements.templateStatus.textContent = error.message; }
  elements.templateImportFile.value = "";
});

elements.workspaceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeWorkspace = button.dataset.workspace;
    renderWorkspace();
  });
});

elements.connect.addEventListener("click", async () => {
  await runUiAction(async () => {
    await workflow.connect();
  });
});

elements.read.addEventListener("click", async () => {
  await runUiAction(async () => {
    readProgress = initialReadProgress();
    setStatus("Power on or power-cycle the tracker now. Waiting for setup response...");
    renderControls();
    latestConfig = await workflow.readTrackerConfig();
    renderConfig(latestConfig);
  });
});

elements.write.addEventListener("click", async () => {
  await runUiAction(async () => {
    latestConfig = await workflow.writeTrackerConfig();
    renderConfig(latestConfig);
  });
});

elements.cancel.addEventListener("click", () => {
  workflow.cancelOperation("Cancelled by user");
  renderControls();
});

elements.discard.addEventListener("click", () => {
  workflow.resetDraft();
  renderConfig(latestConfig);
  setStatus("Draft changes discarded");
  renderControls();
});

elements.disconnect.addEventListener("click", async () => {
  await runUiAction(async () => {
    await workflow.disconnect();
    latestConfig = null;
    renderConfig(null);
  });
});

function showRiskAcknowledgement() {
  if (!hasRiskAcknowledgement(getLocalStorage())) elements.riskDialog.showModal();
}

function getLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function handleDraftFieldChange(field, value) {
  if (!workflow.draft || !field.path) return;
  let nextDraft = setPathValue(workflow.draft, field.path, normalizeFieldValue(field, value, configSchema.fields[field.path]));
  if (field.path.startsWith("gps.virtual.")
    && field.path !== "gps.virtual.enabled"
    && field.path !== "gps.virtual.packet"
    && field.path !== "gps.virtual.advancedRawPacket") {
    nextDraft.gps.virtual = clearAdvancedRawPacket(nextDraft.gps.virtual);
  }
  if (field.path === "digipeater.selector") {
    nextDraft = applyDigipeaterSelector(nextDraft, value, configSchema);
  }
  const validation = workflow.updateDraft(nextDraft);
  if (validation.valid) {
    clearStatus();
  } else {
    setStatus(validation.errors[0].message, "error");
  }
  if (field.path.startsWith("gps.virtual.") && field.path !== "gps.virtual.packet") updateFixedPositionPreview();
  if (field.path === "digipeater.selector") renderConfig(latestConfig);
}

function updateFixedPositionPreview() {
  const preview = elements.categoryContent.querySelector('[data-field-path="gps.virtual.packet"] .field-control');
  if (preview) preview.value = formatFixedPositionPacket(workflow.draft?.gps?.virtual) ?? "";
}

function normalizeFieldValue(field, value, rule = null) {
  if (field.path === "paths.digipeaterPaths") {
    const path = String(value).trim();
    return path === "" ? [] : path.split(",").map((part) => part.trim());
  }
  if (field.control === "checkbox") return Boolean(value);
  if (field.inputType === "number") return value === "" ? null : Number(value);
  if (rule?.valueType === "number") return value === "" ? null : Number(value);
  if (rule?.valueType === "boolean") return value === "" ? null : value === "true";
  if (field.control === "select") return value === "" ? null : value === "0" ? 0 : value;
  return value;
}

function setPathValue(object, path, value) {
  const result = structuredClone(object);
  const parts = path.split(".");
  const last = parts.pop();
  let target = result;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== "object") target[part] = {};
    target = target[part];
  }
  target[last] = value;
  return result;
}

async function runUiAction(action) {
  try {
    renderControls();
    await action();
  } catch (error) {
    console.error("[AP510 workflow]", error);
    setStatus(error.message ?? String(error), "error");
    appendLog("error", error.message ?? String(error));
  } finally {
    renderControls();
  }
}

function handleWorkflowEvent(event) {
  if (event.type === "draft-changed" || event.type === "draft-reset") {
    writeVerified = false;
  } else if (event.type === "state") {
    appendLog("state", `${event.previous} -> ${event.state}`);
  } else if (event.type === "status") {
    setStatus(statusMessageForWorkflowStatus(event));
    appendLog("status", `${event.phase}: ${event.message}`);
  } else if (event.type === "operation-started") {
    writeVerified = false;
    if (event.operation === "read-config") {
      readProgress = initialReadProgress();
      setStatus("Click Cancel if needed. Power on or power-cycle the tracker while setup probes are running.");
    }
    appendLog("operation", `${event.operation} started`);
  } else if (event.type === "operation-completed") {
    if (event.operation === "read-config") readProgress = null;
    appendLog("operation", `${event.operation} completed`);
  } else if (event.type === "operation-failed") {
    if (event.operation === "read-config") readProgress = null;
    setStatus(event.error.message ?? String(event.error), "error");
    appendLog("error", `${event.operation}: ${event.error.message ?? String(event.error)}`);
  } else if (event.type === "raw-config-read") {
    appendLog("workflow", `read ${event.rawBytes.length} raw bytes`);
  } else if (event.type === "config-loaded") {
    writeVerified = false;
    readProgress = null;
    setStatus("Tracker configuration loaded");
    appendLog("workflow", "configuration parsed and validated");
  } else if (event.type === "config-written") {
    writeVerified = true;
    latestConfig = event.config;
    if (activeWorkspace === "program" && templatePrepared) {
      const identity = event.config.toDTO?.()?.identity;
      if (identity?.display) {
        recordTemplateDevice(identity.display);
      }
      elements.templateStatus.textContent = "Template written and verified. Ready to read again.";
    } else {
      setStatus("Configuration written and verified");
    }
    appendLog("workflow", "configuration upload and read-back verification completed");
  } else if (event.type === "serial") {
    handleSerialEvent(event.event);
  }

  renderControls();
}

function handleSerialEvent(event) {
  if (event.type === "status") {
    readProgress = nextReadProgressForSerialStatus(event) ?? readProgress;
    setStatus(statusMessageForSerialStatus(event, readProgress));
    appendLog("serial", `${event.phase}: ${event.message}`);
  } else if (event.type === "progress") {
    appendLog("serial", `${event.phase}: ${event.bytesReceived} bytes`);
  } else if (event.type === "tx") {
    appendLog("tx", `${event.label}  ${hex(event.bytes)}`);
  } else if (event.type === "rx") {
    appendLog("rx", hex(event.bytes));
  }
}

function renderWorkspace() {
  elements.workspaceButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.workspace === activeWorkspace);
    button.setAttribute("aria-selected", String(button.dataset.workspace === activeWorkspace));
  });
  elements.workspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.workspacePanel !== activeWorkspace;
  });
  renderHelp();
  renderTemplates();
}

function renderHelp() {
  if (!elements.helpContent || !elements.helpTocList) return;
  elements.helpContent.innerHTML = "";
  elements.helpTocList.innerHTML = "";

  const template = document.createElement("template");
  template.innerHTML = generalHelpHtml.replaceAll("__AP510_APP_NAME__", APP_METADATA.name);
  const content = template.content.cloneNode(true);
  const fieldDocumentation = content.querySelector("#field-documentation");
  if (!fieldDocumentation) return;

  const categoryLayouts = [
    ["APRS", aprsLayoutSections({}, { blankEmpty: true, schema: configSchema })],
    ["Beaconing", beaconingLayoutSections({}, { blankEmpty: true, schema: configSchema })],
    ["Radio", radioLayoutSections({}, { blankEmpty: true, schema: configSchema })],
    ["Device", deviceLayoutSections({}, { blankEmpty: true, schema: configSchema })],
  ];

  const fieldEntriesByCategory = [];

  for (const [category, sections] of categoryLayouts) {
    const entries = sections.flatMap((section) => section.fields)
      .filter((field, index, fields) => field.path && fields.findIndex((candidate) => candidate.path === field.path) === index)
      .map((field) => ({ field, rule: configSchema.fields[field.path] }))
      .filter(({ rule }) => rule);
    if (entries.length === 0) continue;
    fieldEntriesByCategory.push({ category, entries });
  }

  for (const { category, entries } of fieldEntriesByCategory) {
    const categoryHeading = document.createElement("h3");
    categoryHeading.className = "help-field-category";
    categoryHeading.textContent = category;
    categoryHeading.id = `help-field-${category.toLowerCase()}`;
    fieldDocumentation.append(categoryHeading);

    for (const { field, rule } of entries) {
      const entry = document.createElement("article");
      entry.className = "help-entry";
      entry.id = `help-field-${field.path.replaceAll(".", "-")}`;
      const title = document.createElement("h4");
      const fieldLabel = rule.label ?? field.label;
      const help = rule.help;
      title.textContent = help?.summary ? `${fieldLabel}: ${help.summary}` : fieldLabel;
      entry.append(title);

      if (!help?.summary) {
        const shortDescription = document.createElement("p");
        shortDescription.className = "subtle";
        shortDescription.textContent = "A description for this field has not been added yet.";
        entry.append(shortDescription);
      }

      if (help?.details) {
        const detailsText = document.createElement("p");
        detailsText.textContent = help.details;
        entry.append(detailsText);
        if (help.table) entry.append(helpTable(help.table));
      }
      fieldDocumentation.append(entry);
    }
  }

  elements.helpContent.append(content);
  for (const section of elements.helpContent.querySelectorAll(":scope > section")) {
    const heading = section.querySelector(":scope > h2");
    if (!heading) continue;

    const tocItem = document.createElement("li");
    const tocLink = document.createElement("a");
    tocLink.href = `#${section.id}`;
    tocLink.textContent = heading.textContent;
    tocItem.append(tocLink);

    if (section.id === "field-documentation") {
      const categories = section.querySelectorAll(":scope > h3");
      if (categories.length > 0) {
        const categoryList = document.createElement("ol");
        for (const category of categories) {
          const categoryItem = document.createElement("li");
          const categoryLink = document.createElement("a");
          categoryLink.href = `#${category.id}`;
          categoryLink.textContent = category.textContent;
          categoryItem.append(categoryLink);
          categoryList.append(categoryItem);
        }
        tocItem.append(categoryList);
      }
    }
    elements.helpTocList.append(tocItem);
  }
}

function helpTable(tableDefinition) {
  const table = document.createElement("table");
  table.className = "help-table";
  if (tableDefinition.caption) {
    const caption = document.createElement("caption");
    caption.textContent = tableDefinition.caption;
    table.append(caption);
  }

  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const heading of tableDefinition.headers ?? []) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    headerRow.append(cell);
  }
  head.append(headerRow);
  table.append(head);

  const body = document.createElement("tbody");
  for (const row of tableDefinition.rows ?? []) {
    const rowElement = document.createElement("tr");
    for (const value of row) {
      const cell = document.createElement("td");
      cell.textContent = value;
      rowElement.append(cell);
    }
    body.append(rowElement);
  }
  table.append(body);

  return table;
}

function listTemplates() {
  try { return templateRepository.list(); } catch (error) { elements.templateStatus.textContent = error.message; return []; }
}

function loadTemplateHistory(templateId) {
  if (!templateId) return [];
  try { return templateHistory.list(templateId); }
  catch (error) { elements.templateStatus.textContent = error.message; return []; }
}

function recordTemplateDevice(display) {
  const entry = { display, time: new Date().toLocaleTimeString(), result: "verified" };
  try {
    templateHistory.add(selectedTemplateId, entry);
    templateWrittenDevices = loadTemplateHistory(selectedTemplateId);
  } catch (error) {
    templateWrittenDevices = [...templateWrittenDevices, entry];
    elements.templateStatus.textContent = `Template verified; device history could not be saved: ${error.message}`;
  }
}

function selectedTemplate() {
  return listTemplates().find((template) => template.id === selectedTemplateId) ?? null;
}

function renderTemplates() {
  if (!elements.templateSelect) return;
  const templates = listTemplates();
  const managing = templateView === "manage";
  elements.templateProgramContent.hidden = managing;
  elements.templateManageContent.hidden = !managing;
  elements.templateWorkflowPanel.hidden = managing;
  elements.templateDevicesPanel.hidden = managing;
  elements.templateManageActions.hidden = !managing;
  elements.templateProgramView.classList.toggle("active", !managing);
  elements.templateManageView.classList.toggle("active", managing);
  renderManagedTemplates(templates);
  if (selectedTemplateId && !templates.some((template) => template.id === selectedTemplateId)) selectedTemplateId = "";
  elements.templateSelect.replaceChildren(new Option("Choose a template", ""));
  for (const template of templates) elements.templateSelect.append(new Option(template.name, template.id));
  elements.templateSelect.value = selectedTemplateId;
  const connected = [TrackerWorkflowState.CONNECTED, TrackerWorkflowState.LOADED, TrackerWorkflowState.ERROR].includes(workflow.state);
  elements.templateRead.disabled = Boolean(workflow.currentOperation) || !connected || !selectedTemplateId || !browserSupportsSerial;
  const template = templates.find((item) => item.id === selectedTemplateId);
  elements.templateDescription.textContent = template
    ? `Description: ${template.description || "—"}`
    : "Create a template from Configure after reading a tracker.";
  elements.templateDelete.disabled = !template;
  const missingTemplateFields = getMissingTemplateFields();
  const templateDirty = templateCandidateDirty();
  elements.templateWrite.disabled = templateNeedsReview || missingTemplateFields.length > 0 || !templatePrepared || !templateDirty || Boolean(workflow.currentOperation);
  elements.templateSummary.textContent = "";
  elements.templateSummary.hidden = true;
  if (templatePrepared && !templateWriteVerified && !templateNeedsReview) {
    elements.templateStatus.textContent = missingTemplateFields.length > 0
      ? `Enter values for: ${missingTemplateFields.map((path) => configSchema.fields[path]?.label ?? path).join(", ")}.`
      : templateDirty ? "Ready to write template." : "Tracker already matches this template.";
  }
  renderTemplateContent(template);
  renderTemplateDevices();
  renderTemplateWorkflowCard();
}

function renderManagedTemplates(templates) {
  elements.templateManageSelect.replaceChildren(new Option("Choose a template", ""));
  for (const template of templates) elements.templateManageSelect.append(new Option(template.name, template.id));
  elements.templateManageSelect.value = selectedTemplateId;
  elements.templateManageList.replaceChildren();
  const selected = templates.find((template) => template.id === selectedTemplateId) ?? null;
  elements.templateManageEditor.hidden = !selected;
  if (selected) {
    elements.templateManageName.value = selected.name;
    elements.templateManageDescription.value = selected.description ?? "";
    renderManageKeepFields(selected);
  }
  updateManageSaveState();
  if (templates.length === 0) {
    return;
  }
}

function renderManageKeepFields(template) {
  elements.templateManageKeepFields.replaceChildren();
  const source = applyTrackerTemplate({}, template, { schema: configSchema });
  const paths = [...new Set([
    ...Object.keys(template.values),
    ...Object.keys(configSchema.fields).filter((path) => configSchema.fields[path].templateKeepAllowed === true),
    ...template.keepPaths,
  ])].filter((path) => configSchema.fields[path] && (getPath(source, path) !== undefined || template.keepPaths.includes(path)))
    .sort((left, right) => {
      const leftAllowed = configSchema.fields[left].templateKeepAllowed === true ? 0 : 1;
      const rightAllowed = configSchema.fields[right].templateKeepAllowed === true ? 0 : 1;
      return leftAllowed - rightAllowed || (configSchema.fields[left].label ?? left).localeCompare(configSchema.fields[right].label ?? right);
    });
  const table = document.createElement("table");
  table.className = "change-list";
  table.innerHTML = "<thead><tr><th scope=\"col\">Setting</th><th scope=\"col\">Template value</th><th scope=\"col\">Keep from tracker</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const path of paths) {
    const row = document.createElement("tr");
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = configSchema.fields[path].label ?? path;
    const value = document.createElement("td");
    value.textContent = formatTemplateValue(getPath(source, path));
    const choice = document.createElement("td");
    const input = document.createElement("input");
    if (configSchema.fields[path].templateKeepAllowed === true) {
      input.type = "checkbox";
      input.dataset.path = path;
      input.checked = template.keepPaths.includes(path);
      choice.append(input);
    } else {
      choice.textContent = "—";
    }
    row.append(label, value, choice);
    body.append(row);
  }
  table.append(body);
  elements.templateManageKeepFields.append(table);
}

function updateManageSaveState() {
  const existing = listTemplates().find((template) => template.id === selectedTemplateId);
  if (!existing) {
    elements.templateManageSave.disabled = true;
    return;
  }
  const keepPaths = [...elements.templateManageKeepFields.querySelectorAll("input:checked")].map((input) => input.dataset.path).sort();
  const originalKeepPaths = existing.keepPaths.filter((path) => configSchema.fields[path]?.templateKeepAllowed === true).sort();
  elements.templateManageSave.disabled = elements.templateManageName.value.trim() === existing.name
    && elements.templateManageDescription.value === (existing.description ?? "")
    && JSON.stringify(keepPaths) === JSON.stringify(originalKeepPaths);
}

function renderTemplateContent(template) {
  if (!elements.templateContent) return;
  elements.templateSettingsContent.replaceChildren();
  if (!template) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.innerHTML = "<h3>No template selected</h3><p>Choose a template on the right to review its settings.</p>";
    elements.templateSettingsContent.append(empty);
    return;
  }
  const dto = templateCandidateDto ?? (workflow.draft ? applyTrackerTemplate(workflow.draft, template, { schema: configSchema }) : applyTrackerTemplate({}, template, { schema: configSchema }));
  const currentDto = workflow.originalConfig?.toDTO?.() ?? null;
  const paths = [...new Set([...Object.keys(template.values), ...template.keepPaths])].sort((left, right) => {
    const leftKeep = template.keepPaths.includes(left) ? 0 : 1;
    const rightKeep = template.keepPaths.includes(right) ? 0 : 1;
    return leftKeep - rightKeep || (configSchema.fields[left]?.label ?? left).localeCompare(configSchema.fields[right]?.label ?? right);
  });
  const section = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = "Template settings";
  section.append(heading);
  const table = document.createElement("table");
  table.className = "change-list";
  table.innerHTML = "<thead><tr><th scope=\"col\">Setting</th><th scope=\"col\">Template value</th><th scope=\"col\">Current / edited value</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const path of paths) {
    const row = document.createElement("tr");
    const label = configSchema.fields[path]?.label ?? path;
    const value = getPath(dto, path);
    const currentValue = getPath(currentDto, path);
    if (!template.keepPaths.includes(path) && JSON.stringify(value) !== JSON.stringify(currentValue)) row.classList.add("will-change");
    const editableKeptValue = Boolean(currentDto) && template.keepPaths.includes(path);
    if (editableKeptValue && templateOverrides[path] !== undefined && JSON.stringify(templateOverrides[path]) !== JSON.stringify(currentValue)) row.classList.add("will-change");
    const missingKeptValue = editableKeptValue && (currentValue === null || currentValue === undefined || currentValue === "") && templateOverrides[path] === undefined;
    if (missingKeptValue) row.classList.add("missing-value");
    row.innerHTML = "<th scope=\"row\"></th><td></td><td></td>";
    const labelCell = row.querySelector("th");
    labelCell.textContent = label;
    if (template.keepPaths.includes(path)) {
      const badge = document.createElement("span");
      badge.className = "keep-badge";
      badge.textContent = "Keep";
      labelCell.append(badge);
    }
    row.querySelector("td:nth-child(2)").textContent = formatTemplateValue(value);
    const currentCell = row.querySelector("td:nth-child(3)");
    if (editableKeptValue) {
      currentCell.textContent = missingKeptValue ? "Missing — enter value: " : "";
      const rule = configSchema.fields[path];
      const control = rule.type === "select" ? document.createElement("select") : document.createElement("input");
      control.className = "field-control";
      if (rule.type === "select") {
        for (const option of rule.options ?? []) control.append(new Option(option.label, option.value));
        control.value = templateOverrides[path] ?? (currentValue === null || currentValue === undefined ? "" : String(currentValue));
      } else {
        control.type = rule.type === "number" ? "number" : "text";
        control.value = templateOverrides[path] ?? (currentValue === null || currentValue === undefined ? "" : String(currentValue));
      }
      if (rule.min !== undefined) control.min = String(rule.min);
      if (rule.max !== undefined) control.max = String(rule.max);
      if (rule.step !== undefined) control.step = String(rule.step);
      if (rule.maxLength !== undefined) control.maxLength = rule.maxLength;
      control.setAttribute("aria-label", `${rule.label ?? path} for this tracker`);
      control.addEventListener("change", () => handleTemplateOverride(path, control.value, rule));
      currentCell.append(control);
    } else {
      currentCell.textContent = formatTemplateValue(currentValue);
    }
    body.append(row);
  }
  table.append(body);
  section.append(table);
  elements.templateSettingsContent.append(section);
}

function formatTemplateValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== "").join(", ") || "—";
  if (typeof value === "object") return Object.values(value).filter((item) => item !== null && item !== undefined && item !== "").join(" / ") || "—";
  return String(value);
}

function renderTemplateDevices() {
  if (!elements.templateDevices) return;
  elements.templateDevices.replaceChildren();
  elements.templateDevicesEmpty.hidden = templateWrittenDevices.length > 0;
  for (const device of templateWrittenDevices) {
    const item = document.createElement("li");
    item.textContent = `${device.display} — Verified at ${device.time}`;
    elements.templateDevices.append(item);
  }
}

function renderTemplateWorkflowCard() {
  if (!elements.templateWorkflowCard) return;
  const card = readWorkflowCard({
    state: workflow.state,
    operationName: workflow.currentOperation?.name,
    readProgress,
    hasConfig: Boolean(latestConfig),
    errorMessage: workflow.lastError?.message ?? null,
    writeVerified: activeWorkspace === "program" && templateWriteVerified,
    templateMode: true,
  });
  elements.templateWorkflowCard.dataset.tone = card.tone;
  elements.templateWorkflowStep.textContent = card.step;
  elements.templateWorkflowTitle.textContent = card.title;
  elements.templateWorkflowMessage.textContent = card.message;
  if (card.progress === null) {
    elements.templateWorkflowProgress.hidden = true;
    elements.templateWorkflowProgressBar.style.width = "0%";
    elements.templateWorkflowProgressBar.setAttribute("aria-valuenow", "0");
  } else {
    elements.templateWorkflowProgress.hidden = false;
    elements.templateWorkflowProgressBar.style.width = `${card.progress}%`;
    elements.templateWorkflowProgressBar.setAttribute("aria-valuenow", String(card.progress));
  }
  const identity = workflow.originalConfig?.toDTO?.()?.identity ?? latestConfig?.identity ?? null;
  const display = formatTrackerIdentity(identity);
  elements.templateTrackerIdentity.textContent = display ?? "";
  elements.templateTrackerIdentity.hidden = display === null;
}

function renderTemplateKeepFields() {
  elements.templateKeepFields.replaceChildren();
  const paths = Object.keys(configSchema.fields).filter((path) => configSchema.fields[path].templateKeepAllowed === true && getPath(workflow.draft, path) !== undefined);
  for (const path of paths) {
    const label = document.createElement("label");
    label.className = "checkbox-field";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.path = path;
    input.checked = path === "identity.callsign" || path === "identity.ssid";
    label.append(input, document.createTextNode(configSchema.fields[path].label ?? path));
    elements.templateKeepFields.append(label);
  }
}

function getPath(object, path) {
  return path.split(".").reduce((value, part) => value?.[part], object);
}

function prepareSelectedTemplate() {
  const template = selectedTemplate();
  if (!template || (!workflow.draft && !templateTargetDto)) { templatePrepared = false; templateCandidateDto = null; return; }
  const target = templateTargetDto ?? workflow.draft;
  const merged = applyTrackerTemplate(target, template, { schema: configSchema });
  for (const [path, value] of Object.entries(templateOverrides)) setPathValueInPlace(merged, path, value);
  templateCandidateDto = merged;
  templatePrepared = true;
}

function getMissingTemplateFields() {
  const template = selectedTemplate();
  if (!template || !templateTargetDto) return [];
  return template.keepPaths.filter((path) => getPath(templateTargetDto, path) === null || getPath(templateTargetDto, path) === undefined || getPath(templateTargetDto, path) === "")
    .filter((path) => templateOverrides[path] === undefined || templateOverrides[path] === null || templateOverrides[path] === "");
}

function templateCandidateDirty() {
  if (!templateTargetDto || !templateCandidateDto) return false;
  return JSON.stringify(templateTargetDto) !== JSON.stringify(templateCandidateDto);
}

function setPathValueInPlace(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  for (const part of parts) { target[part] ??= {}; target = target[part]; }
  target[last] = value;
}

function handleTemplateOverride(path, value, rule) {
  templateOverrides[path] = normalizeTemplateOverrideValue(value, rule);
  prepareSelectedTemplate();
  renderTemplates();
}

function normalizeTemplateOverrideValue(value, rule) {
  if (rule?.valueType === "number" || rule?.type === "number") return value === "" ? null : Number(value);
  if (rule?.valueType === "boolean") return value === "" ? null : value === "true";
  return value;
}

function renderCategoryNav() {
  elements.categoryNav.innerHTML = "";
  for (const category of configureCategories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "side-nav-item";
    button.textContent = category.label;
    button.dataset.category = category.id;
    button.addEventListener("click", () => {
      activeCategory = category.id;
      renderConfig(latestConfig);
      renderChangeSummary();
    });
    elements.categoryNav.append(button);
  }
}

function renderControls() {
  const state = workflow.state;
  const busy = Boolean(workflow.currentOperation);
  const connected = [TrackerWorkflowState.CONNECTED, TrackerWorkflowState.LOADED, TrackerWorkflowState.ERROR].includes(state);
  const loaded = state === TrackerWorkflowState.LOADED;

  elements.connect.disabled = busy || state !== TrackerWorkflowState.DISCONNECTED || !browserSupportsSerial;
  elements.read.disabled = busy || !connected || !browserSupportsSerial;
  elements.write.disabled = busy || state !== TrackerWorkflowState.LOADED || !workflow.draftDirty || !browserSupportsSerial;
  elements.read.textContent = readButtonText({
    state,
    operationName: workflow.currentOperation?.name,
    readProgress,
  });
  elements.cancel.disabled = !workflow.canCancel;
  elements.discard.disabled = busy || !workflow.draftDirty;
  elements.saveTemplate.disabled = busy || !loaded;
  elements.templateRead.disabled = busy || !connected || !selectedTemplateId || !browserSupportsSerial;
  elements.disconnect.disabled = busy || state === TrackerWorkflowState.DISCONNECTED;
  elements.connectionDot.dataset.connected = String(connected || loaded);
  elements.connectionText.textContent = connected || loaded ? `${mockTracker ? "Mock AP510" : "AP510"} (${state})` : "No tracker connected";
  elements.browserSupportWarning.hidden = browserSupportsSerial;
  renderTrackerIdentity();
  renderWorkflowCard();
  renderChangeSummary();
  renderTemplates();
  if (state === TrackerWorkflowState.DISCONNECTED && !latestConfig) elements.status.textContent = "";
}

function renderTrackerIdentity() {
  const identity = workflow.originalConfig?.toDTO?.()?.identity ?? latestConfig?.identity ?? null;
  const display = formatTrackerIdentity(identity);
  elements.trackerIdentity.textContent = display ?? "";
  elements.trackerIdentity.hidden = display === null;
}

function renderChangeSummary() {
  const before = workflow.originalConfig?.toDTO() ?? null;
  const changes = configChangeSummary(configSchema, before, workflow.draft);
  elements.changeList.replaceChildren();
  elements.changeSummary.hidden = changes.length === 0;

  for (const change of changes) {
    const row = document.createElement("tr");
    row.innerHTML = `<th scope="row"></th><td></td><td></td>`;
    row.querySelector("th").textContent = change.label;
    row.querySelector("td:nth-child(2)").textContent = change.before;
    row.querySelector("td:nth-child(3)").textContent = change.after;
    elements.changeList.append(row);
  }
}

function renderWorkflowCard() {
  const card = readWorkflowCard({
    state: workflow.state,
    operationName: workflow.currentOperation?.name,
    readProgress,
    hasConfig: Boolean(latestConfig),
    errorMessage: workflow.lastError?.message ?? null,
    writeVerified,
  });

  elements.workflowCard.dataset.tone = card.tone;
  elements.workflowStep.textContent = card.step;
  elements.workflowTitle.textContent = card.title;
  elements.workflowMessage.textContent = card.message;

  if (card.progress === null) {
    elements.workflowProgress.hidden = true;
    elements.workflowProgressBar.style.width = "0%";
    elements.workflowProgressBar.setAttribute("aria-valuenow", "0");
  } else {
    elements.workflowProgress.hidden = false;
    elements.workflowProgressBar.style.width = `${card.progress}%`;
    elements.workflowProgressBar.setAttribute("aria-valuenow", String(card.progress));
  }
}

function renderConfig(config) {
  const dto = workflow.draft ?? config?.toDTO() ?? null;
  const category = configureCategories.find((item) => item.id === activeCategory) ?? configureCategories[0];
  const editable = Boolean(dto);
  elements.categoryTitle.textContent = category.title;
  elements.categorySubtitle.textContent = category.subtitle;

  elements.categoryNav.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === activeCategory);
  });

  elements.categoryContent.innerHTML = "";
  if (!dto) {
    if (activeCategory === "aprs") {
      elements.categoryContent.append(formLayout(aprsLayoutSections({}, { blankEmpty: true, schema: configSchema }), { disabled: true, schema: configSchema }));
    } else if (activeCategory === "beaconing") {
      elements.categoryContent.append(formLayout(beaconingLayoutSections({}, { blankEmpty: true, schema: configSchema }), { disabled: true, schema: configSchema }));
    } else if (activeCategory === "radio") {
      elements.categoryContent.append(formLayout(radioLayoutSections({}, { blankEmpty: true, schema: configSchema }), { disabled: true, schema: configSchema }));
    } else if (activeCategory === "device") {
      elements.categoryContent.append(formLayout(deviceLayoutSections({}, { blankEmpty: true, schema: configSchema }), { disabled: true, schema: configSchema }));
    } else {
      elements.categoryContent.append(emptyState());
    }
    elements.debug.textContent = "";
    return;
  }

  if (activeCategory === "aprs") {
    elements.categoryContent.append(formLayout(aprsLayoutSections(dto, { schema: configSchema }), { disabled: !editable, schema: configSchema, onChange: handleDraftFieldChange }));
  } else if (activeCategory === "beaconing") {
    elements.categoryContent.append(formLayout(beaconingLayoutSections(dto, { schema: configSchema }), { schema: configSchema, onChange: handleDraftFieldChange }));
  } else if (activeCategory === "radio") {
    elements.categoryContent.append(formLayout(radioLayoutSections(dto, { schema: configSchema }), { schema: configSchema, onChange: handleDraftFieldChange }));
  } else if (activeCategory === "device") {
    elements.categoryContent.append(formLayout(deviceLayoutSections(dto, { schema: configSchema }), { schema: configSchema, onChange: handleDraftFieldChange }));
  } else {
    elements.categoryContent.append(emptyState());
  }
  elements.debug.textContent = JSON.stringify(config.toDebugJSON(), null, 2);
}

function formLayout(sections, { disabled = false, schema = null, onChange = null } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-layout";

  for (const section of sections) {
    const sectionElement = document.createElement("section");
    sectionElement.className = "form-section";
    sectionElement.style.setProperty("--field-columns", String(section.columns));

    const heading = document.createElement("h3");
    heading.textContent = section.title;
    sectionElement.append(heading);

    if (section.description) {
      const description = document.createElement("p");
      description.className = "form-section-description";
      if (section.descriptionTone) description.classList.add(`is-${section.descriptionTone}`);
      description.textContent = section.description;
      sectionElement.append(description);
    }

    const fields = document.createElement("div");
    fields.className = "field-grid";
    for (const field of section.fields) {
      fields.append(readonlyField(field, { disabled, rule: schema?.fields?.[field.path], onChange }));
    }
    sectionElement.append(fields);
    wrapper.append(sectionElement);
  }

  return wrapper;
}

function readonlyField(field, { disabled = false, rule = null, onChange = null } = {}) {
  const label = document.createElement("label");
  label.className = field.control === "checkbox" ? "field checkbox-field" : "field";
  if (field.path) label.dataset.fieldPath = field.path;
  if (field.width === "compact") label.classList.add("field-compact");

  const helpSummary = rule?.help?.summary;
  if (helpSummary) {
    label.title = helpSummary;
  }

  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = field.label;

  const value = field.control === "select" ? document.createElement("select") : document.createElement("input");
  value.className = "field-control";
  value.setAttribute("aria-readonly", "true");
  if (helpSummary) value.title = helpSummary;

  if (field.control === "checkbox") {
    value.type = "checkbox";
    value.className = "checkbox-control";
    value.checked = field.checked;
    value.indeterminate = field.indeterminate;
    value.disabled = disabled || field.disabled || !field.path || !rule;
    label.append(value, caption);
    if (!value.disabled && onChange) value.addEventListener("change", () => onChange(field, value.checked));
    return label;
  }

  if (field.control === "select") {
    const schemaOptions = rule?.options ?? field.options;
    const hasBlankOption = field.options.some((option) => option.value === "");
    const options = hasBlankOption && schemaOptions[0]?.value !== "" ? [{ value: "", label: "" }, ...schemaOptions] : schemaOptions;
    for (const option of options) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      value.append(optionElement);
    }
    value.value = field.empty ? "" : field.value === "none" ? "0" : field.value;
    value.disabled = disabled || field.disabled || !field.path || !rule;
  } else {
    value.type = field.inputType ?? "text";
    value.value = field.empty ? "" : field.value;
    if (field.placeholder) value.placeholder = field.placeholder;
    value.readOnly = disabled || field.disabled || !field.path || !rule;
    value.disabled = disabled || field.disabled;
  }

  if (rule?.min !== undefined) value.min = String(rule.min);
  if (rule?.max !== undefined) value.max = String(rule.max);
  if (rule?.step !== undefined) value.step = String(rule.step);
  if (rule?.maxLength !== undefined) value.maxLength = rule.maxLength;
  if (rule?.pattern) value.pattern = rule.pattern;

  if (!value.disabled && !value.readOnly && onChange) {
    value.addEventListener("input", () => onChange(field, value.value));
  } else if (!value.disabled && onChange) {
    value.addEventListener("change", () => onChange(field, value.value));
  }

  if (field.unit) {
    const inputWithUnit = document.createElement("span");
    inputWithUnit.className = "field-control-with-unit";
    const unit = document.createElement("span");
    unit.className = "field-unit";
    unit.textContent = field.unit;
    inputWithUnit.append(value, unit);
    label.append(caption, inputWithUnit);
  } else {
    label.append(caption, value);
  }
  if (rule?.validationMessage) {
    const error = document.createElement("span");
    error.className = "field-error";
    error.textContent = rule.validationMessage;
    const updateValidity = () => {
      const invalid = !value.disabled && !value.validity.valid;
      value.setAttribute("aria-invalid", String(invalid));
      error.hidden = !invalid;
    };
    value.addEventListener("input", updateValidity);
    updateValidity();
    label.append(error);
  }
  return label;
}

function emptyState() {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  wrapper.innerHTML = `
    <h3>No configuration loaded</h3>
    <p>Connect to the tracker first. Then click Read and power on or power-cycle the tracker while the setup probes are running.</p>
  `;
  return wrapper;
}

function setStatus(message, tone = "neutral") {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function clearStatus() {
  elements.status.textContent = "";
  elements.status.dataset.tone = "neutral";
}

function appendLog(kind, message) {
  const timestamp = new Date().toLocaleTimeString();
  elements.log.textContent += `[${timestamp}] ${kind}: ${message}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
