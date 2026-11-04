# 晚自习考勤管理系统（演示版）

一个面向高校晚自习考勤的轻量级全栈管理系统：班委上报考勤、查勤干事核查、
管理端统筹、运维端配置，覆盖「应到变更留痕 / 七轮四人查考勤 / 跨周调班 /
玩手机公示 / 检讨附件 / A4 纵版 Excel 导出」等完整业务闭环。

> ⚠️ **数据声明**：本仓库为**开源演示版本**，所有校名、学院、班级、教室、干事姓名、
> 学生姓名、账号等均为**虚构随机数据**，不含任何真实个人信息。请勿将其中的数据
> 当作真实单位信息。

## 技术栈

- 前端：React 18 + TypeScript + Vite + Tailwind CSS
- 后端：FastAPI + SQLAlchemy 2 + Pydantic v2
- 数据库：SQLite（开发）/ PostgreSQL（生产，配置兼容）
- 鉴权：JWT + bcrypt，首次登录强制改密、登录限流
- 部署：Docker + nginx + HTTPS，Alembic 迁移，自动备份脚本

## 功能亮点

- 四角色闭环：班委 / 查勤 / 管理 / 运维
- 应到人数变更必须填写原因并留痕，管理端可「确认已阅」
- 当日玩手机公示（无人时显示「平安夜」）
- 查考勤按「次」续排（七轮分组循环，不受星期映射限制）
- 跨周调班，带冲突校验
- 导出真正 `.xlsx`，A4 纵版、重复标题、页脚页码，含**美化表 / 纯黑白表**两种风格
- 前后端双模式：连上后端用真实数据，离线自动回退本地演示数据

## 目录结构

```
.
├── src/                前端（React + TS）
│   ├── data.ts         业务基础数据（校/院/班/教室/干事/排班）—— 全部虚构
│   ├── components/     页面与组件
│   └── lib/            导出、API、排次等逻辑
├── backend/            FastAPI 后端
│   ├── app/            路由、模型、服务
│   ├── seed/           种子数据（由 src/data.ts 生成）
│   └── tests/          后端测试
├── scripts/            一键启动 / 种子导出
├── deploy/             Docker / nginx / 备份脚本
└── docs/               系统说明、部署指南、缺口清单等
```

## 本地运行

### 1. 前端

```bash
npm install
npm run dev            # 开发服务器，默认 http://127.0.0.1:5173
# 或构建预览
npm run build && npm run preview
```

### 2. 后端

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
python -m app.seed.run_seed --force                 # 灌入演示数据
uvicorn app.main:app --reload --port 8000
# 接口文档：http://127.0.0.1:8000/api/docs
```

### 3. 一键启动（推荐）

无需手动分步，双击 `start-all.bat`（Windows）或：

```bash
npm run start:all      # 后端 8000 + 前端 4180
npm run check:backend  # 环境体检
npm run verify:backend # 接口联调自检
```

默认账号初始口令均为 `123456`，**首次登录会强制改密**。角色示例：

| 角色 | 用户名示例 | 说明 |
|---|---|---|
| 班委 | `xw01` | 16 个班级各一个 |
| 查勤 | `gs01` | 27 名干事各一个 |
| 管理员 | `admin` | 统筹 |
| 运维 | `ops` | 系统配置、重置口令 |

> 完整账号表见 `docs/账号清单.md`（已脱敏）。

## 生产部署

见 `docs/上线部署指南.md` 与 `deploy/` 下的 Docker / nginx / 备份脚本。
服务器、域名、备案、证书等成本与选型见 `docs/系统说明与技术选型.md`。

## License

[MIT](./LICENSE)
