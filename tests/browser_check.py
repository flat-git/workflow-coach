"""Small real-browser check for the diagram proof of concept.

Requires the developer's Python Playwright installation. Run after `npm run build`.
The delivered HTML itself has no Python or server dependency.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def snapshot(page: Page) -> dict:
    return page.evaluate("window.__workflowGraph.snapshot()")


def ready(page: Page) -> None:
    page.wait_for_function("Boolean(window.__workflowGraph?.snapshot && window.__workflowGraph.snapshot().ready && !window.__workflowGraph.snapshot().busy)")
    page.locator('.djs-element[data-element-id="Report"]').wait_for()


def click_element(page: Page, element_id: str) -> None:
    """Click the real SVG diagram, rather than driving the simulator API."""
    visual = page.locator(f'.djs-element[data-element-id="{element_id}"] .djs-visual').first
    if element_id.startswith("Flow_"):
        # A loop's bounding-box centre is empty canvas. Click a point on its actual stroke.
        point = visual.locator(":scope > path").first.evaluate("""path => {
          const p = path.getPointAtLength(path.getTotalLength() * 0.5);
          const q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
          return {x:q.x, y:q.y};
        }""")
        page.mouse.click(point["x"], point["y"])
    else:
        box = visual.bounding_box()
        assert box, f"No visible diagram geometry for {element_id}"
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)


def wait_current(page: Page, element_id: str) -> None:
    page.wait_for_function(
        "id => window.__workflowGraph.snapshot().currentId === id", arg=element_id
    )


def exported_feedback(page: Page) -> dict:
    raw = page.locator("#feedback-output").input_value()
    payload = raw.split("```workflow-graph-feedback\n", 1)[1].split("\n```", 1)[0]
    return json.loads(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--page", type=Path, default=ROOT / "dist/index.html")
    parser.add_argument("--artifacts", type=Path, default=ROOT / "verification")
    args = parser.parse_args()
    args.artifacts.mkdir(parents=True, exist_ok=True)
    page_path = args.page.resolve()
    assert page_path.is_file(), f"Build output is missing: {page_path}"
    checks: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors: list[str] = []
        requests: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: requests.append(request.url))
        page.goto(page_path.as_uri())
        ready(page)
        assert page.locator('#question-options input:checked').count() == 0
        checks.append("no design answer preselected")
        page.locator("#approval-checkbox").check()
        assert page.locator("#approve-flow").is_disabled()
        page.locator("#approval-checkbox").uncheck()
        checks.append("trial review cannot be accepted before a completed run")

        click_element(page, "Decision")
        assert page.locator("#question-panel").is_visible()
        assert page.locator("#question-title").inner_text().strip()
        page.screenshot(path=str(args.artifacts / "diagram-desktop.png"), full_page=True)
        checks.append("diagram node opens its unresolved design question")

        page.locator("#start-run").click()
        wait_current(page, "Report")
        for node_id, next_id in [("Report", "Receive"), ("Receive", "Rectify"), ("Rectify", "Verify")]:
            click_element(page, node_id)
            wait_current(page, next_id)
        checks.append("real graph clicks advance paused token tasks")

        # The concrete branch controls are supplied by app.js; no engine API is used here.
        click_element(page, "Flow_Pass")
        page.wait_for_function("window.__workflowGraph.snapshot().completed === true")
        assert snapshot(page)["currentId"] == "Close"
        checks.append("success branch reaches the diagram end")

        click_element(page, "Receive")
        page.locator("#node-note").fill("这里应先确认谁来接收，再决定如何派单。")
        page.locator("#save-note").click()
        assert exported_feedback(page)["notes"]
        checks.append("node-linked comment is included in exported feedback")

        click_element(page, "Decision")
        page.locator('#question-options input[value="reassign"]').check()
        page.locator("#question-apply").click()
        page.wait_for_function("window.__workflowGraph.snapshot().revision === 2 && window.__workflowGraph.snapshot().ready && !window.__workflowGraph.snapshot().busy")
        assert not snapshot(page)["completed"]
        assert page.evaluate("window.__workflowGraph.viewer.get('elementRegistry').get('Flow_Return').target.id") == "Receive"
        checks.append("explicit answer changes the real BPMN return edge and resets the trial")
        page.screenshot(path=str(args.artifacts / "diagram-revised.png"), full_page=True)

        click_element(page, "Start")
        wait_current(page, "Report")
        for node_id, next_id in [("Report", "Receive"), ("Receive", "Rectify"), ("Rectify", "Verify")]:
            click_element(page, node_id)
            wait_current(page, next_id)
        click_element(page, "Flow_Return")
        wait_current(page, "Receive")
        for node_id, next_id in [("Receive", "Rectify"), ("Rectify", "Verify")]:
            click_element(page, node_id)
            wait_current(page, next_id)
        click_element(page, "Flow_Pass")
        page.wait_for_function("window.__workflowGraph.snapshot().completed === true")
        checks.append("revised return branch re-enters receiving and can complete on the next pass")

        page.locator("#approval-checkbox").check()
        page.locator("#approve-flow").click()
        feedback = exported_feedback(page)
        assert feedback["revision"] == 2
        assert feedback["designAnswers"]
        assert feedback["trace"]
        assert feedback["review"]["accepted"] is True
        (args.artifacts / "feedback.md").write_text(page.locator("#feedback-output").input_value())
        checks.append("explicit trial review and graph revision are exported separately from run events")

        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#fit-view").click()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "page overflows at 390px"
        page.screenshot(path=str(args.artifacts / "diagram-mobile.png"), full_page=True)
        checks.append("390px page fits without horizontal page overflow")

        fallback = context.new_page()
        fallback.on("pageerror", lambda error: errors.append(str(error)))
        fallback.on("request", lambda request: requests.append(request.url))
        fallback.add_init_script("Object.defineProperty(navigator, 'clipboard', {value: undefined}); document.execCommand = () => false;")
        fallback.goto(page_path.as_uri())
        ready(fallback)
        fallback.locator("#copy-feedback").click()
        assert fallback.locator("#feedback-output").is_visible()
        assert fallback.locator("#feedback-output").input_value()
        checks.append("clipboard failure exposes selectable complete feedback")

        assert not errors, errors
        assert not any(url.startswith(("http://", "https://")) for url in requests), requests
        checks.append("offline HTML makes no network requests and has no JavaScript errors")
        browser.close()

    report = {"passed": True, "page": str(page_path), "checks": checks}
    (args.artifacts / "browser-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
