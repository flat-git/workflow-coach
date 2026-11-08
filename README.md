# Workflow Coach

通过可点击的业务流程图梳理需求：阅读材料、标出疑点、逐步追问、修改流程，并在图中试走正常与退回路径。

当前版本是验证交互方式的独立小样，使用 AI 拟定的隐患上报示例。部门实际规则尚未提供；它还不是完整的通用 Agent Skill，也不会在页面中直接调用 AI。

## 本地运行

需要 Node.js 20+。

```sh
npm ci --ignore-scripts
npm run build
```

用浏览器打开生成的 `dist/index.html`。这是可离线打开的单个 HTML，不需要服务端。

## 怎样体验

1. 点击“验收通过？”菱形，查看“不通过后退给谁”的问题。
2. 选择“回到接收岗位重新分派”并应用，观察退回连线改变。
3. 开始试走，点击高亮任务推进；点击“通过 / 不通过”连线选择本次路径。
4. 点击任意节点或连线查看依据，记录对应的修改意见。
5. 复制完整反馈回 AI 对话继续完善。小样不自动保存，离开前请复制反馈。

设计选择、模拟操作和成果认可分别记录；修改设计会递增版本并重新开始试走，待定内容继续保留。

## 验证

可选的开发验证需要 Python Playwright 和 Chromium：

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/browser_check.py
```

检查覆盖真实节点与连线点击、正常结束、修改退回线路、批注、反馈、版本重置、显式认可和窄屏布局。结果输出到 `verification/`。

## 项目结构

- `source.md`：示例材料及来源说明。
- `src/model.js`：关联来源的流程模型和 BPMN XML。
- `src/app.js`：图内试走、追问、批注与反馈。
- `build.mjs`：生成独立 HTML。
- `NOTES.md`：验证结论与当前边界。

## Git 约定

`main` 保存基线版本；后续改动使用 `feat/`、`fix/` 或 `docs/` 分支，通过 Pull Request 合并。提交采用 Conventional Commits，例如 `feat: add source-linked diagram review`。

## 使用的组件

[bpmn-js](https://github.com/bpmn-io/bpmn-js) 提供图形展示，[bpmn-js-token-simulation](https://github.com/bpmn-io/bpmn-js-token-simulation) 提供真实流程模拟。构建时将第三方许可写入 HTML，并生成 `dist/THIRD-PARTY-LICENSES.txt`；页面保留 bpmn.io 标识。
