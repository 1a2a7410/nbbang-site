import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentTripId = '';
let currentTripName = '';
let tripData = { members: [], expenses: [] };
let unsubscribeTrip = null;

const $ = (id) => document.getElementById(id);
const won = (n) => `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const slugify = (name) => encodeURIComponent(name.trim().replace(/\s+/g, '_'));

const loginScreen = $('loginScreen');
const appScreen = $('appScreen');
const modalBackdrop = $('modalBackdrop');
const modalTitle = $('modalTitle');
const modalBody = $('modalBody');

$('enterTripBtn').addEventListener('click', enterTrip);
$('tripNameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') enterTrip(); });
$('changeTripBtn').addEventListener('click', () => location.reload());
$('modalCloseBtn').addEventListener('click', closeModal);
$('manageMembersBtn').addEventListener('click', openMemberModal);
$('addExpenseBtn').addEventListener('click', openExpenseModal);
$('deleteExpenseBtn').addEventListener('click', openDeleteModal);
$('checkSettlementBtn').addEventListener('click', openSettlementModal);

async function enterTrip() {
  const name = $('tripNameInput').value.trim();
  if (!name) return alert('여행 이름을 입력하세요.');
  currentTripName = name;
  currentTripId = slugify(name);
  const ref = tripRef();
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      tripName: name,
      members: [],
      expenses: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
  listenTrip();
  $('tripTitle').textContent = name;
  loginScreen.classList.remove('active');
  appScreen.classList.add('active');
}

function tripRef() {
  return doc(db, 'trips', currentTripId);
}

function listenTrip() {
  if (unsubscribeTrip) unsubscribeTrip();
  $('syncState').textContent = '실시간 연결 중';
  unsubscribeTrip = onSnapshot(tripRef(), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    tripData = {
      members: Array.isArray(data.members) ? data.members : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : []
    };
    $('syncState').textContent = '실시간 동기화됨';
    render();
  }, (error) => {
    console.error(error);
    $('syncState').textContent = '연결 오류';
    alert('Firebase 연결에 실패했습니다. firebase-config.js와 Firestore 규칙을 확인하세요.');
  });
}

async function saveTrip(nextData) {
  await updateDoc(tripRef(), { ...nextData, updatedAt: serverTimestamp() });
}

function render() {
  const expenses = [...tripData.expenses].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.createdAt - b.createdAt);
  $('memberCount').textContent = `${tripData.members.length}명`;
  $('expenseCount').textContent = `${expenses.length}건`;
  $('totalAmount').textContent = won(expenses.reduce((sum, e) => sum + Number(e.total || 0), 0));

  const list = $('expenseList');
  if (!expenses.length) {
    list.className = 'expense-list empty';
    list.textContent = '아직 등록된 정산이 없습니다.';
    return;
  }
  list.className = 'expense-list';
  list.innerHTML = expenses.map(e => `
    <article class="expense-card">
      <div class="expense-top">
        <div>
          <div class="expense-date">${escapeHtml(e.date)}</div>
          <div class="expense-place">${escapeHtml(e.place)}</div>
        </div>
        <div class="amount">${won(e.total)}</div>
      </div>
      <div class="meta">
        <div>결제자: <b>${escapeHtml(e.payer)}</b></div>
        <div>N빵 금액: <b>${won(e.share)}</b></div>
        <div class="badges">${e.participants.map(p => `<span class="badge">${escapeHtml(p)}</span>`).join('')}</div>
      </div>
    </article>
  `).join('');
}

function openModal(title, html) {
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modalBackdrop.classList.remove('hidden');
}
function closeModal() { modalBackdrop.classList.add('hidden'); }

function openMemberModal() {
  openModal('인원 추가 / 삭제', `
    <div class="form-grid">
      <label>이름 입력</label>
      <input id="newMemberName" placeholder="이름을 입력하세요" />
      <button id="confirmAddMember" class="primary">추가</button>
      <p class="small">인원을 삭제하면 기존 정산 내역에 들어간 이름은 그대로 남습니다. 새 정산 선택 목록에서만 제외됩니다.</p>
      <div id="memberList">${renderMemberRows()}</div>
    </div>
  `);
  $('confirmAddMember').onclick = addMember;
  document.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.onclick = () => removeMember(btn.dataset.removeMember);
  });
}

function renderMemberRows() {
  if (!tripData.members.length) return '<p class="small">등록된 인원이 없습니다.</p>';
  return tripData.members.map(name => `
    <div class="member-row">
      <b>${escapeHtml(name)}</b>
      <button class="danger" data-remove-member="${escapeAttr(name)}">삭제</button>
    </div>
  `).join('');
}

async function addMember() {
  const name = $('newMemberName').value.trim();
  if (!name) return alert('이름을 입력하세요.');
  if (tripData.members.includes(name)) return alert('이미 등록된 이름입니다.');
  await saveTrip({ members: [...tripData.members, name].sort((a, b) => a.localeCompare(b, 'ko-KR')) });
  closeModal();
}

async function removeMember(name) {
  if (!confirm(`${name} 인원을 삭제할까요?`)) return;
  await saveTrip({ members: tripData.members.filter(m => m !== name) });
  closeModal();
}

function openExpenseModal() {
  if (tripData.members.length < 2) return alert('최소 2명 이상 인원을 먼저 추가하세요.');
  openModal('정산 추가', `
    <div class="form-grid">
      <label>날짜</label>
      <input id="expenseDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      <label>장소</label>
      <input id="expensePlace" placeholder="예: 해운대 식당" />
      <label>결제자</label>
      <select id="expensePayer">
        ${tripData.members.map(m => `<option value="${escapeAttr(m)}">${escapeHtml(m)}</option>`).join('')}
      </select>
      <label>부담자</label>
      <div class="checks" id="participantChecks">
        ${tripData.members.map((m, i) => `
          <label class="check-item" for="participant_${i}">
            <input id="participant_${i}" class="participant-checkbox" type="checkbox" name="participants" value="${escapeAttr(m)}" checked />
            <span>${escapeHtml(m)}</span>
          </label>
        `).join('')}
      </div>
      <label>총 금액</label>
      <input id="expenseTotal" type="number" inputmode="numeric" placeholder="예: 50000" />
      <button id="confirmAddExpense" class="primary">확인</button>
    </div>
  `);
  $('confirmAddExpense').onclick = addExpense;
}

async function addExpense() {
  const date = $('expenseDate').value;
  const place = $('expensePlace').value.trim();
  const payer = $('expensePayer').value;
  const participants = [...document.querySelectorAll('input[name="participants"]:checked')].map(el => el.value);
  const total = Number($('expenseTotal').value);
  if (!date || !place || !payer || !participants.length || !total || total <= 0) {
    return alert('날짜, 장소, 결제자, 부담자, 총 금액을 모두 입력하세요.');
  }
  const share = Math.round(total / participants.length);
  const expense = { id: uid(), date, place, payer, participants, total, share, createdAt: Date.now() };
  await saveTrip({ expenses: [...tripData.expenses, expense] });
  closeModal();
}

function openDeleteModal() {
  if (!tripData.expenses.length) return alert('삭제할 정산이 없습니다.');
  const expenses = [...tripData.expenses].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  openModal('정산 삭제', expenses.map(e => `
    <div class="delete-row">
      <div>
        <b>${escapeHtml(e.place)}</b><br />
        <span class="small">${escapeHtml(e.date)} · ${escapeHtml(e.payer)} 결제 · ${won(e.total)}</span>
      </div>
      <button class="danger" data-delete-expense="${e.id}">삭제</button>
    </div>
  `).join(''));
  document.querySelectorAll('[data-delete-expense]').forEach(btn => {
    btn.onclick = () => deleteExpense(btn.dataset.deleteExpense);
  });
}

async function deleteExpense(id) {
  if (!confirm('이 정산을 삭제할까요?')) return;
  await saveTrip({ expenses: tripData.expenses.filter(e => e.id !== id) });
  closeModal();
}

function openSettlementModal() {
  const result = calculateSettlement();
  if (!result.length) {
    openModal('정산 확인', '<p class="small">현재 주고받을 금액이 없습니다.</p>');
    return;
  }
  openModal('정산 확인', result.map(r => `
    <div class="settlement-row">
      <span><b>${escapeHtml(r.from)}</b> → <b>${escapeHtml(r.to)}</b></span>
      <strong>${won(r.amount)}</strong>
    </div>
  `).join(''));
}

function calculateSettlement() {
  const balance = {};
  tripData.members.forEach(m => balance[m] = 0);

  for (const e of tripData.expenses) {
    const share = Number(e.share || 0);
    for (const person of e.participants) {
      if (!(person in balance)) balance[person] = 0;
      if (person !== e.payer) balance[person] -= share;
    }
    if (!(e.payer in balance)) balance[e.payer] = 0;
    balance[e.payer] += share * e.participants.filter(p => p !== e.payer).length;
  }

  const debtors = Object.entries(balance).filter(([, v]) => v < 0).map(([name, amount]) => ({ name, amount: -amount }));
  const creditors = Object.entries(balance).filter(([, v]) => v > 0).map(([name, amount]) => ({ name, amount }));
  const result = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0) result.push({ from: debtors[i].name, to: creditors[j].name, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount <= 0) i++;
    if (creditors[j].amount <= 0) j++;
  }
  return result;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
