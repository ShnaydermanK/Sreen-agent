# Screen Agent

Корпоративная система мониторинга рабочего времени сотрудников контактного центра.

## Компоненты

| Компонент | Технология | Порт |
|-----------|------------|------|
| **Backend API** | FastAPI + Python 3.11 | 8000 |
| **Frontend** | React 18 + TypeScript + Vite | 5173 |
| **Agent** | Electron + Node.js | — |
| **PostgreSQL** | 15-alpine | 5432 |
| **Redis** | 7-alpine | 6379 |
| **MinIO** | Object storage | 9000 / 9001 |
| **Celery** | Video processing worker | — |

## Быстрый старт

### 1. Запустить инфраструктуру

```bash
docker-compose up -d
```

### 2. Применить миграции

```bash
docker-compose exec backend alembic upgrade head
```

### 3. Загрузить тестовые данные

```bash
docker-compose exec backend python seed.py
```

Будет создан:
- Пользователь: `admin@screenagent.local` / `admin123`
- 3 тестовых сотрудника с agent_token-ами

### 4. Открыть Admin Panel

```
http://localhost:5173
```

### 5. Swagger API

```
http://localhost:8000/api/docs
```

## Конфигурация агента

Создайте `config.json` в рабочей директории агента:

```json
{
  "server_url": "http://your-server:8000",
  "agent_token": "<token-from-seed-or-admin-panel>",
  "recording": {
    "enabled": true,
    "fps": 5,
    "resolution": "1280x720",
    "segment_duration_min": 30
  }
}
```

### Запуск агента (разработка)

```bash
cd agent
npm install
npm run dev
```

## API Agent Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| `POST` | `/api/v1/agent/heartbeat` | Пинг агента |
| `GET` | `/api/v1/policy/get` | Получение политики |
| `POST` | `/api/v1/upload/video` | Загрузка сегмента видео |
| `POST` | `/api/v1/stats/push` | Отправка статистики активности |

Все agent-запросы требуют заголовок `X-Agent-Token: <token>`.

## API Admin Endpoints

| Метод | URL | Описание |
|-------|-----|----------|
| `POST` | `/api/admin/auth/login` | Вход |
| `GET` | `/api/admin/employees` | Список сотрудников |
| `GET` | `/api/admin/recordings` | Список записей |
| `GET` | `/api/admin/recordings/{id}` | Деталь записи + presigned URL |
| `GET` | `/api/admin/stats/daily/{employee_id}` | Ежедневная статистика |

## Структура проекта

```
screen-agent/
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/    # Agent API
│   │   │   └── admin/    # Admin Panel API
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Storage, video processing
│   │   └── workers/      # Celery tasks (HLS, thumbnails)
│   └── alembic/          # Migrations
├── frontend/          # React + TypeScript SPA
│   └── src/
│       ├── pages/        # Dashboard, Employees, Recordings
│       └── components/   # Layout, Player, Charts
├── agent/             # Electron desktop client
│   └── src/
│       ├── main.js       # Electron entry + Tray
│       ├── recorder.js   # ffmpeg screen recording
│       ├── tracker.js    # Activity tracking
│       ├── uploader.js   # Sync to server
│       └── db.js         # SQLite local buffer
├── nginx/             # Reverse proxy config
└── docker-compose.yml
```
