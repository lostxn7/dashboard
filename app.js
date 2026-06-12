import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  onSnapshot,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA63S6kCkfk8cou_plj-rJ0Hb71XP7gNHo",
  authDomain: "dashboard-ec697.firebaseapp.com",
  projectId: "dashboard-ec697",
  storageBucket: "dashboard-ec697.firebasestorage.app",
  messagingSenderId: "929917316857",
  appId: "1:929917316857:web:4cfc94270c4ca17c54bc28"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percent = (value) => `${Number(value || 0).toFixed(1)}%`;

const todayISO = () => new Date().toISOString().slice(0, 10);

let transactions = [];
let stock = [];
let notes = [];
let settings = {
  name: "JH Store",
  goal: 5000,
  grid: true,
  gridOpacity: 18
};

let mainChart = null;
let investmentChart = null;
let unsubscribers = [];
let saving = false;
let stockPage = 1;
let stockSort = { key: "createdAt", direction: "desc" };
let lastStockRows = [];

const STOCK_PAGE_SIZE = 8;

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  setupNavigation();
  setupFilters();
  setupModals();
  setupForms();
  setupStockControls();
  setupFinanceControls();
  setupCalculator();
  setupSettingsTabs();
  listenAuth();
});

function setupLogin() {
  $("#google-login").addEventListener("click", async () => {
    $("#login-status").textContent = "Abrindo login...";

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      $("#login-status").textContent = "Erro ao entrar. Confira o Firebase.";
    }
  });

  $("#logout-btn").addEventListener("click", async () => {
    await signOut(auth);
  });
}

function listenAuth() {
  onAuthStateChanged(auth, async (user) => {
    stopListeners();

    if (!user) {
      showLogin("Somente emails permitidos podem acessar.");
      return;
    }

    const allowed = await isAllowedUser(user.email);

    if (!allowed) {
      await signOut(auth);
      showLogin(`Acesso negado para ${user.email}.`);
      return;
    }

    $("#user-email").textContent = user.email;
    showApp();
    await ensureDefaultSettings();
    startFirestoreListeners();
  });
}

async function isAllowedUser(email) {
  if (!email) return false;
  const allowedDoc = await getDoc(doc(db, "allowedUsers", email));
  return allowedDoc.exists();
}

function showLogin(message) {
  $("#app-shell").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  $("#login-status").textContent = message;
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
}

async function ensureDefaultSettings() {
  const settingsRef = doc(db, "settings", "main");
  const snap = await getDoc(settingsRef);

  if (!snap.exists()) {
    await setDoc(settingsRef, {
      name: "JH Store",
      goal: 5000,
      grid: true,
      gridOpacity: 18,
      updatedAt: serverTimestamp()
    });
  }
}

function startFirestoreListeners() {
  const transactionsQuery = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
  const stockQuery = query(collection(db, "stock"), orderBy("createdAt", "desc"));
  const notesQuery = query(collection(db, "notes"), orderBy("createdAt", "desc"));

  unsubscribers.push(onSnapshot(transactionsQuery, (snapshot) => {
    transactions = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderAll();
  }));

  unsubscribers.push(onSnapshot(stockQuery, (snapshot) => {
    stock = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderAll();
  }));

  unsubscribers.push(onSnapshot(notesQuery, (snapshot) => {
    notes = snapshot.docs.map((docItem) => ({
      id: docItem.id,
      ...docItem.data()
    }));

    renderNotes();
  }));

  unsubscribers.push(onSnapshot(doc(db, "settings", "main"), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();

      settings = {
        name: data.name || "JH Store",
        goal: Number(data.goal || 5000),
        grid: data.grid !== false,
        gridOpacity: Number(data.gridOpacity ?? 18)
      };

      setupSettingsValues();
      applyAppearance();
      renderAll();
    }
  }));
}

function stopListeners() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
}

function setupNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      openPage(button.dataset.page);
    });
  });

  $$("[data-open-page]").forEach((button) => {
    button.addEventListener("click", () => {
      openPage(button.dataset.openPage);
    });
  });
}

function openPage(pageName) {
  $$(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageName);
  });

  $$(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageName);
  });

  if (pageName === "dashboard") {
    setTimeout(renderMainChart, 60);
  }

  if (pageName === "investimentos") {
    setTimeout(renderInvestmentChart, 60);
  }
}

function setupFilters() {
  const current = new Date();
  const year = current.getFullYear();

  $("#dash-month-filter").innerHTML = months.map((m, index) => {
    return `<option value="${index}" ${index === current.getMonth() ? "selected" : ""}>${m}</option>`;
  }).join("");

  $("#dash-year-filter").innerHTML = [year - 1, year, year + 1].map((y) => {
    return `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`;
  }).join("");

  $("#dash-month-filter").addEventListener("change", renderAll);
  $("#dash-year-filter").addEventListener("change", renderAll);
  $("#chart-type-filter").addEventListener("change", renderMainChart);
}

function setupModals() {
  $("#open-daily-close-modal").addEventListener("click", () => {
    $("#daily-date").value = todayISO();
    $("#daily-close-modal").showModal();
    updateDailyPreview();
  });

  $("#open-transaction-modal").addEventListener("click", () => {
    $("#tr-date").value = todayISO();
    $("#transaction-modal").showModal();
  });

  $("#open-stock-modal").addEventListener("click", () => {
    resetStockForm();
    $("#stock-modal").showModal();
  });

  $("#open-bulk-stock-modal").addEventListener("click", () => {
    $("#bulk-stock-modal").showModal();
    renderBulkPreview([]);
  });

  $("#open-investment-modal").addEventListener("click", () => {
    $("#investment-date").value = todayISO();
    $("#investment-modal").showModal();
  });

  $("#open-note-modal").addEventListener("click", () => {
    $("#note-modal").showModal();
  });

  $$("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).close();
    });
  });

  $("#daily-gross").addEventListener("input", updateDailyPreview);
  $("#daily-net").addEventListener("input", updateDailyPreview);
  $("#daily-sales-count").addEventListener("input", updateDailyPreview);

  $("#close-stock-drawer").addEventListener("click", closeStockDrawer);
  $("#drawer-overlay").addEventListener("click", closeStockDrawer);
}

function setupForms() {
  $("#daily-close-form").addEventListener("submit", saveDailyClose);
  $("#transaction-form").addEventListener("submit", saveManualTransaction);
  $("#stock-form").addEventListener("submit", saveStockItem);
  $("#investment-form").addEventListener("submit", saveInvestment);
  $("#bulk-stock-form").addEventListener("submit", saveBulkStock);
  $("#note-form").addEventListener("submit", saveNote);

  $("#preview-bulk-stock").addEventListener("click", () => {
    renderBulkPreview(parseBulkStock());
  });

  $("#clear-bulk-stock").addEventListener("click", () => {
    $("#bulk-content").value = "";
    renderBulkPreview([]);
  });

  document.addEventListener("click", handleGlobalClicks);
  document.addEventListener("change", handleGlobalChanges);

  $("#save-settings").addEventListener("click", saveSettingsFromForm);
  $("#clear-cache").addEventListener("click", () => location.reload());
  $("#export-dashboard-report").addEventListener("click", () => exportCSV("relatorio-dashboard.csv", buildFinanceCSV(transactions)));
  $("#export-finance-csv").addEventListener("click", () => exportCSV("financeiro.csv", buildFinanceCSV(filteredFinanceRows())));
}

function setupStockControls() {
  $("#stock-search").addEventListener("input", () => {
    stockPage = 1;
    renderStock();
  });

  $("#stock-status-filter").addEventListener("change", () => {
    stockPage = 1;
    renderStock();
  });

  $("#stock-category-filter").addEventListener("change", () => {
    stockPage = 1;
    renderStock();
  });

  $("#stock-platform-filter").addEventListener("change", () => {
    stockPage = 1;
    renderStock();
  });

  $("#clear-stock-filters").addEventListener("click", () => {
    $("#stock-search").value = "";
    $("#stock-status-filter").value = "all";
    $("#stock-category-filter").value = "all";
    $("#stock-platform-filter").value = "all";
    stockPage = 1;
    renderStock();
  });

  $("#stock-prev-page").addEventListener("click", () => {
    if (stockPage > 1) {
      stockPage--;
      renderStock();
    }
  });

  $("#stock-next-page").addEventListener("click", () => {
    const totalPages = Math.max(Math.ceil(lastStockRows.length / STOCK_PAGE_SIZE), 1);

    if (stockPage < totalPages) {
      stockPage++;
      renderStock();
    }
  });

  $$("[data-sort-stock]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortStock;

      if (stockSort.key === key) {
        stockSort.direction = stockSort.direction === "asc" ? "desc" : "asc";
      } else {
        stockSort = { key, direction: "asc" };
      }

      renderStock();
    });
  });
}

function setupFinanceControls() {
  $("#finance-search").addEventListener("input", renderFinance);
  $("#finance-type-filter").addEventListener("change", renderFinance);
  $("#finance-platform-filter").addEventListener("change", renderFinance);

  $("#clear-finance-filters").addEventListener("click", () => {
    $("#finance-search").value = "";
    $("#finance-type-filter").value = "all";
    $("#finance-platform-filter").value = "all";
    renderFinance();
  });
}

function setupSettingsTabs() {
  $$(".settings-tab").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".settings-tab").forEach((tab) => tab.classList.remove("active"));
      $$(".settings-panel").forEach((panel) => panel.classList.remove("active"));

      button.classList.add("active");
      $(`#settings-${button.dataset.settingsTab}`).classList.add("active");
    });
  });
}

async function handleGlobalClicks(event) {
  const copyButton = event.target.closest("[data-copy]");
  if (copyButton) {
    const text = decodeURIComponent(copyButton.dataset.copy || "").trim();

    if (!text) {
      alert("Nada para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      const oldText = copyButton.textContent;
      copyButton.textContent = "Copiado";
      setTimeout(() => copyButton.textContent = oldText, 900);
    } catch (error) {
      console.error(error);
      alert("Não foi possível copiar.");
    }

    return;
  }

  const deleteStockButton = event.target.closest("[data-delete-stock]");
  if (deleteStockButton) {
    if (!confirm("Excluir essa conta do estoque?")) return;
    await deleteDoc(doc(db, "stock", deleteStockButton.dataset.deleteStock));
    closeStockDrawer();
    return;
  }

  const editStockButton = event.target.closest("[data-edit-stock]");
  if (editStockButton) {
    const item = stock.find((stockItem) => stockItem.id === editStockButton.dataset.editStock);
    if (!item) return;

    fillStockForm(item);
    $("#stock-modal").showModal();
    return;
  }

  const deleteTransactionButton = event.target.closest("[data-delete-transaction]");
  if (deleteTransactionButton) {
    if (!confirm("Excluir essa movimentação?")) return;
    await deleteDoc(doc(db, "transactions", deleteTransactionButton.dataset.deleteTransaction));
    return;
  }

  const stockRow = event.target.closest("[data-stock-row]");
  if (stockRow) {
    const item = stock.find((stockItem) => stockItem.id === stockRow.dataset.stockRow);
    if (item) openStockDrawer(item);
  }
}

async function handleGlobalChanges(event) {
  const statusSelect = event.target.closest("[data-stock-status]");
  if (!statusSelect) return;

  const id = statusSelect.dataset.stockStatus;

  await updateDoc(doc(db, "stock", id), {
    status: statusSelect.value,
    soldAt: statusSelect.value === "Vendida" ? todayISO() : null,
    updatedAt: serverTimestamp()
  });
}

function updateDailyPreview() {
  const gross = Number($("#daily-gross").value || 0);
  const net = Number($("#daily-net").value || 0);
  const count = Number($("#daily-sales-count").value || 0);
  const fee = Math.max(gross - net, 0);
  const feePercent = gross ? (fee / gross) * 100 : 0;
  const ticket = count ? net / count : 0;

  $("#daily-fee-value").textContent = money(fee);
  $("#daily-fee-percent").textContent = percent(feePercent);
  $("#daily-ticket").textContent = money(ticket);
}

async function saveDailyClose(event) {
  event.preventDefault();

  if (saving) return;
  saving = true;

  const button = $("#save-daily-close-btn");
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    const gross = Number($("#daily-gross").value || 0);
    const net = Number($("#daily-net").value || 0);
    const count = Number($("#daily-sales-count").value || 1);
    const fee = Math.max(gross - net, 0);
    const feePercent = gross ? (fee / gross) * 100 : 0;

    await addDoc(collection(db, "transactions"), {
      type: "receita",
      mode: "dailyClose",
      category: "Fechamento diário",
      desc: `Fechamento ${$("#daily-platform").value}`,
      platform: $("#daily-platform").value,
      salesCount: count,
      grossValue: gross,
      value: net,
      feeValue: fee,
      totalFeePercent: feePercent,
      date: $("#daily-date").value,
      note: $("#daily-note").value.trim(),
      createdAt: serverTimestamp()
    });

    event.target.reset();
    $("#daily-close-modal").close();
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar fechamento.");
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Salvar fechamento";
  }
}

async function saveManualTransaction(event) {
  event.preventDefault();

  if (saving) return;
  saving = true;

  const button = $("#save-transaction-btn");
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    const type = $("#tr-type").value;
    const gross = Number($("#tr-gross").value || 0);
    const netInput = Number($("#tr-net").value || 0);
    const net = netInput || gross;
    const fee = type === "receita" ? Math.max(gross - net, 0) : 0;
    const feePercent = gross ? (fee / gross) * 100 : 0;

    await addDoc(collection(db, "transactions"), {
      type,
      mode: "manual",
      category: $("#tr-category").value,
      desc: $("#tr-desc").value.trim(),
      platform: $("#tr-category").value === "GGMAX" ? "GGMAX" : "Manual",
      grossValue: gross,
      value: type === "receita" ? net : gross,
      feeValue: fee,
      totalFeePercent: feePercent,
      date: $("#tr-date").value,
      createdAt: serverTimestamp()
    });

    event.target.reset();
    $("#transaction-modal").close();
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar movimentação.");
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Salvar movimentação";
  }
}

async function saveStockItem(event) {
  event.preventDefault();

  if (saving) return;
  saving = true;

  const button = $("#save-stock-btn");
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    const id = $("#stock-edit-id").value;
    const login = $("#stock-login").value.trim();
    const password = $("#stock-password").value.trim();
    const customName = $("#stock-name").value.trim();

    const payload = {
      name: customName || login,
      login,
      password,
      raw: password ? `${login}:${password}` : login,
      game: $("#stock-game").value,
      category: $("#stock-category").value,
      status: $("#stock-status").value,
      platform: $("#stock-platform").value,
      cost: Number($("#stock-cost").value || 0),
      price: Number($("#stock-price").value || 0),
      note: $("#stock-note").value.trim(),
      updatedAt: serverTimestamp()
    };

    if (id) {
      await updateDoc(doc(db, "stock", id), payload);
    } else {
      await addDoc(collection(db, "stock"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    }

    resetStockForm();
    $("#stock-modal").close();
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar conta.");
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Salvar conta";
  }
}

async function saveBulkStock(event) {
  event.preventDefault();

  if (saving) return;

  const items = parseBulkStock();

  if (!items.length) {
    alert("Cole pelo menos uma conta.");
    return;
  }

  if (!confirm(`Cadastrar ${items.length} conta(s) no estoque?`)) return;

  saving = true;

  const button = $("#save-bulk-stock-btn");
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    const game = $("#bulk-game").value;
    const category = $("#bulk-category").value;
    const status = $("#bulk-status").value;
    const platform = $("#bulk-platform").value;
    const price = Number($("#bulk-price").value || 0);
    const cost = Number($("#bulk-cost").value || 0);

    const promises = items.map((item) => {
      return addDoc(collection(db, "stock"), {
        name: item.login,
        login: item.login,
        password: item.password,
        game,
        category,
        status,
        platform,
        cost,
        price,
        note: item.note,
        raw: item.raw,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    await Promise.all(promises);

    $("#bulk-content").value = "";
    renderBulkPreview([]);
    $("#bulk-stock-modal").close();

    alert(`${items.length} conta(s) cadastradas com sucesso.`);
  } catch (error) {
    console.error(error);
    alert("Erro ao importar contas.");
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Salvar todos no estoque";
  }
}

async function saveInvestment(event) {
  event.preventDefault();

  if (saving) return;
  saving = true;

  const button = $("#save-investment-btn");
  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    await addDoc(collection(db, "transactions"), {
      type: "despesa",
      mode: "investment",
      category: "Investimento",
      investmentType: $("#investment-type").value,
      desc: $("#investment-desc").value.trim(),
      platform: "Manual",
      grossValue: Number($("#investment-value").value || 0),
      value: Number($("#investment-value").value || 0),
      feeValue: 0,
      totalFeePercent: 0,
      date: $("#investment-date").value,
      createdAt: serverTimestamp()
    });

    event.target.reset();
    $("#investment-modal").close();
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar investimento.");
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Salvar investimento";
  }
}

async function saveNote(event) {
  event.preventDefault();

  if (saving) return;
  saving = true;

  try {
    await addDoc(collection(db, "notes"), {
      title: $("#note-title").value.trim(),
      category: $("#note-category").value,
      text: $("#note-text").value.trim(),
      date: new Date().toLocaleDateString("pt-BR"),
      createdAt: serverTimestamp()
    });

    event.target.reset();
    $("#note-modal").close();
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar anotação.");
  } finally {
    saving = false;
  }
}

function parseBulkStock() {
  const content = $("#bulk-content").value.trim();

  if (!content) return [];

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cleanLine = line.replace(/\s+/g, " ").trim();

      let login = cleanLine;
      let password = "";

      if (cleanLine.includes(":")) {
        const parts = cleanLine.split(":");
        login = parts[0].trim();
        password = parts.slice(1).join(":").trim();
      }

      return {
        login: login.trim(),
        password: password.trim(),
        note: "",
        raw: password.trim() ? `${login.trim()}:${password.trim()}` : login.trim()
      };
    })
    .filter((item) => item.login);
}

function renderBulkPreview(items) {
  $("#bulk-count").textContent = `${items.length} item(s)`;

  if (!items.length) {
    $("#bulk-preview").innerHTML = `<div class="empty">Nenhum item separado ainda.</div>`;
    return;
  }

  $("#bulk-preview").innerHTML = items.map((item, index) => {
    const ggmaxFormat = item.password ? `${item.login}:${item.password}` : item.login;

    return `
      <div class="bulk-preview-item">
        <strong>Item #${index + 1}</strong>

        <div class="credential-preview">
          <span>Login</span>
          <code>${escapeHTML(item.login)}</code>
          <button type="button" class="mini-copy" data-copy="${encodeURIComponent(item.login)}">Copiar</button>
        </div>

        <div class="credential-preview">
          <span>Senha</span>
          <code>${escapeHTML(item.password || "Sem senha")}</code>
          <button type="button" class="mini-copy" data-copy="${encodeURIComponent(item.password)}">Copiar</button>
        </div>

        <div class="credential-preview">
          <span>Formato GGMAX</span>
          <code>${escapeHTML(ggmaxFormat)}</code>
          <button type="button" class="mini-copy" data-copy="${encodeURIComponent(ggmaxFormat)}">Copiar</button>
        </div>
      </div>
    `;
  }).join("");
}

function resetStockForm() {
  $("#stock-modal-title").textContent = "Nova conta";
  $("#stock-edit-id").value = "";
  $("#stock-form").reset();
  $("#stock-status").value = "Pronta";
}

function fillStockForm(item) {
  const normalized = normalizeStockItem(item);

  $("#stock-modal-title").textContent = "Editar conta";
  $("#stock-edit-id").value = item.id;
  $("#stock-login").value = normalized.login;
  $("#stock-password").value = normalized.password;
  $("#stock-name").value = item.name || "";
  $("#stock-game").value = item.game || "Jailbreak";
  $("#stock-category").value = item.category || "Outro";
  $("#stock-status").value = item.status || "Pronta";
  $("#stock-platform").value = item.platform || "GGMAX";
  $("#stock-cost").value = item.cost || "";
  $("#stock-price").value = item.price || "";
  $("#stock-note").value = item.note || "";
}

function normalizeStockItem(item) {
  let login = String(item.login || item.name || "").trim();
  let password = String(item.password || "").trim();

  if (!password && item.raw && String(item.raw).includes(":")) {
    const parts = String(item.raw).split(":");
    login = parts[0].trim() || login;
    password = parts.slice(1).join(":").trim();
  }

  if (!password && item.note) {
    const note = String(item.note).trim();

    if (note.toLowerCase().startsWith("senha:")) {
      password = note.split(":").slice(1).join(":").trim();
    } else if (!note.includes(" ") && note.length <= 80) {
      password = note;
    }
  }

  const ggmax = password ? `${login}:${password}` : login;

  return {
    ...item,
    login,
    password,
    ggmax,
    name: item.name || login,
    status: item.status || "Pronta",
    category: item.category || "Outro",
    platform: item.platform || "GGMAX",
    price: Number(item.price || 0),
    cost: Number(item.cost || 0),
    profit: Number(item.price || 0) - Number(item.cost || 0)
  };
}

function setupSettingsValues() {
  $("#setting-name").value = settings.name;
  $("#setting-goal").value = settings.goal;
  $("#setting-grid").checked = settings.grid;
  $("#setting-grid-opacity").value = settings.gridOpacity;
  $("#dash-goal").textContent = money(settings.goal);
}

function applyAppearance() {
  document.body.classList.toggle("grid-off", !settings.grid);
  document.documentElement.style.setProperty("--grid-opacity", String(settings.gridOpacity / 1000));
}

async function saveSettingsFromForm() {
  settings.name = $("#setting-name").value.trim() || "JH Store";
  settings.goal = Number($("#setting-goal").value || 5000);
  settings.grid = $("#setting-grid").checked;
  settings.gridOpacity = Number($("#setting-grid-opacity").value || 18);

  await setDoc(doc(db, "settings", "main"), {
    ...settings,
    updatedAt: serverTimestamp()
  }, { merge: true });

  alert("Configurações salvas!");
}

function getNetValue(item) {
  return Number(item.value ?? item.netValue ?? item.grossValue ?? 0);
}

function getGrossValue(item) {
  return Number(item.grossValue ?? item.value ?? 0);
}

function getFeeValue(item) {
  return Number(item.feeValue ?? 0);
}

function totals(list = transactions) {
  const receitas = list
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + getNetValue(item), 0);

  const receitasBrutas = list
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + getGrossValue(item), 0);

  const taxas = list
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + getFeeValue(item), 0);

  const despesas = list
    .filter((item) => item.type === "despesa")
    .reduce((sum, item) => sum + getNetValue(item), 0);

  const vendas = list
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + Number(item.salesCount || 1), 0);

  const lucro = receitas - despesas;
  const ticket = vendas ? receitas / vendas : 0;
  const taxaMedia = receitasBrutas ? (taxas / receitasBrutas) * 100 : 0;
  const roi = despesas ? ((receitas - despesas) / despesas) * 100 : 0;

  return {
    receitas,
    receitasBrutas,
    taxas,
    despesas,
    vendas,
    lucro,
    ticket,
    taxaMedia,
    roi
  };
}

function selectedPeriodTransactions() {
  const month = Number($("#dash-month-filter")?.value ?? new Date().getMonth());
  const year = Number($("#dash-year-filter")?.value ?? new Date().getFullYear());

  return transactions.filter((item) => {
    if (!item.date) return false;
    const date = new Date(`${item.date}T00:00:00`);
    return date.getMonth() === month && date.getFullYear() === year;
  });
}

function previousPeriodTransactions() {
  let month = Number($("#dash-month-filter")?.value ?? new Date().getMonth()) - 1;
  let year = Number($("#dash-year-filter")?.value ?? new Date().getFullYear());

  if (month < 0) {
    month = 11;
    year--;
  }

  return transactions.filter((item) => {
    if (!item.date) return false;
    const date = new Date(`${item.date}T00:00:00`);
    return date.getMonth() === month && date.getFullYear() === year;
  });
}

function renderAll() {
  renderDashboard();
  renderFinance();
  renderStock();
  renderInvestments();
  renderNotes();
  renderMainChart();
  renderInvestmentChart();
}

function renderDashboard() {
  const period = selectedPeriodTransactions();
  const prev = previousPeriodTransactions();
  const currentTotals = totals(period);
  const prevTotals = totals(prev);
  const goalPercent = Math.min((currentTotals.receitas / settings.goal) * 100, 100);

  $("#dash-revenue").textContent = money(currentTotals.receitas);
  $("#dash-sales").textContent = currentTotals.vendas;
  $("#dash-ticket").textContent = money(currentTotals.ticket);
  $("#dash-goal").textContent = money(settings.goal);
  $("#dash-goal-bar").style.width = `${goalPercent}%`;
  $("#dash-goal-text").textContent = `${percent(goalPercent)} atingida`;

  $("#dash-revenue-delta").textContent = `${deltaText(currentTotals.receitas, prevTotals.receitas)} vs mês anterior`;
  $("#dash-sales-delta").textContent = `${currentTotals.vendas - prevTotals.vendas >= 0 ? "+" : ""}${currentTotals.vendas - prevTotals.vendas} vs mês anterior`;
  $("#dash-ticket-delta").textContent = `${deltaText(currentTotals.ticket, prevTotals.ticket)} vs mês anterior`;

  const latestSales = transactions
    .filter((item) => item.type === "receita")
    .slice(0, 5);

  $("#latest-sales-table").innerHTML = latestSales.length ? latestSales.map((item, index) => `
    <tr>
      <td>#${String(1020 + index).padStart(4, "0")}</td>
      <td>${escapeHTML(item.desc || item.category || "Venda")}</td>
      <td>${escapeHTML(item.platform || item.category || "Manual")}</td>
      <td>${money(getNetValue(item))}</td>
      <td>${formatDateTime(item.date)}</td>
      <td><span class="status-badge status-pronta">Concluída</span></td>
    </tr>
  `).join("") : emptyTableRow(6, "Nenhuma venda registrada.");
}

function deltaText(current, previous) {
  if (!previous) return "+0%";
  const value = ((current - previous) / previous) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function renderFinance() {
  const rows = filteredFinanceRows();
  const total = totals(transactions);

  $("#fin-revenue").textContent = money(total.receitas);
  $("#fin-gross").textContent = money(total.receitasBrutas);
  $("#fin-fees").textContent = money(total.taxas);
  $("#fin-balance").textContent = money(total.lucro);

  $("#finance-table").innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td><span class="status-badge ${item.type === "receita" ? "status-pronta" : "status-problema"}">${item.type}</span></td>
      <td>${escapeHTML(item.desc || item.category || "")}</td>
      <td>${money(getGrossValue(item))}</td>
      <td>${money(getNetValue(item))}</td>
      <td>${money(getFeeValue(item))}</td>
      <td>${formatDateTime(item.date)}</td>
      <td><button class="icon-btn" data-delete-transaction="${item.id}">×</button></td>
    </tr>
  `).join("") : emptyTableRow(7, "Nenhuma movimentação encontrada.");
}

function filteredFinanceRows() {
  const search = $("#finance-search")?.value.toLowerCase().trim() || "";
  const type = $("#finance-type-filter")?.value || "all";
  const platform = $("#finance-platform-filter")?.value || "all";

  return transactions.filter((item) => {
    const text = `${item.type} ${item.desc} ${item.category} ${item.platform} ${item.note}`.toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const matchesType = type === "all" || item.type === type;
    const matchesPlatform = platform === "all" || item.platform === platform || item.category === platform;

    return matchesSearch && matchesType && matchesPlatform;
  });
}

function renderStock() {
  let rows = stock.map(normalizeStockItem);
  const search = $("#stock-search")?.value.toLowerCase().trim() || "";
  const status = $("#stock-status-filter")?.value || "all";
  const category = $("#stock-category-filter")?.value || "all";
  const platform = $("#stock-platform-filter")?.value || "all";

  rows = rows.filter((item) => {
    const text = `${item.name} ${item.login} ${item.password} ${item.game} ${item.category} ${item.platform} ${item.note}`.toLowerCase();

    return (!search || text.includes(search)) &&
      (status === "all" || item.status === status) &&
      (category === "all" || item.category === category) &&
      (platform === "all" || item.platform === platform);
  });

  rows.sort((a, b) => compareStock(a, b, stockSort.key, stockSort.direction));

  lastStockRows = rows;
  const totalPages = Math.max(Math.ceil(rows.length / STOCK_PAGE_SIZE), 1);
  stockPage = Math.min(stockPage, totalPages);

  const start = (stockPage - 1) * STOCK_PAGE_SIZE;
  const pageRows = rows.slice(start, start + STOCK_PAGE_SIZE);

  $("#stock-table").innerHTML = pageRows.length ? pageRows.map((item) => `
    <tr data-stock-row="${item.id}">
      <td>
        <div class="account-cell">
          <strong>${escapeHTML(item.name || item.login)}</strong>
          <small>${escapeHTML(item.login)}</small>
        </div>
      </td>
      <td>${statusBadge(item.status)}</td>
      <td>${escapeHTML(item.category)}</td>
      <td>${escapeHTML(item.platform)}</td>
      <td>${money(item.price)}</td>
      <td>${money(item.cost)}</td>
      <td>${money(item.profit)}</td>
      <td>${formatDateTime(item.createdAt || item.date)}</td>
    </tr>
  `).join("") : emptyTableRow(8, "Nenhuma conta encontrada.");

  $("#stock-page-info").textContent = `${stockPage} / ${totalPages}`;
}

function compareStock(a, b, key, direction) {
  const dir = direction === "asc" ? 1 : -1;

  let av = a[key];
  let bv = b[key];

  if (key === "createdAt") {
    av = dateValue(a.createdAt || a.date);
    bv = dateValue(b.createdAt || b.date);
  }

  if (typeof av === "number" || typeof bv === "number") {
    return (Number(av || 0) - Number(bv || 0)) * dir;
  }

  return String(av || "").localeCompare(String(bv || "")) * dir;
}

function statusBadge(status) {
  const normalized = String(status || "Pronta");
  const className = `status-${normalized.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`;

  return `<span class="status-badge ${className}">${escapeHTML(normalized)}</span>`;
}

function openStockDrawer(item) {
  const data = normalizeStockItem(item);

  $("#drawer-title").textContent = data.name || data.login;

  $("#drawer-content").innerHTML = `
    <div class="drawer-section">
      <h3>Acesso</h3>

      <div class="drawer-row">
        <span>Login</span>
        <code>${escapeHTML(data.login)}</code>
        <button class="mini-copy" data-copy="${encodeURIComponent(data.login)}">Copiar</button>
      </div>

      <div class="drawer-row">
        <span>Senha</span>
        <code>${escapeHTML(data.password || "Sem senha")}</code>
        <button class="mini-copy" data-copy="${encodeURIComponent(data.password)}">Copiar</button>
      </div>

      <div class="drawer-row">
        <span>GGMAX</span>
        <code>${escapeHTML(data.ggmax)}</code>
        <button class="mini-copy" data-copy="${encodeURIComponent(data.ggmax)}">Copiar</button>
      </div>
    </div>

    <div class="drawer-section">
      <h3>Informações</h3>
      <div class="drawer-meta">
        <div><span>Status</span><strong>${statusBadge(data.status)}</strong></div>
        <div><span>Categoria</span><strong>${escapeHTML(data.category)}</strong></div>
        <div><span>Plataforma</span><strong>${escapeHTML(data.platform)}</strong></div>
        <div><span>Jogo</span><strong>${escapeHTML(data.game || "")}</strong></div>
        <div><span>Valor</span><strong>${money(data.price)}</strong></div>
        <div><span>Custo</span><strong>${money(data.cost)}</strong></div>
        <div><span>Lucro</span><strong>${money(data.profit)}</strong></div>
        <div><span>Criada em</span><strong>${formatDateTime(data.createdAt || data.date)}</strong></div>
      </div>
    </div>

    <div class="drawer-section">
      <h3>Observações</h3>
      <p class="muted">${escapeHTML(data.note || "Nenhuma observação.")}</p>
    </div>

    <div class="drawer-section">
      <h3>Status</h3>
      <select data-stock-status="${data.id}">
        ${["Pronta", "Farmando", "Anunciada", "Vendida", "Entregue", "Problema"].map((status) => {
          return `<option value="${status}" ${data.status === status ? "selected" : ""}>${status}</option>`;
        }).join("")}
      </select>
    </div>

    <div class="head-actions">
      <button class="btn btn-soft" data-edit-stock="${data.id}">Editar</button>
      <button class="btn btn-soft btn-danger" data-delete-stock="${data.id}">Excluir</button>
    </div>
  `;

  $("#stock-drawer").classList.add("open");
  $("#drawer-overlay").classList.add("open");
}

function closeStockDrawer() {
  $("#stock-drawer").classList.remove("open");
  $("#drawer-overlay").classList.remove("open");
}

function renderInvestments() {
  const total = totals(transactions);
  const investments = transactions.filter((item) => item.type === "despesa" && item.category === "Investimento");
  const invested = investments.reduce((sum, item) => sum + getNetValue(item), 0);
  const result = total.receitas - invested;
  const roi = invested ? (result / invested) * 100 : 0;

  $("#inv-total").textContent = money(invested);
  $("#inv-revenue").textContent = money(total.receitas);
  $("#inv-result").textContent = money(result);
  $("#inv-roi").textContent = percent(roi);

  $("#investment-table").innerHTML = investments.length ? investments.map((item) => `
    <tr>
      <td>${escapeHTML(item.investmentType || "Investimento")}</td>
      <td>${escapeHTML(item.desc || "")}</td>
      <td>${money(getNetValue(item))}</td>
      <td>${formatDateTime(item.date)}</td>
      <td><button class="icon-btn" data-delete-transaction="${item.id}">×</button></td>
    </tr>
  `).join("") : emptyTableRow(5, "Nenhum investimento cadastrado.");
}

function renderNotes() {
  const defaults = [
    { title: "Estratégias de venda", category: "Estratégias", text: "Focar em contas com boa margem e atualizar anúncios com frequência.", date: "" },
    { title: "Contas para anunciar", category: "Contas para anunciar", text: "Use o estoque para separar contas prontas e anunciadas.", date: "" },
    { title: "Metas", category: "Metas", text: `Meta mensal atual: ${money(settings.goal)}.`, date: "" }
  ];

  const list = notes.length ? notes : defaults;

  $("#notes-grid").innerHTML = list.map((note) => `
    <article class="note-card">
      <span class="note-category">${escapeHTML(note.category || "Anotação")}</span>
      <h3>${escapeHTML(note.title)}</h3>
      <p>${escapeHTML(note.text)}</p>
      <small>${escapeHTML(note.date || new Date().toLocaleDateString("pt-BR"))}</small>
    </article>
  `).join("");
}

function renderMainChart() {
  const canvas = $("#main-chart");
  if (!canvas) return;

  const year = Number($("#dash-year-filter")?.value ?? new Date().getFullYear());
  const type = $("#chart-type-filter")?.value || "receita";
  const data = Array(12).fill(0);

  transactions.forEach((item) => {
    if (!item.date || item.type !== "receita") return;

    const date = new Date(`${item.date}T00:00:00`);
    if (date.getFullYear() !== year) return;

    if (type === "receita") data[date.getMonth()] += getNetValue(item);
    if (type === "bruto") data[date.getMonth()] += getGrossValue(item);
    if (type === "taxas") data[date.getMonth()] += getFeeValue(item);
  });

  if (mainChart) mainChart.destroy();

  mainChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
      datasets: [
        {
          label: type === "receita" ? "Receita Líquida" : type === "bruto" ? "Bruto Vendido" : "Taxas Pagas",
          data,
          borderColor: "#ffffff",
          backgroundColor: "rgba(255,255,255,.035)",
          borderWidth: 1.8,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: .35,
          fill: true
        }
      ]
    },
    options: chartOptions()
  });
}

function renderInvestmentChart() {
  const canvas = $("#investment-chart");
  if (!canvas) return;

  const year = new Date().getFullYear();
  const receitas = Array(12).fill(0);
  const investimentos = Array(12).fill(0);

  transactions.forEach((item) => {
    if (!item.date) return;

    const date = new Date(`${item.date}T00:00:00`);
    if (date.getFullYear() !== year) return;

    if (item.type === "receita") receitas[date.getMonth()] += getNetValue(item);
    if (item.type === "despesa" && item.category === "Investimento") investimentos[date.getMonth()] += getNetValue(item);
  });

  if (investmentChart) investmentChart.destroy();

  investmentChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
      datasets: [
        {
          label: "Receita Líquida",
          data: receitas,
          borderColor: "#ffffff",
          backgroundColor: "rgba(255,255,255,.035)",
          borderWidth: 1.8,
          tension: .35,
          fill: true
        },
        {
          label: "Investimentos",
          data: investimentos,
          borderColor: "#8c8f96",
          backgroundColor: "rgba(255,255,255,.02)",
          borderWidth: 1.8,
          tension: .35,
          fill: true
        }
      ]
    },
    options: chartOptions()
  });
}

function chartOptions() {
  return {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: "#d8d8d8",
          boxWidth: 18,
          boxHeight: 2
        }
      },
      tooltip: {
        backgroundColor: "#111",
        titleColor: "#fff",
        bodyColor: "#d8d8d8",
        borderColor: "rgba(255,255,255,.12)",
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${money(ctx.raw)}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#8c8f96" },
        grid: { color: "rgba(255,255,255,.045)" }
      },
      y: {
        ticks: {
          color: "#8c8f96",
          callback: (value) => money(value)
        },
        grid: { color: "rgba(255,255,255,.045)" }
      }
    }
  };
}

function setupCalculator() {
  $("#calc-real-fee").addEventListener("click", () => {
    const gross = Number($("#fee-gross").value || 0);
    const net = Number($("#fee-net").value || 0);
    const fee = Math.max(gross - net, 0);
    const feePercent = gross ? (fee / gross) * 100 : 0;

    $("#real-fee-value").textContent = money(fee);
    $("#real-fee-percent").textContent = percent(feePercent);
  });

  $("#calc-price-needed").addEventListener("click", () => {
    const desired = Number($("#desired-net").value || 0);
    const feePercent = Number($("#desired-fee").value || 0);
    const price = feePercent >= 100 ? 0 : desired / (1 - feePercent / 100);

    $("#price-needed").textContent = money(price);
  });
}

function buildFinanceCSV(rows) {
  const header = ["tipo", "descricao", "plataforma", "bruto", "liquido", "taxa", "data"];
  const body = rows.map((item) => [
    item.type,
    item.desc || item.category || "",
    item.platform || "",
    getGrossValue(item),
    getNetValue(item),
    getFeeValue(item),
    item.date || ""
  ]);

  return [header, ...body]
    .map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

function exportCSV(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function emptyTableRow(colspan, text) {
  return `<tr><td colspan="${colspan}" class="empty-row">${text}</td></tr>`;
}

function formatDateTime(value) {
  if (!value) return "-";

  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toLocaleString("pt-BR");
  }

  if (typeof value === "string") {
    const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("pt-BR");
  }

  return "-";
}

function dateValue(value) {
  if (!value) return 0;
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(String(value).includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function escapeHTML(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
