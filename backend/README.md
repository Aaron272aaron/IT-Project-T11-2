# 网页怎样把 CSV 交给 Python

现在已经接通：网页选文件 → 发给本机 Python → 调用 `csv import.py` → 返回结果 → 网页展示答案。仍未连接数据库。

## 先把它想成一个办事窗口

- React 网页是前台：收取你选的文件，展示处理结果。
- Vite 是开发时的转交员：让网页运行，把 `/api` 开头的请求转交给 Python。
- `server.py` 是后面的接待窗口：持续等候网页请求，检查上传大小和请求类型。
- `canvas_import.py` 是助手：把收到的文件交给现有 CSV 模块，并整理返回格式。
- `csv import.py` 是真正检查表格的工作人员：读取学生、题目、答案，发现错误和提醒。
- 数据库是长期保存档案的柜子：本次没有使用。

“接入”就是把传递文件、调用函数、返回结果这条路连起来。Python 仍在自己的进程里运行，没有被塞进网页。

## 一次点击，按顺序发生什么

### 1. 选择文件，还没有上传

`frontend/src/pages/CanvasUpload.tsx` 的 `choose()` 记住你选择的 `File`，检查是不是 `.csv`、有没有超过 10 MB。它不会在浏览器解析 CSV，也不会此时就发送文件。

### 2. 点击 Validate and preview，网页开始寄文件

同一文件里的 `validate()` 会显示等待状态，再调用 `frontend/src/api.ts` 的 `previewCanvasCsv()`。发送部分可简化理解为：

```ts
fetch('/api/canvas/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'text/csv' },
  body: file,
});
```

`fetch` 是“发送请求”；路径是收件地址；`POST` 表示这次要送交数据；`Content-Type` 是包裹标签，说明装的是 CSV；`body` 是真正的文件内容。实际代码还有取消、超时和错误处理。

发送的是原始文件字节，不在网页里重新排版，因此不会在这一环节去掉代码缩进或改写换行。

### 3. Vite 把请求送到 Python 的门口

开发时有两个服务：前端通常在 `127.0.0.1:5173`，Python 在 `127.0.0.1:8000`。`127.0.0.1` 表示本机；端口可理解为同一栋楼里的不同窗口号。

`frontend/vite.config.ts` 规定：网页发送到 `/api` 的请求都转给 Python。因此地址的变化是：

```text
网页 → http://127.0.0.1:5173/api/canvas/preview
Vite → http://127.0.0.1:8000/api/canvas/preview
```

Vite 只负责转交，不理解题目，也不评分。这是开发服务的代理功能；以后正式部署，需要配置相应的 API 转发。

### 4. Python 接待窗口收下文件

`backend/server.py` 的 `do_POST()` 处理上传地址，检查文件类型和大小，再读取内容。后端也检查大小，是因为其他程序可以绕过网页直接请求它。

然后调用 `preview_csv(content)`，将工作交给 `backend/canvas_import.py`。

### 5. 助手真正调用队友的模块

现有 `read_canvas_csv()` 需要一个本地文件路径，而网络送来的是字节。助手先把字节写进自动生成的临时 `upload.csv`，再执行：

```python
data = csv_module.read_canvas_csv(path)
```

这句才是真正调用队友代码的地方。队友的文件名 `csv import.py` 带空格，所以通过 `importlib` 按固定文件路径加载，而没有改名、覆盖或复制其中的解析逻辑。加载模块不会执行它底部只供命令行运行的入口。

处理完成或发生异常时，临时目录都会清除。原始 CSV 不会被改写。

### 6. 把 Python 结果整理成双方都能读的清单

Python 返回的题目、学生、答案等对象，先被整理成普通字典，再转换为 JSON。JSON 可以理解为“按统一格式写好的清单”。简化结构如下：

```json
{
  "status": "ok",
  "service": "automarktic-python",
  "parser": "csv import.py",
  "preview": {
    "questions": [],
    "students": [],
    "issues": []
  }
}
```

这里只展示结构，真实成功结果的题目和学生列表有内容。助手还会统一字段名称，例如 Python 的 `original_answer` 对应网页的 `original`，内容保持原样。Canvas 来源分数不会因此变成最终评分。

### 7. 网页收到结果，更新画面

`api.ts` 检查响应状态和 JSON 结构，`CanvasUpload.tsx` 用 `setPreview(result)` 保存当前结果。React 根据新结果更新学生数、题目列表、原答案和校验提示。

此后切换学生、切换题目，是在已收到的结果里找对应内容，不会每切换一次都重新上传 CSV。

## 出错时怎么办

- 没启动 Python：上传页面提示无法连接，可以启动服务后重试，不会偷偷换用前端解析。
- 文件格式错误：Python 返回 HTTP 422 和问题列表，页面阻止答案预览，避免把部分数据当成完整导入。
- 格式正常但有空白答案等情况：显示提醒，保留原答案供人工查看。
- 等待超过 30 秒：网页停止等待并提示超时。
- 清空、换文件或离开页面：网页取消当前请求并忽略旧回复。已经开始的 Python 解析不保证立即中断，但处理后临时文件仍会删除。

其他接口错误包括 400（请求不完整）、413（超过 10 MB）、415（请求不是 CSV）和 500（服务处理失败）。后端每次读取请求的等待上限是 15 秒。

## 怎么运行

终端 A：

```bash
cd /Users/oubunsen/Desktop/IT-Project-T11-2
python3 backend/server.py
```

终端 B：

```bash
cd /Users/oubunsen/Desktop/IT-Project-T11-2/frontend
npm run dev
```

两个终端都保持运行。打开前端显示的地址，点击 **Explore demo workspace → Create exam（或打开已有考试）→ Upload answer CSV**，选文件后点击 **Validate and preview**。

Python 不自动热更新。修改后端代码后，在终端 A 按 Ctrl+C，再运行启动命令。默认端口占用时，可用 `python3 backend/server.py --port 8002`，配合 `API_PROXY_TARGET=http://127.0.0.1:8002 npm run dev` 启动前端。

## 已清理与保留的部分

已删除旧的“测试 Python 连接”组件、`checkPythonConnection()`、`HealthResponse` 和只测试该按钮的浏览器测试。真正的上传测试继续验证网页能否请求 Python。

后台保留一个很小的 `GET /api/health`，自动测试用它确认服务已经启动；它不再有网页按钮，也不返回展示用的文字和时间戳。

旧的前端 Canvas 解析逻辑在接入 Python 时已移除。`frontend/src/canvasCsv.ts` 仍提供前端类型和虚构示例，这是上传页面还在使用的内容。另一个六题演示考试的导入功能有自己的格式和用途，不在此次清理范围内。

目前只接入读取和校验，没有调用 `import_canvas_csv()` 写 SQLite，也没有接入保存评分和成绩导出。未保存的网页预览刷新即清除。现在可以点击 Save answers to exam，把已校验的结果按考试保存到当前标签页的 sessionStorage，刷新后可恢复；仍不是数据库保存。Rubric Word/PDF 也作为本标签页的参考附件保存，不调用这个 CSV 解析接口。演示评分记录保持独立。

## 验证

仓库根目录：

```bash
python3 -m unittest discover -s backend -p 'test_*.py'
```

frontend 目录：

```bash
npm run test
npm run build
npm run test:e2e
```

浏览器测试自动启动独立的 Python（8001）和 Vite（5174），不复用手动运行的服务。设置 `CANVAS_TEST_CSV` 为本机样例 CSV 的绝对路径，还会检查 4 名学生、37 道题和 7 个说明段落；不会把真实学生答案放入截图或提交的测试夹具。


## DOCX rubric preview

`POST /api/rubric/convert` accepts raw DOCX bytes with Content-Type `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (maximum 2 MB). `rubric_preview.py` checks the document archive, uses a unique temporary LibreOffice profile, converts it to PDF with a 60-second timeout, and returns `{ "status": "ok", "pdf": "<base64>" }`. Temporary files are removed after processing. It does not call the CSV module or database. The browser checks the resulting PDF and counts pages using PDF.js.

PDF uploads are rendered directly in the browser, so they do not require LibreOffice. DOCX conversion searches `SOFFICE_BIN`, PATH, the usual macOS LibreOffice installation and this machine's Codex bundled runtime. Set `SOFFICE_BIN` explicitly on other machines if necessary. A missing converter returns HTTP 503 with a useful explanation; invalid DOCX returns 422, oversized input 413 and unsupported media type 415.

Run all backend tests with `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s backend -p 'test_*.py'`. These tests use isolated ports and synthetic content. The conversion process is intended for this local prototype, not an internet-facing document conversion service.


## Local Sample exam

Run `python3 backend/build_sample_exam.py` once before starting the server to prepare the supplied CSV and DOCX as the default Sample exam. `GET /api/demo/sample-exam` returns this prepared record with no-store headers. The generated `backend/demo/sample-exam.json` is git-ignored and contains local student data. The original files remain unchanged. `sample_rubric.json` holds the reviewed rubric category descriptions and expected Word hash; the builder rejects changed source material until its mapping has been reviewed.

The sample has 4 students, 37 questions and 24 preview pages. Page mappings are deliberately shared where the guide covers several questions on the same pages. CSV scores are source evidence, not human confirmations. Human marking stays in the browser session and does not change the fixture or the original CSV.
