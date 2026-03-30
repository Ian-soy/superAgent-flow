# DeerFlow 本地部署经验文档

## 一、部署环境准备

### 1.1 系统要求

| 组件 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 22+ | 前端构建和运行必需 |
| Python | 3.12+ | 后端 LangGraph 服务必需 |
| pnpm | 10.26.2+ | 前端包管理器 |
| uv | 0.11+ | Python 包管理器（比 pip 更快） |
| Nginx | 任意版本 | 反向代理（可选但推荐） |
| Docker | 最新版 | 沙箱功能必需（可选） |

### 1.2 Windows 环境特殊注意事项

**问题 1: 编码问题导致脚本执行失败**
```bash
# 错误现象
UnicodeEncodeError: 'gbk' codec can't encode character '\u2713'

# 解决方案
# Windows 默认使用 GBK 编码，但项目脚本使用 UTF-8
# 建议：使用 Git Bash 或 WSL 运行命令，避免 Windows CMD
```

**问题 2: 路径分隔符**
```bash
# Windows 使用反斜杠，但 bash 脚本期望正斜杠
# 使用 Git Bash 可以自动处理这个问题
# 手动执行时要确保路径格式正确
cd /d/agentSpace/superAgent-flow  # 正确
cd d:\agentSpace\superAgent-flow   # 在 Git Bash 中可能有问题
```

---

## 二、依赖安装问题

### 2.1 npm/pnpm 镜像证书问题

**问题现象：**
```
npm error code CERT_HAS_EXPIRED
npm error request to https://registry.npm.taobao.org failed
```

**解决方案：**
```bash
# 切换到官方 registry
npm config set registry https://registry.npmjs.org/
pnpm config set registry https://registry.npmjs.org/

# 或使用 corepack 安装 pnpm
corepack enable
corepack prepare pnpm@latest --activate
```

### 2.2 uv 安装

```bash
# 方式 1：官方脚本（推荐）
curl -fsSL https://astral.sh/uv/install.sh | sh

# 方式 2：pip 安装
pip install uv

# Windows 用户
# 安装后添加到 PATH: $HOME/.local/bin
export PATH="$HOME/.local/bin:$PATH"
```

---

## 三、配置问题

### 3.1 配置文件生成

```bash
# 首次部署必须执行
make config

# 这会创建两个文件：
# - config.yaml: 应用配置（模型、工具、沙箱等）
# - .env: 环境变量（API 密钥等）
```

### 3.2 百炼模型配置示例

```yaml
# config.yaml 中添加
models:
  - name: bailian-qwen-max
    display_name: 百炼 Qwen Max
    use: langchain_openai:ChatOpenAI
    model: qwen-max
    api_key: $BAILIAN_API_KEY
    base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
    max_tokens: 8192
    temperature: 0.7
    supports_thinking: true
    supports_vision: true
```

对应的 `.env`：
```bash
BAILIAN_API_KEY=your-bailian-api-key
```

### 3.3 BETTER_AUTH_SECRET 详解

#### 什么是 BETTER_AUTH_SECRET？

`BETTER_AUTH_SECRET` 是 [Better Auth](https://www.better-auth.com/) 库的密钥，用于：

1. **会话签名**：签名和验证用户会话 cookie
2. **令牌加密**：加密 JWT 令牌和会话数据
3. **安全验证**：防止会话劫持和伪造
4. **CSRF 保护**：跨站请求伪造防护

#### 为什么需要它？

```
❌ 没有设置时：
Error: Invalid environment variables
{
  code: 'invalid_type',
  expected: 'string',
  received: 'undefined',
  path: ['BETTER_AUTH_SECRET'],
  message: 'Required'
}
```

- Next.js 构建时验证环境变量
- Better Auth 要求必须提供密钥
- 生产环境必须设置，否则无法启动

#### 如何获取/生成？

```bash
# 方式 1：使用 Python 生成（推荐）
python3 -c "import secrets; print(secrets.token_hex(32))"

# 方式 2：使用 OpenSSL
openssl rand -hex 32

# 方式 3：使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 方式 4：使用 /dev/urandom (Linux/Mac)
head -c 32 /dev/urandom | xxd -p -c 64
```

**生成示例输出：**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

#### 如何配置？

**开发环境：**
```bash
# 添加到 frontend/.env
BETTER_AUTH_SECRET=your-generated-secret-key
```

**生产环境：**
```bash
# 添加到 .env（项目根目录）
BETTER_AUTH_SECRET=your-generated-secret-key

# 或者作为环境变量导出
export BETTER_AUTH_SECRET=your-generated-secret-key
```

#### 安全注意事项

⚠️ **重要：**
1. **不要硬编码**：不要将密钥直接写在代码中
2. **不要提交到 Git**：确保 .env 在 .gitignore 中
3. **生产环境重新生成**：每次部署新环境时生成新的密钥
4. **密钥长度**：至少 32 字节（64 个十六进制字符）
5. **保密性**：泄露密钥会导致会话被伪造

---

## 四、开发模式 vs 生产模式

### 4.1 开发模式（make dev）

```bash
# 特点：
# - 热重载（修改代码自动刷新）
# - 按需编译（首次访问页面时才编译）
# - 调试信息完整
# - 性能较差（未优化）

# 适用场景：日常开发、调试代码

# 问题：首次访问页面慢（Windows 下可能 60+ 秒）
GET /workspace 200 in 67s (compile: 67s, render: 30ms)
```

### 4.2 生产模式（make start）

```bash
# 前置要求：
# 1. 先构建前端
# 2. 设置 BETTER_AUTH_SECRET

# 构建命令
cd frontend && pnpm build

# 特点：
# - 预编译完成（构建时编译）
# - 无热重载
# - 代码优化（压缩、tree-shaking）
# - 性能最佳

# 适用场景：演示、生产环境、快速体验
```

### 4.3 模式对比

| 特性 | 开发模式 | 生产模式 |
|------|----------|----------|
| 启动速度 | 快 | 慢（需构建） |
| 首次访问 | 慢（60s+） | 快（<1s） |
| 热重载 | ✅ | ❌ |
| 调试 | 方便 | 困难 |
| 性能 | 差 | 优 |
| 适用场景 | 开发 | 演示/生产 |

---

## 五、服务架构与端口

### 5.1 服务架构图

```
                    ┌─────────────────────────────────────────┐
                    │           Nginx (Port 2026)              │
                    │         统一入口 / 反向代理               │
                    └─────────────────┬───────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │  Frontend     │       │  Gateway API  │       │  LangGraph    │
    │  Port 3000    │       │  Port 8001    │       │  Port 2024    │
    │  Next.js      │       │  FastAPI      │       │  LangGraph    │
    └───────────────┘       └───────────────┘       └───────────────┘
                                      │                         │
                                      └───────────┬─────────────┘
                                                  ▼
                                        ┌───────────────────┐
                                        │  LLM Models       │
                                        │  (百炼/OpenAI等)   │
                                        └───────────────────┘
```

### 5.2 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 2026 | Nginx | 统一入口，对外暴露的唯一端口 |
| 3000 | Frontend | Next.js 前端（开发模式） |
| 8001 | Gateway | API 网关，处理业务逻辑 |
| 2024 | LangGraph | Agent 运行时服务 |

### 5.3 访问地址

```
# 用户访问（推荐）
http://localhost:2026

# 直接访问各服务（调试用）
http://localhost:3000      # 前端
http://localhost:8001      # Gateway API
http://localhost:8001/docs # API 文档
http://localhost:2024      # LangGraph
```

---

## 六、常见问题排查

### 6.1 服务启动失败

**检查步骤：**
```bash
# 1. 检查端口占用
netstat -ano | findstr 2026
netstat -ano | findstr 8001
netstat -ano | findstr 2024
netstat -ano | findstr 3000

# 2. 检查日志
cat logs/langgraph.log
cat logs/gateway.log
cat logs/frontend.log
cat logs/nginx.log

# 3. 检查健康状态
curl http://localhost:2024/health
curl http://localhost:8001/health
```

### 6.2 Nginx 启动失败

**错误：**
```
nginx: [emerg] CreateDirectory() failed (3: The system cannot find the path)
```

**解决：**
```bash
mkdir -p temp/client_body_temp
nginx -c /path/to/nginx.local.conf -p /path/to/project
```

### 6.3 环境变量不生效

**问题：** 设置了变量但应用读取不到

**解决：**
```bash
# 1. 确认 .env 文件位置
# 根目录 .env: 后端和全局配置
# frontend/.env: 前端专用配置

# 2. 重启服务（修改后必须重启）
pkill -f "langgraph"
pkill -f "uvicorn"
pkill -f "next"
pkill nginx

# 3. 检查变量名拼写
# 注意：Next.js 只识别 NEXT_PUBLIC_ 前缀的变量
```

### 6.4 模型调用失败

**检查清单：**
- [ ] API Key 是否正确
- [ ] 模型名称是否正确
- [ ] base_url 是否正确
- [ ] 网络是否能访问模型服务
- [ ] 查看 gateway 日志中的错误信息

---

## 七、二次开发建议

### 7.1 项目结构理解

```
deer-flow/
├── backend/              # Python 后端
│   ├── packages/         # 核心包
│   │   └── harness/      # DeerFlow 核心
│   ├── app/              # FastAPI 应用
│   ├── skills/           # 技能定义
│   └── tests/            # 测试
├── frontend/             # Next.js 前端
│   ├── src/
│   │   ├── app/          # 页面路由
│   │   ├── components/   # 组件
│   │   ├── core/         # 核心业务逻辑
│   │   └── lib/          # 工具函数
│   └── public/           # 静态资源
├── docker/               # Docker 配置
├── scripts/              # 部署脚本
├── config.yaml           # 主配置文件
└── .env                  # 环境变量
```

### 7.2 开发工作流

```bash
# 1. 启动开发模式（首次）
make dev

# 2. 修改代码
# - 后端代码修改自动热重载
# - 前端代码修改自动刷新

# 3. 测试（重要！）
cd backend && uv run pytest
cd frontend && pnpm check

# 4. 构建生产版本
make start
```

### 7.3 添加新模型

1. 在 `config.yaml` 的 `models` 部分添加配置
2. 在 `.env` 中添加对应的 API Key
3. 重启服务

### 7.4 添加新技能

1. 在 `skills/public/` 或 `skills/custom/` 创建技能目录
2. 编写 `SKILL.md` 定义技能
3. 在 `config.yaml` 的 `skills` 部分启用

---

## 八、安全建议

### 8.1 本地开发安全

- 不要提交 `.env` 文件到 Git
- 定期更换 API Key
- 使用 `BETTER_AUTH_SECRET` 保护会话

### 8.2 生产部署安全

```bash
# 1. 修改默认端口
# 2. 启用 HTTPS
# 3. 配置防火墙规则
# 4. 设置 IP 白名单
# 5. 定期更新依赖
```

---

## 九、参考资料

- [DeerFlow GitHub](https://github.com/bytedance/deer-flow)
- [Better Auth 文档](https://www.better-auth.com/)
- [Next.js 文档](https://nextjs.org/docs)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [百炼文档](https://help.aliyun.com/document_detail/611411.html)

---

## 十、快速命令参考

```bash
# 首次部署
make config                    # 生成配置
make install                   # 安装依赖
make dev                       # 开发模式

# 日常开发
make start                     # 生产模式
make stop                      # 停止服务
make clean                     # 清理

# 调试
make check                     # 检查依赖
make config-upgrade            # 升级配置
```

---

**最后更新：** 2026-03-28

**维护者：** Claude Code
