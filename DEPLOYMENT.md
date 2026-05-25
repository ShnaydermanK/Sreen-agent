# Screen Agent — Руководство по развёртыванию и тестированию

## Содержание
1. [Архитектура и сетевые требования](#1-архитектура-и-сетевые-требования)
2. [Развёртывание сервера](#2-развёртывание-сервера)
3. [Сборка Windows MSI installer](#3-сборка-windows-msi-installer)
4. [Установка агента на рабочие ПК](#4-установка-агента-на-рабочие-пк)
5. [Массовое развёртывание через GPO](#5-массовое-развёртывание-через-gpo)
6. [Тестирование](#6-тестирование)
7. [Сценарии сети](#7-сценарии-сети)
8. [Безопасность и HTTPS](#8-безопасность-и-https)

---

## 1. Архитектура и сетевые требования

```
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│   Рабочий ПК сотрудника         │        │   Сервер Screen Agent            │
│                                  │        │   (on-premise или VPS)           │
│  Screen Agent (Electron/Service) │──────▶ │  nginx :80/:443                  │
│                                  │  HTTP  │    ├─ /api → FastAPI :8000       │
│  Каждые 30 сек: heartbeat        │        │    ├─ /ws  → WebSocket           │
│  Каждые N мин: upload video      │        │    └─ /     → React Admin :3001  │
│  Каждые 5 мин: activity stats    │        │  MinIO    :9000                  │
│                                  │        │  PostgreSQL :5432 (внутри)       │
└─────────────────────────────────┘        └──────────────────────────────────┘
         ПК менеджера
  ┌─────────────────────┐
  │  Браузер            │──────▶ http://server-ip:3001  (Admin Panel)
  └─────────────────────┘
```

### Нужна ли одна сеть?

| Сценарий | Нужна ли одна сеть? | Как настроить |
|----------|---------------------|---------------|
| **Офис (LAN)** — сервер и ПК в одной локальной сети | ✅ Да, проще всего | `server_url: http://192.168.1.100:8000` |
| **Офис + удалённые** — часть сотрудников работает из дома | ❌ Нет, нужен VPN | WireGuard / OpenVPN, затем LAN IP |
| **Облако** — сервер на VPS (Yandex Cloud, etc.) | ❌ Нет | `server_url: https://monitor.company.ru` |
| **Филиалы** — разные офисы | ❌ Нет | Публичный IP + HTTPS |

**Вывод:** ПК не обязаны быть в одной сети — агент работает через любое IP-соединение. Главное — ПК должен "видеть" IP/домен сервера по порту 8000 (или 443 при HTTPS).

---

## 2. Развёртывание сервера

### 2.1 Требования к серверу
- RAM: 4 GB минимум (рекомендуется 8 GB)
- CPU: 2 vCPU минимум
- Диск: от 50 GB (под видеоархив — зависит от числа агентов)
- ОС: Ubuntu 22.04 / Debian 12 / любой Linux с Docker

### 2.2 Установка

```bash
# Клонировать/скопировать проект на сервер
git clone <repo> screen_agent_tss
cd screen_agent_tss

# Создать .env (или использовать дефолты из docker-compose.yml)
cp .env.example .env  # если есть, или настроить переменные ниже

# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Запустить миграции и seed-данные
docker compose exec backend alembic upgrade head
docker compose exec backend python seed.py
```

### 2.3 Переменные окружения (docker-compose.yml)

```yaml
POSTGRES_PASSWORD: yourpassword
SECRET_KEY: your-secret-key-change-this
MINIO_ROOT_USER: minioadmin
MINIO_ROOT_PASSWORD: minioadmin123
```

### 2.4 Проверка сервера

```bash
# API работает?
curl http://SERVER_IP:8000/health
# → {"status": "ok"}

# Admin Panel открывается?
# Браузер: http://SERVER_IP:3001
# Логин: admin@screenagent.local / admin123
```

---

## 3. Сборка Windows MSI installer

**Важно:** Сборка MSI/NSIS требует Windows или macOS с Node.js 20+.

### 3.1 Подготовка на macOS/Linux (кросс-компиляция)

```bash
# Установить wine для кросс-компиляции на macOS (опционально)
brew install --cask wine-stable

# Или использовать Docker с Windows-образом
# (рекомендуется делать сборку на Windows)
```

### 3.2 Сборка на Windows

```bat
# Открыть CMD/PowerShell в директории agent/
cd C:\path\to\screen_agent_tss\agent

# Установить зависимости
npm install

# Сгенерировать иконки (если есть ImageMagick)
# installer\generate-icons.sh  (из WSL или Git Bash)

# Собрать MSI + NSIS установщик
installer\build-win.bat

# Или по отдельности:
npm run build:win:msi   # только MSI
npm run build:win       # MSI + NSIS setup.exe
```

### 3.3 Результат сборки

```
agent/dist/
├── Screen Agent-1.0.0.msi          ← MSI для GPO/тихой установки
├── Screen Agent Setup 1.0.0.exe    ← NSIS с мастером установки
└── win-unpacked/                   ← Распакованные файлы (для отладки)
```

### 3.4 Что делает NSIS installer

1. Показывает лицензионное соглашение (assets/LICENSE.txt)
2. **Страница настройки:** запрашивает Адрес сервера + Токен агента
3. Устанавливает файлы в `C:\Program Files\Screen Agent\`
4. Записывает `config.json` с введёнными данными
5. Создаёт ярлык в меню «Пуск»
6. Добавляет исключение Windows Firewall (outbound)
7. Запускает приложение после установки

---

## 4. Установка агента на рабочие ПК

### 4.1 Интерактивная установка (NSIS)

```
1. Скопируйте "Screen Agent Setup 1.0.0.exe" на ПК сотрудника
2. Запустите от имени Администратора
3. Следуйте мастеру установки:
   - Примите лицензионное соглашение
   - На странице "Подключение к серверу" введите:
       Адрес сервера: http://192.168.1.100:8000
       Токен агента:  <токен из Admin Panel>
4. Нажмите "Установить"
5. Агент запустится автоматически в системном трее
```

### 4.2 Где взять токен агента

```
Admin Panel → Сотрудники → [Карточка сотрудника] → Агенты → Новый токен
```

Каждый токен привязан к конкретному сотруднику. Один токен = один агент.

### 4.3 Тихая установка (MSI)

```bat
REM Установка с передачей параметров через командную строку
msiexec /i "Screen Agent-1.0.0.msi" /quiet /norestart ^
  SERVER_URL="http://192.168.1.100:8000" ^
  AGENT_TOKEN="ваш_токен_здесь"

REM Без параметров (нужно будет вручную заполнить config.json)
msiexec /i "Screen Agent-1.0.0.msi" /quiet /norestart
```

**После тихой установки** — если не передали параметры, отредактируйте:
```
C:\Program Files\Screen Agent\config.json
```

```json
{
  "server_url": "http://192.168.1.100:8000",
  "agent_token": "ВАШ_ТОКЕН",
  "recording": {
    "enabled": true,
    "fps": 5,
    "segment_duration_min": 1,
    "codec": "auto"
  }
}
```

---

## 5. Массовое развёртывание через GPO

### 5.1 Через Group Policy (GPO)

```
1. Скопируйте .msi на сетевой ресурс: \\server\share\ScreenAgent.msi

2. Откройте Group Policy Management Console (gpmc.msc)

3. Создайте новый GPO или отредактируйте существующий:
   Computer Configuration → Policies → Software Settings 
   → Software Installation → New Package
   
4. Укажите путь к .msi (обязательно UNC-путь: \\server\share\...)

5. Выберите "Assigned" (назначено)

6. Применение: при следующем входе пользователя / перезагрузке ПК
```

### 5.2 Через PowerShell Remoting (альтернатива)

```powershell
# Массовая установка на список ПК
$computers = Get-Content "computers.txt"
$msiPath = "\\fileserver\agents\ScreenAgent-1.0.0.msi"
$serverUrl = "http://192.168.1.100:8000"

foreach ($pc in $computers) {
    $token = (Get-EmployeeToken -Computer $pc)  # ваша логика получения токена
    
    Invoke-Command -ComputerName $pc -ScriptBlock {
        param($msi, $url, $tok)
        Start-Process msiexec -ArgumentList "/i `"$msi`" /quiet SERVER_URL=`"$url`" AGENT_TOKEN=`"$tok`"" -Wait
    } -ArgumentList $msiPath, $serverUrl, $token
}
```

---

## 6. Тестирование

### 6.1 Чеклист тестирования (пошагово)

#### Шаг 1: Проверить сервер

```bash
# На машине сервера
docker compose ps
# Все сервисы должны быть "Up"

curl http://localhost:8000/health
# {"status": "ok"}

# Открыть Admin Panel в браузере
# http://SERVER_IP:3001
# Войти: admin@screenagent.local / admin123
```

#### Шаг 2: Получить токен агента

```
Admin Panel → Сотрудники → Добавить сотрудника → ...
→ Карточка → Агенты → Новый токен
```
Скопируйте токен — он понадобится при установке.

#### Шаг 3: Установить агент на тестовый ПК

```
1. Скопировать "Screen Agent Setup 1.0.0.exe" на Windows ПК
2. ПКМ → Запуск от имени администратора
3. В мастере:
   - Адрес сервера: http://SERVER_IP:8000
   - Токен: вставить скопированный токен
4. Завершить установку
```

#### Шаг 4: Убедиться, что агент запустился

```
✓ В системном трее должна появиться иконка Screen Agent
✓ Иконка зелёного цвета = идёт запись
✓ ПКМ на иконке → "Сервер: http://SERVER_IP:8000"
```

#### Шаг 5: Проверить в Admin Panel

```
Dashboard → список агентов
✓ Статус агента: "online" (обновляется каждые 30 сек)
✓ Последний heartbeat: менее 1 минуты назад
```

#### Шаг 6: Проверить запись видео

```
Подождать 1–2 минуты (один сегмент = 1 мин по умолчанию)

Admin Panel → Сотрудники → [сотрудник] → Записи
✓ Появился новый видеосегмент
✓ Нажать Play → видео воспроизводится
```

#### Шаг 7: Проверить скриншоты (live preview)

```
Dashboard → карточка агента
✓ Отображается скриншот экрана (обновляется каждые 5 мин)
```

#### Шаг 8: Проверить активность

```
Admin Panel → Сотрудники → [сотрудник] → обзор
✓ Отображается время активности/простоя
✓ График активности за сегодня
```

### 6.2 Troubleshooting

| Проблема | Что проверить |
|----------|---------------|
| Агент не подключается к серверу | Пинг SERVER_IP с ПК агента. Открыт ли порт 8000 в фаерволе сервера? |
| Статус агента не меняется на "online" | Проверить config.json — правильный ли токен? Смотреть лог агента (трей → Показать лог) |
| Видео не появляется | ffmpeg установлен? `where ffmpeg` в CMD. На Windows нужно установить ffmpeg и добавить в PATH |
| Видео есть, но не воспроизводится | Celery worker работает? `docker compose logs celery_worker` |
| Запись не запускается на Windows | Разрешён ли захват экрана? Нужно запустить агент от имени залогиненного пользователя (не как сервис) |

### 6.3 Лог файлы

```
Windows: C:\Users\USERNAME\.screen-agent\agent.log
macOS:   ~/.screen-agent/agent.log
```

```bat
REM Открыть папку с логом через трей
REM ПКМ на иконке → "Показать лог"

REM Или напрямую
type "%USERPROFILE%\.screen-agent\agent.log"
```

---

## 7. Сценарии сети

### Сценарий A: Все в одной LAN

```
Сервер:  IP 192.168.1.100 (статический!)
Агент:   server_url = "http://192.168.1.100:8000"
```

Убедитесь, что у сервера **статический IP** в вашей сети (настроить в роутере через DHCP-резервирование по MAC).

### Сценарий B: Удалённые сотрудники + VPN

```
Сервер:  192.168.1.100 (в офисе)
VPN:     WireGuard / OpenVPN (сервер в той же сети)
Агент:   server_url = "http://192.168.1.100:8000" (через VPN тоннель)
```

VPN-клиент должен запускаться **до** Screen Agent (или вместе с ним).

### Сценарий C: Облачный сервер

```
Сервер:  VPS (Yandex Cloud / Selectel / Hetzner)
Домен:   monitor.company.ru → IP VPS
HTTPS:   Let's Encrypt через Certbot
Агент:   server_url = "https://monitor.company.ru"
```

#### Настройка HTTPS на сервере

```bash
# На VPS с Nginx
apt install certbot python3-certbot-nginx

# Создать конфиг /etc/nginx/sites-available/screen-agent
cat > /etc/nginx/sites-available/screen-agent <<EOF
server {
    listen 80;
    server_name monitor.company.ru;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name monitor.company.ru;
    
    ssl_certificate /etc/letsencrypt/live/monitor.company.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/monitor.company.ru/privkey.pem;
    
    # Admin Panel
    location / {
        proxy_pass http://localhost:3001;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -s /etc/nginx/sites-available/screen-agent /etc/nginx/sites-enabled/
certbot --nginx -d monitor.company.ru
nginx -s reload
```

### Сценарий D: Разные офисы без VPN

```
Сервер: публичный IP (или домен с HTTPS)
Агент:  server_url = "https://monitor.company.ru"
```

Единственное требование — порт 443 (HTTPS) открыт на сервере.

### Итоговая таблица

| | Одна LAN | VPN | Облако/Публичный IP |
|---|---|---|---|
| Сложность настройки | Низкая | Средняя | Средняя |
| Безопасность без HTTPS | Приемлемо (LAN) | ✅ Шифруется VPN | ❌ Нужен HTTPS |
| Поддержка удалённых | ❌ | ✅ | ✅ |
| Стоимость | Бесплатно | Бесплатно (WireGuard) | VPS от ~500 руб/мес |

---

## 8. Безопасность и HTTPS

### Почему HTTPS важен

При передаче через публичную сеть (интернет) без HTTPS:
- Видео и скриншоты передаются в открытом виде
- Токены агентов могут быть перехвачены

### Минимальная безопасность для продакшена

```bash
# 1. Смените дефолтные пароли в docker-compose.yml:
POSTGRES_PASSWORD=<strong-password>
SECRET_KEY=<random-64-chars>
MINIO_ROOT_PASSWORD=<strong-password>

# 2. Настройте HTTPS (см. Сценарий C выше)

# 3. Закройте прямые порты в фаерволе сервера:
ufw allow 22    # SSH
ufw allow 80    # HTTP (redirect)
ufw allow 443   # HTTPS
ufw deny 8000   # Не открывать напрямую!
ufw deny 9000   # MinIO — только внутри Docker
ufw enable
```

### Ротация токенов агента

Если токен скомпрометирован:
```
Admin Panel → Сотрудники → [сотрудник] → Агенты → Деактивировать токен → Новый токен
```
Затем обновить config.json на ПК агента и перезапустить агент.
