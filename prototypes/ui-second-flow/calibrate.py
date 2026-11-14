"""Run one deliberate defect at a time, then restore the exact source bytes."""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parent
CASES = [
    (
        "arrival",
        "picker-flow.ts",
        "state.facts.arrived === null ||\n    !sameLinkTarget(state.facts.arrived, attempt.target)",
        "false",
        "answer alone cannot write or close",
    ),
    (
        "role",
        "picker-flow.ts",
        "attempt.label !== null && state.facts.role === 'GM'",
        "attempt.label !== null",
        "demotion before arrival",
    ),
    (
        "timeout",
        "picker-caller.ts",
        "timing.labelReadTimeoutMs,",
        "timing.labelReadTimeoutMs * 2,",
        "timeout read permits linking",
    ),
    (
        "stale-attempt",
        "picker-flow.ts",
        "state.attempt?.id === event.id &&",
        "state.attempt !== null &&",
        "close failure permits same-target retry",
    ),
    (
        "queued-disposal",
        "picker-caller.ts",
        "if (state.disposed || state.closed)",
        "if (false)",
        "synchronous disposal by link",
    ),
    (
        "arrival-first-stages",
        "picker-flow.ts",
        "state.attempt.phase === 'waiting' &&",
        "state.attempt.phase !== 'writing' &&",
        "arrival first survives a late command timeout while",
    ),
    (
        "notification-early-deadline",
        "picker-caller.ts",
        "timing.labelWriteTimeoutMs,\n          () => ({ type: 'notified'",
        "timing.labelWriteTimeoutMs - 1,\n          () => ({ type: 'notified'",
        "notification timeout waits until its deadline",
    ),
    (
        "timer-cleanup",
        "picker-caller.ts",
        "      cancelTimer();",
        "",
        "settlement removes its timer",
    ),
]


def main():
    for name, filename, before, after, test_name in CASES:
        target = ROOT / filename
        original = target.read_bytes()
        text = original.decode()
        if before not in text:
            raise RuntimeError(f"{name}: mutation anchor missing")
        try:
            target.write_text(text.replace(before, after, 1))
            result = subprocess.run(
                ["bun", "test", "picker-caller.test.ts", "--test-name-pattern", test_name],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            print(f"=== {name}: exit {result.returncode} ===", flush=True)
            print(result.stdout + result.stderr, flush=True)
            if result.returncode != 1 or "expect(received)" not in result.stderr:
                raise RuntimeError(f"{name}: no behavioral assertion failure")
        finally:
            target.write_bytes(original)
    subprocess.run(["bun", "test", "picker-caller.test.ts"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
