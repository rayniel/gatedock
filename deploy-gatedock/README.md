# GateDock 本地源码生产部署

本目录是 GateDock 自维护部署入口；`../deploy/` 保留当前 Git 基线的上游部署，
以后同步上游时不在其中叠加 GateDock 部署逻辑。必须保留整个仓库，不能只复制本目录。
唯一复用的上游部署材料是 ACL 初始化 SQL 和 ACL 兼容性 schema 补丁，均只读挂载；
不复制整套上游脚本，也不改变内部 API 路径或 Go module 名称。

## 镜像选型与边界

| 服务 | 默认镜像 | 原因 |
| --- | --- | --- |
| API | `gatedock-api:local` | 当前后端源码构建，包含二开功能 |
| Web / Nginx | `gatedock-ui:local` | 当前前端源码构建，Nginx 服务静态页面、API 与 WebSocket |
| MySQL | `mysql:8.4.7` | 官方 8.4 LTS；仅用于全新数据目录，已验证导入 ACL seed |
| Redis | `redis:7.2.12-alpine` | 官方 7.2 系列，开启 AOF 持久化 |
| ACL API / worker | `gatedock-acl:local` | 从固定提交的 `rayniel/gatedock-acl` submodule 构建同一镜像，独立运行 |
| Guacd | `ghcr.io/veops/oneterm-guacd:v26.10.1` | 保留已验证的 RDP、录屏、文件目录行为，暂不直接换成通用 Guacd |

可在 `.env` 中覆盖 `GATEDOCK_API_IMAGE`、`GATEDOCK_UI_IMAGE`、
`GATEDOCK_MYSQL_IMAGE`、`GATEDOCK_REDIS_IMAGE`、`GATEDOCK_ACL_IMAGE`、
`GATEDOCK_GUACD_IMAGE`。生产建议将依赖固定为经验证的 digest；
这里使用明确版本而不是 `latest`，但 tag 不是不可变供应链保证。
不能仅给上游镜像改名就声称自建。ACL 已接入源码构建；Guacd 暂保留上游镜像。

首次构建需要联网拉基础镜像和 Go/Yarn/Python 依赖，不是离线安装包。
构建环境在 Docker 中，不要求宿主机安装 Go、Node 或 Yarn。
支持架构以所有依赖镜像的 manifest 为准；本轮验证环境为 Linux x86_64。

### 构建网络与镜像源

ACL 构建默认使用官方 Debian HTTPS 源和 PyPI。若部署服务器访问慢或超时，
先确认 Docker 容器能够访问你信任的镜像站，再在初始化后的 `deploy-gatedock/.env`
中增加以下示例（请勿覆盖已有凭据）：

```dotenv
GATEDOCK_ACL_DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn
GATEDOCK_ACL_PYPI_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
GATEDOCK_API_ALPINE_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/alpine
```

Debian 地址是同时包含 `/debian` 和 `/debian-security` 的镜像站根地址，不是
`/debian` 目录；Alpine 地址需包含 `/alpine`。三项可以分别设置，只接受信任的
HTTPS 源。前两项影响 ACL 构建，Alpine 源影响 API 运行镜像中的 apk 依赖安装；
都不影响 Docker 基础镜像、Go 或 Yarn 的下载。修改后重新运行 `./gatedock.sh up`；
不需重新 `init` 或删除数据。APT 源元数据和 APK 包仍通过发行版签名密钥验证。
Python 依赖锁定版本但未提供包哈希；应评估镜像站的可信度和同步情况。
这些值是构建参数，可能出现在构建日志或镜像历史中，不要在 URL 中包含密码或令牌。
使用 `sudo` 时建议将参数写入 `.env`，避免 sudo 清除当前 shell 环境变量。

## 全新安装

需要 Docker Engine / BuildKit、Docker Compose v2.17+（支持 additional build contexts）、
Git、Bash、OpenSSL、tar；
操作账号须有 Docker 权限。先检查端口和 Docker 网络是否冲突：

```bash
git clone --recurse-submodules https://github.com/rayniel/gatedock.git
cd gatedock/deploy-gatedock
./gatedock.sh init
./gatedock.sh up
./gatedock.sh status
```

`init` 生成随机数据库密码、ACL 应用密钥、统一会话密钥、资产 AES 密钥和管理员密码，
写入忽略提交的 `.env` 与 `runtime/`，文件权限为 600、目录为 700。
已有 `.env`、`runtime/` 或 `data/` 时拒绝覆盖，不会擅自重置密码。
ACL seed 中的默认管理员密码和应用/API 密钥在首次初始化时被替换，
历史示例审计记录清除；API 使用独立数据库用户，不使用 MySQL root。

管理员用户名为 `admin`，随机密码见 `runtime/admin.credentials`；
此文件只保存首次密码，网页修改密码后不会自动更新。不要把它复制到公开日志。
默认访问 `http://127.0.0.1:8666`；默认不发布 SSH、数据库、Redis、ACL、Guacd 端口。
数据库初始化仅在空数据目录执行；修改 `.env` 不会自动修改已有数据库用户密码。
凭据轮换必须同步数据库、`.env` 和 `runtime/config.yaml`；
会话密钥还须在 ACL/API 两端一致，资产 AES 密钥不能随意替换。

所有数据写入本目录 `data/`，与旧 `deploy/volume/` 完全独立。
**这不是旧安装的迁移命令**，不会接管旧数据。旧站点也使用 8666 时，应在 init 前选择其他端口：

```bash
GATEDOCK_PROJECT_NAME=gatedock-test GATEDOCK_WEB_PORT=18666 \
  GATEDOCK_NETWORK_SUBNET=172.29.81.0/24 GATEDOCK_WEB_IP=172.29.81.10 \
  ./gatedock.sh init
```

默认网络为 `172.29.80.0/24`、Web 地址为 `172.29.80.10`。
更换网络必须一起调整 Web IP；init 将其 `/32` 写入后端可信代理列表。
初始化后修改 `.env` 中的 Web IP 时，也必须修改 `runtime/config.yaml` 的
`http.trustedProxies`。不要信任所有来源。

## 常用操作

| 命令 | 行为 |
| --- | --- |
| `./gatedock.sh check` | 检查 Docker、配置文件及 Compose 语法，不打印密钥 |
| `./gatedock.sh build` | 从本地源码构建 API、Web、ACL，不停当前服务 |
| `./gatedock.sh up` | 构建、启动，等待所有服务健康，再检查网关和认证配置接口 |
| `./gatedock.sh verify` | 检查网关、运行时策略、ACL 配置接口及 API 监听 |
| `./gatedock.sh update` | 先构建，再备份，再更新容器并验证；不是零停机升级 |
| `./gatedock.sh backup` | 暂停 Web/API，备份数据库、配置、录屏及 RDP 文件，随后启动 Web/API |
| `./gatedock.sh restart-web` | 应用登录策略/代理配置，无需重建前端 bundle |
| `./gatedock.sh logs api` | 查看指定服务最近 100 行日志 |
| `./gatedock.sh status` | 查看容器和健康状态 |
| `./gatedock.sh stop` | 停止本套服务，不删除容器或数据 |

`up`/`update` 返回成功仅表示基础就绪检查通过，不代表真实 SSH/RDP 资产连接、
OIDC 身份提供方回调或所有业务功能都已验证。上线前应使用测试资产做验收。
API 容器健康检查目前检查监听端口；ACL/Web 有 HTTP 检查，worker 有 Celery ping。
日志采用 Docker `json-file`，每服务最多 3 个 10MB 文件；ACL 文件日志仍需定期清理。

### SSH 客户端入口（可选）

网页终端路径为浏览器 xterm.js → WebSocket → GateDock → 资产。
项目另有终端客户端路径 SSH → GateDock → 资产，不是宿主机的 SSH。
默认不发布这个入口；需要时：

```bash
./gatedock.sh --ssh up
ssh 堡垒机用户名@127.0.0.1 -p 2222
```

后续操作保持使用 `--ssh`，避免重新创建 API 时移除端口。
在 `.env` 配置 `GATEDOCK_SSH_BIND`、`GATEDOCK_SSH_PORT` 可改变监听；
对外开放时配合防火墙。APISIX 的 HTTP 路由不能直接转发这个 TCP SSH 入口。

## APISIX 前置部署

推荐拓扑：

```text
浏览器 --HTTPS--> APISIX --HTTP--> GateDock Web/Nginx
                                      |--> API（含 WebSocket）
                                      |--> ACL（含 OIDC 登录/回调）
```

APISIX 是外部网关，Nginx 是容器内应用网关和静态文件服务，两者保留。
参考 `apisix-route.example.json`（示例资源，不含 Admin API 密钥）。
使用你现有的 APISIX 管理方式创建路由并配置 TLS 证书：

1. 修改示例的 `host` 与 upstream 地址为真实域名及 GateDock 主机可达地址。
   示例中的 loopback 仅在 APISIX 与应用共享宿主机网络命名空间时可用；
   APISIX 在另一台服务器或容器中时，不能将 `127.0.0.1` 当作 GateDock 地址。
2. `.env` 的 `GATEDOCK_WEB_BIND` 默认 loopback。远程 APISIX 时改为专用网卡 IP，
   防火墙仅允许 APISIX 访问该端口，不建议无条件监听所有公网接口。
3. 将 `GATEDOCK_TRUSTED_PROXY_CIDR` 设置为 Nginx 实际看到的 APISIX 来源 IP/CIDR，
   然后 `./gatedock.sh restart-web`。Docker NAT 下来源可能是网桥地址，需实测。
   仅这些来源的 `X-Forwarded-For` 和 `X-Forwarded-Proto` 被信任。
4. APISIX 保留外部 Host、完整 URI/查询参数、Cookie、Referer，
   正确设置 `X-Forwarded-Proto` 和客户端地址；不要添加路径前缀或改写 `/api`。
   示例启用 WebSocket 和 7200 秒 upstream 超时；
   APISIX 自身客户端超时、body 大小限制也需按终端/文件传输需求配置。
5. **整个站点统一转发到 Web/Nginx**。不能把 `/api/login`、
   `/api/v1/acl/login` 直接转发到 ACL，否则绕过 Web 登录策略。
6. OIDC 回调登记为 `https://你的域名/api/oidc/callback`，
   登录入口 `/api/oidc/login`；登录/回调保持同一域名。
   ACL 登录依赖 Referer，不能配置 `no-referrer` 或丢弃该头。

首页检查到登录会话失效时直接进入登录流程，不弹出该检查的 401 错误，也不再等待
固定的 3 秒登出延迟。仅启用一个 Web 登录提供方且开启 `auth_auto_redirect` 时，
直接跳转到该提供方；未开启自动跳转时仍保留原有确认倒计时。
其他接口的 401、密码错误以及服务端故障仍正常提示。

本配置拒绝信任非指定代理来源伪造的外部协议头；后端只信任 Web 容器地址。
真实 APISIX 和身份提供方需在你的部署环境完成联调，本轮不声称完成外部端到端认证。

## Web 本地密码登录开关

先登录并配置/测试 OIDC，再在 `.env` 设置：

```dotenv
GATEDOCK_WEB_LOCAL_LOGIN_ENABLED=false
```

```bash
./gatedock.sh restart-web
```

默认 `true`，方便初始化和调试。仅接受小写 `true` / `false`。
关闭后 `/user/login` 只显示 OIDC，指定 Web 密码接口返回 403，
包括 LDAP、旧接口和伪装 `channel=ssh` 的请求；无 OIDC 时明确报错，不降级开放密码。
OIDC 登录、回调、退出不拦截；已有会话不主动撤销；资产凭据和 CLI SSH 不受影响。
恢复时改为 `true` 再执行 `restart-web`，不需重建 bundle、重启 API 或 ACL。
这是 Nginx Web 入口策略，不是第三方 ACL 内部认证开关，因此不能直接暴露 ACL。

## 二开功能使用

- 工作台资产展开行：账号名称在工作台内连接；旁边独立图标在新页连接，点击区域分离。
- RDP 直接剪贴板：系统设置 → 访问控制 → 个人剪贴板偏好 → 开启直接剪贴板同步，
  保存并重连。默认关闭，仅文本；Ctrl+V/Cmd+V/Shift+Insert 可直接粘贴。
  远端复制仅在该会话有焦点时写入本地；复制/粘贴权限分别检查，监控会话不启用。
  需 HTTPS（localhost 例外）和浏览器授权；保留手动剪贴板入口，不支持图片/文件。
- Telnet 设备不再发送 Linux shell 初始化命令。在资产新增/编辑/批量协议编辑中，
  选择 Telnet 后可配置退格为 DEL（默认透传）或 BS（将 DEL 转为 BS）。
  按设备设置并重连，不自动猜测；SSH 输入不改变。

## 备份、升级与恢复

`backup` 写入 `backups/时间戳-PID/`：数据库 SQL、配置/录屏/RDP 文件归档、
运行镜像清单，并给旧 API/Web/ACL 镜像添加 `gatedock-api:backup-*` /
`gatedock-web:backup-*` / `gatedock-acl-api:backup-*` 标签，避免本地构建覆盖后无法找到旧镜像。
备份会中断网页和资产连接；先安排维护窗口。ACL 仍在运行，因此数据库是
单事务快照，不应同时执行 ACL 管理变更或任何 schema 变更。
备份文件含敏感数据，权限限制不等于加密，须加密后复制到异机。
Docker 创建的文件若当前账号无读取权限，应使用具备权限的运维账号备份。
不能只备份 MySQL：丢失 AES 密钥会使原资产凭据无法解密。

建议生产每次使用独立镜像版本，在 `.env` 中配置 API/UI/ACL 镜像名，记录 Git commit，
先在独立环境验证，再执行 `update`。不要混用旧上游 Compose 启动本套数据。
`update` 构建失败时不停止应用；备份失败明确报错并尝试启动原应用；
升级或就绪检查失败不伪装成功，也**不会自动回滚数据库 schema**。

恢复流程（必须先在演练环境验证）：

1. `./gatedock.sh stop`，保留故障数据、配置和日志，禁止直接删除 `data/`。
2. 将备份配置和文件恢复到**独立恢复目录**，使用独立项目名、端口、网络；
   不覆盖运行目录。配置保留原 AES、ACL 和会话密钥。
3. 选择与备份匹配的旧 API/Web/ACL 镜像标签，设置 `GATEDOCK_API_IMAGE`、
   `GATEDOCK_UI_IMAGE` 和 `GATEDOCK_ACL_IMAGE`；使用 Compose `--no-build`，
   不要调用会重建的 `up` 脚本。直接使用 Compose 前先从仓库根设置
   `export GATEDOCK_ACL_REVISION=$(git -C third_party/gatedock-acl rev-parse HEAD)`。
4. 先启动恢复目录的 MySQL/Redis/Guacd，然后导入 `databases.sql`：

   ```bash
   docker compose up -d --wait mysql redis oneterm-guacd
   docker compose exec -T mysql sh -c \
     'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root' < backups/对应备份/databases.sql
   docker compose up -d --no-build --wait
   ./gatedock.sh verify
   ```

5. 验证密码/OIDC 登录、权限、资产凭据解密、SSH/RDP、录屏、文件后，再切换 APISIX。
   Redis 缓存/队列不包含在快照中，ACL 启动会重建角色缓存；原会话不保证可恢复。
   异机恢复需提前保存/推送旧镜像，备份标签仅保证本机镜像保留，不是镜像归档。

旧 MySQL 8.2 数据目录不能直接挂到 8.4 镜像后当作已验证升级：
本轮只验证新库初始化，旧安装迁移应做 SQL 逻辑导出/导入和单独演练。

## ACL 源码与版本管理

源码位于 `../third_party/gatedock-acl/`，通过 Git submodule 指向
<https://github.com/rayniel/gatedock-acl> 的精确提交，不跟随 main 自动升级。
已有 checkout 在仓库根执行：

```bash
git submodule update --init --recursive
```

如果 `docker info` 提示 Docker socket 权限不足，可先使用 `sudo ./gatedock.sh check`
和 `sudo ./gatedock.sh up`；`init` 已完成时不要重新运行，避免覆盖已有密钥。
也可以由管理员将操作账号加入 Docker 组并重新登录；Docker 组具有接近 root 的权限，
只授予可信账号。若 Git 报仓库所有权不安全，应先核对仓库所有者与执行账号，
不要通过信任所有目录来绕过检查。使用 sudo 时初始化 submodule 仍应以仓库所有者身份执行，
避免生成属于 root 的源码文件。

不要直接用该仓库原 Dockerfile：其 requirements.txt 与应用实际运行依赖不一致。
本目录 `acl/Dockerfile` 从 Python 基础镜像开始构建，不继承上游 ACL 镜像；
`acl/requirements.lock` 记录原运行镜像实际安装的兼容版本，构建执行 `pip check`。
锁文件固定版本但未附 wheel 哈希，不应被视为完整供应链可复现保证。
自建镜像不复制源码中的 `.env`，只加载部署传入的随机数据库密码和统一会话密钥。
镜像标签记录 ACL Git revision，并保留原许可证。

已确认固定 fork 与原镜像的应用代码差异是退出时缺少 `session.clear()`：
`acl/logout-session.patch` 在构建时明确应用这个补丁，无法匹配时构建失败，
避免降级退出行为。补丁先由主仓管理，不让 submodule 出现未提交修改。
将来在 ACL fork 中合入此修复并更新 submodule 时，应同步移除该补丁。
构建脚本拒绝脏的 ACL 工作树，以免镜像 revision 与实际内容不一致。

**当前为兼容性迁移，仍使用已停止维护的 Python 3.8 和旧依赖。**
自建不等于已完成依赖现代化或安全认证；升级 Python/Flask 等需单独测试，
不能仅因镜像改名便宣称达到生产安全标准。
依赖 wheel 编译流程目前只验证 Linux x86_64。

更新 ACL 源码时：在 submodule 内切换到经过测试的 commit，
提交主仓 gitlink 变更，然后在独立环境构建/验证，再安排生产维护窗口。
不要仅拉取分支最新提交就直接升级真实认证数据库。
`up`/`build`/`update` 均显式构建 ACL API 镜像，worker 复用它，不会提前拉取别人的镜像。

独立测试环境可运行回归测试（会写入登录审计及重建角色缓存，勿对生产随意运行）：

```bash
cd deploy-gatedock
export GATEDOCK_ACL_REVISION=$(git -C ../third_party/gatedock-acl rev-parse HEAD)
read -rs -p 'Test admin password: ' GATEDOCK_TEST_ADMIN_PASSWORD; echo
export GATEDOCK_TEST_ADMIN_PASSWORD
docker compose exec -T -e GATEDOCK_TEST_ADMIN_PASSWORD acl-api \
  python - < tests/acl_compatibility.py
unset GATEDOCK_TEST_ADMIN_PASSWORD
```

该测试检查真实 Web 密码登录、Go API 会话授权、退出后的拒绝访问、worker 数据库任务，
以及模拟身份提供方的 OIDC 登录/回调/state 校验。它不连接你的真实身份提供方。

## 旧运行环境的前端兼容桥接

`docker-compose.legacy-web.yaml` 仅用于现有上游命名的 `oneterm-ui`：
把当前二开前端的 Nginx/登录策略挂载切换到本目录，保持旧数据和后端不动。
它不是完整生产迁移方案。仓库根目录执行：

```bash
docker compose -f deploy/docker-compose.yaml \
  -f deploy-gatedock/docker-compose.legacy-web.yaml \
  up -d --no-deps --no-build oneterm-ui
```

前提是本地已有经验证的 `gatedock-ui:local`。
后续更新此旧前端保持带此 override；不要直接用恢复后的上游 Compose 重建二开环境。
