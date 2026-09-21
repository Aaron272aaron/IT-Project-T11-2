# AutoMarktic React 前端

根据 Figma 的 `Prototype Pages (Copy)`（文件 `RkRQ0I0xUoWPdVjxhvnvf4`）实现。技术栈是 **React + TypeScript + Vite + 普通 CSS**。原项目的 `marking/`、`Code Repairing Model/` 保持独立。

## 运行

需要 Node.js 20.19+ 或 22.12+（本机已用 Node 24 验证）。

```bash
cd /Users/oubunsen/Desktop/IT-Project-T11-2/frontend
npm ci
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:5173`。登录页可以点击 **Explore demo workspace**，或使用用户名 `demo`、密码 `demo1234`。

```bash
npm run test        # CSV 和评分规则单元测试
npm run test:e2e    # Chrome 中的实际页面/流程测试，需要安装 Google Chrome
npm run build      # TypeScript 检查及生产构建，输出 dist/
npm run preview    # 预览已构建的版本
npm run format     # 格式化代码
```

`test:e2e` 会自动启动本地开发服务器；已经运行的同端口服务器也可以复用。浏览器测试配置见 `playwright.config.ts`。

## 已实现的页面与设计对应

URL 使用 hash 路由，例如 `http://127.0.0.1:5173/#/members`。首次访问需先进入 demo。

| 页面/状态 | 路由 | Figma node |
| --- | --- | --- |
| 登录正常、错误状态 | `#/login`、`#/login/error` | `2205:5`、`2205:44` |
| 旧 Ocean 登录配色入口 | `#/login/ocean` | `1:2`（复用登录表单，保留配色变体） |
| Subject dashboard | `#/dashboard` | `4259:143` |
| 创建工作区 | `#/create-workspace` | `4267:192` |
| 成员列表、管理成员弹窗 | `#/members` | `4259:145`、`4261:197` |
| 工作区设置 | `#/workspace-settings` | `4259:146` |
| 个人设置 | `#/user-settings` | `6218:244` |
| 考试总览 | `#/exam/final` | `4249:2` |
| 导入：上传、校验错误、待导入、进度、完成 | `#/import` 内的真实流程 | `4254:528`、`4254:602`、`4254:677`、`4254:747`、`4254:808` |
| 短答案分组总览 | `#/question/1` | `4275:301` |
| 短答案评分 | `#/question/1/mark/demo001` | `4275:492` |
| 编程答案总览 | `#/question/5` | `4275:772` |
| 函数答案与 AI 对照评分 | `#/question/5/mark/demo001` | `4276:262` |
| 可执行代码评分 | `#/question/3/mark/demo001` | `4276:361` |

另有 `#/exams` 考试列表、`#/exam/midterm` 已归档预览和 `#/exam/practice` 草稿预览。完整可交互演示集中在 **Final exam**。题目 2、4、6 分别复用对应题型页面。原 Figma 中只有空容器的成员管理区域补成了可用弹窗。

侧栏、按钮、表单、表格和卡片为共用组件；手机屏幕使用可展开侧栏，宽表格在容器内横向滚动。进度数值由演示答案实际计算，因此不强行复制 Figma 中互不一致的静态计数。旧 Ocean 页面是共享登录表单的配色变体，不是旧稿的逐像素复刻。

## 可以实际操作什么

- 创建/切换工作区；新工作区的答案与其他工作区分开。
- 修改工作区和个人资料；刷新当前标签页后仍保留会话数据。
- 搜索、添加、调整角色、移除演示成员；不会发送真实邮件。
- 按学生 ID、评分状态、答案组过滤；分页；查看原答案。
- CSV 拖入/选择、校验、下载问题清单、导入；提供正常和错误示例入口。
- 填写分数/评语，确认保存，确认并跳到下一条未评分答案。
- 对相同短答案整组评分：先显示影响人数及覆盖已有分数的提示，跳过锁定的演示答案。
- 导出已确认分数 CSV；文本字段做公式注入转义。

## 导入格式

本版读取“一行一条答案”的标准化 CSV；**不是任意 Canvas 原始导出都可以直接导入**。请先将 Canvas 导出转换成以下列名，页面可下载模板：

```csv
student_id,question_id,answer
student241,1,"3, because the list has three elements."
student241,5,"def clean_text(s):
    return s.strip().lower()"
```

- `question_id` 为 1–6；每文件最多 10,000 行、10 MB。
- 支持引号、逗号和多行代码；保留答案原始空格、缩进与换行。
- 缺列、缺学生 ID、空答案、非法题号、重复学生/题目记录会阻止导入。
- 同一考试中已经存在的学生/题目不会被导入覆盖。
- 短答案仅以完整文本完全相同分组，不擅自忽略可能有意义的空格。

## 我怎样组织代码

| 文件 | 职责 |
| --- | --- |
| `src/main.tsx` | 入口及路由，决定当前显示哪一个页面 |
| `src/components/Layout.tsx` | 统一侧栏、工作区切换、账户入口、手机导航 |
| `src/components/UI.tsx` | 共用卡片、按钮、表单、对话框、进度条 |
| `src/pages/Workspace.tsx` | 工作区创建/设置、成员管理、个人设置 |
| `src/pages/Exams.tsx` | Dashboard、考试列表和考试总览 |
| `src/pages/Import.tsx` | 五阶段导入流程 |
| `src/pages/Questions.tsx` | 分组/编程答案总览和三类评分页面 |
| `src/pages/Login.tsx` | 演示登录及错误/帮助状态 |
| `src/domain.ts` | 数据类型、示例题目、CSV 校验、分组、评分约束 |
| `src/state.tsx` | React 共享状态及 sessionStorage 保存 |
| `src/styles.css` | Figma 颜色、尺寸、字体、布局和响应式样式 |
| `tests/`、`e2e/` | 数据规则测试及真实浏览器流程验证 |

举例：点击“Confirm final mark” → 页面调用 `saveMarks` → 校验分数范围及锁定状态 → 只更新所选答案的分数和评语 → React 重新计算总览进度。原答案字符串不会改变。

## 当前边界与后续接入

这是**可以运行和交互的前端原型**，还不是完整上线系统。

- 登录账号是演示凭据，没有真实身份认证。前端的角色、锁定标签不是安全边界。
- 数据保存在当前标签页的 `sessionStorage`，不是数据库。刷新可以恢复；关闭标签页/清除浏览器数据后不保证保留。测试时使用示例数据，正式数据需先接持久化服务。
- Python 测试结果和 AI 修正是明确标注的固定演示证据。没有在浏览器执行学生代码，也没有调用第三方 AI。新导入的代码显示“未测试”，不会生成虚假的通过结果。
- “Use recommended mark”仅填写输入框，必须再次确认才保存。AI 建议不会替换原答案。
- 注册、找回密码、真实邀请、多用户协作锁、模型生成和永久存储需要后端。界面会解释未接入状态，不会假装这些操作成功。
- 现有 Python 模块没有 HTTP API。下一步应增加 **React → 后端 API → 数据库/隔离 Python runner/本地模型**；浏览器不直接连接数据库，也不直接运行 `run.sh`。

建议后端提供工作区/成员/考试/答案 CRUD、CSV 导入任务、评分确认、测试任务、建议任务、锁与审计接口。后端必须再次验证权限、分数范围、版本冲突及原答案不可变；不要把前端校验当成安全保障。具体单机或共享服务器部署方案留待确定。

Figma 的 logo 已下载为 `public/logo-code.svg`，字体随 npm 包本地提供；正常使用界面不依赖临时 Figma 资源地址。
