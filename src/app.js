import BpmnViewer from 'bpmn-js/lib/NavigatedViewer';
import TokenSimulationModule from 'bpmn-js-token-simulation/lib/viewer';
import SimulationSupportModule from 'bpmn-js-token-simulation/lib/simulation-support';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css';
import './style.css';
import './graph.css';
import { SOURCE, MODEL, makeXml } from './model.js';

const $ = (id) => document.getElementById(id);
const create = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const viewer = new BpmnViewer({
  container: '#canvas',
  additionalModules: [TokenSimulationModule, SimulationSupportModule],
  textRenderer: { defaultStyle: { fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif', fontSize: 14 } }
});
const simulation = viewer.get('simulator');
const support = viewer.get('simulationSupport');
const eventBus = viewer.get('eventBus');
const registry = viewer.get('elementRegistry');
const canvas = viewer.get('canvas');
const overlays = viewer.get('overlays');
const nodeMap = new Map(MODEL.nodes.map((item) => [item.id, item]));
const edgeMap = new Map(MODEL.edges.map((item) => [item.id, item]));
let revision = 1;
let designAnswer = null;
let selectedId = 'Decision';
let currentId = null;
let running = false;
let completed = false;
let busy = false;
let ready = false;
let trace = [];
let notes = [];
let designAnswers = [];
let archivedRuns = [];
let review = { accepted: false };
const draftNotes = new Map();
let lastAction = '先点“开始试走”，再直接点击高亮的流程节点。';

function returnTarget() { return designAnswer === 'reassign' ? 'Receive' : 'Rectify'; }
function label(id) { return nodeMap.get(id)?.label || edgeMap.get(id)?.label || id; }
function currentEdge(id) {
  const edge = edgeMap.get(id);
  return id === 'Flow_Return' ? { ...edge, to: returnTarget(), label: designAnswer === 'reassign' ? '不通过 · 重新分派' : designAnswer === 'original' ? '不通过 · 继续整改' : edge.label } : edge;
}
function fitGraph() {
  const fit = canvas.zoom('fit-viewport', 'auto');
  canvas.zoom(fit * 0.88, 'auto');
}
function designIsChosen() { return designAnswer === 'original' || designAnswer === 'reassign'; }
function snapshot() {
  return { ready, revision, currentId, completed, running, busy, designAnswer, selectedId, trace: structuredClone(trace), notes: structuredClone(notes), review: structuredClone(review) };
}
window.__workflowGraph = { viewer, simulation, model: MODEL, snapshot };

function feedbackText() {
  const data = {
    schemaVersion: 1, experimentId: MODEL.id, revision,
    sourceProvenance: SOURCE.provenance,
    designAnswers, notes, trace, archivedRuns, review
  };
  return `# 流程图体验反馈：${MODEL.title}\n\n版本：v${revision}\n素材说明：${SOURCE.provenance}\n\n` +
    '请根据明确的设计选择与节点批注继续修订流程；模拟操作不代表对业务规则的确认。\n\n' +
    '```workflow-graph-feedback\n' + JSON.stringify(data, null, 2) + '\n```\n';
}

function updateFeedback() { $('feedback-output').value = feedbackText(); }
function renderIssues() {
  const issues = [
    { id: 'Receive', text: '接收与分派：具体由哪个岗位接手？' },
    { id: 'Verify', text: '检查处理结果：谁检查，依据什么标准？' },
    { id: 'Close', text: '事项关闭：什么条件才算真正结束？' }
  ];
  if (!designIsChosen()) issues.unshift({ id: 'Decision', text: '验收不通过：退回哪里？本轮先讨论这一处。' });
  $('open-count').textContent = String(issues.length);
  $('issue-list').replaceChildren(...issues.map((issue) => {
    const button = create('button', issue.text);
    button.type = 'button'; button.addEventListener('click', () => selectElement(issue.id));
    return button;
  }));
}

function renderMarkers() {
  for (const item of [...MODEL.nodes, ...MODEL.edges]) {
    if (!registry.get(item.id)) continue;
    for (const marker of ['wf-open', 'wf-current', 'wf-visited', 'wf-selected', 'wf-chosen']) canvas.removeMarker(item.id, marker);
    if (item.status === 'open' && !(designIsChosen() && ['Decision', 'Flow_Return'].includes(item.id))) canvas.addMarker(item.id, 'wf-open');
    if (designIsChosen() && ['Decision', 'Flow_Return'].includes(item.id)) canvas.addMarker(item.id, 'wf-chosen');
    if (trace.some((event) => event.elementId === item.id)) canvas.addMarker(item.id, 'wf-visited');
    if (item.id === currentId) canvas.addMarker(item.id, 'wf-current');
    if (item.id === selectedId) canvas.addMarker(item.id, 'wf-selected');
  }
}

function renderInspector() {
  const item = nodeMap.get(selectedId) || currentEdge(selectedId);
  if (!item) return;
  const isEdge = edgeMap.has(selectedId);
  $('node-title').textContent = isEdge ? `${label(item.from)} → ${label(item.to)}` : item.label;
  $('node-kind').textContent = ['Decision', 'Flow_Return'].includes(selectedId) && designIsChosen() ? '方案已选择' : item.status === 'open' ? '待确定' : 'AI 演示建议';
  $('node-owner').textContent = isEdge ? `连线条件：${item.label}` : item.owner;
  $('node-evidence').replaceChildren(...item.sourceIds.map((id) => {
    const line = SOURCE.lines.find((line) => line.id === id);
    return create('p', `[${id}] ${line?.text || '出处待补充'}`);
  }));
  $('node-note').value = draftNotes.get(selectedId) || '';
  $('question-panel').hidden = !['Decision', 'Flow_Return'].includes(selectedId);
  $('branch-panel').hidden = currentId !== 'Verify' || !['Decision', 'Verify', 'Flow_Pass', 'Flow_Return'].includes(selectedId);
  $('question-result').textContent = designAnswer === 'unknown' ? '已记录“还没想好”。退回去向继续标为待确定，仍可按建议线路体验。' : designIsChosen() ? `当前选择：${MODEL.question.options.find((option) => option.id === designAnswer).label}。图已更新到 v${revision}。` : '';
  renderMarkers();
}

function renderStatus() {
  $('revision-label').textContent = `草稿 v${revision}`;
  $('current-step').textContent = currentId ? label(currentId) : '尚未开始';
  $('run-status').textContent = lastAction;
  $('start-run').disabled = busy || running || completed;
  $('reset-run').disabled = busy || (!running && !trace.length && !completed);
  $('question-apply').disabled = busy;
  $('approve-flow').disabled = !completed || !$('approval-checkbox').checked || review.accepted || busy;
  $('approval-status').textContent = review.accepted ? `你已认可 v${revision} 的本次试走结果；其他待定事项仍保留。` : completed ? '本次路径已到终点。请检查经过的节点、分支和仍待确定的内容，再明确认可。' : '完成一次试走后，再检查并认可这一版；到达终点本身不代表流程已经正确。';
  $('path-log').replaceChildren(...trace.filter((event) => nodeMap.has(event.elementId)).map((event, index) => {
    const li = create('li');
    li.append(create('span', String(index + 1).padStart(2, '0')), create('strong', label(event.elementId)));
    return li;
  }));
  renderIssues();
  renderInspector();
  updateFeedback();
}

function selectElement(id) {
  if (!nodeMap.has(id) && !edgeMap.has(id)) return;
  selectedId = id;
  renderInspector();
}

function trigger(id) {
  const element = registry.get(id);
  const subscription = simulation.findSubscriptions({ element })[0];
  if (!subscription) { lastAction = '当前节点还未准备好，请稍等片刻。'; renderStatus(); return; }
  simulation.trigger({ event: subscription.event, scope: subscription.scope });
}

function chooseBranch(edgeId) {
  if (busy || currentId !== 'Verify') {
    selectElement(edgeId);
    lastAction = '分支可先检查；试走到“检查处理结果”后，再点击这条连线选择本次结果。';
    renderStatus(); return;
  }
  simulation.setConfig(registry.get('Decision'), { activeOutgoing: registry.get(edgeId) });
  selectedId = edgeId;
  lastAction = edgeId === 'Flow_Pass' ? '本次模拟选择了“通过”，观察路径到达结束点。' : `本次模拟选择了“不通过”，观察退回到“${label(returnTarget())}”。`;
  trigger('Verify');
}

function archiveRun(reason) {
  if (trace.length) archivedRuns.push({ revision, reason, trace: structuredClone(trace), review: structuredClone(review) });
}
function clearRun() {
  currentId = null; running = false; completed = false; trace = []; review = { accepted: false };
  $('approval-checkbox').checked = false;
}

async function loadGraph() {
  busy = true; ready = false;
  try {
    await viewer.importXML(makeXml(designAnswer));
    support.toggleSimulation(true);
    for (const task of MODEL.nodes.filter((item) => item.type === 'task')) simulation.waitAtElement(registry.get(task.id), true);
    overlays.clear();
    for (const id of ['Receive', 'Verify', 'Decision', 'Close']) {
      const marker = create('button', id === 'Decision' && designIsChosen() ? '已选方案' : '待确定', 'wf-issue-badge');
      marker.type = 'button'; marker.setAttribute('aria-label', `${label(id)}：查看待确定内容`);
      marker.addEventListener('click', (event) => { event.stopPropagation(); selectElement(id); });
      overlays.add(id, 'workflow-issue', { position: { top: -24, left: 6 }, html: marker });
    }
    fitGraph();
    ready = true;
  } finally { busy = false; renderStatus(); }
}

function startRun() {
  if (busy || running || completed) return;
  running = true;
  lastAction = '流程已开始。直接点击高亮的任务节点，模拟完成这一步。';
  trigger('Start');
}

eventBus.on('trace.elementEnter', ({ element }) => {
  if (!nodeMap.has(element.id) && !edgeMap.has(element.id)) return;
  trace.push({ elementId: element.id, revision, at: new Date().toISOString() });
  if (nodeMap.has(element.id)) {
    currentId = element.id;
    if (element.id === 'Close') { completed = true; running = false; lastAction = '本次路径已走到“事项关闭”。可以重新试走“不通过”分支，也可以检查本轮成果。'; }
    else if (element.id === 'Verify') lastAction = '走到验收了。点菱形或“通过 / 不通过”连线，选择这次模拟的结果。';
    else if (element.id !== 'Decision') lastAction = `当前：${label(element.id)}。直接点击这个高亮节点继续。`;
    if (element.id === 'Verify') selectedId = 'Decision';
    else if (element.id !== 'Decision') selectedId = element.id;
  }
  renderStatus();
});

eventBus.on('element.click', 2000, ({ element }) => {
  const id = element.labelTarget?.id || element.id;
  if (busy || (!nodeMap.has(id) && !edgeMap.has(id))) return;
  selectElement(id);
  if (id === 'Start' && !running && !completed) { startRun(); return; }
  if (['Flow_Pass', 'Flow_Return'].includes(id)) { chooseBranch(id); return; }
  if (id === 'Decision' || id === 'Verify') {
    if (currentId === 'Verify') { lastAction = '请点击图上的“通过 / 不通过”连线，或右侧的本次验收结果按钮。'; renderStatus(); }
    return;
  }
  if (running && id === currentId && nodeMap.get(id)?.type === 'task') trigger(id);
});

$('flow-title').textContent = MODEL.title;
$('flow-subtitle').textContent = MODEL.subtitle;
$('source-text').textContent = SOURCE.provenance + '\n\n' + SOURCE.text;
$('question-title').textContent = MODEL.question.text;
$('question-context').textContent = MODEL.question.context;
$('question-options').replaceChildren(...MODEL.question.options.map((option) => {
  const wrapper = create('label', undefined, 'design-option');
  const input = create('input'); input.type = 'radio'; input.name = 'design-answer'; input.value = option.id;
  const text = create('span');
  text.append(create('strong', option.label + (option.recommended ? ' · 建议' : '')), create('small', option.detail));
  wrapper.append(input, text); return wrapper;
}));

$('start-run').addEventListener('click', startRun);
$('reset-run').addEventListener('click', () => {
  if (busy) return;
  archiveRun('重新试走');
  viewer.get('resetSimulation').resetSimulation();
  clearRun();
  for (const task of MODEL.nodes.filter((item) => item.type === 'task')) simulation.waitAtElement(registry.get(task.id), true);
  lastAction = '已回到起点。设计选择和节点批注保留；点击“开始试走”再验证一条路径。';
  renderStatus();
});
$('fit-view').addEventListener('click', fitGraph);
$('zoom-in')?.addEventListener('click', () => canvas.zoom(Math.min(2.2, canvas.zoom() * 1.25), 'auto'));
$('zoom-out')?.addEventListener('click', () => canvas.zoom(Math.max(0.18, canvas.zoom() / 1.25), 'auto'));
$('source-toggle').addEventListener('click', () => {
  $('source-panel').hidden = !$('source-panel').hidden;
  $('source-toggle').setAttribute('aria-expanded', String(!$('source-panel').hidden));
});
$('branch-pass').addEventListener('click', () => chooseBranch('Flow_Pass'));
$('branch-return').addEventListener('click', () => chooseBranch('Flow_Return'));
$('question-apply').addEventListener('click', async () => {
  const answer = document.querySelector('input[name="design-answer"]:checked')?.value;
  if (!answer) { $('question-result').textContent = '请明确选择一项；推荐没有预先选中。'; return; }
  if (answer === designAnswer) { $('question-result').textContent = '这一选择已经在当前图中，无需重复改版。'; return; }
  archiveRun('设计修改，旧轨迹对应旧版图');
  revision++;
  designAnswer = answer;
  designAnswers.push({ questionId: MODEL.question.id, elementId: 'Flow_Return', answerId: answer, revision, confirmed: answer !== 'unknown', at: new Date().toISOString() });
  clearRun(); selectedId = 'Decision';
  lastAction = answer === 'unknown' ? '已保留待定。建议退回线继续显示为待确定；请重新试走。' : `本地演示已改图：不通过后回到“${label(returnTarget())}”。旧试走已归档，请从起点验证新版。`;
  await loadGraph();
});
$('node-note').addEventListener('input', () => draftNotes.set(selectedId, $('node-note').value));
$('save-note').addEventListener('click', () => {
  const text = $('node-note').value.trim();
  if (!text) { $('copy-status').textContent = '请先写下对当前节点或连线的意见。'; return; }
  notes.push({ elementId: selectedId, label: label(selectedId), revision, text });
  draftNotes.delete(selectedId); $('node-note').value = '';
  $('notes-list').replaceChildren(...notes.map((note) => create('li', `v${note.revision} · ${label(note.elementId)}：${note.text}`)));
  $('copy-status').textContent = '这条批注已记在对应节点上，复制反馈时会一起带回 AI。';
  updateFeedback();
});
$('approval-checkbox').addEventListener('change', renderStatus);
$('approve-flow').addEventListener('click', () => {
  if (!completed || !$('approval-checkbox').checked) return;
  review = { accepted: true, revision, at: new Date().toISOString(), scope: '用户对本次示例图的试走认可；其余待确定事项仍保留' };
  renderStatus();
});
$('copy-feedback').addEventListener('click', async () => {
  updateFeedback();
  try { await navigator.clipboard.writeText($('feedback-output').value); $('copy-status').textContent = '已复制。请把整段反馈粘贴回原来的 AI 对话。'; }
  catch {
    const details = $('feedback-output').closest('details');
    if (details) details.open = true;
    $('feedback-output').focus(); $('feedback-output').select();
    $('copy-status').textContent = '浏览器未允许自动复制。反馈原文已展开并选中，请手动复制回 AI。';
  }
});
new ResizeObserver(() => { if (ready) canvas.resized(); }).observe($('canvas'));
loadGraph().catch((error) => {
  $('run-status').textContent = `流程图载入失败：${error.message}`;
  console.error(error);
});
