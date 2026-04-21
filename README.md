# model-check Node.js 部署版

这是 AI 模型检测工具的 Node.js 版本，适合部署到自己的云服务器，并通过 Nginx 对外提供服务。

## 项目结构

```txt
model-check/
├── public/index.html                # 前端页面
├── functions/_lib/model-utils.js    # 模型发现与检测核心逻辑
├── server.js                        # Node.js / Express 服务入口
├── package.json                     # Node.js 依赖与启动命令
└── ecosystem.config.cjs             # PM2 启动配置
```

## 本地运行

```bash
npm install
npm start
```

浏览器访问：

```txt
http://localhost:3000
```

健康检查：

```bash
curl http://127.0.0.1:3000/health
```

## 云服务器部署

### 1. 安装 Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

Node.js 18 或更高版本即可。

### 2. 上传并解压项目

建议放到：

```txt
/usr/local/nginx/html/model-check
```

示例：

```bash
cd /usr/local/nginx/html
rm -rf model-check
unzip model-check-node-fixed.zip
mv model-check-node-fixed model-check
cd model-check
```

### 3. 安装依赖

```bash
npm install --production
```

网络慢可以使用：

```bash
npm install --production --registry=https://registry.npmmirror.com
```

### 4. 使用 PM2 启动

```bash
npm install -g pm2
pm2 delete model-check 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

查看状态：

```bash
pm2 list
pm2 logs model-check
```

测试服务：

```bash
curl http://127.0.0.1:3000/health
```

正常会返回：

```json
{"ok":true,"name":"model-check","mode":"nodejs"}
```

## Nginx 配置

域名：

```txt
mc.520277.xyz
```

Nginx 反向代理到本机 Node 服务：

```nginx
server {
    listen 80;
    server_name mc.520277.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

检查并重载 Nginx：

```bash
/usr/local/nginx/sbin/nginx -t
/usr/local/nginx/sbin/nginx -s reload
```

## 常用命令

```bash
pm2 list
pm2 logs model-check
pm2 restart model-check
pm2 stop model-check
```

## 接口说明

页面使用以下接口：

```txt
GET  /health
POST /api/models
POST /api/check-model
POST /api/check-models
```

