const lines = [
  { id: 'S1', text: '演示场景：同事发现设备旁有油迹，准备上报。' },
  { id: 'S2', text: '演示建议：上报后，先由接收岗位查看并安排处理。接收岗位尚未确定。' },
  { id: 'S3', text: '演示建议：处理人完成整改后，提交处理结果。' },
  { id: 'S4', text: '演示建议：由验收岗位检查处理结果。具体验收岗位和检查标准尚未确定。' },
  { id: 'S5', text: '演示建议：验收通过后关闭事项。真实的关闭条件尚未确定。' },
  { id: 'S6', text: '材料留白：验收不通过后，是退回原处理人，还是交给接收岗位重新分派？这里尚未说明。' }
];

export const SOURCE = {
  title: '隐患上报 · 示例文字材料',
  provenance: '用户给出的业务主题是“隐患上报系统”，并要求在流程图内点击试走。尚未提供部门现行流程。以下 S1–S6 均为 AI 编写的演示材料，不能代表部门实际制度。',
  text: lines.map(line => `[${line.id}] ${line.text}`).join('\n\n'),
  lines
};

export const MODEL = {
  id: 'hazard-graph-poc',
  title: '隐患上报：把闭环走一遍',
  subtitle: '根据示例文字整理的草稿。直接点图试走，在有疑问的节点继续完善。',
  startId: 'Start',
  endId: 'Close',
  nodes: [
    { id: 'Start', label: '发现隐患', type: 'start', owner: '发现人（演示建议）', status: 'suggested', sourceIds: ['S1'], description: '从发现设备旁有油迹这一演示情景开始。尚未规定什么情况必须上报。' },
    { id: 'Report', label: '提交隐患', type: 'task', owner: '上报人（演示建议）', status: 'suggested', sourceIds: ['S1', 'S2'], description: '把发现的情况交到下一环节。具体需提供哪些信息，仍可继续讨论。' },
    { id: 'Receive', label: '接收与分派', type: 'task', owner: '接收岗位待确定', status: 'open', sourceIds: ['S2'], description: '先有人接手，再安排处理。现有示例并未明确具体接收岗位或分派权限。' },
    { id: 'Rectify', label: '实施整改', type: 'task', owner: '处理人（演示建议）', status: 'suggested', sourceIds: ['S3'], description: '处理人实施整改，并把处理结果交给验收环节。处理不了的情况尚未定义。' },
    { id: 'Verify', label: '检查处理结果', type: 'task', owner: '验收岗位待确定', status: 'suggested', sourceIds: ['S4'], description: '检查处理结果是否可以认可。由谁验收、依据什么标准仍需确定。' },
    { id: 'Decision', label: '验收通过？', type: 'gateway', owner: '验收岗位待确定', status: 'open', sourceIds: ['S4', 'S5', 'S6'], description: '通过与不通过会走向不同路径。不通过交回哪里，是本轮要解决的一个缺口。' },
    { id: 'Close', label: '事项关闭', type: 'end', owner: '关闭确认人待确定', status: 'suggested', sourceIds: ['S5'], description: '这是演示终点。到达这里，只表示本次模拟路径走通，实际关闭条件还需要你确认。' }
  ],
  edges: [
    { id: 'Flow_Start', from: 'Start', to: 'Report', label: '准备上报', kind: 'normal', status: 'suggested', sourceIds: ['S1'] },
    { id: 'Flow_Report', from: 'Report', to: 'Receive', label: '提交', kind: 'normal', status: 'suggested', sourceIds: ['S2'] },
    { id: 'Flow_Assign', from: 'Receive', to: 'Rectify', label: '安排处理', kind: 'normal', status: 'suggested', sourceIds: ['S2', 'S3'] },
    { id: 'Flow_Rectified', from: 'Rectify', to: 'Verify', label: '提交结果', kind: 'normal', status: 'suggested', sourceIds: ['S3', 'S4'] },
    { id: 'Flow_Verified', from: 'Verify', to: 'Decision', label: '作出判断', kind: 'normal', status: 'suggested', sourceIds: ['S4'] },
    { id: 'Flow_Pass', from: 'Decision', to: 'Close', label: '通过', kind: 'normal', status: 'suggested', sourceIds: ['S5'] },
    { id: 'Flow_Return', from: 'Decision', to: 'Rectify', label: '不通过 · 去向待确定', kind: 'return', status: 'open', sourceIds: ['S6'] }
  ],
  question: {
    id: 'verification-return',
    nodeId: 'Decision',
    text: '验收不通过后，应该交回哪里？',
    context: '示例材料 S6 没有说明失败后的去向。图中暂用退回原处理人的建议线路；你可以选择另一种设计，立刻比较图的变化。',
    recommendedId: 'original',
    options: [
      { id: 'original', label: '退回原处理人继续整改', detail: '推荐用于先验证一个简单闭环。原处理人补充整改，再提交验收；这只是可讨论的建议。', recommended: true },
      { id: 'reassign', label: '回到接收岗位重新分派', detail: '先判断问题和处理安排是否合适，再分给处理人。退回连线会改接到“接收与分派”。', recommended: false },
      { id: 'unknown', label: '还没想好，保留待确定', detail: '保留这个缺口；仍可按建议线路试走，不会把建议记成已确认。', recommended: false }
    ]
  }
};

const escapeXml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

const bounds = {
  Start: { x: 60, y: 190, w: 36, h: 36 },
  Report: { x: 150, y: 168, w: 150, h: 80 },
  Receive: { x: 360, y: 168, w: 150, h: 80 },
  Rectify: { x: 570, y: 168, w: 150, h: 80 },
  Verify: { x: 780, y: 168, w: 150, h: 80 },
  Decision: { x: 1000, y: 183, w: 50, h: 50 },
  Close: { x: 1170, y: 190, w: 36, h: 36 }
};

function edgePoints(edge) {
  if (edge.id === 'Flow_Return') {
    const destination = bounds[edge.to];
    return [[1025, 233], [1025, 370], [destination.x + destination.w / 2, 370], [destination.x + destination.w / 2, destination.y + destination.h]];
  }
  const from = bounds[edge.from];
  const to = bounds[edge.to];
  return [[from.x + from.w, from.y + from.h / 2], [to.x, to.y + to.h / 2]];
}

export function makeXml(answerId = null) {
  if (![null, 'original', 'reassign', 'unknown'].includes(answerId)) throw new Error(`Unsupported return-design answer: ${answerId}`);
  const edges = MODEL.edges.map(edge => edge.id === 'Flow_Return' ? {
    ...edge,
    to: answerId === 'reassign' ? 'Receive' : 'Rectify',
    label: answerId === 'reassign' ? '不通过 · 重新分派' : answerId === 'original' ? '不通过 · 继续整改' : '不通过 · 去向待确定'
  } : edge);
  const nodeXml = MODEL.nodes.map(node => {
    const tag = { start: 'startEvent', task: 'userTask', gateway: 'exclusiveGateway', end: 'endEvent' }[node.type];
    const incoming = edges.filter(edge => edge.to === node.id).map(edge => `      <bpmn:incoming>${edge.id}</bpmn:incoming>`);
    const outgoing = edges.filter(edge => edge.from === node.id).map(edge => `      <bpmn:outgoing>${edge.id}</bpmn:outgoing>`);
    return `    <bpmn:${tag} id="${node.id}" name="${escapeXml(node.label)}">\n      <bpmn:documentation>${escapeXml(node.description)}</bpmn:documentation>\n${[...incoming, ...outgoing].join('\n')}\n    </bpmn:${tag}>`;
  });
  const edgeXml = edges.map(edge => `    <bpmn:sequenceFlow id="${edge.id}" sourceRef="${edge.from}" targetRef="${edge.to}" name="${escapeXml(edge.label)}" />`);
  const shapeXml = MODEL.nodes.map(node => {
    const box = bounds[node.id];
    const labelY = node.type === 'gateway' ? box.y - 35 : box.y + box.h + 8;
    const label = node.type === 'start' || node.type === 'end' || node.type === 'gateway'
      ? `\n        <bpmndi:BPMNLabel><dc:Bounds x="${box.x + box.w / 2 - 60}" y="${labelY}" width="120" height="30" /></bpmndi:BPMNLabel>` : '';
    return `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}"${node.type === 'gateway' ? ' isMarkerVisible="true"' : ''}>\n        <dc:Bounds x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" />${label}\n      </bpmndi:BPMNShape>`;
  });
  const edgeDi = edges.map(edge => {
    const points = edgePoints(edge);
    const label = edge.id === 'Flow_Return'
      ? { x: (points[1][0] + points[2][0]) / 2 - 105, y: 378, w: 210, h: 26 }
      : { x: (points[0][0] + points[1][0]) / 2 - 47, y: 179, w: 94, h: 24 };
    return `      <bpmndi:BPMNEdge id="${edge.id}_di" bpmnElement="${edge.id}">\n${points.map(([x, y]) => `        <di:waypoint x="${x}" y="${y}" />`).join('\n')}\n        <bpmndi:BPMNLabel><dc:Bounds x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" /></bpmndi:BPMNLabel>\n      </bpmndi:BPMNEdge>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Hazard_POC" targetNamespace="https://example.com/workflow-coach/poc">
  <bpmn:process id="Process_Hazard_POC" name="隐患上报示例草稿" isExecutable="false">
${nodeXml.join('\n')}
${edgeXml.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_Hazard_POC">
    <bpmndi:BPMNPlane id="Plane_Hazard_POC" bpmnElement="Process_Hazard_POC">
${shapeXml.join('\n')}
${edgeDi.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
