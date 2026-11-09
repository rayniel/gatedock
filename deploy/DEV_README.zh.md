# OneTerm 开发环境快速搭建指南

> **语言**: [English](DEV_README.md) | [中文](DEV_README.zh.md)

本指南帮助开发者快速搭建 OneTerm 的开发环境，支持前端和后端独立开发。

## 环境选择

### RDP 独立会话页面

在工作台的 RDP 操作菜单中选择“独立页面连接”对应的账号，或点击展开账号旁的新标签页图标。
原有工作台内连接保持不变；独立页面会建立新的连接，不会迁移已有会话。
独立页沿用登录校验和资产账号权限，只显示远程桌面。顶部箭头可展开全屏、分辨率、
按权限开放的剪贴板和文件工具，以及断开连接按钮。全屏需要用户点击，Esc 可退出。
自动分辨率会随窗口调整请求远程桌面更新；固定分辨率按比例适应窗口，远端不支持动态
分辨率时仍按实际画面尺寸缩放。

验证时请连接测试 RDP 资产，检查新标签页和刷新后的认证、窗口缩放、进入/退出全屏、
不同缩放比例下的鼠标点击、工具弹窗、权限限制以及断开后重新连接。
监控页面不应向被监控会话发送分辨率更新。此功能需要构建并部署更新后的前端镜像。

### 🎨 前端开发环境
适用于：Vue.js 前端开发、UI 调试、前端功能开发
- 启动：MySQL、Redis、ACL-API、Guacd、OneTerm-API（可选）
- 本地运行：前端项目

### ⚙️ 后端开发环境  
适用于：Go 后端开发、API 开发、协议连接器开发
- 启动：MySQL、Redis、ACL-API、Guacd、OneTerm-UI
- 本地运行：后端项目

## 快速开始

### 前置要求
- Docker & Docker Compose
- Node.js 14.17.6+ (前端开发)
- Go 1.26+（后端开发；项目工具链：1.26.8）
- Git

### 1. 克隆项目
```bash
git clone <your-repo-url>
cd oneterm
```

### 2. 选择你的开发环境

#### 🎨 前端开发环境

1. **启动后端依赖服务**
```bash
cd deploy
# 启动必要的后端服务
docker compose -f docker-compose.frontend-dev.yaml up -d

# 查看服务状态
docker compose -f docker-compose.frontend-dev.yaml ps
```

2. **本地运行前端**
```bash
cd oneterm-ui

# 安装依赖
yarn install

# 启动开发服务器
npm run serve
```

3. **访问应用**
- 前端开发服务器: http://localhost:8000
- OneTerm API: http://localhost:18888
- ACL API: http://localhost:15000

#### ⚙️ 后端开发环境

1. **启动前端和依赖服务**
```bash
cd deploy
# 启动前端和必要服务
docker compose -f docker-compose.backend-dev.yaml up -d

# 查看服务状态
docker compose -f docker-compose.backend-dev.yaml ps
```

2. **配置后端**
```bash
cd backend/cmd/server
# 复制开发环境配置文件（已预配置好开发环境）
cp ../../deploy/dev-config.example.yaml config.yaml
```

3. **本地运行后端**
```bash
cd backend/cmd/server

# 安装依赖
go mod tidy

# 运行服务器
go run main.go config.yaml
```

4. **访问应用**
- 前端界面: http://localhost:8666
- 后端API: http://localhost:8888
- SSH端口: localhost:2222

## 开发工作流

### 前端开发

```bash
# 开发环境
cd oneterm-ui
npm run serve          # 启动开发服务器
npm run lint           # 代码检查
npm run lint:nofix     # 仅检查不修复

# 构建
npm run build          # 生产构建
npm run build:preview  # 预览构建
```

### 后端开发

```bash
# 开发环境
cd backend/cmd/server
go run main.go config.yaml     # 运行服务器

# 构建和测试
cd backend
go mod tidy                    # 更新依赖
go build ./...                 # 构建所有包
go test ./...                  # 运行测试

# 生产构建
cd backend/cmd/server
./build.sh                     # 构建 Linux 二进制文件
```

## 数据库管理

### 连接信息
- **MySQL**: localhost:13306
- **用户名**: root
- **密码**: 123456
- **数据库**: oneterm, acl

### 常用操作
```bash
# 连接 MySQL
mysql -h localhost -P 13306 -u root -p123456

# 查看数据库
show databases;
use oneterm;
show tables;

# 重置数据库（谨慎使用）
cd deploy
docker compose -f docker-compose.frontend-dev.yaml down -v
docker compose -f docker-compose.frontend-dev.yaml up -d
```

## 常见问题

### 端口冲突
如果遇到端口冲突，修改 docker-compose 文件中的端口映射：
```yaml
ports:
  - "新端口:容器端口"
```

### 数据库连接失败
1. 确保 MySQL 容器已启动并健康
2. 检查配置文件中的数据库连接参数
3. 验证端口映射是否正确

### 前端代理问题
检查 `oneterm-ui/vue.config.js` 中的代理配置：
```javascript
devServer: {
  proxy: {
    '/api': {
      target: 'http://localhost:18888',  // 确保指向正确的后端地址
      changeOrigin: true
    }
  }
}
```

### ACL 权限问题
1. 确保 ACL-API 服务正常运行
2. 检查初始化是否完成
3. 查看容器日志: `docker logs oneterm-acl-api-dev`

## 清理环境

```bash
# 停止开发环境
cd deploy
docker compose -f docker-compose.frontend-dev.yaml down
# 或
docker compose -f docker-compose.backend-dev.yaml down

# 清理所有数据（包括数据库）
docker compose -f docker-compose.frontend-dev.yaml down -v
```

## 调试技巧

### 查看日志
```bash
# 查看所有服务日志
docker compose -f docker-compose.frontend-dev.yaml logs

# 查看特定服务日志
docker compose -f docker-compose.frontend-dev.yaml logs mysql
docker compose -f docker-compose.frontend-dev.yaml logs acl-api

# 实时跟踪日志
docker compose -f docker-compose.frontend-dev.yaml logs -f
```

### 进入容器
```bash
# 进入 MySQL 容器
docker exec -it oneterm-mysql-dev bash

# 进入 ACL-API 容器
docker exec -it oneterm-acl-api-dev bash
```

## 快速启动脚本

使用便捷的启动脚本：

```bash
cd deploy

# 前端开发模式
./dev-start.sh frontend

# 后端开发模式
./dev-start.sh backend

# 完整环境模式
./dev-start.sh full

# 停止所有服务
./dev-start.sh stop

# 显示帮助
./dev-start.sh help
```

## 配置文件

### 后端配置
使用开发环境配置模板：
```bash
cd backend/cmd/server
cp ../../deploy/dev-config.example.yaml config.yaml
# 配置已预设好开发环境
```

### 前端配置
前端会自动代理到后端。如需自定义代理设置，编辑 `oneterm-ui/vue.config.js`。

## 贡献指南

+ [CONTRIBUTING_cn.md](../CONTRIBUTING_cn.md)

## 技术支持

- 项目文档: 查看项目根目录的 README.md
- 问题反馈: 创建 GitHub Issue
- 开发讨论: 参与项目讨论

---

**开发愉快! 🚀**