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
  name: "Lost Dashboard",
  goal: 5000
};

let monthlyChart;
let unsubscribers = [];

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
    $("#welcome-title").textContent = `Olá, ${user.displayName || "Lost"} 👋`;

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
      name: "Lost Dashboard",
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
        name: snapshot.data().name || "Lost Dashboard",
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
  });

  $("#open-stock-modal").addEventListener("click", () => {
    $("#stock-modal").showModal();
  });

  $("#quick-investment").addEventListener("click", () => {
    $("#tr-type").value = "despesa";
    $("#tr-category").value = "Investimento";
    $("#tr-date").value = new Date().toISOString().slice(0, 10);
    $("#transaction-modal").showModal();
  });

  $$("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      $(`#${button.dataset.close}`).close();
    });
  });
}

function setupForms() {
  $("#transaction-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    await addDoc(collection(db, "transactions"), {
      type: $("#tr-type").value,
      category: $("#tr-category").value,
      desc: $("#tr-desc").value.trim(),
      value: Number($("#tr-value").value),
      date: $("#tr-date").value,
      createdAt: serverTimestamp()
    });

    event.target.reset();
    $("#transaction-modal").close();
  });

  $("#stock-form").addEventListener("submit", async (event) => {
    event.preventDefault();

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
    if (!confirm("Tem certeza que deseja apagar todas as movimentações?")) return;
    await deleteCollection("transactions");
  });

  $("#clear-stock").addEventListener("click", async () => {
    if (!confirm("Tem certeza que deseja apagar todo o estoque?")) return;
    await deleteCollection("stock");
  });

  $("#goal-select").addEventListener("change", async () => {
    settings.goal = Number($("#goal-select").value);
    await saveSettings();
  });

  $("#save-settings").addEventListener("click", async () => {
    settings.name = $("#setting-name").value.trim() || "Lost Dashboard";
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
    name: settings.name || "Lost Dashboard",
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

function totals(list = transactions) {
  const receitas = list
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const despesas = list
    .filter((item) => item.type === "despesa")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const vendas = list.filter((item) => item.type === "receita").length;
  const lucro = receitas - despesas;
  const ticket = vendas ? receitas / vendas : 0;
  const roi = despesas ? ((receitas - despesas) / despesas) * 100 : 0;
  const margem = receitas ? (lucro / receitas) * 100 : 0;

  return {
    receitas,
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
  $("#db-ticket").textContent = money(periodTotals.ticket);
  $("#db-margem").textContent = percent(periodTotals.margem);

  $("#goal-current").textContent = money(periodTotals.receitas);
  $("#goal-target").textContent = money(settings.goal);
  $("#goal-progress").style.width = `${goalPercent}%`;
  $("#goal-percent").textContent = `${percent(goalPercent)} da meta atingida`;

  $("#card-fat-mensal").textContent = money(periodTotals.receitas);
  $("#card-fat-bruto").textContent = money(allTotals.receitas);
  $("#card-saldo-mensal").textContent = money(periodTotals.lucro);
  $("#card-meta").textContent = percent(goalPercent);
  $("#card-lucro-real").textContent = money(allTotals.lucro);
  $("#card-roi").textContent = percent(allTotals.roi);

  renderInvestmentList();
}

function renderFaturamento() {
  const total = totals();

  $("#ft-receitas").textContent = money(total.receitas);
  $("#ft-despesas").textContent = money(total.despesas);
  $("#ft-saldo").textContent = money(total.lucro);
  $("#ft-roi").textContent = percent(total.roi);

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

  list.innerHTML = transactions.map((item) => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(item.desc)}</strong>
        <small>${escapeHTML(item.category)} • ${formatDate(item.date)}</small>
      </div>

      <span class="badge ${item.type === "despesa" ? "red" : ""}">
        ${item.type}
      </span>

      <strong class="${item.type === "despesa" ? "red" : "green"}">
        ${money(item.value)}
      </strong>
    </div>
  `).join("");
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
        <strong class="green">
          ${money(Number(item.price || 0) - Number(item.cost || 0))}
        </strong>
      </div>

      <span class="badge">${escapeHTML(item.status)}</span>
    </div>
  `).join("");
}

function renderInvestments() {
  const invested = transactions
    .filter((item) => item.type === "despesa" && item.category === "Investimento")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

  const retorno = transactions
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + Number(item.value || 0), 0);

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

      <strong class="red">${money(item.value)}</strong>
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
      receitas[date.getMonth()] += Number(item.value || 0);
    }

    if (item.type === "despesa") {
      despesas[date.getMonth()] += Number(item.value || 0);
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
          label: "Receitas",
          data: receitas,
          borderColor: "#18e67a",
          backgroundColor: "rgba(24, 230, 122, .08)",
          tension: .35,
          fill: true
        },
        {
          label: "Despesas",
          data: despesas,
          borderColor: "#ff3b3b",
          backgroundColor: "rgba(255, 59, 59, .06)",
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