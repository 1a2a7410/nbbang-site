import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentTripId = '';
let currentTripName = '';
let tripData = { members: [], memberInfo: {}, expenses: [], settlementChecks: {} };
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
        memberInfo: {},
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
      memberInfo: data.memberInfo && typeof data.memberInfo === 'object' ? data.memberInfo : {},
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
        <div class="expense-footer">
          <div class="badges">${renderParticipantBadges(e.participants || [], e.id)}</div>
          <button class="edit-expense-btn" type="button" data-edit-expense="${escapeAttr(e.id)}">정산 수정</button>
        </div>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-edit-expense]').forEach(btn => {
    btn.addEventListener('click', () => openEditExpenseModal(btn.dataset.editExpense));
  });
  document.querySelectorAll('[data-more-participants]').forEach(btn => {
    btn.addEventListener('click', () => openHiddenParticipantsModal(btn.dataset.moreParticipants));
  });
}


function renderParticipantBadges(participants, expenseId) {
  const list = Array.isArray(participants) ? participants.filter(Boolean) : [];
  if (!list.length) return '';
  const visibleCount = list.length > 4 ? 4 : list.length;
  const visible = list.slice(0, visibleCount).map(p => `<span class="badge">${escapeHtml(p)}</span>`);
  const hiddenCount = list.length - visibleCount;
  if (hiddenCount > 0) {
    visible.push(`<button class="badge more-badge" type="button" data-more-participants="${escapeAttr(expenseId)}">+${hiddenCount}명</button>`);
  }
  return visible.join('');
}

function openHiddenParticipantsModal(expenseId) {
  const expense = tripData.expenses.find(e => e.id === expenseId);
  if (!expense) return;
  const participants = Array.isArray(expense.participants) ? expense.participants.filter(Boolean) : [];
  const hidden = participants.slice(4);
  openModal('추가 부담자', `
    <p class="hint">화면에 표시되지 않은 부담자입니다.</p>
    <div class="member-list">
      ${hidden.length ? hidden.map(name => `<div class="member-row"><b>${escapeHtml(name)}</b></div>`).join('') : '<p class="empty small">추가 부담자가 없습니다.</p>'}
    </div>
  `);
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
      <label>은행명</label>
      <input id="newMemberBank" placeholder="은행명을 입력하세요" />
      <label>계좌번호</label>
      <input id="newMemberAccount" inputmode="numeric" placeholder="계좌번호를 입력하세요" />
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
  return tripData.members.map(name => {
    const info = getMemberInfo(name);
    const detail = [info.bank, info.account].filter(Boolean).join(' · ');
    return `
      <div class="member-row">
        <div>
          <b>${escapeHtml(name)}</b>
          ${detail ? `<div class="member-account-preview">${escapeHtml(detail)}</div>` : ''}
        </div>
        <button class="danger" data-remove-member="${escapeAttr(name)}">삭제</button>
      </div>
    `;
  }).join('');
}

async function addMember() {
  const name = $('newMemberName').value.trim();
  const bank = $('newMemberBank').value.trim();
  const account = $('newMemberAccount').value.trim();
  if (!name) return alert('이름을 입력해주세요.');
  if (tripData.members.includes(name)) return alert('이미 등록된 이름입니다.');
  const nextMembers = [...tripData.members, name].sort((a, b) => a.localeCompare(b, 'ko-KR'));
  const nextMemberInfo = {
    ...(tripData.memberInfo || {}),
    [name]: { bank, account }
  };
  await saveTrip({ members: nextMembers, memberInfo: nextMemberInfo });
  alert('인원이 추가되었습니다.');
  closeModal();
}

async function removeMember(name) {
  if (!confirm(`${name} 인원을 삭제할까요?`)) return;
  const nextMemberInfo = { ...(tripData.memberInfo || {}) };
  delete nextMemberInfo[name];
  await saveTrip({ members: tripData.members.filter(m => m !== name), memberInfo: nextMemberInfo });
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


function openEditExpenseModal(id) {
  const expense = tripData.expenses.find(e => e.id === id);
  if (!expense) return alert('수정할 정산을 찾을 수 없습니다.');
  if (tripData.members.length < 1) return alert('정산을 추가하려면 인원을 먼저 추가해주세요.');

  const selectedParticipants = Array.isArray(expense.participants) ? expense.participants : [];
  openModal('정산 수정', `
    <div class="form-grid">
      <label>날짜</label>
      <input id="editExpenseDate" type="date" value="${escapeAttr(expense.date || new Date().toISOString().slice(0, 10))}" />
      <label>장소(품목)</label>
      <input id="editExpensePlace" placeholder="장소(품목)를(을) 입력하세요" value="${escapeAttr(expense.place || '')}" />
      <label>결제자</label>
      <select id="editExpensePayer">
        <option value="">결제자를 선택하세요</option>
        ${tripData.members.map(m => `<option value="${escapeAttr(m)}" ${m === expense.payer ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
      </select>
      <label>부담자</label>
      <div class="checks" id="editParticipantChecks">
        ${tripData.members.map((m, i) => `
          <label class="check-item" for="edit_participant_${i}">
            <input id="edit_participant_${i}" class="participant-checkbox" type="checkbox" name="editParticipants" value="${escapeAttr(m)}" ${selectedParticipants.includes(m) ? 'checked' : ''} />
            <span>${escapeHtml(m)}</span>
          </label>
        `).join('')}
      </div>
      <label>총 금액</label>
      <input id="editExpenseTotal" type="number" inputmode="numeric" placeholder="총 금액을 입력하세요" value="${Number(expense.total || 0)}" />
      <input id="editExpenseSharePreview" type="text" value="자동 계산됩니다" readonly />
      <button id="confirmEditExpense" class="primary">확인</button>
    </div>
  `);

  const updateShare = () => {
    const total = Number($('editExpenseTotal').value);
    const count = document.querySelectorAll('input[name="editParticipants"]:checked').length;
    $('editExpenseSharePreview').value = total > 0 && count > 0 ? won(total / count) : '자동 계산됩니다';
  };
  $('editExpenseTotal').addEventListener('input', updateShare);
  document.querySelectorAll('input[name="editParticipants"]').forEach(input => input.addEventListener('change', updateShare));
  $('confirmEditExpense').onclick = () => updateExpense(id);
  updateShare();
}

async function updateExpense(id) {
  const date = $('editExpenseDate').value;
  const place = $('editExpensePlace').value.trim();
  const payer = $('editExpensePayer').value;
  const participants = [...document.querySelectorAll('input[name="editParticipants"]:checked')].map(el => el.value);
  const total = Number($('editExpenseTotal').value);

  if (!date) return alert('날짜를 입력해주세요.');
  if (!place) return alert('장소를 입력해주세요.');
  if (!payer) return alert('결제자를 선택해주세요.');
  if (!participants.length) return alert('부담자를 1명 이상 선택해주세요.');
  if (!total) return alert('총 금액을 입력해주세요.');
  if (total <= 0) return alert('총 금액은 0원보다 커야 합니다.');

  const share = Math.round(total / participants.length);
  const nextExpenses = tripData.expenses.map(e => {
    if (e.id !== id) return e;
    return {
      ...e,
      date,
      place,
      payer,
      participants,
      total,
      share,
      updatedAt: Date.now()
    };
  });

  await saveTrip({ expenses: nextExpenses });
  alert('정산이 수정되었습니다.');
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
  const members = [...tripData.members];

  if (!members.length) {
    openModal('정산 확인', '<p class="small">등록된 인원이 없습니다.<br>인원을 먼저 추가해주세요.</p>');
    return;
  }

  const memberRows = members.map(member => {
    const obligations = result.filter(r => r.from === member);
    const total = obligations.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const isDone = obligations.length === 0 || obligations.every(r => Boolean(tripData.settlementChecks[settlementKey(r)]));
    const summary = obligations.length ? `${obligations.length}건 · ${won(total)}` : '송금할 내역 없음';

    return `
      <button class="settlement-person-row" type="button" data-settlement-person="${escapeAttr(member)}">
        <input class="person-done-check" type="checkbox" ${isDone ? 'checked' : ''} disabled aria-label="${escapeAttr(member)} 완료 상태" />
        <div class="settlement-person-main">
          <div class="settlement-person-name">${escapeHtml(member)}</div>
          <div class="settlement-person-summary">${summary}</div>
        </div>
        <span class="settlement-person-arrow">›</span>
      </button>
    `;
  }).join('');

  openModal('정산 확인', `
    <p class="small">최종 정산 결과<br>이름을 누르면 본인이 송금해야 할 내역만 확인할 수 있습니다.<br>모든 송금 체크가 완료되면 이름 옆 체크표시가 활성화됩니다.</p>
    <div class="settlement-count">등록 인원 ${members.length}명</div>
    <div class="settlement-person-list">${memberRows}</div>
  `);

  document.querySelectorAll('[data-settlement-person]').forEach(btn => {
    btn.addEventListener('click', () => openPersonalSettlementModal(btn.dataset.settlementPerson));
  });
}

function openPersonalSettlementModal(member) {
  const result = calculateSettlement().filter(r => r.from === member);

  if (!result.length) {
    openModal('정산 확인', `
      <button class="back-link" type="button" id="backToSettlementMembers">‹ 인원 목록</button>
      <p class="small"><b>${escapeHtml(member)}</b>님의 송금 내역<br>현재 송금할 금액이 없습니다.</p>
    `);
    $('backToSettlementMembers').onclick = openSettlementModal;
    return;
  }

  const allDone = result.every(r => Boolean(tripData.settlementChecks[settlementKey(r)]));
  const rows = result.map(r => {
    const key = settlementKey(r);
    const done = Boolean(tripData.settlementChecks[key]);
    const info = getMemberInfo(r.to);
    const accountText = formatAccountInfo(info);
    return `
      <label class="settlement-check-row personal-row">
        <input type="checkbox" data-settlement-key="${escapeAttr(key)}" ${done ? 'checked' : ''} />
        <div>
          <div class="settlement-names">${escapeHtml(r.to)}에게</div>
          ${accountText ? `<button type="button" class="account-copy" data-copy-account="${escapeAttr(accountText)}">${escapeHtml(accountText)}</button>` : `<div class="account-copy muted">계좌 정보 없음</div>`}
          <div class="settlement-status ${done ? 'done' : ''}">${done ? '완료' : '미완료'}</div>
        </div>
        <strong>${won(r.amount)}</strong>
      </label>
    `;
  }).join('');

  openModal('정산 확인', `
    <button class="back-link" type="button" id="backToSettlementMembers">‹ 인원 목록</button>
    <div class="personal-settlement-head">
      <input class="person-done-check large" type="checkbox" ${allDone ? 'checked' : ''} disabled />
      <div>
        <div class="personal-title">${escapeHtml(member)}</div>
        <p class="small">${escapeHtml(member)}님이 송금해야 할 내역입니다.</p>
      </div>
    </div>
    <div class="settlement-count">전체 ${result.length}건</div>
    <div class="settlement-list">${rows}</div>
  `);

  $('backToSettlementMembers').onclick = openSettlementModal;
  document.querySelectorAll('[data-settlement-key]').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.settlementKey;
      const nextChecks = { ...(tripData.settlementChecks || {}) };
      if (input.checked) nextChecks[key] = true;
      else delete nextChecks[key];
      await saveTrip({ settlementChecks: nextChecks });
      alert('정산 완료 상태가 저장되었습니다.');
      openPersonalSettlementModal(member);
    });
  });

  document.querySelectorAll('[data-copy-account]').forEach(btn => {
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = btn.dataset.copyAccount || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        alert('계좌 정보가 복사되었습니다.');
      } catch {
        fallbackCopyText(text);
        alert('계좌 정보가 복사되었습니다.');
      }
    });
  });
}


function getMemberInfo(name) {
  const info = tripData.memberInfo && typeof tripData.memberInfo === 'object' ? tripData.memberInfo[name] : null;
  return {
    bank: String(info?.bank || '').trim(),
    account: String(info?.account || '').trim()
  };
}

function formatAccountInfo(info) {
  const bank = String(info?.bank || '').trim();
  const account = String(info?.account || '').trim();
  if (!bank && !account) return '';
  if (bank && account) return `${bank} ${account}`;
  return bank || account;
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function calculateSettlement() {
  const pairDebts = {};

  for (const e of tripData.expenses) {
    const participants = Array.isArray(e.participants) ? e.participants : [];
    const payer = e.payer;
    if (!payer || !participants.length) continue;

    const total = Number(e.total || 0);
    if (!total || total <= 0) continue;

    const share = Math.round(total / participants.length);

    for (const person of participants) {
      if (!person || person === payer) continue;
      const key = `${person}__${payer}`;
      pairDebts[key] = (pairDebts[key] || 0) + share;
    }
  }

  const names = Array.from(new Set([
    ...tripData.members,
    ...tripData.expenses.flatMap(e => [e.payer, ...(Array.isArray(e.participants) ? e.participants : [])])
  ].filter(Boolean)));

  const result = [];
  const processed = new Set();

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const abKey = `${a}__${b}`;
      const baKey = `${b}__${a}`;
      if (processed.has(abKey) || processed.has(baKey)) continue;

      const ab = Math.round(pairDebts[abKey] || 0);
      const ba = Math.round(pairDebts[baKey] || 0);
      const net = ab - ba;

      if (net > 0) result.push({ from: a, to: b, amount: net });
      if (net < 0) result.push({ from: b, to: a, amount: Math.abs(net) });

      processed.add(abKey);
      processed.add(baKey);
    }
  }

  return result.sort((a, b) => {
    if (a.to !== b.to) return a.to.localeCompare(b.to, 'ko');
    if (a.from !== b.from) return a.from.localeCompare(b.from, 'ko');
    return b.amount - a.amount;
  });
}

function settlementKey(r) {
  return `${r.from}__${r.to}__${Math.round(r.amount)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }
