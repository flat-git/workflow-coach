# Diagram proof-of-concept integration contract

This is a small throwaway experiment, not a rewrite of the existing skill. Output: `dist/index.html`, one offline HTML. No backend and no network after building. Use actual bpmn-js + bpmn-js-token-simulation; the main user interface is the BPMN graph itself.

## File ownership
- Root: `src/app.js`, `build.mjs`, package/dependencies, integration.
- UI worker: `src/page.html`, `src/style.css`.
- Model worker: `src/model.js`, `source.md`.
- Test/review worker: `tests/browser_check.py`, focused library API findings.

## HTML / JavaScript contract

`page.html` must have `__APP_CSS__` and `__APP_JS__` placeholders; build replaces once. Main canvas element `#canvas` (large, ≥500px desktop). UI IDs: `start-run`, `reset-run`, `fit-view`, `current-step`, `run-status`, `path-log`, `revision-label`, `source-toggle`, `source-panel`, `source-text`, `question-panel`, `question-title`, `question-context`, `question-options`, `question-apply`, `question-result`, `node-title`, `node-kind`, `node-owner`, `node-evidence`, `node-note`, `save-note`, `notes-list`, `copy-feedback`, `feedback-output`, `copy-status`, `approval-checkbox`, `approve-flow`, `approval-status`, `flow-title`, `flow-subtitle`, `open-count`, `issue-list`. Use semantic buttons / labels. `question-apply` applies a locally simulated explicit design answer; runtime must label this as demo behavior and export it for the AI, not pretend it calls AI.

`question-options` is a container for unselected radios dynamically supplied by app. `path-log`, `notes-list`, `issue-list` are containers dynamically populated. `feedback-output` is a read-only textarea visible under an expandable detail (must stay selectable on clipboard failure). `node-note` is a textarea for a note on the selected node or edge. Start/run/reset/diagram actions are simulation observations; explicit design answer or review acceptance is a separate event.

Suggested layout: compact header + toolbar, graph taking most of the first viewport, right inspector that shows selected node / issue and one question, small expandable source / history / feedback areas. This is a diagram, not a business form prototype. No multiple UI variants: user explicitly requested this shape.

## Model interface

`src/model.js` exports:
- `SOURCE`: `{title, provenance, text, lines:[{id,text}]}`. Source is explicitly illustrative AI-written prose because actual department rules weren't provided. Preserve raw user scope separately within provenance; do not attribute proposed rules to the user.
- `MODEL`: `{id,title,subtitle,startId,endId,nodes:[{id,label,type:'start'|'task'|'gateway'|'end',owner,status:'suggested'|'open',sourceIds:[...],description}],edges:[{id,from,to,label,kind:'normal'|'return',status,sourceIds}],question:{id,nodeId,text,context,recommendedId,options:[{id,label,detail,recommended}]} }`.
- `makeXml(answerId=null)`: valid BPMN XML including DI/layout for graph; use stable readable IDs. Local demo question changes the verification-failure return destination: `original` => back to the original rectification task; `reassign` => back to receiving/dispatch; `unknown` => leave unresolved and do not mark confirmed. The return edge is `Flow_Return`. Nodes IDs: `Start`, `Report`, `Receive`, `Rectify`, `Verify`, `Decision`, `Close`. Gateway outgoing edges `Flow_Pass` to Close (end event) and `Flow_Return` to Rectify by default (dashed/amber question marker is added by app; this default remains an illustrative suggestion, not a confirmed department rule).

Use a horizontal top path with a low return loop. `Decision` is an exclusive gateway; only one outgoing branch enabled at a time in token simulation. Every node/edge has evidence linkage into illustrative source lines; missing actual rules stay visible.

## Feedback

Export a Markdown reply with a fenced `workflow-graph-feedback` JSON block: `{schemaVersion:1,experimentId,revision,sourceProvenance,designAnswers,notes,trace,review}`. Comments identify selected element IDs, revision and a user note. Revision increments only when a design answer changes; reset traversal and review on diagram revision. Unknown never counts as confirmation. Stage review acceptance requires an explicit checkbox and a completed trial run; label it as user's trial review rather than proof of real-world compliance. No persistence needed for the experiment.
