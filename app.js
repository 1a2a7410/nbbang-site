import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TEXT = {
  appTitle: "N빵 정산",
  settlementNamePlaceholder: "정산 이름을 입력하세요",
  enter: "입장하기",
  currentSettlement: "현재 정산",
  loginHelp: "정산 이름을 입력하면 같은 이름의 정산방으로 접속합니다.",
  addExpense: "정산추가",
  deleteExpense: "정산삭제",
  checkSettlement: "정산확인",
  addMember: "인원추가",
  memberManage: "인원 관리",
  namePlaceholder: "이름을 입력하세요",
  add: "추가",
  registeredMembers: "등록된 인원",
  delete: "삭제",
  noMembers: "아직 등록된 인원이 없습니다.",
  needMembers: "인원을 먼저 추가해주세요.",
  close: "닫기",
  expenseAdd: "정산 추가",
  date: "날짜",
  place: "장소(품목)",
  payer: "결제자",
  participants: "부담자",
  totalAmount: "총 금액",
  splitAmount: "N빵 금액",
  datePlaceholder: "날짜를 선택하세요",
  placePlaceholder: "장소(품목)를(을) 입력하세요",
  payerPlaceholder: "결제자를 선택하세요",
  participantsPlaceholder: "부담자를 선택하세요",
  totalAmountPlaceholder: "총 금액을 입력하세요",
  autoCalculated: "자동 계산됩니다",
  confirm: "확인",
  cancel: "취소",
  expenseList: "정산 내역",
  noExpenses: "아직 등록된 정산이 없습니다.",
  sortedByDate: "날짜순으로 정산 내역이 표시됩니다.",
  perPerson: "1인당",
  won: "원",
  peopleUnit: "명",
  deleteTitle: "정산 삭제",
  chooseDelete: "삭제할 정산을 선택하세요.",
  noDeleteExpenses: "삭제할 정산이 없습니다.",
  deleteHelp: "정산을 삭제하면 해당 정산의 계산값도 함께 제거됩니다.",
  settlementTitle: "정산 확인",
  finalResult: "최종 정산 결과",
  allDone: "모든 정산이 완료되었습니다.",
  noSettlement: "아직 정산할 금액이 없습니다.",
  settlementHelp: "아래 금액을 송금 시 전체 정산이 완료됩니다.",
  realtimeCheckHelp: "체크한 항목은 실시간으로 완료된 송금으로 표시됩니다.",
  sender: "보낼 사람",
  receiver: "받을 사람",
  sendAmount: "보낼 금액",
  done: "완료",
  undone: "미완료",
  errSettlementName: "정산 이름을 입력해주세요.",
  errName: "이름을 입력해주세요.",
  errDuplicateName: "이미 등록된 이름입니다.",
  memberAdded: "인원이 추가되었습니다.",
  memberDeleted: "인원이 삭제되었습니다.",
  errNeedMembersForExpense: "정산을 추가하려면 인원을 먼저 추가해주세요.",
  errDate: "날짜를 입력해주세요.",
  errPlace: "장소를 입력해주세요.",
  errPayer: "결제자를 선택해주세요.",
  errParticipants: "부담자를 1명 이상 선택해주세요.",
  errAmount: "총 금액을 입력해주세요.",
  errAmountPositive: "총 금액은 0원보다 커야 합니다.",
  expenseAdded: "정산이 추가되었습니다.",
  expenseDeleted: "정산이 삭제되었습니다.",
  checkSaved: "정산 완료 상태가 저장되었습니다.",
  loading: "데이터를 불러오는 중입니다.",
  saveError: "데이터 저장 중 오류가 발생했습니다.",
  loadError: "데이터를 불러오지 못했습니다.",
  firebaseError: "Firebase 연결을 확인해주세요."
};

const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen");
const appScreen = $("appScreen");
const tripNameInput = $("tripNameInput");
const enterTripBtn = $("enterTripBtn");
const recentWrap = $("recentWrap");
const recentSelect = $("recentSelect");
const tripTitle = $("tripTitle");
const changeTripBtn = $("changeTripBtn");
const memberCount = $("memberCount");
const expenseCount = $("expenseCount");
const totalAmount = $("totalAmount");
const expenseList = $("expenseList");
const syncState = $("syncState");
const modalBackdrop = $("modalBackdrop");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalCloseBtn = $("modalCloseBtn");
const toast = $("toast");

let tripId = "";
let unsubscribe = null;
let state = emptyState();
let settlementModalOpen = false;

function emptyState() {
  return { members: [], expenses: [], settlementsChecked: {}, updatedAt: null, createdAt: null };
}
function sanitizeTripName(name) {
  return name.trim().replace(/[\/#[]?]/g, "_").slice(0, 80);
}
function makeId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}
function money(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}${TEXT.won}`;
}
function showToast(message) {
  if (!toast) return alert(message);
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 1800);
}

function saveRecentTrip(name) {
  const key = "nbbang_recent_trips";
  const list = JSON.parse(localStorage.getItem(key) || "[]").filter((item) => item !== name);
  list.unshift(name);
  localStorage.setItem(key, JSON.stringify(list.slice(0, 3)));
  renderRecentTrips();
}
function renderRecentTrips() {
  const list = JSON.parse(localStorage.getItem("nbbang_recent_trips") || "[]").slice(0, 3);
  recentSelect.innerHTML = `<option value="">최근 정산 이름 선택</option>`;
  list.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    recentSelect.appendChild(option);
  });
  recentWrap.classList.toggle("hidden", list.length === 0);
}

recentSelect.addEventListener("change", () => {
  if (recentSelect.value) tripNameInput.value = recentSelect.value;
});
enterTripBtn.addEventListener("click", enterTrip);
tripNameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") enterTrip(); });
changeTripBtn.addEventListener("click", () => {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  tripId = "";
  state = emptyState();
  appScreen.classList.remove("active");
  loginScreen.classList.add("active");
  renderRecentTrips();
});

async function enterTrip() {
  const name = sanitizeTripName(tripNameInput.value);
  if (!name) return showToast(TEXT.errSettlementName);
  tripId = name;
  saveRecentTrip(name);
  tripTitle.textContent = name;
  loginScreen.classList.remove("active");
  appScreen.classList.add("active");
  syncState.textContent = TEXT.loading;

  if (unsubscribe) unsubscribe();
  const ref = doc(db, "trips", tripId);
  unsubscribe = onSnapshot(ref, async (snap) => {
    if (!snap.exists()) {
      state = emptyState();
      await setDoc(ref, { ...state, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      syncState.textContent = "연결됨";
      renderAll();
      return;
    }
    const data = snap.data();
    state = {
      members: Array.isArray(data.members) ? data.members : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      settlementsChecked: data.settlementsChecked || {},
      updatedAt: data.updatedAt || null,
      createdAt: data.createdAt || null
    };
    syncState.textContent = "실시간 동기화 중";
    renderAll();
    if (settlementModalOpen && !modalBackdrop.classList.contains("hidden")) renderSettlementModalBody();
  }, () => {
    syncState.textContent = "연결 오류";
    showToast(`${TEXT.loadError} ${TEXT.firebaseError}`);
  });
}

async function savePatch(patch) {
  if (!tripId) return;
  try {
    await updateDoc(doc(db, "trips", tripId), { ...patch, updatedAt: serverTimestamp() });
  } catch (error) {
    try {
      await setDoc(doc(db, "trips", tripId), { ...emptyState(), ...patch, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      showToast(TEXT.saveError);
    }
  }
}

function renderAll() {
  memberCount.textContent = `${state.members.length}${TEXT.peopleUnit}`;
  expenseCount.textContent = `${state.expenses.length}건`;
  totalAmount.textContent = money(state.expenses.reduce((sum, e) => sum + (Number(e.totalAmount) || 0), 0));
  renderExpenseList();
}
function sortedExpenses() {
  return [...state.expenses].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}
function renderExpenseList() {
  const list = sortedExpenses();
  if (list.length === 0) {
    expenseList.classList.add("empty");
    expenseList.innerHTML = `${TEXT.noExpenses}<br><span class="small">${TEXT.sortedByDate}</span>`;
    return;
  }
  expenseList.classList.remove("empty");
  expenseList.innerHTML = list.map((expense) => `
    <article class="expense-card">
      <div class="expense-top">
        <div>
          <div class="expense-date">${escapeHtml(expense.date)}</div>
          <div class="expense-place">${escapeHtml(expense.place)}</div>
        </div>
        <div class="amount">${money(expense.totalAmount)}</div>
      </div>
      <div class="meta">
        <div><b>${TEXT.payer}</b> · ${escapeHtml(expense.payer)}</div>
        <div><b>${TEXT.participants}</b> · ${expense.participants.length}${TEXT.peopleUnit}<div class="badges">${expense.participants.map((p) => `<span class="badge">${escapeHtml(p)}</span>`).join("")}</div></div>
        <div><b>${TEXT.perPerson}</b> · ${money(expense.splitAmount)}</div>
      </div>
    </article>
  `).join("");
}

function openModal(title, bodyHtml) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalBackdrop.classList.remove("hidden");
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  settlementModalOpen = false;
}
modalCloseBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (event) => { if (event.target === modalBackdrop) closeModal(); });

$("manageMembersBtn").addEventListener("click", openMemberModal);
$("addExpenseBtn").addEventListener("click", openAddExpenseModal);
$("deleteExpenseBtn").addEventListener("click", openDeleteExpenseModal);
$("checkSettlementBtn").addEventListener("click", openSettlementModal);

function openMemberModal() {
  openModal(TEXT.memberManage, `
    <div class="form-grid">
      <label>${TEXT.namePlaceholder}</label>
      <input id="memberNameInput" placeholder="${TEXT.namePlaceholder}" />
      <button id="memberAddBtn" class="primary">${TEXT.add}</button>
      <h3>${TEXT.registeredMembers}</h3>
      <div id="memberList"></div>
    </div>
  `);
  renderMemberListInModal();
  $("memberAddBtn").addEventListener("click", addMember);
  $("memberNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addMember(); });
}
function renderMemberListInModal() {
  const list = $("memberList");
  if (!list) return;
  if (state.members.length === 0) {
    list.innerHTML = `<p class="small">${TEXT.noMembers}<br>${TEXT.needMembers}</p>`;
    return;
  }
  list.innerHTML = state.members.map((name) => `
    <div class="member-row">
      <strong>${escapeHtml(name)}</strong>
      <button class="danger" data-member-delete="${escapeHtml(name)}">${TEXT.delete}</button>
    </div>
  `).join("");
  list.querySelectorAll("[data-member-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteMember(btn.dataset.memberDelete));
  });
}
async function addMember() {
  const input = $("memberNameInput");
  const name = input.value.trim();
  if (!name) return showToast(TEXT.errName);
  if (state.members.includes(name)) return showToast(TEXT.errDuplicateName);
  await savePatch({ members: [...state.members, name] });
  input.value = "";
  showToast(TEXT.memberAdded);
  setTimeout(renderMemberListInModal, 250);
}
async function deleteMember(name) {
  const members = state.members.filter((m) => m !== name);
  const expenses = state.expenses.map((e) => ({ ...e, participants: e.participants.filter((p) => p !== name) }))
    .filter((e) => e.payer !== name && e.participants.length > 0);
  await savePatch({ members, expenses, settlementsChecked: {} });
  showToast(TEXT.memberDeleted);
  setTimeout(renderMemberListInModal, 250);
}

function openAddExpenseModal() {
  if (state.members.length === 0) return showToast(TEXT.errNeedMembersForExpense);
  const memberOptions = state.members.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  const participantChecks = state.members.map((m) => `
    <label class="check-item"><input type="checkbox" name="participants" value="${escapeHtml(m)}" /> ${escapeHtml(m)}</label>
  `).join("");
  openModal(TEXT.expenseAdd, `
    <div class="form-grid">
      <label>${TEXT.date}</label>
      <input id="expenseDate" type="date" placeholder="${TEXT.datePlaceholder}" />
      <label>${TEXT.place}</label>
      <input id="expensePlace" placeholder="${TEXT.placePlaceholder}" />
      <label>${TEXT.payer}</label>
      <select id="expensePayer"><option value="">${TEXT.payerPlaceholder}</option>${memberOptions}</select>
      <label>${TEXT.participants}</label>
      <p class="small">${TEXT.participantsPlaceholder}</p>
      <div class="checks">${participantChecks}</div>
      <label>${TEXT.totalAmount}</label>
      <input id="expenseAmount" inputmode="numeric" placeholder="${TEXT.totalAmountPlaceholder}" />
      <label>${TEXT.splitAmount}</label>
      <div id="splitPreview" class="calc-box">${TEXT.autoCalculated}</div>
      <div class="action-row">
        <button class="cancel-btn" id="addCancelBtn">${TEXT.cancel}</button>
        <button class="ok-btn" id="addConfirmBtn">${TEXT.confirm}</button>
      </div>
    </div>
  `);
  $("expenseDate").value = new Date().toISOString().slice(0, 10);
  const updatePreview = () => {
    const amount = Number(String($("expenseAmount").value).replace(/[^0-9]/g, ""));
    const count = [...document.querySelectorAll('input[name="participants"]:checked')].length;
    $("splitPreview").textContent = amount > 0 && count > 0 ? money(Math.round(amount / count)) : TEXT.autoCalculated;
  };
  $("expenseAmount").addEventListener("input", updatePreview);
  document.querySelectorAll('input[name="participants"]').forEach((el) => el.addEventListener("change", updatePreview));
  $("addCancelBtn").addEventListener("click", closeModal);
  $("addConfirmBtn").addEventListener("click", addExpense);
}
async function addExpense() {
  const date = $("expenseDate").value;
  const place = $("expensePlace").value.trim();
  const payer = $("expensePayer").value;
  const participants = [...document.querySelectorAll('input[name="participants"]:checked')].map((el) => el.value);
  const total = Number(String($("expenseAmount").value).replace(/[^0-9]/g, ""));
  if (!date) return showToast(TEXT.errDate);
  if (!place) return showToast(TEXT.errPlace);
  if (!payer) return showToast(TEXT.errPayer);
  if (participants.length < 1) return showToast(TEXT.errParticipants);
  if (!total) return showToast(TEXT.errAmount);
  if (total <= 0) return showToast(TEXT.errAmountPositive);
  const expense = {
    id: makeId("expense"), date, place, payer, participants,
    totalAmount: total, splitAmount: Math.round(total / participants.length), createdAt: Date.now()
  };
  await savePatch({ expenses: [...state.expenses, expense], settlementsChecked: {} });
  showToast(TEXT.expenseAdded);
  closeModal();
}

function openDeleteExpenseModal() {
  const list = sortedExpenses();
  if (list.length === 0) {
    openModal(TEXT.deleteTitle, `<p class="small">${TEXT.noDeleteExpenses}</p><p class="small">${TEXT.deleteHelp}</p>`);
    return;
  }
  openModal(TEXT.deleteTitle, `
    <p class="small">${TEXT.chooseDelete}</p>
    ${list.map((e) => `
      <div class="delete-row">
        <div><strong>${escapeHtml(e.place)}</strong><br><span class="small">${escapeHtml(e.date)} · ${money(e.totalAmount)}</span></div>
        <button class="danger" data-expense-delete="${e.id}">${TEXT.delete}</button>
      </div>
    `).join("")}
    <p class="small">${TEXT.deleteHelp}</p>
  `);
  modalBody.querySelectorAll("[data-expense-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await savePatch({ expenses: state.expenses.filter((e) => e.id !== btn.dataset.expenseDelete), settlementsChecked: {} });
      showToast(TEXT.expenseDeleted);
      closeModal();
    });
  });
}

function calculateSettlements() {
  const balance = Object.fromEntries(state.members.map((m) => [m, 0]));
  for (const expense of state.expenses) {
    if (!Object.prototype.hasOwnProperty.call(balance, expense.payer)) balance[expense.payer] = 0;
    balance[expense.payer] += Number(expense.totalAmount) || 0;
    for (const person of expense.participants) {
      if (!Object.prototype.hasOwnProperty.call(balance, person)) balance[person] = 0;
      balance[person] -= Number(expense.splitAmount) || 0;
    }
  }
  const debtors = Object.entries(balance).filter(([, v]) => v < 0).map(([name, amount]) => ({ name, amount: -amount })).sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balance).filter(([, v]) => v > 0).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  const result = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) result.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(amount) });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= 0.5) i++;
    if (creditors[j].amount <= 0.5) j++;
  }
  return result.filter((r) => r.amount > 0);
}
function settlementKey(item) { return `${item.from}__TO__${item.to}__${item.amount}`; }
function openSettlementModal() {
  settlementModalOpen = true;
  openModal(TEXT.settlementTitle, "");
  renderSettlementModalBody();
}
function renderSettlementModalBody() {
  const settlements = calculateSettlements();
  const incomplete = settlements.filter((s) => !state.settlementsChecked[settlementKey(s)]);
  let html = `<h3>${TEXT.finalResult}</h3>`;
  if (settlements.length === 0) {
    html += `<p class="small">${TEXT.allDone}<br>${TEXT.noSettlement}</p>`;
  } else if (incomplete.length === 0) {
    html += `<p class="small">${TEXT.allDone}</p>`;
  }
  html += `<p class="small">${TEXT.settlementHelp}<br>${TEXT.realtimeCheckHelp}</p>`;
  html += settlements.map((s) => {
    const key = settlementKey(s);
    const checked = Boolean(state.settlementsChecked[key]);
    return `
      <div class="settlement-row ${checked ? "done-row" : ""}">
        <input class="status-check" type="checkbox" data-settlement-key="${escapeHtml(key)}" ${checked ? "checked" : ""} />
        <div class="settlement-info">
          <strong>${escapeHtml(s.from)} → ${escapeHtml(s.to)}</strong><br>
          <span class="small">${TEXT.sender}: ${escapeHtml(s.from)} · ${TEXT.receiver}: ${escapeHtml(s.to)} · ${TEXT.sendAmount}: ${money(s.amount)}</span><br>
          <span class="status-badge ${checked ? "done" : ""}">${checked ? TEXT.done : TEXT.undone}</span>
        </div>
      </div>
    `;
  }).join("");
  modalBody.innerHTML = html;
  modalBody.querySelectorAll("[data-settlement-key]").forEach((input) => {
    input.addEventListener("change", async () => {
      const next = { ...state.settlementsChecked, [input.dataset.settlementKey]: input.checked };
      if (!input.checked) delete next[input.dataset.settlementKey];
      await savePatch({ settlementsChecked: next });
      showToast(TEXT.checkSaved);
    });
  });
}

renderRecentTrips();
renderAll();
