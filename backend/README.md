# 晚自习考勤管理系统 · 后端

FastAPI + SQLAlchemy。数据 **默认走 SQLite（零安装）**，改一个环境变量即可切到 PostgreSQL，  
模型层不使用任何数据库方言特有类型，所以两边共用同一套代码。

## 1. 初始化（只需一次）

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\python.exe -m pip install -r requirements.txt
# macOS / Linux
.venv/bin/python -m pip install -r requirements.txt
```

> 若公司网络需要代理：`pip install -r requirements.txt --proxy http://<host>:<port>`

## 2. 导入基础数据

数据来源是前端 `src/data.ts`，避免两份数据漂移：

```bash
# 在项目根目录
node scripts/export-seed.mjs     # 生成 backend/app/seed/seed_data.json
cd backend
.venv/Scripts/python.exe -m app.seed.run_seed --force
```

会写入 10 间教室、16 个班、27 名干事、本周/下周两套排班、7 轮假条核查分组、  
45 个账号、16 条今日考勤演示数据。**所有账号初始口令均为 `123456`。**

## 3. 启动

```bash
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

- 接口文档：<http://127.0.0.1:8000/api/docs>
- 健康检查：<http://127.0.0.1:8000/api/health>

## 4. 测试

```bash
.venv/Scripts/python.exe -m pytest -q
```

测试使用临时目录里的独立 SQLite 库，不会改动开发数据。
其中 `tests/test_migrations.py` 会在临时库上跑一遍 `alembic upgrade head` 再与模型比对
——改了模型却忘了生成迁移时，它会直接失败。

## 5. 数据库迁移（Alembic）

SQLite 开发模式下启动会自动建表（`create_all`），不需要迁移。
**PostgreSQL 生产环境不做自动建表**，必须跑迁移：

```bash
# 生成迁移（改了 models/entities.py 之后）
.venv/Scripts/python.exe -m alembic revision --autogenerate -m "说明改了什么"

# 应用迁移
.venv/Scripts/python.exe -m alembic upgrade head

# 检查模型与迁移是否一致（CI 里也该跑）
.venv/Scripts/python.exe -m alembic check
```

数据库地址只从 `DATABASE_URL`（或 `.env`）读，`alembic.ini` 里那行是空的，避免两处配置漂移。

## 6. 前端怎么连上来

三种运行方式，前端会自动判断用哪种：

| 方式       | 启动命令                            | 后端       | 说明                                                   |
| -------- | ------------------------------- | -------- | ---------------------------------------------------- |
| 完整模式（推荐） | 双击根目录 `start-all.bat`           | 已连接    | 前端跑在 `http://127.0.0.1:4180`，已在 CORS 白名单内            |
| 前端开发模式   | `npm run dev`                   | 已连接    | Vite 默认 5173，同样在白名单内                                 |
| 单文件离线包   | 双击 `dist-standalone/index.html` | 未连接（本地演示数据） | `file://` 的 Origin 是 `null`，浏览器会被 CORS 拦下，前端自动回退本地数据 |



> **为什么单文件包连不上后端？** 不是 bug。浏览器对 `file://` 页面发出的跨域请求一律带  
> `Origin: null`，而白名单里不可能安全地放 `null`（那等于允许本机任意 HTML 调接口）。  
> 单文件包的定位是「断网也能演示」，要用真实数据请走 `start-all.bat`。

如需改端口或白名单，编辑 `backend/.env` 的 `CORS_ORIGINS`（逗号分隔）。

## 7. 切换到 PostgreSQL

本机不必安装 PostgreSQL 也能开发。要上生产时：

```bash
# 起一个本地 PG（可选）
docker compose up -d db

# 修改 backend/.env
DATABASE_URL=postgresql+psycopg://attendance:attendance@127.0.0.1:5432/attendance
```

`psycopg` 驱动需要额外安装：`pip install "psycopg[binary]"`，生产用 Alembic 迁移，  
不要用 SQLite 那套 `create_all`。

## 目录结构

```
backend/
├── app/
│   ├── core/        配置、数据库引擎、口令哈希与 JWT、共享常量
│   ├── models/      SQLAlchemy 模型（账号、班级、教室、排班、调班、考勤、假条、玩手机、检讨、附件、审计日志等）
│   ├── schemas/     Pydantic 出入参（对外 camelCase）
│   ├── api/         路由与依赖注入（认证、角色守卫）
│   ├── services/    领域计算（排班校验、考勤排次、应到人数、教室规则）
│   └── seed/        数据导入
├── migrations/      Alembic 迁移脚本
└── tests/           单元测试、接口测试、迁移一致性检查
```

完整上线步骤见 `docs/上线部署指南.md`（服务器、域名备案、HTTPS、备份、更新）。

## 已实现与未实现

已实现：真实口令哈希 + JWT、按角色的接口鉴权、服务端重算应到人数、  
跨周调班双向互换（与前端同一套校验规则）、考勤按「次」续排、附件存储、  
审计日志、登录失败限流与临时锁定、首次登录强制改密与口令强度策略、  
Alembic 迁移、Docker 生产编排、备份/恢复脚本。

尚未实现（下一阶段）：Refresh Token、Redis 缓存、  
对象存储、微信消息推送、定时备份的异地同步。
