# 听着游管理后台

独立的管理后台系统（与 Wxtravel 小程序无关），用于管理景区/景点、会员卡商品与 SKU、定价方案、兑换码、推荐位、订单、C 端用户、权限（RBAC）与操作日志。

## 技术栈

- 前端：Vue 3 + Vite + Element Plus + Pinia + Vue Router（端口 5173）
- 后端：Node.js + Express + MySQL（`mysql2` 连接池，端口 3001）
- 认证：JWT（Bearer，12 小时有效）

## 目录结构

```
houtai/
  README.md
  server/               # 后端
    src/
      config/db.js      # mysql2 连接池
      middleware/       # auth(JWT)、permRequired(菜单级权限)、error
      routes/           # auth scenic product pricing redeem order user recommend log system upload region
      services/         # opLog / stock / pricing / redeem / orderOps
      utils/            # helpers / constants / excel
      sql/
        schema.sql      # 建库建表（20 张表）
        seed/init.js    # 建库 + 区划/菜单/角色/admin 种子（幂等）
        seed/demo.js    # 演示业务数据（可重复执行）
    uploads/            # 上传文件（images/、audio/），运行时生成
  web/                  # 前端
    src/
      api/              # 按模块封装
      router/ stores/ layout/ views/ components/
```

## 启动步骤

### 1. 启动 MySQL

服务名 `MySQL93`（默认安装）。以管理员身份运行 PowerShell：

```powershell
net start MySQL93
```

连接配置在 `server/.env`（默认 `root` / 空密码，端口 3306）。如你的 root 密码不同，请修改 `.env` 中的 `DB_PASS`。

### 2. 启动后端

```powershell
cd server
npm install
npm run init    # 建库建表 + 菜单/角色/初始管理员/行政区划（幂等）
npm run demo    # 可选：写入演示业务数据（可重复执行，会清空业务数据重建）
npm run dev     # 启动 http://localhost:3001
```

### 3. 启动前端

```powershell
cd web
npm install
npm run dev     # 打开 http://localhost:5173（/api、/uploads 已代理到 3001）
```

## 测试账号

| 账号 | 密码 | 角色 | 权限 |
|---|---|---|---|
| `admin` | `Admin@123456` | 管理员 | 全部菜单 |
| `operator` | `Oper@123456` | 运营员 | 景区 / 商品 / 定价 / 兑换码 / 订单 |

> `operator` 账号由 `npm run demo` 创建；如只跑 `npm run init`，只有 `admin`。

## 常用说明

- **金额单位**：数据库一律存"分"，前端展示为"元"。
- **待支付超时**：默认 30 分钟自动关闭（由 `sys_config` 表 `pay_expire_minutes` 配置），后端每 60 秒执行一次定时任务；demo 数据中包含一条 2 小时前的待支付订单，服务启动 1 分钟内会被自动关闭。
- **兑换码**：8 位，字符集为 `2-9 + A-Z 去掉 I/O`，全局唯一。
- **重新初始化**：`npm run init`（幂等，不会清角色配置）；`npm run demo` 会清空业务表（订单/商品/景区等）后重建演示数据。
