// ① Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyB8gbeN-nRQGNJPrnVOrqp-uXP5Bs3E0yE",
  authDomain: "data-base-mh2026.firebaseapp.com",
  projectId: "data-base-mh2026",
  storageBucket: "data-base-mh2026.firebasestorage.app",
  messagingSenderId: "897077284587",
  appId: "1:897077284587:web:b1712795e415cefa9738ae",
  measurementId: "G-R8342W7N9W"
};

// ② Firebase 초기화
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ③ 허가된 관리자 이메일 목록
const ALLOWED_ADMINS = [
  "munhyungove@gmail.com",
  "schoolgamasot@gmail.com"
];

// ③-1 공통 상수 (건의 유형 / 처리 현황)
const CATEGORIES = ['시설', '급식', '행사', '학습환경', '학생복지', '진로·진학', '기타'];
const STATUSES = ['확인 안함', '검토중', '처리 완료', '반려됨'];

let allSuggestions = [];

// 현재 목록 화면이 어떤 기준으로 보여지고 있는지 저장
// mode: 'all' | 'type' | 'date' | 'status' | 'favorite'
let currentMode = 'all';

// ③-2 로그인 여부 플래그 (관리자 화면 접근 가드용)
let isAuthenticated = false;

// ④ 로그인 상태 감지
auth.onAuthStateChanged(user => {
  if (user) {
    const userEmail = user.email ? user.email.toLowerCase() : "";
    const isAdmin = ALLOWED_ADMINS.some(admin => admin.toLowerCase() === userEmail);

    if (isAdmin) {
      isAuthenticated = true;
      document.getElementById('loginScreen').style.display = 'none';
      showHome();
      loadSuggestions();
    } else {
      isAuthenticated = false;
      alert(`[ACCESS DENIED]\n${user.email} IS NOT AUTHORIZED.`);
      auth.signOut();
    }
  } else {
    isAuthenticated = false;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('homeScreen').style.display = 'none';
    document.getElementById('listScreen').style.display = 'none';
    document.getElementById('statsScreen').style.display = 'none';
    document.getElementById('exportScreen').style.display = 'none';
  }
});

// ④-1 로그아웃 상태거나 인증 전이면 무조건 로그인 화면으로 되돌리는 가드
// (관리자 화면으로 진입하는 모든 경로 - 메뉴 클릭, 브라우저 뒤로가기/캐시 복원 등 -
//  이 가드를 통과해야만 실제로 화면이 전환됨)
function requireAuthOrRedirect() {
  if (!isAuthenticated) {
    hideAllScreens();
    document.getElementById('loginScreen').style.display = 'flex';
    return false;
  }
  return true;
}

// 브라우저가 페이지를 뒤로가기/앞으로가기로 캐시에서 복원할 때(bfcache)
// onAuthStateChanged가 다시 실행되지 않을 수 있으므로 별도로 한 번 더 확인
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    requireAuthOrRedirect();
  }
});

/*
// [임시 코드] 바로 홈 화면으로 진입 및 데이터 로드
document.getElementById('loginScreen').style.display = 'none'; // 로그인 디자인을 확인하고 싶다면 'flex'로 변경하세요!
showHome();
loadSuggestions();
*/
// ⑤ Google 팝업 로그인
async function handleGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await auth.signInWithPopup(provider);
  } catch (err) {
    console.error("Login failed:", err);
    if (err.code !== 'auth/popup-closed-by-user') {
      alert(`LOGIN ERROR: ${err.message}`);
    }
  }
}

// ⑥ 로그아웃
function handleLogout() {
  auth.signOut();
}

// ⑦ 화면 전환 함수
function hideAllScreens() {
  ['homeScreen', 'listScreen', 'statsScreen', 'exportScreen'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

function showHome() {
  if (!requireAuthOrRedirect()) return;
  hideAllScreens();
  document.getElementById('homeScreen').style.display = 'block';
}

function goToList(mode) {
  if (!requireAuthOrRedirect()) return;

  currentMode = mode;
  listFilterState = createFilterState();

  hideAllScreens();
  document.getElementById('listScreen').style.display = 'block';

  const titleMap = {
    all: '전체 건의',
    type: '유형별 건의',
    date: '날짜별 건의',
    status: '현황별 건의',
    favorite: '즐겨찾기'
  };
  document.getElementById('listTitle').textContent = titleMap[mode] || '건의 목록';

  renderListFilterBar();
  applyListFilter();
}

function goToStats() {
  if (!requireAuthOrRedirect()) return;

  hideAllScreens();
  document.getElementById('statsScreen').style.display = 'block';

  statsFilterState = createFilterState();
  renderFilterBar('statsFilterBar', statsFilterState, applyStatsFilter, { showSearch: false });
  applyStatsFilter();
}

function goToExport() {
  if (!requireAuthOrRedirect()) return;

  hideAllScreens();
  document.getElementById('exportScreen').style.display = 'block';

  exportFilterState = createFilterState();
  selectedExportIds.clear();
  renderFilterBar('exportFilterBar', exportFilterState, applyExportFilter, { showSearch: true });
  applyExportFilter();
}

// ⑦-1 사용설명서(manual) 화면 전환
// 로그인 화면(및 필요 시 다른 화면)의 '사용설명서' 버튼에서 호출됩니다.
// 로그인 여부와 상관없이 열람할 수 있도록 requireAuthOrRedirect 가드를 거치지 않습니다.
function showManual() {
  document.getElementById('loginScreen').style.display = 'none';
  hideAllScreens();
  document.getElementById('manualScreen').style.display = 'block';
  return false;
}

// 사용설명서 화면의 '홈' 버튼: 로그인 여부에 따라 알맞은 화면으로 되돌아갑니다.
function manualGoHome() {
  document.getElementById('manualScreen').style.display = 'none';
  if (isAuthenticated) {
    showHome();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
  }
  return false;
}

// ⑦-2 '건의 제출' 페이지 링크
// 학생들이 건의를 제출하는 페이지(별도 폼/사이트)의 실제 주소를 아래 값에 입력해 주세요.
// 예) const SUGGESTION_FORM_URL = "https://mhhs-2006.github.io/";
const SUGGESTION_FORM_URL = "https://mhhs-2006.github.io/";

function goToSubmissionForm() {
  if (SUGGESTION_FORM_URL) {
    window.open(SUGGESTION_FORM_URL, "_blank");
  } else {
    alert("건의 제출 페이지 주소가 아직 설정되지 않았습니다.\nscript.js 상단의 SUGGESTION_FORM_URL 값에 실제 건의 제출 페이지 주소를 입력해 주세요.");
  }
  return false;
}

// ⑧ Firestore 데이터 로드
function loadSuggestions() {
  db.collection("suggestions").orderBy("createdAt", "desc").onSnapshot(snapshot => {
    allSuggestions = [];
    snapshot.forEach(doc => {
      allSuggestions.push({ id: doc.id, ...doc.data() });
    });

    // 현재 열려 있는 화면이 있다면 최신 데이터로 갱신
    if (document.getElementById('listScreen').style.display !== 'none') {
      applyListFilter();
    }
    if (document.getElementById('statsScreen').style.display !== 'none') {
      applyStatsFilter();
    }
    if (document.getElementById('exportScreen').style.display !== 'none') {
      applyExportFilter();
    }
  }, error => {
    console.error("Data load failed:", error);
  });
}

/* =====================================================================
   공통 필터 (건의 시기 / 건의 유형 / 건의 현황 + 키워드 검색 + 초기화)
   List / Stats / Export 화면에서 공용으로 사용
   ===================================================================== */

function createFilterState() {
  return { keyword: '', dateFrom: '', dateTo: '', category: '전체', status: '전체' };
}

let listFilterState = createFilterState();
let statsFilterState = createFilterState();
let exportFilterState = createFilterState();

function renderFilterBar(containerId, state, onApply, opts) {
  opts = opts || {};
  const showSearch = opts.showSearch !== false;
  const container = document.getElementById(containerId);

  container.innerHTML = `
    <div class="filter-panel">
      ${showSearch ? `
      <div class="filter-field filter-field-search">
        <label>키워드 검색</label>
        <input type="text" id="${containerId}-keyword" placeholder="내용, 코멘트 검색">
      </div>` : ''}
      <div class="filter-field">
        <label>건의 시기</label>
        <div class="filter-date-range">
          <input type="date" id="${containerId}-dateFrom">
          <span>~</span>
          <input type="date" id="${containerId}-dateTo">
        </div>
      </div>
      <div class="filter-field">
        <label>건의 유형</label>
        <select id="${containerId}-category">
          <option value="전체">전체</option>
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="filter-field">
        <label>건의 현황</label>
        <select id="${containerId}-status">
          <option value="전체">전체</option>
          ${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>
      <button class="filter-reset-btn" id="${containerId}-reset" type="button">초기화</button>
    </div>
  `;

  // 기존 상태 값 반영
  if (showSearch) {
    const keywordEl = document.getElementById(`${containerId}-keyword`);
    keywordEl.value = state.keyword;
    keywordEl.addEventListener('input', e => { state.keyword = e.target.value; onApply(); });
  }

  const dateFromEl = document.getElementById(`${containerId}-dateFrom`);
  dateFromEl.value = state.dateFrom;
  dateFromEl.addEventListener('change', e => { state.dateFrom = e.target.value; onApply(); });

  const dateToEl = document.getElementById(`${containerId}-dateTo`);
  dateToEl.value = state.dateTo;
  dateToEl.addEventListener('change', e => { state.dateTo = e.target.value; onApply(); });

  const categoryEl = document.getElementById(`${containerId}-category`);
  categoryEl.value = state.category;
  categoryEl.addEventListener('change', e => { state.category = e.target.value; onApply(); });

  const statusEl = document.getElementById(`${containerId}-status`);
  statusEl.value = state.status;
  statusEl.addEventListener('change', e => { state.status = e.target.value; onApply(); });

  document.getElementById(`${containerId}-reset`).addEventListener('click', () => {
    state.keyword = '';
    state.dateFrom = '';
    state.dateTo = '';
    state.category = '전체';
    state.status = '전체';
    renderFilterBar(containerId, state, onApply, opts);
    onApply();
  });
}

// 리스트 화면 전용: 현재 모드(currentMode)에 따라 알맞은 필터 UI를 그려줌
// - all / favorite : 기존 통합 필터(검색+시기+유형+현황)
// - type   : 검색 없이 '건의 유형' 버튼으로만 분류
// - date   : 검색 없이 '건의 시기' 기간 선택으로만 필터
// - status : 검색 없이 '건의 현황' 버튼으로만 분류
function renderListFilterBar() {
  const containerId = 'listFilterBar';

  if (currentMode === 'type') {
    renderCategoryButtonBar(containerId, listFilterState, applyListFilter);
  } else if (currentMode === 'date') {
    renderDateRangeBar(containerId, listFilterState, applyListFilter);
  } else if (currentMode === 'status') {
    renderStatusButtonBar(containerId, listFilterState, applyListFilter);
  } else {
    renderFilterBar(containerId, listFilterState, applyListFilter, { showSearch: true });
  }
}

// 건의 유형 버튼 필터 (유형별 탭)
function renderCategoryButtonBar(containerId, state, onApply) {
  const container = document.getElementById(containerId);
  const options = ['전체', ...CATEGORIES];

  container.innerHTML = `
    <div class="filter-chip-bar">
      ${options.map(c => `<button type="button" class="filter-chip ${state.category === c ? 'active' : ''}" data-value="${c}">${c}</button>`).join('')}
    </div>
  `;

  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.value;
      renderCategoryButtonBar(containerId, state, onApply);
      onApply();
    });
  });
}

// 건의 현황 버튼 필터 (현황별 탭)
function renderStatusButtonBar(containerId, state, onApply) {
  const container = document.getElementById(containerId);
  const options = ['전체', ...STATUSES];

  container.innerHTML = `
    <div class="filter-chip-bar">
      ${options.map(s => `<button type="button" class="filter-chip ${state.status === s ? 'active' : ''}" data-value="${s}">${s}</button>`).join('')}
    </div>
  `;

  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.status = btn.dataset.value;
      renderStatusButtonBar(containerId, state, onApply);
      onApply();
    });
  });
}

// 건의 시기 기간 선택 필터 (날짜별 탭) - 검색/유형/현황 없이 기간만
function renderDateRangeBar(containerId, state, onApply) {
  const container = document.getElementById(containerId);

  container.innerHTML = `
    <div class="filter-panel">
      <div class="filter-field">
        <label>건의 시기</label>
        <div class="filter-date-range">
          <input type="date" id="${containerId}-dateFrom">
          <span>~</span>
          <input type="date" id="${containerId}-dateTo">
        </div>
      </div>
      <button class="filter-reset-btn" id="${containerId}-reset" type="button">초기화</button>
    </div>
  `;

  const dateFromEl = document.getElementById(`${containerId}-dateFrom`);
  dateFromEl.value = state.dateFrom;
  dateFromEl.addEventListener('change', e => { state.dateFrom = e.target.value; onApply(); });

  const dateToEl = document.getElementById(`${containerId}-dateTo`);
  dateToEl.value = state.dateTo;
  dateToEl.addEventListener('change', e => { state.dateTo = e.target.value; onApply(); });

  document.getElementById(`${containerId}-reset`).addEventListener('click', () => {
    state.dateFrom = '';
    state.dateTo = '';
    renderDateRangeBar(containerId, state, onApply);
    onApply();
  });
}

// 공용 필터 적용 함수
function filterData(list, state) {
  return list.filter(item => {
    if (state.category !== '전체' && (item.category || '기타') !== state.category) return false;
    if (state.status !== '전체' && (item.status || '확인 안함') !== state.status) return false;

    if (state.dateFrom || state.dateTo) {
      if (!item.createdAt) return false;
      const itemDate = new Date(item.createdAt.seconds * 1000);

      if (state.dateFrom) {
        const from = new Date(state.dateFrom);
        from.setHours(0, 0, 0, 0);
        if (itemDate < from) return false;
      }
      if (state.dateTo) {
        const to = new Date(state.dateTo);
        to.setHours(23, 59, 59, 999);
        if (itemDate > to) return false;
      }
    }

    if (state.keyword && state.keyword.trim()) {
      const kw = state.keyword.trim().toLowerCase();
      const haystack = `${item.content || ''} ${item.comment || ''} ${item.category || ''}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }

    return true;
  });
}

/* =====================================================================
   LIST SCREEN
   ===================================================================== */

function applyListFilter() {
  let base = allSuggestions;
  if (currentMode === 'favorite') {
    base = base.filter(item => !!item.favorite);
  }
  const filtered = filterData(base, listFilterState);
  renderCards(filtered);
}

// 카드를 HTML 화면에 출력하는 함수 (코멘트 + 즐겨찾기 포함)
function renderCards(dataList) {
  const grid = document.getElementById('suggestionGrid');
  grid.innerHTML = '';

  if (dataList.length === 0) {
    grid.innerHTML = `<p class="empty-msg">해당 건의가 없습니다.</p>`;
    return;
  }

  dataList.forEach(item => {
    const dateStr = item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'NO DATE';
    const currentStatus = item.status || '확인 안함';
    const isFavorite = !!item.favorite;

    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.innerHTML = `
      <div>
        <div class="card-header">
          <div class="card-header-left">
            <span class="category-tag">${item.category || '기타'}</span>
            <span class="date-text">${dateStr}</span>
          </div>
          <button class="star-btn ${isFavorite ? 'active' : ''}" title="즐겨찾기" onclick="toggleFavorite('${item.id}', ${isFavorite})">${isFavorite ? '★' : '☆'}</button>
        </div>
        <div class="card-content">${item.content || ''}</div>
      </div>
      <div class="admin-controls">
        <select class="status-select" id="status-${item.id}" onchange="updateStatus('${item.id}', this.value)">
          ${STATUSES.map(s => `<option value="${s}" ${currentStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <label class="comment-label">관리자 코멘트</label>
        <textarea class="comment-input" id="comment-${item.id}" placeholder="코멘트를 입력하세요 (자동 저장)" onblur="updateComment('${item.id}', this.value)">${item.comment || ''}</textarea>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 상태 업데이트 (드롭다운 선택 즉시 저장)
async function updateStatus(docId, newStatus) {
  try {
    await db.collection("suggestions").doc(docId).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Update error:", err);
    alert(`ERROR: ${err.message}`);
  }
}

// 코멘트 업데이트 (텍스트 영역에서 포커스 아웃 시 즉시 저장)
async function updateComment(docId, newComment) {
  try {
    await db.collection("suggestions").doc(docId).update({
      comment: newComment,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Comment update error:", err);
    alert(`ERROR: ${err.message}`);
  }
}

// 즐겨찾기 토글
async function toggleFavorite(docId, currentValue) {
  try {
    await db.collection("suggestions").doc(docId).update({
      favorite: !currentValue,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("Favorite update error:", err);
    alert(`ERROR: ${err.message}`);
  }
}

/* =====================================================================
   STATS SCREEN (건의통계)
   ===================================================================== */

let categoryChartInstance = null;
let statusChartInstance = null;
let trendChartInstance = null;

function sameMonth(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function applyStatsFilter() {
  const filtered = filterData(allSuggestions, statsFilterState);
  renderStatsKPI(filtered);
  renderStatsCharts(filtered);
}

function renderStatsKPI(filtered) {
  const now = new Date();
  const thisMonthCount = allSuggestions.filter(item =>
    item.createdAt && sameMonth(new Date(item.createdAt.seconds * 1000), now)
  ).length;

  const pendingCount = filtered.filter(item => {
    const s = item.status || '확인 안함';
    return s === '확인 안함' || s === '검토중';
  }).length;

  const totalFiltered = filtered.length;

  const kpiRow = document.getElementById('statsKpiRow');
  kpiRow.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">이번 달 총 접수 건수</div>
      <div class="kpi-value">${thisMonthCount}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">미처리(대기) 건수</div>
      <div class="kpi-value">${pendingCount}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">현재 필터 결과 건수</div>
      <div class="kpi-value">${totalFiltered}</div>
    </div>
  `;
}

function renderStatsCharts(filtered) {
  const violet = getComputedStyle(document.documentElement).getPropertyValue('--text-violet').trim() || '#0d0129';

  // 유형별 비중
  const categoryCounts = CATEGORIES.map(c => filtered.filter(i => (i.category || '기타') === c).length);
  const categoryPalette = ['#fae59b', '#f2b400', '#c9a0ff', '#a0c4ff', '#a0ffc4', '#ff9ecb', '#d9d9d9'];

  if (categoryChartInstance) categoryChartInstance.destroy();
  categoryChartInstance = new Chart(document.getElementById('categoryChartCanvas'), {
    type: 'doughnut',
    data: {
      labels: CATEGORIES,
      datasets: [{
        data: categoryCounts,
        backgroundColor: categoryPalette,
        borderColor: violet,
        borderWidth: 1.5
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: violet, font: { family: 'Inter' } } }
      }
    }
  });

  // 처리 현황 비율
  const statusCounts = STATUSES.map(s => filtered.filter(i => (i.status || '확인 안함') === s).length);
  const statusPalette = ['#d9d9d9', '#fae59b', '#a0ffc4', '#ff9ecb'];

  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(document.getElementById('statusChartCanvas'), {
    type: 'pie',
    data: {
      labels: STATUSES,
      datasets: [{
        data: statusCounts,
        backgroundColor: statusPalette,
        borderColor: violet,
        borderWidth: 1.5
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: violet, font: { family: 'Inter' } } }
      }
    }
  });

  // 월별 건의 추이
  const monthMap = {};
  filtered.forEach(item => {
    if (!item.createdAt) return;
    const d = new Date(item.createdAt.seconds * 1000);
    const key = monthKey(d);
    monthMap[key] = (monthMap[key] || 0) + 1;
  });
  const sortedMonths = Object.keys(monthMap).sort();

  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(document.getElementById('trendChartCanvas'), {
    type: 'line',
    data: {
      labels: sortedMonths,
      datasets: [{
        label: '건의 건수',
        data: sortedMonths.map(k => monthMap[k]),
        borderColor: violet,
        backgroundColor: '#fae59b',
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      scales: {
        x: { ticks: { color: violet }, grid: { color: '#eee' } },
        y: { beginAtZero: true, ticks: { color: violet, precision: 0 }, grid: { color: '#eee' } }
      },
      plugins: {
        legend: { labels: { color: violet, font: { family: 'Inter' } } }
      }
    }
  });
}

/* =====================================================================
   EXPORT SCREEN (데이터 내보내기)
   ===================================================================== */

let selectedExportIds = new Set();
let currentExportFilteredIds = [];

function applyExportFilter() {
  const filtered = filterData(allSuggestions, exportFilterState);
  currentExportFilteredIds = filtered.map(i => i.id);
  renderExportList(filtered);
  updateExportCount();
}

function renderExportList(list) {
  const container = document.getElementById('exportList');
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<p class="empty-msg">해당 건의가 없습니다.</p>`;
    return;
  }

  list.forEach(item => {
    const dateStr = item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'NO DATE';
    const row = document.createElement('label');
    row.className = 'export-row';
    row.innerHTML = `
      <input type="checkbox" id="exportChk-${item.id}" ${selectedExportIds.has(item.id) ? 'checked' : ''} onchange="toggleExportSelect('${item.id}', this.checked)">
      <span class="export-row-content">
        <strong>[${item.category || '기타'}]</strong> ${dateStr} · ${(item.status || '확인 안함')} — ${(item.content || '').slice(0, 60)}${(item.content || '').length > 60 ? '...' : ''}
      </span>
    `;
    container.appendChild(row);
  });
}

function toggleExportSelect(id, checked) {
  if (checked) selectedExportIds.add(id);
  else selectedExportIds.delete(id);
  updateExportCount();
}

function exportSelectAll() {
  currentExportFilteredIds.forEach(id => selectedExportIds.add(id));
  applyExportFilter();
}

function exportDeselectAll() {
  currentExportFilteredIds.forEach(id => selectedExportIds.delete(id));
  applyExportFilter();
}

function updateExportCount() {
  document.getElementById('exportCount').textContent = `${selectedExportIds.size}개 선택됨`;
}

function getSelectedExportRows() {
  return allSuggestions
    .filter(item => selectedExportIds.has(item.id))
    .map(item => ({
      '유형': item.category || '기타',
      '접수일': item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'NO DATE',
      '내용': item.content || '',
      '상태': item.status || '확인 안함',
      '코멘트': item.comment || '',
      '즐겨찾기': item.favorite ? 'Y' : 'N'
    }));
}

function exportToExcel() {
  const rows = getSelectedExportRows();
  if (rows.length === 0) {
    alert('내보낼 건의를 먼저 선택해주세요.');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '건의목록');
  XLSX.writeFile(wb, `건의목록_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function exportToCSV() {
  const rows = getSelectedExportRows();
  if (rows.length === 0) {
    alert('내보낼 건의를 먼저 선택해주세요.');
    return;
  }
  const headers = Object.keys(rows[0]);
  const escapeCell = val => `"${String(val).replace(/"/g, '""')}"`;
  const csvLines = [
    headers.map(escapeCell).join(','),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(','))
  ];
  const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM 추가 (엑셀 한글 깨짐 방지)

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `건의목록_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
