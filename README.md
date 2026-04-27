# 🏥 Дни рождения врачей — Telegram Mini App

Telegram Mini App с бэкендом на Node.js (Express + PostgreSQL). 
База данных и бот развернуты на VPS через Docker.

## Стек

| Слой | Технология |
|---|---|
| Frontend | HTML5 + Vanilla JS + CSS (Glassmorphism) |
| Backend | Node.js + Express + Prisma ORM |
| Database | PostgreSQL |
| Bot | Telegraf.js (с ежедневными уведомлениями) |
| Hosting | Firebase (Frontend) + VPS (Backend) |
| CI/CD | GitHub Actions + Docker |

## Особенности (Features)
- 🏥 **Фильтрация по клиникам**: Быстрый выбор врачей конкретного филиала.
- 👑 **Подсветка юбиляров**: Автоматическое определение юбилеев (30, 35, 40... лет) с короной.
- ♈ **Знаки зодиака**: Автоматическое отображение иконок знаков зодиака.
- 🎉 **Эффект конфетти**: Праздничная анимация, если сегодня есть именинники.
- 📱 **Быстрая связь**: Кнопки прямого звонка и WhatsApp с готовым текстом поздравления.
- ⚡ **Bypass Cache**: Система автоматического сброса кэша Telegram (v=6).

## Структура проекта

```
kdl_bd/
├── .github/workflows/deploy.yml   # Автодеплой при push в main
├── public/
│   ├── index.html                 # Главная страница
│   ├── app.js                     # Логика приложения
│   ├── styles.css                 # Стили (Glassmorphism, dark/light)
│   ├── sw.js                      # Service Worker (уведомления + кеш)
│   └── doctors.json               # База данных врачей
├── firebase.json                  # Конфиг Firebase Hosting
└── .firebaserc                    # ID Firebase-проекта
```

## Быстрый старт

### 1. Создать Firebase-проект

1. Зайди на [console.firebase.google.com](https://console.firebase.google.com)
2. Создай новый проект
3. Перейди в **Hosting** → нажми «Начало работы»
4. Скопируй **Project ID**

### 2. Обновить конфиг

В файле `.firebaserc` замени `YOUR_FIREBASE_PROJECT_ID` на реальный ID:
```json
{
  "projects": {
    "default": "kdl-bd-prod"
  }
}
```

### 3. Добавить GitHub Secrets

В GitHub репозитории → **Settings → Secrets and variables → Actions**:

| Secret | Значение |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON сервисного аккаунта Firebase |
| `FIREBASE_PROJECT_ID` | ID Firebase-проекта |

Получить сервисный аккаунт:
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Выбрать "Use an existing project" и выбрать свой проект
# В настройках GitHub Actions Firebase создаст секрет автоматически
```

### 4. Деплой

```bash
git add .
git commit -m "Initial deploy"
git push origin main
```

GitHub Actions автоматически задеплоит на Firebase Hosting за ~30 секунд.

### 5. Настроить Telegram Mini App

В **@BotFather**:
```
/newapp
# Выбрать бота
# Web App URL: https://YOUR_PROJECT_ID.web.app
```

## Добавление врача

Открой `public/doctors.json` и добавь запись по шаблону:

```json
{
  "id": 21,
  "name": "Фамилия Имя Отчество",
  "department": "Название отделения",
  "position": "Должность",
  "birthday": "YYYY-MM-DD",
  "phone": "+7 XXX XXX-XX-XX",
  "email": "email@clinic.kz",
  "photo": null
}
```

После сохранения файла:
```bash
git add public/doctors.json
git commit -m "Add doctor: Фамилия И.О."
git push origin main
```

Данные обновятся на сайте автоматически.

## Система уведомлений

### Как работает

| Событие | Действие |
|---|---|
| Открыл приложение | Проверяем: у кого ДР завтра |
| Нашли совпадение | Показываем баннер-напоминание вверху |
| Пользователь нажал 🔕 | Запрашиваем разрешение на push-уведомления |
| Разрешение получено | Отправляем системное уведомление (через SW) |
| Уведомление уже было | `localStorage` помнит, не дублируем |

### Бэкенд
Благодаря переходу на VPS, уведомления теперь приходят автоматически в Telegram через бота, даже если приложение закрыто.

## Деплой бэкенда на VPS

### 1. Подготовка сервера (Ubuntu 24.04)
Сервер должен иметь чистую ОС.

### 2. Загрузка файлов
Загрузи папку `server`, `docker-compose.yml` и `setup_vps.sh` на сервер в папку `/root/kdl_bd`.

### 3. Настройка переменных
Создай файл `server/.env` на сервере:
```env
DATABASE_URL="postgresql://kdl_user:kdl_password@db:5432/kdl_bd?schema=public"
BOT_TOKEN="ТВОЙ_ТОКЕН_ОТ_BOTFATHER"
```

### 4. Запуск
Выполни скрипт настройки:
```bash
chmod +x setup_vps.sh
./setup_vps.sh
```

### 5. Миграция данных (из JSON в Базу)
После запуска контейнеров, выполни миграцию (разово):
```bash
docker compose exec api node src/migrate.js
```

Теперь база данных заполнена, а бот и API работают на порту 3000.

## Локальный запуск (Frontend)

```bash
# Установить firebase-tools
npm install -g firebase-tools

# Запустить локальный сервер
firebase serve --only hosting

# Открыть
http://localhost:5000
```
