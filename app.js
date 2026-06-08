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
let savingTransaction = false;
let savingStock = false;

const months = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  setupNavigation();
  setupFilters();
  setupModals();
  setupForms();
  setupFeePreview();
  listenAuth();
});

function setupLogin() {
  $("#google-login").addEventListener("click", async () => {
    $("#login-status").textContent = "Abrindo login...";

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      $("#login-status").textContent = "Erro ao entrar. Confira se o login Google está ativado no Firebase.";
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
      showLogin(`Acesso negado para ${user.email}. Esse email não está permitido.`);
      return;
    }

    $("#user-email").textContent = user.email;
    $("#welcome-title").textContent = `Olá, ${user.displayName || "JH Store"} 👋`;

    showApp();

    await ensureDefaultSettings();
    startFirestoreListeners();
  });
}

async function isAllowedUser(email) {
  if (!email) return false;

  try {
    const allowedDoc = await getDoc(doc(db, "allowedUsers", email));
    return allowedDoc.exists();
  } catch (error) {
    console.error(error);
    $("#login-status").textContent = "Erro ao verificar permissão. Confira as regras do Firestore.";
    return false;
  }
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
      $$(".nav-item").forEach((item) => item.classList.remove("active"));
      $$(".page").forEach((page) => page.classList.remove("active"));

      button.classList.add("active");
      $(`#${button.dataset.page}`).classList.add("active");

      if (button.dataset.page === "faturamento") {
        setTimeout(renderChart, 60);
      }
    });
  });
}

function setupFilters() {
  const monthFilter = $("#month-filter");
  const yearFilter = $("#year-filter");
  const current = new Date();

  monthFilter.innerHTML = months.map((m, index) => {
    return `<option value="${index}" ${index === current.getMonth() ? "selected" : ""}>${m}</option>`;
  }).join("");

  const year = current.getFullYear();

  yearFilter.innerHTML = [year - 1, year, year + 1].map((y) => {
    return `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`;
  }).join("");

  monthFilter.addEventListener("change", renderAll);
  yearFilter.addEventListener("change", renderAll);
}

function setupModals() {
  $("#open-transaction-modal").addEventListener("click", () => {
    $("#tr-date").value = new Date().toISOString().slice(0, 10);
    $("#transaction-modal").showModal();
    updateFeePreview();
  });

  $("#open-stock-modal").addEventListener("click", () => {
    $("#stock-modal").showModal();
  });

  $("#quick-investment").addEventListener("click", () => {
    $("#tr-type").value = "despesa";
    $("#tr-category").value = "Investimento";
    $("#tr-fee-percent").value = "";
    $("#tr-date").value = new Date().toISOString().slice(0, 10);
    $("#transaction-modal").showModal();
    updateFeePreview();
  });

  $$("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).close();
    });
  });
}

function setupFeePreview() {
  $("#tr-gross-value").addEventListener("input", updateFeePreview);
  $("#tr-fee-percent").addEventListener("input", updateFeePreview);
  $("#tr-type").addEventListener("change", updateFeePreview);
}

function updateFeePreview() {
  const type = $("#tr-type").value;
  const grossValue = Number($("#tr-gross-value").value || 0);
  const feePercent = type === "receita" ? Number($("#tr-fee-percent").value || 0) : 0;
  const feeValue = grossValue * (feePercent / 100);
  const netValue = Math.max(grossValue - feeValue, 0);

  $("#fee-value-preview").textContent = money(feeValue);
  $("#net-value-preview").textContent = money(type === "receita" ? netValue : grossValue);

  if (type === "despesa") {
    $("#fee-field").style.opacity = ".45";
    $("#tr-fee-percent").disabled = true;
  } else {
    $("#fee-field").style.opacity = "1";
    $("#tr-fee-percent").disabled = false;
  }
}

function setupForms() {
  $("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (savingTransaction) return;

    savingTransaction = true;
    const saveButton = $("#save-transaction-btn");
    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";

    try {
      const type = $("#tr-type").value;
      const grossValue = Number($("#tr-gross-value").value || 0);
      const feePercent = type === "receita" ? Number($("#tr-fee-percent").value || 0) : 0;
      const feeValue = type === "receita" ? grossValue * (feePercent / 100) : 0;
      const netValue = type === "receita" ? Math.max(grossValue - feeValue, 0) : grossValue;

      await addDoc(collection(db, "transactions"), {
        type,
        category: $("#tr-category").value,
        desc: $("#tr-desc").value.trim(),
        grossValue,
        feePercent,
        feeValue,
        value: netValue,
        date: $("#tr-date").value,
        createdAt: serverTimestamp()
      });

      event.target.reset();
      $("#transaction-modal").close();
      updateFeePreview();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar movimentação.");
    } finally {
      savingTransaction = false;
      saveButton.disabled = false;
      saveButton.textContent = "Salvar movimentação";
    }
  });

  $("#stock-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (savingStock) return;

    savingStock = true;
    const saveButton = $("#save-stock-btn");
    saveButton.disabled = true;
    saveButton.textContent = "Salvando...";

    try {
      await addDoc(collection(db, "stock"), {
        name: $("#stock-name").value.trim(),
        game: $("#stock-game").value,
        cost: Number($("#stock-cost").value || 0),
        price: Number($("#stock-price").value || 0),
        status: $("#stock-status").value,
        createdAt: serverTimestamp()
      });

      event.target.reset();
      $("#stock-modal").close();
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar item.");
    } finally {
      savingStock = false;
      saveButton.disabled = false;
      saveButton.textContent = "Salvar item";
    }
  });

  $("#add-note").addEventListener("click", async () => {
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
  });

  $("#clear-transactions").addEventListener("click", async () => {
    if (!confirm("Tem certeza que deseja apagar TODAS as movimentações?")) return;
    await deleteCollection("transactions");
  });

  $("#clear-stock").addEventListener("click", async () => {
    if (!confirm("Tem certeza que deseja apagar todo o estoque?")) return;
    await deleteCollection("stock");
  });

  $("#transaction-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-transaction]");
    if (!button) return;

    const id = button.dataset.deleteTransaction;

    if (!confirm("Excluir somente essa movimentação?")) return;

    await deleteDoc(doc(db, "transactions", id));
  });

  $("#stock-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-stock]");
    if (!button) return;

    const id = button.dataset.deleteStock;

    if (!confirm("Excluir somente esse item do estoque?")) return;

    await deleteDoc(doc(db, "stock", id));
  });

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

async function deleteCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));

  const deletions = snapshot.docs.map((docItem) => {
    return deleteDoc(doc(db, collectionName, docItem.id));
  });

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

  const vendas = list.filter((item) => item.type === "receita").length;
  const lucro = receitas - despesas;
  const ticket = vendas ? receitas / vendas : 0;
  const roi = despesas ? ((receitas - despesas) / despesas) * 100 : 0;
  const margem = receitas ? (lucro / receitas) * 100 : 0;

  return {
    receitas,
    receitasBrutas,
    taxas,
    despesas,
    vendas,
    lucro,
    ticket,
    roi,
    margem
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

  const activeStock = stock.filter((item) => {
    return item.status !== "Vendido" && item.status !== "Entregue";
  }).length;

  const goalPercent = Math.min((total.receitas / settings.goal) * 100, 100);

  $("#ov-total").textContent = money(total.receitas);
  $("#ov-vendas").textContent = total.vendas;
  $("#ov-lucro").textContent = money(total.lucro);
  $("#ov-estoque").textContent = activeStock;
  $("#ov-roi").textContent = percent(total.roi);

  $("#quick-meta").textContent = percent(goalPercent);
  $("#quick-ticket").textContent = money(total.ticket);
  $("#quick-investido").textContent = money(total.despesas);
  $("#quick-progress-text").textContent = percent(goalPercent);
  $("#quick-progress").style.width = `${goalPercent}%`;
}

function renderDashboard() {
  const period = selectedPeriodTransactions();
  const periodTotals = totals(period);
  const allTotals = totals();
  const goalPercent = Math.min((periodTotals.receitas / settings.goal) * 100, 100);

  $("#db-vendas").textContent = periodTotals.vendas;
  $("#db-receitas").textContent = money(periodTotals.receitas);
  $("#db-taxas").textContent = money(periodTotals.taxas);
  $("#db-ticket").textContent = money(periodTotals.ticket);

  $("#goal-current").textContent = money(periodTotals.receitas);
  $("#goal-target").textContent = money(settings.goal);
  $("#goal-progress").style.width = `${goalPercent}%`;
  $("#goal-percent").textContent = `${percent(goalPercent)} da meta atingida`;

  $("#card-fat-mensal").textContent = money(periodTotals.receitas);
  $("#card-fat-bruto").textContent = money(allTotals.receitasBrutas);
  $("#card-taxas").textContent = money(allTotals.taxas);
  $("#card-saldo-mensal").textContent = money(periodTotals.lucro);
  $("#card-lucro-real").textContent = money(allTotals.lucro);
  $("#card-roi").textContent = percent(allTotals.roi);

  renderInvestmentList();
}

function renderFaturamento() {
  const total = totals();

  $("#ft-receitas").textContent = money(total.receitas);
  $("#ft-despesas").textContent = money(total.despesas);
  $("#ft-taxas").textContent = money(total.taxas);
  $("#ft-saldo").textContent = money(total.lucro);

  const list = $("#transaction-list");

  if (!transactions.length) {
    list.innerHTML = `
      <div class="empty">
        <strong>Nenhuma movimentação ainda</strong>
        <p>Clique em “Nova Movimentação” para começar.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = transactions.map((item) => {
    const grossValue = getGrossValue(item);
    const feeValue = getFeeValue(item);
    const netValue = getNetValue(item);
    const feePercent = Number(item.feePercent || 0);

    return `
      <div class="item-row">
        <div>
          <strong>${escapeHTML(item.desc)}</strong>
          <small>${escapeHTML(item.category)} • ${formatDate(item.date)}</small>

          <div class="meta-line">
            <span>Bruto: ${money(grossValue)}</span>
            <span>Taxa: ${money(feeValue)} ${feePercent ? `(${feePercent}%)` : ""}</span>
            <span>Líquido: ${money(netValue)}</span>
          </div>
        </div>

        <span class="badge ${item.type === "despesa" ? "red" : ""}">
          ${item.type}
        </span>

        <strong>
          ${money(netValue)}
        </strong>

        <button class="icon-btn" data-delete-transaction="${item.id}" title="Excluir movimentação">
          ×
        </button>
      </div>
    `;
  }).join("");
}

function renderStock() {
  const announced = stock.filter((item) => item.status === "Anunciado").length;

  const sold = stock.filter((item) => {
    return item.status === "Vendido" || item.status === "Entregue";
  }).length;

  const potential = stock
    .filter((item) => item.status !== "Vendido" && item.status !== "Entregue")
    .reduce((sum, item) => sum + Number(item.price || 0), 0);

  $("#st-total").textContent = stock.length;
  $("#st-anunciados").textContent = announced;
  $("#st-vendidos").textContent = sold;
  $("#st-potencial").textContent = money(potential);

  const list = $("#stock-list");

  if (!stock.length) {
    list.innerHTML = `
      <div class="empty">
        <strong>Nenhum item cadastrado</strong>
        <p>Adicione contas, carros, itens e produtos.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = stock.map((item) => `
    <div class="stock-row">
      <div>
        <strong>${escapeHTML(item.name)}</strong>
        <small>${escapeHTML(item.game)}</small>
      </div>

      <div>
        <small>Custo</small>
        <strong>${money(item.cost)}</strong>
      </div>

      <div>
        <small>Preço</small>
        <strong>${money(item.price)}</strong>
      </div>

      <div>
        <small>Lucro previsto</small>
        <strong>
          ${money(Number(item.price || 0) - Number(item.cost || 0))}
        </strong>
      </div>

      <button class="icon-btn" data-delete-stock="${item.id}" title="Excluir item">
        ×
      </button>
    </div>
  `).join("");
}

function renderInvestments() {
  const invested = transactions
    .filter((item) => item.type === "despesa" && item.category === "Investimento")
    .reduce((sum, item) => sum + getNetValue(item), 0);

  const retorno = transactions
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + getNetValue(item), 0);

  $("#inv-total").textContent = money(invested);
  $("#inv-retorno").textContent = money(retorno);
  $("#inv-saldo").textContent = money(retorno - invested);
}

function renderInvestmentList() {
  const investments = transactions.filter((item) => {
    return item.type === "despesa" && item.category === "Investimento";
  });

  const list = $("#investment-list");

  if (!investments.length) {
    list.innerHTML = `
      <div class="empty">
        <p>Você ainda não investiu nada</p>
      </div>
    `;
    return;
  }

  list.innerHTML = investments.slice(0, 5).map((item) => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(item.desc)}</strong>
        <small>${formatDate(item.date)}</small>
      </div>

      <strong>${money(getNetValue(item))}</strong>

      <button class="icon-btn" data-delete-transaction="${item.id}" title="Excluir movimentação">
        ×
      </button>
    </div>
  `).join("");
}

function renderNotes() {
  const list = $("#notes-list");

  if (!notes.length) {
    list.innerHTML = `
      <div class="empty">
        <p>Nenhuma anotação salva ainda.</p>
      </div>
    `;
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

    if (item.type === "receita") {
      receitas[date.getMonth()] += getNetValue(item);
    }

    if (item.type === "despesa") {
      despesas[date.getMonth()] += getNetValue(item);
    }
  });

  if (monthlyChart) {
    monthlyChart.destroy();
  }

  monthlyChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez"
      ],
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
          ticks: {
            color: "#9a9a9a"
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        },
        y: {
          ticks: {
            color: "#9a9a9a",
            callback: (value) => money(value)
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        }
      }
    }
  });
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