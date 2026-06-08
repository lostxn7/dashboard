const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const percent = (value) => `${Number(value || 0).toFixed(1)}%`;

const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

let transactions = storage.get("lost_transactions", []);
let stock = storage.get("lost_stock", []);
let notes = storage.get("lost_notes", []);
let settings = storage.get("lost_settings", {
  name: "Lost Dashboard",
  goal: 5000
});

let monthlyChart;

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function init() {
  setupNavigation();
  setupFilters();
  setupModals();
  setupForms();
  setupSettings();
  renderAll();
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
  $("#transaction-form").addEventListener("submit", (event) => {
    event.preventDefault();

    transactions.unshift({
      id: crypto.randomUUID(),
      type: $("#tr-type").value,
      category: $("#tr-category").value,
      desc: $("#tr-desc").value.trim(),
      value: Number($("#tr-value").value),
      date: $("#tr-date").value
    });

    storage.set("lost_transactions", transactions);
    event.target.reset();
    $("#transaction-modal").close();
    renderAll();
  });

  $("#stock-form").addEventListener("submit", (event) => {
    event.preventDefault();

    stock.unshift({
      id: crypto.randomUUID(),
      name: $("#stock-name").value.trim(),
      game: $("#stock-game").value,
      cost: Number($("#stock-cost").value || 0),
      price: Number($("#stock-price").value || 0),
      status: $("#stock-status").value
    });

    storage.set("lost_stock", stock);
    event.target.reset();
    $("#stock-modal").close();
    renderAll();
  });

  $("#add-note").addEventListener("click", () => {
    const title = $("#note-title").value.trim();
    const text = $("#note-text").value.trim();

    if (!title || !text) return;

    notes.unshift({
      id: crypto.randomUUID(),
      title,
      text,
      date: new Date().toLocaleDateString("pt-BR")
    });

    storage.set("lost_notes", notes);
    $("#note-title").value = "";
    $("#note-text").value = "";
    renderNotes();
  });

  $("#clear-transactions").addEventListener("click", () => {
    if (!confirm("Tem certeza que deseja apagar todas as movimentações?")) return;
    transactions = [];
    storage.set("lost_transactions", transactions);
    renderAll();
  });

  $("#clear-stock").addEventListener("click", () => {
    if (!confirm("Tem certeza que deseja apagar todo o estoque?")) return;
    stock = [];
    storage.set("lost_stock", stock);
    renderAll();
  });

  $("#goal-select").addEventListener("change", () => {
    settings.goal = Number($("#goal-select").value);
    storage.set("lost_settings", settings);
    renderAll();
  });
}

function setupSettings() {
  $("#setting-name").value = settings.name;
  $("#setting-goal").value = settings.goal;
  $("#goal-select").value = String(settings.goal);

  $("#save-settings").addEventListener("click", () => {
    settings.name = $("#setting-name").value.trim() || "Lost Dashboard";
    settings.goal = Number($("#setting-goal").value || 5000);

    if (![1000, 3000, 5000, 10000].includes(settings.goal)) {
      const option = document.createElement("option");
      option.value = settings.goal;
      option.textContent = money(settings.goal);
      $("#goal-select").appendChild(option);
    }

    $("#goal-select").value = String(settings.goal);
    storage.set("lost_settings", settings);
    renderAll();
    alert("Configurações salvas!");
  });
}

function totals(list = transactions) {
  const receitas = list
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + item.value, 0);

  const despesas = list
    .filter((item) => item.type === "despesa")
    .reduce((sum, item) => sum + item.value, 0);

  const vendas = list.filter((item) => item.type === "receita").length;
  const lucro = receitas - despesas;
  const ticket = vendas ? receitas / vendas : 0;
  const roi = despesas ? ((receitas - despesas) / despesas) * 100 : 0;
  const margem = receitas ? (lucro / receitas) * 100 : 0;

  return { receitas, despesas, vendas, lucro, ticket, roi, margem };
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
  renderNotes();
  renderChart();
}

function renderOverview() {
  const total = totals();
  const activeStock = stock.filter((item) => item.status !== "Vendido" && item.status !== "Entregue").length;
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
    list.innerHTML = `<div class="empty"><strong>Nenhuma movimentação ainda</strong><p>Clique em “Nova Movimentação” para começar.</p></div>`;
    return;
  }

  list.innerHTML = transactions.map((item) => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(item.desc)}</strong>
        <small>${item.category} • ${formatDate(item.date)}</small>
      </div>
      <span class="badge ${item.type === "despesa" ? "red" : ""}">${item.type}</span>
      <strong class="${item.type === "despesa" ? "red" : "green"}">${money(item.value)}</strong>
    </div>
  `).join("");
}

function renderStock() {
  const announced = stock.filter((item) => item.status === "Anunciado").length;
  const sold = stock.filter((item) => item.status === "Vendido" || item.status === "Entregue").length;
  const potential = stock
    .filter((item) => item.status !== "Vendido" && item.status !== "Entregue")
    .reduce((sum, item) => sum + item.price, 0);

  $("#st-total").textContent = stock.length;
  $("#st-anunciados").textContent = announced;
  $("#st-vendidos").textContent = sold;
  $("#st-potencial").textContent = money(potential);

  const list = $("#stock-list");

  if (!stock.length) {
    list.innerHTML = `<div class="empty"><strong>Nenhum item cadastrado</strong><p>Adicione contas, carros, itens e produtos.</p></div>`;
    return;
  }

  list.innerHTML = stock.map((item) => `
    <div class="stock-row">
      <div>
        <strong>${escapeHTML(item.name)}</strong>
        <small>${item.game}</small>
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
        <strong class="green">${money(item.price - item.cost)}</strong>
      </div>
      <span class="badge">${item.status}</span>
    </div>
  `).join("");
}

function renderInvestments() {
  const invested = transactions
    .filter((item) => item.type === "despesa" && item.category === "Investimento")
    .reduce((sum, item) => sum + item.value, 0);

  const retorno = transactions
    .filter((item) => item.type === "receita")
    .reduce((sum, item) => sum + item.value, 0);

  $("#inv-total").textContent = money(invested);
  $("#inv-retorno").textContent = money(retorno);
  $("#inv-saldo").textContent = money(retorno - invested);
}

function renderInvestmentList() {
  const investments = transactions.filter((item) => item.type === "despesa" && item.category === "Investimento");
  const list = $("#investment-list");

  if (!investments.length) {
    list.innerHTML = `<div class="empty"><p>Você ainda não investiu nada</p></div>`;
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
    list.innerHTML = `<div class="empty"><p>Nenhuma anotação salva ainda.</p></div>`;
    return;
  }

  list.innerHTML = notes.map((note) => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(note.title)}</strong>
        <small>${note.date}</small>
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

    if (item.type === "receita") receitas[date.getMonth()] += item.value;
    if (item.type === "despesa") despesas[date.getMonth()] += item.value;
  });

  if (monthlyChart) {
    monthlyChart.destroy();
  }

  monthlyChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
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

function formatDate(dateString) {
  return new Date(`${dateString}T00:00:00`).toLocaleDateString("pt-BR");
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", init);
