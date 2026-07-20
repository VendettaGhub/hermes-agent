from agent.prompt_builder import KANBAN_GUIDANCE


def test_kanban_guidance_runs_independent_review_autonomously():
    assert "launch a fresh read-only reviewer with `delegate_task(review=True" in KANBAN_GUIDANCE
    assert "returns the verdict synchronously in the same tool response" in KANBAN_GUIDANCE
    assert "Never call `kanban_block` merely for review" in KANBAN_GUIDANCE
    assert "On NO-GO, fix" in KANBAN_GUIDANCE
    assert "repeat until GO" in KANBAN_GUIDANCE
    assert "review-required" not in KANBAN_GUIDANCE


def test_kanban_guidance_reserves_blocking_for_external_hard_blocks():
    assert "Block only on a genuine external hard block" in KANBAN_GUIDANCE
    assert "missing credentials/access" in KANBAN_GUIDANCE
    assert "destructive/public external action" in KANBAN_GUIDANCE
    assert "locally reproducible failure is NOT a human block" in KANBAN_GUIDANCE


def test_kanban_guidance_drives_fixable_work_to_acceptance():
    assert "Drive to acceptance autonomously" in KANBAN_GUIDANCE
    assert "safest goal-aligned reversible choice" in KANBAN_GUIDANCE
    assert "retry transient operations" in KANBAN_GUIDANCE
    assert "try a different local strategy" in KANBAN_GUIDANCE
    assert "Never stop at a plan, stub, first failed command" in KANBAN_GUIDANCE
    assert "Do not weaken gates" in KANBAN_GUIDANCE
    assert "use mocks as proof" in KANBAN_GUIDANCE
    assert "unless the task or user explicitly authorizes that side effect" in KANBAN_GUIDANCE
