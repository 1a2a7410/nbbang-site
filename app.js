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
let tripData = { members: [], expenses: [], settlementChecks: {} };
let unsubscribeTrip = null;

const RECENT_KEY = 'nbbang_recent_names_v2';
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
$('recentTripSelect').addEventListener('change', (e) => {
  const value = e.target.value;
  if (!value) return;
  $('tripNameInput').value = value;
});

renderRecentTrips();

async function enterTrip() {
  const name = $('tripNameInput').value.trim();
  if (!name) return alert('정산 이름을 입력해주세요.');

  try {
    $('enterTripBtn').disabled = true;
    $('enterTripBtn').textContent = '데이터를 불러오는 중입니다.';

    currentTripName = name;
    currentTripId = slugify(name);
    const ref = tripRef();
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(ref, {
        tripName: name,
        members: [],
        expenses: [],
        settlementChecks: {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    saveRecentTripName(name);
    listenTrip();
    $('tripTitle').textContent = name;
    loginScreen.classList.remove('active');
    appScreen.classList.add('active');
  } catch (error) {
    console.error(error);
    alert('데이터를 불러오지 못했습니다. Firebase 연결을 확인해주세요.');
  } finally {
    $('enterTripBtn').disabled = false;
    $('enterTripBtn').textContent = '입장하기';
  }
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
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      settlementChecks: data.settlementChecks && typeof data.settlementChecks === 'object' ? data.settlementChecks : {}
    };
    $('syncState').textContent = '실시간 동기화됨';
    render();
  }, (error) => {
    console.error(error);
    $('syncState').textContent = '연결 오류';
    alert('Firebase 연결을 확인해주세요.');
  });
}

async function saveTrip(nextData) {
  await updateDoc(tripRef(), { ...nextData, updatedAt: serverTimestamp() });
}

function getRecentTripNames() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function saveRecentTripName(name) {
  const recent = getRecentTripNames().filter(item => item !== name);
  recent.unshift(name);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 3)));
  renderRecentTrips();
}

function renderRecentTrips() {
  const recent = getRecentTripNames();
  const area = $('recentTripArea');
  const select = $('recentTripSelect');
  if (!recent.length) {
    area.classList.add('hidden');
    return;
  }
  area.classList.remove('hidden');
  select.innerHTML = '<option value="">최근 정산 이름 선택</option>' + recent.map(name => `<option value="${escapeAttr(name)}">${escapeHtml(name)}</option>`).join('');
}

function render() {
  const expenses = [...tripData.expenses].sort((a, b) => String(a.date).localeCompare(String(b.date)) || Number(a.createdAt || 0) - Number(b.createdAt || 0));
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
        <div>부담자: <b>${Number(e.participants?.length || 0)}명</b></div>
        <div>1인당: <b>${won(e.share)}</b></div>
        <div class="badges">${(e.participants || []).map(p => `<span class="badge">${escapeHtml(p)}</span>`).join('')}</div>
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
  openModal('인원 관리', `
    <div class="form-grid">
      <label>이름을 입력하세요</label>
      <input id="newMemberName" placeholder="이름을 입력하세요" />
      <button id="confirmAddMember" class="primary">추가</button>
      <label>등록된 인원</label>
      <div id="memberList">${renderMemberRows()}</div>
    </div>
  `);
  $('confirmAddMember').onclick = addMember;
  document.querySelectorAll('[data-remove-member]').forEach(btn => {
    btn.onclick = () => removeMember(btn.dataset.removeMember);
  });
}

function renderMemberRows() {
  if (!tripData.members.length) return '<p class="small">아직 등록된 인원이 없습니다.<br>인원을 먼저 추가해주세요.</p>';
  return tripData.members.map(name => `
    <div class="member-row">
      <b>${escapeHtml(name)}</b>
      <button class="danger" data-remove-member="${escapeAttr(name)}">삭제</button>
    </div>
  `).join('');
}

async function addMember() {
  const name = $('newMemberName').value.trim();
  if (!name) return alert('이름을 입력해주세요.');
  if (tripData.members.includes(name)) return alert('이미 등록된 이름입니다.');
  await saveTrip({ members: [...tripData.members, name].sort((a, b) => a.localeCompare(b, 'ko-KR')) });
  alert('인원이 추가되었습니다.');
  closeModal();
}

async function removeMember(name) {
  if (!confirm(`${name} 인원을 삭제할까요?`)) return;
  await saveTrip({ members: tripData.members.filter(m => m !== name) });
  alert('인원이 삭제되었습니다.');
  closeModal();
}

function openExpenseModal() {
  if (tripData.members.length < 1) return alert('정산을 추가하려면 인원을 먼저 추가해주세요.');
  openModal('정산 추가', `
    <div class="form-grid">
      <label>날짜</label>
      <input id="expenseDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
      <label>장소(품목)</label>
      <input id="expensePlace" placeholder="장소(품목)를(을) 입력하세요" />
      <label>결제자</label>
      <select id="expensePayer">
        <option value="">결제자를 선택하세요</option>
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
      <input id="expenseTotal" type="number" inputmode="numeric" placeholder="총 금액을 입력하세요" />
      <input id="expenseSharePreview" type="text" value="자동 계산됩니다" readonly />
      <button id="confirmAddExpense" class="primary">확인</button>
    </div>
  `);
  const updateShare = () => {
    const total = Number($('expenseTotal').value);
    const count = document.querySelectorAll('input[name="participants"]:checked').length;
    $('expenseSharePreview').value = total > 0 && count > 0 ? won(total / count) : '자동 계산됩니다';
  };
  $('expenseTotal').addEventListener('input', updateShare);
  document.querySelectorAll('input[name="participants"]').forEach(input => input.addEventListener('change', updateShare));
  $('confirmAddExpense').onclick = addExpense;
}

async function addExpense() {
  const date = $('expenseDate').value;
  const place = $('expensePlace').value.trim();
  const payer = $('expensePayer').value;
  const participants = [...document.querySelectorAll('input[name="participants"]:checked')].map(el => el.value);
  const total = Number($('expenseTotal').value);

  if (!date) return alert('날짜를 입력해주세요.');
  if (!place) return alert('장소를 입력해주세요.');
  if (!payer) return alert('결제자를 선택해주세요.');
  if (!participants.length) return alert('부담자를 1명 이상 선택해주세요.');
  if (!total) return alert('총 금액을 입력해주세요.');
  if (total <= 0) return alert('총 금액은 0원보다 커야 합니다.');

  const share = Math.round(total / participants.length);
  const expense = { id: uid(), date, place, payer, participants, total, share, createdAt: Date.now() };
  await saveTrip({ expenses: [...tripData.expenses, expense] });
  alert('정산이 추가되었습니다.');
  closeModal();
}

function openDeleteModal() {
  if (!tripData.expenses.length) return alert('삭제할 정산이 없습니다.');
  const expenses = [...tripData.expenses].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  openModal('정산 삭제', `
    <p class="small">삭제할 정산을 선택하세요.<br>정산을 삭제하면 해당 정산의 계산값도 함께 제거됩니다.</p>
    ${expenses.map(e => `
      <div class="delete-row">
        <div>
          <b>${escapeHtml(e.place)}</b><br />
          <span class="small">${escapeHtml(e.date)} · ${escapeHtml(e.payer)} 결제 · ${won(e.total)}</span>
        </div>
        <button class="danger" data-delete-expense="${e.id}">삭제</button>
      </div>
    `).join('')}
  `);
  document.querySelectorAll('[data-delete-expense]').forEach(btn => {
    btn.onclick = () => deleteExpense(btn.dataset.deleteExpense);
  });
}

async function deleteExpense(id) {
  if (!confirm('이 정산을 삭제할까요?')) return;
  await saveTrip({ expenses: tripData.expenses.filter(e => e.id !== id) });
  alert('정산이 삭제되었습니다.');
  closeModal();
}

function openSettlementModal() {
  const result = calculateSettlement();
  if (!result.length) {
    openModal('정산 확인', '<p class="small">모든 정산이 완료되었습니다.<br>아직 정산할 금액이 없습니다.</p>');
    return;
  }
  openModal('정산 확인', `
    <p class="small">최종 정산 결과<br>아래 금액을 송금 시 전체 정산이 완료됩니다.<br>체크한 항목은 실시간으로 완료된 송금으로 표시됩니다.</p>
    <div class="settlement-list">
      ${result.map(r => {
        const key = settlementKey(r);
        const done = Boolean(tripData.settlementChecks[key]);
        return `
          <label class="settlement-check-row">
            <input type="checkbox" data-settlement-key="${escapeAttr(key)}" ${done ? 'checked' : ''} />
            <div>
              <div class="settlement-names">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</div>
              <div class="settlement-status ${done ? 'done' : ''}">${done ? '완료' : '미완료'}</div>
            </div>
            <strong>${won(r.amount)}</strong>
          </label>
        `;
      }).join('')}
    </div>
  `);
  document.querySelectorAll('[data-settlement-key]').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.settlementKey;
      const nextChecks = { ...(tripData.settlementChecks || {}) };
      if (input.checked) nextChecks[key] = true;
      else delete nextChecks[key];
      await saveTrip({ settlementChecks: nextChecks });
      alert('정산 완료 상태가 저장되었습니다.');
      openSettlementModal();
    });
  });
}

function calculateSettlement() {
  const balance = {};
  tripData.members.forEach(m => balance[m] = 0);

  for (const e of tripData.expenses) {
    const participants = Array.isArray(e.participants) ? e.participants : [];
    if (!participants.length) continue;
    const total = Number(e.total || 0);
    const share = Math.round(total / participants.length);

    for (const person of participants) {
      if (!(person in balance)) balance[person] = 0;
      balance[person] -= share;
    }
    if (!(e.payer in balance)) balance[e.payer] = 0;
    balance[e.payer] += share * participants.length;
  }

  const debtors = Object.entries(balance)
    .filter(([, v]) => v < 0)
    .map(([name, amount]) => ({ name, amount: Math.round(-amount) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balance)
    .filter(([, v]) => v > 0)
    .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

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

function settlementKey(r) {
  return `${r.from}__${r.to}__${Math.round(r.amount)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }
