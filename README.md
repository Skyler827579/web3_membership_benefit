# Web3 资料库

这是一个 ChainPulse 付费资料站，包含前台访问页、后台管理页、会员中心、每日行情文章、网页化学习资料和社群资源入口。

## 运行方式

```bash
cd web3-resource-library
npm start
```

前台地址：

```text
http://127.0.0.1:4173
```

后台地址：

```text
http://127.0.0.1:4173/admin.html
```

默认后台密码：

```text
admin123
```

正式使用前，建议修改 `data/db.json` 里的 `adminPassword`。

## 当前资料

- 品牌：ChainPulse
- 资料名称：Web3破局之路｜完整版资料
- 价格：20 元人民币
- 学习内容：`protected/content/learning.json`
- 展示方式：网页章节，不提供 PDF 下载入口

## 使用流程

1. 后台登录。
2. 生成邀请码。
3. 把邀请码发给客户。
4. 客户在前台输入邀请码。
5. 客户看到微信二维码并付款。
6. 后台确认已付款。
7. 客户刷新状态后进入会员中心。

现在解锁后的实际入口是会员中心：

- 每日行情文章
- Web3 基础学习内容
- 社群与上海 Web3 资源

## 替换微信收款码

当前二维码是占位图。把真实微信收款码放到 `public/assets/` 目录里，然后在 `data/db.json` 里把：

```json
"wechatQr": "/assets/wechat-qr-placeholder.svg"
```

改成你的图片路径，例如：

```json
"wechatQr": "/assets/my-wechat-pay.png"
```

## 说明

当前版本采用后台人工确认收款，适合先做私域资料售卖和小规模交付。后续如果要接入微信支付自动回调，需要申请微信支付商户号并接入支付接口。

## 部署到 VPS

服务器建议使用 Ubuntu 22.04 或 24.04。

### 1. 安装 Node.js

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. 上传项目

把整个 `web3-resource-library` 文件夹上传到服务器，例如放到：

```text
/var/www/web3-resource-library
```

### 3. 修改后台密码和二维码

编辑：

```text
/var/www/web3-resource-library/data/db.json
```

至少修改：

```json
"adminPassword": "换成你的后台密码"
```

并替换真实微信收款码路径。

### 4. 用 PM2 常驻运行

```bash
sudo npm install -g pm2
cd /var/www/web3-resource-library
HOST=127.0.0.1 PORT=4173 pm2 start server.js --name web3-resource-library
pm2 save
pm2 startup
```

### 5. 配置域名反向代理

安装 Nginx：

```bash
sudo apt install -y nginx
```

创建配置：

```bash
sudo nano /etc/nginx/sites-available/web3-resource-library
```

写入：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/web3-resource-library /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. 配置 HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

完成后，客户访问：

```text
https://your-domain.com
```

后台访问：

```text
https://your-domain.com/admin.html
```

## GitHub + Netlify 自动部署

这个项目已经包含 Netlify 配置：

- `netlify.toml`
- `netlify/functions/api.mjs`
- `netlify/functions/daily-update.mjs`

Netlify 版本会使用 Netlify Functions 和 Netlify Blobs 保存邀请码、订单、后台登录状态和每日文章。

### 1. 推送到 GitHub

先在 GitHub 创建一个空仓库，然后在本地执行：

```bash
cd web3-resource-library
export GITHUB_REPO_URL=git@github.com:你的用户名/chainpulse-library.git
npm run deploy:github
```

如果你使用 HTTPS 仓库地址，也可以这样：

```bash
export GITHUB_REPO_URL=https://github.com/你的用户名/chainpulse-library.git
npm run deploy:github
```

### 2. 在 Netlify 连接 GitHub

进入 Netlify：

```text
Add new site -> Import from Git -> 选择 GitHub 仓库
```

配置：

```text
Build command：留空
Publish directory：public
Functions directory：netlify/functions
```

### 3. 自动更新

`daily-update` 函数每天会自动生成一篇行情文章。当前抓取的是主流资产价格和 24 小时变化，并以文章形式展示，不写成口播稿。

如果你有自己的 `crypto daily script`，可以把逻辑替换到：

```text
netlify/functions/daily-update.mjs
```

和本地后台生成逻辑：

```text
server.js
```

## 网页内容与防复制

客户付款确认后进入会员中心，不提供 PDF 下载按钮。基础学习内容已经抽成网页章节，每日行情以文章形式展示。页面默认禁用文本选择、复制、右键菜单、保存和打印快捷键。

需要注意：网页无法从技术上 100% 防截图或防高级抓包，只能做到普通客户不能直接复制文字、不能直接点下载。
