/* ============================================================
   APP.JS — Telegram Mini App: Дни рождения врачей
   Версия: 1.0.0 | Без бэкенда | Service Worker уведомления
   ============================================================ */

'use strict';

/* ── Константы ──────────────────────────────────────────────── */
const STORAGE_KEY_FILTER  = 'kdl_bd_dept_filter';
const STORAGE_KEY_SORT    = 'kdl_bd_sort';
const STORAGE_KEY_NOTIF   = 'kdl_bd_notified'; // JSON: { "YYYY": [doctorId, ...] }
const STORAGE_KEY_PERM    = 'kdl_bd_notif_perm'; // 'granted' | 'denied' | null
const DOCTORS_URL          = './doctors.json';

/* ── Состояние приложения ───────────────────────────────────── */
const state = {
  doctors: [],
  filtered: [],
  activeTab: 'all',
  search: '',
  department: '',
  clinic: '',
  sort: 'birthday',
  selectedDoctor: null,
};

/* ── DOM-узлы ──────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const DOM = {
  searchInput:   $('search-input'),
  clearSearch:   $('clear-search'),
  deptFilter:    $('dept-filter'),
  clinicFilter:  $('clinic-filter'),
  sortSelect:    $('sort-select'),
  doctorsList:   $('doctors-list'),
  emptyState:    $('empty-state'),
  statsBar:      $('stats-bar'),
  doctorModal:   $('doctor-modal'),
  modalBody:     $('modal-body'),
  notifyBtn:     $('notify-btn'),
  notifBanner:   $('notification-banner'),
  notifText:     document.querySelector('.notification-banner__text'),
};

/* ── Утилиты ────────────────────────────────────────────────── */

/**
 * Форматирует дату рождения в русский формат вида "15 марта 1985"
 * @param {string} dateStr ISO date string YYYY-MM-DD
 * @returns {string}
 */
function formatBirthday(dateStr) {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Вычисляет количество дней до следующего дня рождения (0 = сегодня)
 * @param {string} dateStr ISO date string YYYY-MM-DD
 * @returns {number}
 */
function daysUntilBirthday(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bd = new Date(dateStr + 'T00:00:00');

  // Следующий ДР в этом или следующем году
  let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);

  return Math.round((next - today) / 86_400_000);
}

/**
 * Вычисляет возраст (полных лет), который исполнится на ближайший ДР
 * @param {string} dateStr
 * @returns {number}
 */
function nextAge(dateStr) {
  const bd = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const baseAge = today.getFullYear() - bd.getFullYear();
  const hasHadBdThisYear =
    today.getMonth() > bd.getMonth() ||
    (today.getMonth() === bd.getMonth() && today.getDate() >= bd.getDate());
  // Возраст, который исполнится на ближайший ДР
  return hasHadBdThisYear ? baseAge + 1 : baseAge;
}

/**
 * Возвращает инициал (первые буквы имени и фамилии) для аватара
 * @param {string} fullName "Фамилия Имя Отчество"
 * @returns {string} 1-2 буквы
 */
function getInitials(fullName) {
  const parts = fullName.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
}

/**
 * Безопасный JSON.parse с fallback
 * @param {string} key localStorage ключ
 * @param {*} fallback значение по умолчанию
 */
function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore quota errors */ }
}

/* ── Telegram WebApp интеграция ─────────────────────────────── */
const tg = window.Telegram?.WebApp || null;

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();

  // Синхронизируем тему
  applyTelegramTheme();

  // Следим за изменением темы
  tg.onEvent('themeChanged', applyTelegramTheme);

  // Back button
  tg.BackButton.onClick(() => {
    if (!DOM.doctorModal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

function applyTelegramTheme() {
  if (!tg) return;
  const isDark = tg.colorScheme === 'dark';
  document.body.classList.toggle('dark', isDark);
}

/* ── Service Worker ─────────────────────────────────────────── */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    console.log('[SW] Зарегистрирован:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[SW] Ошибка регистрации:', err);
    return null;
  }
}

/* ── Уведомления ─────────────────────────────────────────────── */

/**
 * Возвращает список врачей, у которых ДР завтра
 * @returns {Array}
 */
function getDoctorsBirthdayTomorrow() {
  return state.doctors.filter((d) => daysUntilBirthday(d.birthday) === 1);
}

/**
 * Возвращает список врачей, у которых ДР сегодня
 */
function getDoctorsBirthdayToday() {
  return state.doctors.filter((d) => daysUntilBirthday(d.birthday) === 0);
}

/**
 * Проверяем, отправляли ли уже уведомление доктору в этом году
 */
function wasNotifiedThisYear(doctorId) {
  const year = new Date().getFullYear().toString();
  const stored = loadFromStorage(STORAGE_KEY_NOTIF, {});
  return Array.isArray(stored[year]) && stored[year].includes(doctorId);
}

function markNotifiedThisYear(doctorId) {
  const year = new Date().getFullYear().toString();
  const stored = loadFromStorage(STORAGE_KEY_NOTIF, {});
  if (!Array.isArray(stored[year])) stored[year] = [];
  if (!stored[year].includes(doctorId)) stored[year].push(doctorId);
  saveToStorage(STORAGE_KEY_NOTIF, stored);
}

/**
 * Показываем in-app баннер
 */
function showBanner(doctors) {
  if (!doctors.length || !DOM.notifBanner || !DOM.notifText) return;
  const names = doctors.map((d) => d.name.split(' ').slice(0, 2).join(' ')).join(', ');
  DOM.notifText.textContent = `Завтра день рождения у: ${names}`;
  DOM.notifBanner.classList.remove('hidden');
}

window.closeBanner = function () {
  DOM.notifBanner?.classList.add('hidden');
};

/**
 * Отправляем Web Api Notification через Service Worker
 */
async function sendWebNotification(doctor) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const reg = await navigator.serviceWorker?.ready;
  if (reg) {
    // Через SW — лучше отображение
    reg.showNotification('🎂 День рождения завтра!', {
      body: `У ${doctor.name} (${doctor.department}) завтра день рождения!`,
      icon: '/icon-192.png',
      tag: `birthday-${doctor.id}-${new Date().getFullYear()}`,
      requireInteraction: false,
    });
  } else {
    // Fallback — прямое уведомление
    new Notification('🎂 День рождения завтра!', {
      body: `У ${doctor.name} (${doctor.department}) завтра день рождения!`,
      tag: `birthday-${doctor.id}`,
    });
  }
}

/**
 * Основная проверка: запускается при загрузке приложения
 */
async function checkAndNotify() {
  if (state.doctors.length === 0) return;

  const tomorrow = getDoctorsBirthdayTomorrow();
  const needNotif = tomorrow.filter((d) => !wasNotifiedThisYear(d.id));

  if (needNotif.length === 0) return;

  // Всегда показываем in-app баннер
  showBanner(needNotif);

  // Пытаемся отправить системное уведомление
  if ('Notification' in window && Notification.permission === 'granted') {
    for (const doctor of needNotif) {
      await sendWebNotification(doctor);
      markNotifiedThisYear(doctor.id);
    }
  }
}

/**
 * Запрашиваем разрешение на уведомления (по клику пользователя)
 */
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Ваш браузер не поддерживает уведомления');
    return;
  }

  if (Notification.permission === 'granted') {
    showToast('Уведомления уже включены ✓');
    updateNotifyBtn();
    return;
  }

  if (Notification.permission === 'denied') {
    showToast('Уведомления заблокированы. Откройте настройки браузера');
    return;
  }

  // Запрашиваем (only работает по user gesture)
  const permission = await Notification.requestPermission();
  saveToStorage(STORAGE_KEY_PERM, permission);
  updateNotifyBtn();

  if (permission === 'granted') {
    showToast('Уведомления включены! Вы получите напоминание за день до ДР 🎂');
    // Немедленно проверяем и уведомляем
    await checkAndNotify();
  } else {
    showToast('Уведомления отклонены');
  }
}

function updateNotifyBtn() {
  if (!DOM.notifyBtn) return;
  const granted = 'Notification' in window && Notification.permission === 'granted';
  DOM.notifyBtn.classList.toggle('active', granted);
  DOM.notifyBtn.title = granted ? 'Уведомления включены' : 'Включить уведомления';
  DOM.notifyBtn.textContent = granted ? '🔔' : '🔕';
}

/* ── Toast ───────────────────────────────────────────────────── */
function showToast(message) {
  // Используем Telegram haptic + alert или простой toast
  if (tg?.showAlert) {
    tg.showAlert(message);
    return;
  }
  // Fallback: создаём toast динамически
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(30,34,54,0.95)',
    color: '#e8eaf6', padding: '10px 18px',
    borderRadius: '50px', fontSize: '13px', fontWeight: '600',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    zIndex: '9999', whiteSpace: 'nowrap',
    animation: 'cardIn 0.3s ease',
    transition: 'opacity 0.3s ease',
  });
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 2500);
}

/* ── Загрузка данных ─────────────────────────────────────────── */
async function loadDoctors() {
  try {
    const res = await fetch(DOCTORS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.doctors = await res.json();
    return true;
  } catch (err) {
    console.error('[App] Ошибка загрузки данных:', err);
    DOM.doctorsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <p>Не удалось загрузить данные</p>
      </div>`;
    return false;
  }
}

/* ── Фильтрация и сортировка ─────────────────────────────────── */

/**
 * @returns {Array} отфильтрованный и отсортированный список врачей
 */
function applyFilters() {
  let list = [...state.doctors];

  // Вкладка
  if (state.activeTab === 'today') {
    list = list.filter((d) => daysUntilBirthday(d.birthday) === 0);
  } else if (state.activeTab === 'upcoming') {
    list = list.filter((d) => {
      const days = daysUntilBirthday(d.birthday);
      return days >= 0 && days <= 30;
    });
  } else if (state.activeTab === 'jubilee') {
    list = list.filter((d) => {
      const age = nextAge(d.birthday);
      return age > 0 && age % 5 === 0;
    });
  }

  // Поиск (имя + специальность + клиника)
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.department && d.department.toLowerCase().includes(q)) ||
        (d.clinic && d.clinic.toLowerCase().includes(q))
    );
  }

  // Отделение
  if (state.department) {
    list = list.filter((d) => d.department === state.department);
  }

  // Клиника
  if (state.clinic) {
    list = list.filter((d) => d.clinic === state.clinic);
  }

  // Сортировка
  if (state.sort === 'birthday') {
    list.sort((a, b) => daysUntilBirthday(a.birthday) - daysUntilBirthday(b.birthday));
  } else if (state.sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  } else if (state.sort === 'dept') {
    list.sort((a, b) => a.department.localeCompare(b.department, 'ru') || a.name.localeCompare(b.name, 'ru'));
  } else if (state.sort === 'clinic') {
    list.sort((a, b) => (a.clinic || '').localeCompare(b.clinic || '', 'ru') || a.name.localeCompare(b.name, 'ru'));
  }

  state.filtered = list;
  return list;
}

/* ── Рендеринг ───────────────────────────────────────────────── */

function getBadge(days) {
  if (days === 0) return `<span class="birthday-badge badge-today">🎉 Сегодня!</span>`;
  if (days === 1) return `<span class="birthday-badge badge-tomorrow">🎂 Завтра!</span>`;
  if (days <= 7) return `<span class="birthday-badge badge-soon">через ${days} дн.</span>`;
  if (days <= 30) return `<span class="birthday-badge badge-days">через ${days} дн.</span>`;
  return `<span class="birthday-badge badge-days">${days} дн.</span>`;
}

function renderDoctorCard(doctor) {
  const days = daysUntilBirthday(doctor.birthday);
  const bd = new Date(doctor.birthday + 'T00:00:00');
  const age = nextAge(doctor.birthday);
  const isJub = age > 0 && age % 5 === 0;
  const shortDate = `${bd.getDate().toString().padStart(2, '0')}.${(bd.getMonth() + 1).toString().padStart(2, '0')}`;

  let cardClass = 'doctor-card';
  if (days === 0) cardClass += ' birthday-today';
  else if (days <= 7) cardClass += ' birthday-soon';
  if (isJub) cardClass += ' is-jubilee';

  const initials = getInitials(doctor.name);

  return `
    <div class="${cardClass}" data-id="${doctor.id}" onclick="openModal(${doctor.id})">
      <div class="doctor-avatar">${doctor.photo
        ? `<img src="${doctor.photo}" alt="${doctor.name}" loading="lazy" />`
        : initials
      }</div>
      <div class="doctor-info">
        <div class="doctor-name">${doctor.name}</div>
        <div class="doctor-dept">${doctor.department}</div>
        <div class="doctor-position">${doctor.clinic || ''} ${isJub ? `<span class="jubilee-chip">👑 Юбилей ${age} лет</span>` : ''}</div>
      </div>
      <div class="doctor-bd">
        <span class="birthday-date">🎂 ${shortDate}</span>
        ${getBadge(days)}
      </div>
    </div>`;
}

function renderList() {
  const list = applyFilters();
  const container = DOM.doctorsList;

  if (list.length === 0) {
    container.innerHTML = '';
    DOM.emptyState.classList.remove('hidden');
  } else {
    DOM.emptyState.classList.add('hidden');
    container.innerHTML = list.map(renderDoctorCard).join('');
  }

  renderStats(list);
}

function renderStats(list) {
  if (!DOM.statsBar) return;
  const today = list.filter((d) => daysUntilBirthday(d.birthday) === 0).length;
  const soon = list.filter((d) => {
    const dd = daysUntilBirthday(d.birthday);
    return dd > 0 && dd <= 7;
  }).length;

  const parts = [`<span>👤 Врачей: ${list.length}</span>`];
  if (today > 0) parts.push(`<span>🎉 Сегодня: ${today}</span>`);
  if (soon > 0) parts.push(`<span>📅 На неделе: ${soon}</span>`);
  DOM.statsBar.innerHTML = parts.join('');
}

/* ── Специальности: заполнение dropdown ─────────────────────── */
function populateDepartments() {
  const depts = [...new Set(
    state.doctors.map((d) => d.department).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  if (!DOM.deptFilter) return;
  DOM.deptFilter.innerHTML =
    `<option value="">Все специальности</option>` +
    depts.map((dep) => `<option value="${dep}">${dep}</option>`).join('');

  // Восстанавливаем последний выбор
  const saved = loadFromStorage(STORAGE_KEY_FILTER, '');
  if (saved && depts.includes(saved)) {
    DOM.deptFilter.value = saved;
    state.department = saved;
  }
}

/* ── Клиники: заполнение dropdown ─────────────────────────────── */
function populateClinics() {
  const clinics = [...new Set(
    state.doctors.map((d) => d.clinic).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  if (!DOM.clinicFilter) return;
  DOM.clinicFilter.innerHTML =
    `<option value="">Все клиники</option>` +
    clinics.map((c) => `<option value="${c}">${c}</option>`).join('');

  // Восстанавливаем последний выбор
  const saved = loadFromStorage('kdl_clinic', '');
  if (saved && clinics.includes(saved)) {
    DOM.clinicFilter.value = saved;
    state.clinic = saved;
  }
}

/* ── Модальное окно карточки врача ──────────────────────────── */
window.openModal = function (id) {
  const doctor = state.doctors.find((d) => d.id === id);
  if (!doctor) return;
  state.selectedDoctor = doctor;

  const days = daysUntilBirthday(doctor.birthday);
  const age  = nextAge(doctor.birthday);
  const bd   = new Date(doctor.birthday + 'T00:00:00');

  let bdLabel = '';
  if (days === 0) bdLabel = '<span class="modal-age-chip">🎉 Сегодня!</span>';
  else if (days === 1) bdLabel = '<span class="modal-age-chip">🎂 Завтра!</span>';
  else bdLabel = `<span class="modal-age-chip">через ${days} дн.</span>`;

  const initials = getInitials(doctor.name);

  DOM.modalBody.innerHTML = `
    <div class="modal-avatar">${initials}</div>
    <div class="modal-name">${doctor.name}</div>
    <div class="modal-dept">${doctor.department}</div>
    ${doctor.clinic ? `<div class="modal-position">🏥 ${doctor.clinic}</div>` : ''}
    <div class="modal-birthday-block">
      <div class="modal-birthday-icon">🎂</div>
      <div class="modal-birthday-info">
        <div class="modal-birthday-date">${formatBirthday(doctor.birthday)}</div>
        <div class="modal-birthday-meta">
          Исполнится ${age} лет &nbsp;·&nbsp; ${bdLabel}
        </div>
      </div>
    </div>
    ${doctor.phone ? `
      <a class="modal-contact-btn" href="tel:${doctor.phone}">
        📞 &nbsp;${doctor.phone}
      </a>` : ''}
    ${doctor.email ? `
      <a class="modal-email-btn" href="mailto:${doctor.email}">
        ✉️ &nbsp;${doctor.email}
      </a>` : ''}
    ${doctor.code ? `<div style="text-align:center;margin-top:12px;font-size:11px;color:var(--text-muted)">Код врача: ${doctor.code}</div>` : ''}
  `;

  DOM.doctorModal.classList.remove('hidden');

  // Telegram back button
  if (tg) tg.BackButton.show();
};

window.closeModal = function () {
  DOM.doctorModal.classList.add('hidden');
  state.selectedDoctor = null;
  if (tg) tg.BackButton.hide();
};

/* ── Обработчики событий ─────────────────────────────────────── */
function bindEvents() {
  // Поиск
  DOM.searchInput?.addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    DOM.clearSearch?.classList.toggle('hidden', !state.search);
    renderList();
  });

  DOM.clearSearch?.addEventListener('click', () => {
    state.search = '';
    DOM.searchInput.value = '';
    DOM.clearSearch.classList.add('hidden');
    DOM.searchInput.focus();
    renderList();
  });

  // Фильтр отделений
  DOM.deptFilter?.addEventListener('change', (e) => {
    state.department = e.target.value;
    saveToStorage(STORAGE_KEY_FILTER, state.department);
    renderList();
  });

  // Фильтр клиник
  DOM.clinicFilter?.addEventListener('change', (e) => {
    state.clinic = e.target.value;
    saveToStorage('kdl_clinic', state.clinic);
    renderList();
  });

  // Сортировка
  DOM.sortSelect?.addEventListener('change', (e) => {
    state.sort = e.target.value;
    saveToStorage(STORAGE_KEY_SORT, state.sort);
    renderList();
  });

  // Вкладки
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      btn.classList.add('active');
      state.activeTab = btn.dataset.tab;
      renderList();
    });
  });

  // Кнопка уведомлений
  DOM.notifyBtn?.addEventListener('click', requestNotificationPermission);

  // Закрытие модалки по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

/* ── Инициализация ──────────────────────────────────────────── */
async function init() {
  // 1. Инициализируем Telegram WebApp
  initTelegram();

  // 2. Регистрируем Service Worker
  await registerServiceWorker();

  // 3. Восстанавливаем настройки
  state.sort = loadFromStorage(STORAGE_KEY_SORT, 'birthday');
  if (DOM.sortSelect) DOM.sortSelect.value = state.sort;

  // 4. Загружаем данные
  const ok = await loadDoctors();
  if (!ok) return;

  // 5. Строим UI
  populateDepartments();
  populateClinics();
  renderList();

  // 6. Привязываем события
  bindEvents();

  // 7. Обновляем кнопку уведомлений
  updateNotifyBtn();

  // 8. Проверяем дни рождения и уведомляем
  await checkAndNotify();
}

// Запуск
document.addEventListener('DOMContentLoaded', init);
