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

let transactions = [];
let stock = [];
let notes = [];
let settings = {
  name: "JH Store",
  goal: 5000
};

let monthlyChart;
let unsubscribers = [];
let saving = false;

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
  setupStockFilters();
  setupCalculator();
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
    $("#welcome-title").textContent = settings.name || "JH Store";

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
      settings = {
        name: snapshot.data().name || "JH Store",
        goal: Number(snapshot.data().goal || 5000)
      };

      $("#welcome-title").textContent = settings.name;
      setupSettingsValues();
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
    setTimeout(renderChart, 60);
  }
}

function setupFilters() {
  const current = new Date();

  $("#month-filter").innerHTML = months.map((m, index) => {
    return `<option value="${index}" ${index === current.getMonth() ? "selected" : ""}>${m}</option>`;
  }).join("");

  const year = current.getFullYear();

  $("#year-filter").innerHTML = [year - 1, year, year + 1].map((y) => {
    return `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`;
  }).join("");

  $("#month-filter").addEventListener("change", renderAll);
  $("#year-filter").addEventListener("change", renderAll);
}

function setupModals() {
  const today = new Date().toISOString().slice(0, 10);

  $("#open-daily-close-modal").addEventListener("click", () => {
    $("#daily-date").value = today;
    $("#daily-close-modal").showModal();
    updateDailyPreview();
  });

  $("#open-transaction-modal").addEventListener("click", () => {
    $("#tr-date").value = today;
    $("#transaction-modal").showModal();
  });

  $("#open-stock-modal").addEventListener("click", () => {
    resetStockForm();
    $("#stock-modal").showModal();
  });

  $("#open-investment-modal").addEventListener("click", () => {
    $("#investment-date").value = today;
    $("#investment-modal").showModal();
  });

  $$("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).close();
    });
  });

  $("#daily-gross").addEventListener("input", updateDailyPreview);
  $("#daily-net").addEventListener("input", updateDailyPreview);
  $("#daily-sales-count").addEventListener("input", updateDailyPreview);
}

function setupForms() {
  $("#daily-close-form").addEventListener("submit", saveDailyClose);
  $("#transaction-form").addEventListener("submit", saveManualTransaction);
  $("#stock-form").addEventListener("submit", saveStockItem);
  $("#investment-form").addEventListener("submit", saveInvestment);

  $("#add-note").addEventListener("click", saveNote);

  $("#clear-transactions").addEventListener("click", async () => {
    if (!confirm("Apagar todas as movimentações?")) return;
    await deleteCollection("transactions");
  });

  $("#clear-stock").addEventListener("click", async () => {
    if (!confirm("Apagar todo o estoque?")) return;
    await deleteCollection("stock");
  });

  $("#transaction-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-transaction]");
    if (!button) return;

    if (!confirm("Excluir essa movimentação?")) return;

    await deleteDoc(doc(db, "transactions", button.dataset.deleteTransaction));
  });

  $("#all-investments-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-transaction]");
    if (!button) return;

    if (!confirm("Excluir esse investimento?")) return;

    await deleteDoc(doc(db, "transactions", button.dataset.deleteTransaction));
  });

  $("#stock-ready, #stock-farming, #stock-listed, #stock-sold, #stock-problem").forEach?.(() => {});

  document.addEventListener("click", handleGlobalClicks);
  document.addEventListener("change", handleGlobalChanges);

  $("#goal-select").addEventListener("change", async () => {
    settings.goal = Number($("#goal-select").value);
    await saveSettings();
  });

  $("#save-settings").addEventListener("click", async () => {
    settings.name = $("#setting-name").value.trim() || "JH Store";
    settings.goal = Number($("#setting-goal").value || 5000);
    await saveSettings();
    alert("Configurações salvas!");
  });
}

async function handleGlobalClicks(event) {
  const deleteStockButton = event.target.closest("[data-delete-stock]");
  if (deleteStockButton) {
    if (!confirm("Excluir esse item do estoque?")) return;
    await deleteDoc(doc(db, "stock", deleteStockButton.dataset.deleteStock));
    return;
  }

  const editStockButton = event.target.closest("[data-edit-stock]");
  if (editStockButton) {
    const item = stock.find((stockItem) => stockItem.id === editStockButton.dataset.editStock);
    if (!item) return;

    fillStockForm(item);
    $("#stock-modal").showModal();
  }
}

async function handleGlobalChanges(event) {
  const statusSelect = event.target.closest("[data-stock-status]");
  if (!statusSelect) return;

  const id = statusSelect.dataset.stockStatus;
  await updateDoc(doc(db, "stock", id), {
    status: statusSelect.value,
    soldAt: statusSelect.value === "Vendida" ? new Date().toISOString().slice(0, 10) : null,
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

    const payload = {
      name: $("#stock-name").value.trim(),
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
    alert("Erro ao salvar item.");
  } finally {
    saving = false;
    button.disabled = false;
    button.textContent = "Salvar item";
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

async function saveNote() {
  const title = $("#note-title").value.trim();
  const text = $("#note-text").value.trim();

  if (!title || !text) return;

  await addDoc(collection(db, "notes"), {
    title,
    text,
    date: new Date().toLocaleDateString("pt-BR"),
    createdAt: serverTimestamp()
  });

  $("#note-title").value = "";
  $("#note-text").value = "";
}

async function deleteCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  const deletions = snapshot.docs.map((docItem) => deleteDoc(doc(db, collectionName, docItem.id)));
  await Promise.all(deletions);
}

async function saveSettings() {
  await setDoc(doc(db, "settings", "main"), {
    name: settings.name || "JH Store",
    goal: Number(settings.goal || 5000),
    updatedAt: serverTimestamp()
  }, {
    merge: true
  });
}

function resetStockForm() {
  $("#stock-modal-title").textContent = "Novo item";
  $("#stock-edit-id").value = "";
  $("#stock-form").reset();
  $("#stock-status").value = "Pronta";
}

function fillStockForm(item) {
  $("#stock-modal-title").textContent = "Editar item";
  $("#stock-edit-id").value = item.id;
  $("#stock-name").value = item.name || "";
  $("#stock-game").value = item.game || "Jailbreak";
  $("#stock-category").value = item.category || "Outro";
  $("#stock-status").value = item.status || "Pronta";
  $("#stock-platform").value = item.platform || "GGMAX";
  $("#stock-cost").value = item.cost || "";
  $("#stock-price").value = item.price || "";
  $("#stock-note").value = item.note || "";
}

function setupSettingsValues() {
  $("#setting-name").value = settings.name;
  $("#setting-goal").value = settings.goal;

  const goalSelect = $("#goal-select");
  const goalValue = String(settings.goal);

  if (![...goalSelect.options].some((option) => option.value === goalValue)) {
    const option = document.createElement("option");
    option.value = goalValue;
    option.textContent = money(settings.goal);
    goalSelect.appendChild(option);
  }

  goalSelect.value = goalValue;
}

function setupStockFilters() {
  $("#stock-status-filter").addEventListener("change", renderStock);
  $("#stock-category-filter").addEventListener("change", renderStock);
  $("#stock-search").addEventListener("input", renderStock);
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
  const month = Number($("#month-filter")?.value ?? new Date().getMonth());
  const year = Number($("#year-filter")?.value ?? new Date().getFullYear());

  return transactions.filter((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    return date.getMonth() === month && date.getFullYear() === year;
  });
}

function renderAll() {
  renderOverview();
  renderDashboard();
  renderFaturamento();
  renderStock();
  renderInvestments();
  renderChart();
}

function renderOverview() {
  const total = totals();
  const activeStock = stock.filter((item) => !["Vendida", "Entregue"].includes(item.status)).length;

  $("#ov-total").textContent = money(total.receitas);
  $("#ov-vendas").textContent = total.vendas;
  $("#ov-lucro").textContent = money(total.lucro);
  $("#ov-estoque").textContent = activeStock;
  $("#ov-taxa-media").textContent = percent(total.taxaMedia);

  $("#sum-ready").textContent = stock.filter((i) => i.status === "Pronta").length;
  $("#sum-farming").textContent = stock.filter((i) => i.status === "Farmando").length;
  $("#sum-listed").textContent = stock.filter((i) => i.status === "Anunciada").length;
  $("#sum-sold").textContent = stock.filter((i) => i.status === "Vendida").length;

  const closings = transactions
    .filter((item) => item.mode === "dailyClose")
    .slice(0, 5);

  $("#recent-closings").innerHTML = closings.length ? closings.map(renderTransactionRow).join("") : `
    <div class="empty">
      <strong>Nenhum fechamento ainda</strong>
      <p>Use a aba Faturamento para criar seu primeiro fechamento diário.</p>
    </div>
  `;
}

function renderDashboard() {
  const period = selectedPeriodTransactions();
  const periodTotals = totals(period);
  const allTotals = totals();
  const goalPercent = Math.min((periodTotals.receitas / settings.goal) * 100, 100);

  $("#db-receitas").textContent = money(periodTotals.receitas);
  $("#db-bruto").textContent = money(periodTotals.receitasBrutas);
  $("#db-taxas").textContent = money(periodTotals.taxas);
  $("#db-ticket").textContent = money(periodTotals.ticket);

  $("#goal-current").textContent = money(periodTotals.receitas);
  $("#goal-target").textContent = money(settings.goal);
  $("#goal-progress").style.width = `${goalPercent}%`;
  $("#goal-percent").textContent = `${percent(goalPercent)} da meta atingida`;

  renderInvestmentList();

  return allTotals;
}

function renderFaturamento() {
  const total = totals();

  $("#ft-receitas").textContent = money(total.receitas);
  $("#ft-bruto").textContent = money(total.receitasBrutas);
  $("#ft-taxas").textContent = money(total.taxas);
  $("#ft-saldo").textContent = money(total.lucro);

  const list = $("#transaction-list");

  if (!transactions.length) {
    list.innerHTML = `
      <div class="empty">
        <strong>Nenhuma movimentação ainda</strong>
        <p>Crie um fechamento diário ou uma movimentação manual.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = transactions.map(renderTransactionRow).join("");
}

function renderTransactionRow(item) {
  const gross = getGrossValue(item);
  const net = getNetValue(item);
  const fee = getFeeValue(item);
  const feePercent = Number(item.totalFeePercent || 0);
  const countText = item.salesCount ? ` • ${item.salesCount} venda(s)` : "";

  return `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(item.desc || item.category)}</strong>
        <small>${escapeHTML(item.platform || item.category || "")} • ${formatDate(item.date)}${countText}</small>
        <div class="meta-line">
          <span>Bruto: ${money(gross)}</span>
          <span>Líquido: ${money(net)}</span>
          <span>Taxa: ${money(fee)}</span>
          <span>${percent(feePercent)}</span>
          ${item.note ? `<span>Obs: ${escapeHTML(item.note)}</span>` : ""}
        </div>
      </div>

      <strong>${item.type === "despesa" ? "-" : ""}${money(net)}</strong>

      <button class="icon-btn" data-delete-transaction="${item.id}" title="Excluir">
        ×
      </button>
    </div>
  `;
}

function renderStock() {
  const statusFilter = $("#stock-status-filter").value;
  const categoryFilter = $("#stock-category-filter").value;
  const search = $("#stock-search").value.toLowerCase().trim();

  let filtered = [...stock];

  if (statusFilter !== "all") {
    filtered = filtered.filter((item) => item.status === statusFilter);
  }

  if (categoryFilter !== "all") {
    filtered = filtered.filter((item) => item.category === categoryFilter);
  }

  if (search) {
    filtered = filtered.filter((item) => {
      return `${item.name} ${item.game} ${item.category} ${item.note}`.toLowerCase().includes(search);
    });
  }

  const active = stock.filter((item) => !["Vendida", "Entregue"].includes(item.status));
  const potential = active.reduce((sum, item) => sum + Number(item.price || 0), 0);

  $("#st-total").textContent = active.length;
  $("#st-anunciados").textContent = stock.filter((item) => item.status === "Anunciada").length;
  $("#st-vendidos").textContent = stock.filter((item) => item.status === "Vendida").length;
  $("#st-potencial").textContent = money(potential);

  renderStockColumn("stock-ready", filtered.filter((item) => item.status === "Pronta"));
  renderStockColumn("stock-farming", filtered.filter((item) => item.status === "Farmando"));
  renderStockColumn("stock-listed", filtered.filter((item) => item.status === "Anunciada"));
  renderStockColumn("stock-sold", filtered.filter((item) => item.status === "Vendida" || item.status === "Entregue"));
  renderStockColumn("stock-problem", filtered.filter((item) => item.status === "Problema"));
}

function renderStockColumn(elementId, items) {
  const element = $(`#${elementId}`);

  if (!items.length) {
    element.innerHTML = `<div class="empty"><p>Vazio</p></div>`;
    return;
  }

  element.innerHTML = items.map((item) => `
    <div class="stock-card">
      <h4>${escapeHTML(item.name)}</h4>
      <p>${escapeHTML(item.game || "")} • ${escapeHTML(item.category || "")}</p>
      <p>${escapeHTML(item.platform || "")}</p>
      <p>Custo: ${money(item.cost)} • Preço: ${money(item.price)}</p>
      ${item.note ? `<p>Obs: ${escapeHTML(item.note)}</p>` : ""}

      <select data-stock-status="${item.id}">
        ${["Pronta", "Farmando", "Anunciada", "Vendida", "Entregue", "Problema"].map((status) => {
          return `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`;
        }).join("")}
      </select>

      <div class="stock-actions">
        <button class="ghost" data-edit-stock="${item.id}">Editar</button>
        <button class="icon-btn" data-delete-stock="${item.id}">×</button>
      </div>
    </div>
  `).join("");
}

function renderInvestments() {
  const total = totals();
  const invested = transactions
    .filter((item) => item.type === "despesa" && item.category === "Investimento")
    .reduce((sum, item) => sum + getNetValue(item), 0);

  const roi = invested ? ((total.receitas - invested) / invested) * 100 : 0;

  $("#inv-total").textContent = money(invested);
  $("#inv-retorno").textContent = money(total.receitas);
  $("#inv-saldo").textContent = money(total.receitas - invested);
  $("#inv-roi").textContent = percent(roi);

  const investments = transactions.filter((item) => item.type === "despesa" && item.category === "Investimento");

  $("#all-investments-list").innerHTML = investments.length ? investments.map(renderTransactionRow).join("") : `
    <div class="empty">
      <strong>Nenhum investimento cadastrado</strong>
      <p>Adicione gastos com contas, anúncios, ferramentas e servidores.</p>
    </div>
  `;
}

function renderInvestmentList() {
  const investments = transactions
    .filter((item) => item.type === "despesa" && item.category === "Investimento")
    .slice(0, 5);

  $("#investment-list").innerHTML = investments.length ? investments.map(renderTransactionRow).join("") : `
    <div class="empty">
      <p>Nenhum investimento recente.</p>
    </div>
  `;
}

function renderNotes() {
  const list = $("#notes-list");

  if (!notes.length) {
    list.innerHTML = `<div class="empty"><p>Nenhuma anotação salva ainda.</p></div>`;
    return;
  }

  list.innerHTML = notes.map((note) => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(note.title)}</strong>
        <small>${note.date || ""}</small>
        <p>${escapeHTML(note.text)}</p>
      </div>
    </div>
  `).join("");
}

function renderChart() {
  const canvas = $("#monthly-chart");
  if (!canvas) return;

  const year = new Date().getFullYear();
  const receitas = Array(12).fill(0);
  const despesas = Array(12).fill(0);

  transactions.forEach((item) => {
    const date = new Date(`${item.date}T00:00:00`);
    if (date.getFullYear() !== year) return;

    if (item.type === "receita") receitas[date.getMonth()] += getNetValue(item);
    if (item.type === "despesa") despesas[date.getMonth()] += getNetValue(item);
  });

  if (monthlyChart) monthlyChart.destroy();

  monthlyChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
      datasets: [
        {
          label: "Receitas líquidas",
          data: receitas,
          borderColor: "#ffffff",
          backgroundColor: "rgba(255,255,255,.08)",
          tension: .35,
          fill: true
        },
        {
          label: "Despesas",
          data: despesas,
          borderColor: "#9b9b9b",
          backgroundColor: "rgba(255,255,255,.035)",
          tension: .35,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: "#d8d8d8"
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#9a9a9a" },
          grid: { color: "rgba(255,255,255,.06)" }
        },
        y: {
          ticks: {
            color: "#9a9a9a",
            callback: (value) => money(value)
          },
          grid: { color: "rgba(255,255,255,.06)" }
        }
      }
    }
  });
}

function setupCalculator() {
  const display = $("#calc-display");

  $("[data-calc]")?.parentElement?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-calc]");
    if (!button) return;
    display.value += button.dataset.calc;
  });

  $("#calc-equals").addEventListener("click", calculateExpression);
  $("#calc-clear").addEventListener("click", () => display.value = "");
  $("#calc-back").addEventListener("click", () => display.value = display.value.slice(0, -1));

  display.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      calculateExpression();
    }

    if (event.key === "Escape") {
      display.value = "";
    }
  });

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

function calculateExpression() {
  const display = $("#calc-display");
  const expression = display.value.replace(/,/g, ".").replace(/[^0-9+\-*/().]/g, "");

  if (!expression) return;

  try {
    display.value = String(Function(`"use strict"; return (${expression})`)());
  } catch {
    display.value = "Erro";
  }
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("pt-BR");
}

function escapeHTML(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}