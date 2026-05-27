# 2026 World Cup Roster Auto-Update

## 工作原理

```
Wikipedia 或自定义 API
        ↓  每天自动抓取（GitHub Actions）
  rosters.json 自动更新
        ↓  APP 每30分钟轮询
     手机端自动显示最新阵容
```

---

## 第一步：创建 GitHub 仓库（5分钟）

1. 打开 https://github.com/new
2. 仓库名填写 `worldcup-rosters`（或任意名字）
3. 选择 **Public**（必须公开，否则 APP 无法访问）
4. 不要勾选 "Add a README file"
5. 点击 **Create repository**

## 第二步：上传文件到仓库

在项目目录下打开终端，运行：

```bash
cd github-automation

# 初始化 git
git init
git add .
git commit -m "Initial setup"

# 关联你的仓库（替换成你的用户名）
git remote add origin https://github.com/你的用户名/worldcup-rosters.git

# 推送
git branch -M main
git push -u origin main
```

## 第三步：配置 APP

1. 获取 raw URL：

```
https://raw.githubusercontent.com/你的用户名/worldcup-rosters/main/rosters.json
```

2. 打开 APP → 阵容页面 → 点击右上角 **⚙️ 齿轮**
3. 粘贴上面的 URL
4. 点击 **保存**

APP 会立即拉取一次数据，之后每30分钟自动检查更新。

---

## 自动更新机制

| 触发方式 | 频率 |
|----------|------|
| GitHub Actions 定时抓取 | 每天 2 次 |
| APP 轮询检查 | 每 30 分钟 |
| APP 从后台切回 | 立即检查 |
| 下拉刷新 | 手动立即检查 |

---

## 如何手动更新阵容数据

**方式一：直接编辑 rosters.json（推荐）**

1. 在 GitHub 上打开你的仓库
2. 点击 `rosters.json` → 编辑按钮（铅笔图标）
3. 修改球队阵容数据
4. 提交（Commit changes）
5. 手机 APP 在30分钟内会自动获取更新

**方式二：触发 GitHub Action 手动运行**

1. 在 GitHub 仓库页面点击 **Actions** 标签
2. 左侧选择 **Update Rosters**
3. 点击 **Run workflow** → **Run workflow**

---

## 如何接入自定义 API

如果你有自己的数据源（后端接口等）：

1. 在 GitHub 仓库页面 → **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**
3. Name: `ROSTER_SOURCE_URL`
4. Value: 你的 API URL（如 `https://your-server.com/api/rosters`）
5. 点击 **Add secret**

之后 GitHub Action 会优先从你的 API 拉取数据。

---

## rosters.json 数据格式

```json
{
  "last_updated": "2026-05-30",
  "teams": [
    {
      "name": "巴西",
      "name_en": "Brazil",
      "coach": "Carlo Ancelotti",
      "status": "announced",
      "players": [
        { "number": 1, "name": "Alisson", "position": "门将", "club": "利物浦" }
      ],
      "expected_date": "2026-05-18"
    }
  ],
  "update_schedule": {}
}
```

`status` 字段：`"announced"` = 已公布阵容，`"pending"` = 尚未公布

---

## 文件说明

```
github-automation/
├── .github/workflows/
│   └── update-rosters.yml    # GitHub Actions 工作流配置
├── scripts/
│   └── scrape-rosters.js     # 数据抓取脚本
├── rosters.json              # 阵容数据文件（最终被APP读取）
└── README.md                 # 本文件
```
