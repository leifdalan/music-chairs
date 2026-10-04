from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
CHECK_SOURCE = REPO_ROOT / "bin" / "check"
PROBE = (
    "import pytest, yaml, subprocess; "
    "subprocess.run(['ruff','--version'], check=True, stdout=subprocess.DEVNULL)"
)
PYTHON_TARGETS = (
    "../lib ../bin/kickoff-config ../bin/kickoff-evidence "
    "../bin/kickoff-tree-id ../bin/check-receipt ../bin/execution-telemetry "
    "../bin/check-execution-dashboards ../bin/check-harness-parity "
    "../bin/check-toolchain-callers ../bin/lessons ../bin/treatise "
    "../bin/check-catalogs "
    "../bin/check-hooks-installed ../bin/check-shell-syntax ../bin/new-name "
    "../bin/check-plan-concreteness ../bin/check-plan-delivery ../bin/review-verdicts "
    "../bin/check-log-prefix ../bin/check-log-monotonic ../bin/kickoff-command-zero "
    "../bin/log-append ../bin/log-relocate ../bin/normalize-final-newline "
    "../bin/check-candidate-partition ../bin/deploy "
    "../tests"
)
# A Node stub that answers the toolchain helper's queries and logs every probe
# and tool run. Tool entries resolve to /entry/<executable>.
NODE_STUB = """#!/usr/bin/env bash
set -u
if [[ "${1:-}" == "-p" ]]; then
  printf '%s\\n' "$0"
  exit 0
fi
if [[ "${1:-}" == "-e" ]]; then
  case "$2" in
    *"await import('react-router')"*)
      printf 'node cwd=%s probe\\n' "$PWD" >> "$CHECK_TEST_LOG"
      exit 0
      ;;
    *"toolEntry(...process.argv"*)
      printf '/entry/%s\\n' "$4"
      exit 0
      ;;
  esac
fi
printf 'node cwd=%s args=%s\\n' "$PWD" "$*" >> "$CHECK_TEST_LOG"
if [[ -n "${CHECK_TEST_NODE_FAIL_MATCH:-}" && "$*" == *"$CHECK_TEST_NODE_FAIL_MATCH"* ]]; then
  exit "${CHECK_TEST_FAIL_CODE:-23}"
fi
"""


def _write_executable(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    path.chmod(0o755)


def _write_python_stub(path: Path) -> None:
    _write_executable(
        path,
        """#!/usr/bin/env bash
printf '%s\n' "$0"
""",
    )


@pytest.fixture
def check_repo(tmp_path: Path) -> tuple[Path, dict[str, str]]:
    root = tmp_path / "repo"
    (root / "bin").mkdir(parents=True)
    (root / "tooling").mkdir()
    (root / "project").mkdir()
    (root / "tests").mkdir()
    shutil.copy2(CHECK_SOURCE, root / "bin" / "check")
    for name in ("_python-toolchain", "_node-toolchain", "test", "kickoff-evidence"):
        shutil.copy2(REPO_ROOT / "bin" / name, root / "bin" / name)
    shutil.copy2(REPO_ROOT / "bin" / "kickoff-tree-id", root / "bin" / "kickoff-tree-id")
    (root / "tooling" / "pyproject.toml").write_text("[project]\nname='fixture'\n")
    (root / "tooling" / "uv.lock").write_text("version = 1\n")
    (root / "tooling" / ".python-version").write_text("3.11\n")
    (root / "project" / "package.json").write_text('{"name": "fixture"}\n')
    (root / "project" / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
    _write_executable(root / "project" / "node_modules" / "node" / "bin" / "node", NODE_STUB)
    (root / "AGENTS.md").symlink_to("CLAUDE.md")
    (root / "CLAUDE.md").write_text("# Fixture\n")

    log_path = tmp_path / "calls.log"
    tool_dir = tmp_path / "tools"
    tool_dir.mkdir()
    _write_executable(
        tool_dir / "uv",
        """#!/usr/bin/env bash
set -u
printf 'uv cwd=%s args=%s\\n' "$PWD" "$*" >> "$CHECK_TEST_LOG"
if [[ -n "${CHECK_TEST_FAIL_MATCH:-}" && "$*" == *"$CHECK_TEST_FAIL_MATCH"* ]]; then
  exit "${CHECK_TEST_FAIL_CODE:-23}"
fi
if [[ -n "${CHECK_TEST_REAL_RUFF:-}" && "$*" == *"ruff format --check"* ]]; then
  # Run the real formatter over the directories the gate names; the fixture's
  # single-file targets are shell stubs.
  targets=()
  for argument in "$@"; do
    [[ -d "$argument" ]] && targets+=("$argument")
  done
  exec "$CHECK_TEST_REAL_RUFF" format --check "${targets[@]}"
fi
if [[ "$*" == python\\ find\\ --no-project\\ * ]]; then
  printf '%s\\n' "${@: -1}"
elif [[ "$*" == "python dir" ]]; then
  printf '%s\\n' "$CHECK_TEST_MANAGED_ROOT"
fi
""",
    )
    _write_executable(tool_dir / "corepack", "#!/usr/bin/env bash\nexit 0\n")
    _write_executable(
        root / "bin" / "kickoff-config",
        """#!/usr/bin/env bash
printf 'config cwd=%s args=%s\\n' "$PWD" "$*" >> "$CHECK_TEST_LOG"
""",
    )
    _write_executable(
        root / "bin" / "lessons",
        """#!/usr/bin/env bash
printf 'lessons cwd=%s args=%s\\n' "$PWD" "$*" >> "$CHECK_TEST_LOG"
""",
    )
    _write_executable(
        root / "bin" / "treatise",
        """#!/usr/bin/env bash
printf 'treatise cwd=%s args=%s\\n' "$PWD" "$*" >> "$CHECK_TEST_LOG"
""",
    )
    # `timing` is the last policy gate, so it carries the failure injection that
    # proves a policy failure cannot be masked by later output.
    _write_executable(
        root / "bin" / "test-governance",
        """#!/usr/bin/env bash
printf 'governance cwd=%s args=%s\n' "$PWD" "$*" >> "$CHECK_TEST_LOG"
if [[ "${1:-}" == "select" ]]; then
  printf '%s\n' 'FOCUSED' 'fixture selection' 'tests/test_check.py'
fi
if [[ "${1:-}" == "timing" && -n "${CHECK_POLICY_FAIL_CODE:-}" ]]; then
  exit "$CHECK_POLICY_FAIL_CODE"
fi
""",
    )
    _write_executable(
        root / "bin" / "check-receipt",
        """#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  candidate)
    printf '%064d\n' 0
    ;;
  begin)
    mkdir -p "$PWD/.kickoff/check-all/logs"
    log="$PWD/.kickoff/check-all/logs/fixture.log"
    : > "$log"
    printf '%s\n' "$log"
    ;;
  complete)
    if [[ " $* " == *" --outcome passed "* ]]; then
      printf '%s\n' \
        'CHECK RECEIPT STORED candidate=fixture log=.kickoff/check-all/logs/fixture.log' \
        'CHECK ALL PASS'
    fi
    ;;
  fingerprint)
    printf '%064d\n' 1
    ;;
  pre-push)
    exit 1
    ;;
esac
""",
    )
    for executable, label in (
        ("execution-telemetry", "telemetry"),
        ("check-harness-parity", "parity"),
        ("check-toolchain-callers", "callers"),
        ("check-execution-dashboards", "dashboards"),
        ("check-catalogs", "catalogs"),
        ("check-hooks-installed", "hooksinstalled"),
        ("check-shell-syntax", "shellsyntax"),
        ("new-name", "newname"),
        ("check-log", "log"),
        ("check-candidate-partition", "partition"),
        ("check-log-prefix", "logprefix"),
        ("check-log-monotonic", "logmonotonic"),
        ("kickoff-command-zero", "commandzero"),
        ("log-append", "logappend"),
        ("log-relocate", "logrelocate"),
        ("normalize-final-newline", "finalnewline"),
        ("python", "python"),
        ("node", "node-wrapper"),
    ):
        _write_executable(
            root / "bin" / executable,
            f'#!/usr/bin/env bash\nprintf \'{label} cwd=%s\\n\' "$PWD" >> "$CHECK_TEST_LOG"\n',
        )
    # The pinned Terraform wrapper: logs which configuration and subcommand ran.
    _write_executable(
        root / "bin" / "terraform",
        """#!/usr/bin/env bash
chdir="${1#-chdir=}"
printf 'terraform chdir=%s cmd=%s\n' "$chdir" "$2" >> "$CHECK_TEST_LOG"
if [[ "$2" == "init" ]]; then
  printf 'terraform init data=%s args=%s\n' "$TF_DATA_DIR" "${*:3}" >> "$CHECK_TEST_INIT_LOG"
fi
if [[ "$2" == "${CHECK_TEST_TERRAFORM_FAIL:-none}" ]]; then
  exit "${CHECK_TEST_FAIL_CODE:-23}"
fi
""",
    )
    (root / "project" / "deploy" / "terraform").mkdir(parents=True)
    (root / "project" / "deploy" / "terraform" / ".terraform.lock.hcl").write_text("# lock\n")
    environment = os.environ.copy()
    environment["PATH"] = f"{tool_dir}:/usr/bin:/bin"
    environment["XDG_CACHE_HOME"] = str(tmp_path / "cache")
    environment["CHECK_TEST_INIT_LOG"] = str(tmp_path / "terraform-init.log")
    environment["CHECK_TEST_LOG"] = str(log_path)
    environment["CHECK_TEST_MANAGED_ROOT"] = str(tool_dir / "managed-python")
    environment.pop("TOOLCHAIN_PYTHON", None)
    environment.pop("TOOLCHAIN_NODE", None)
    return root, environment


def _run(
    root: Path,
    environment: dict[str, str],
    *arguments: str,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(root / "bin" / "check"), *arguments],
        cwd=cwd or root,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def _python_probe(root: Path) -> str:
    return (
        f"uv cwd={root} args=run --project {root / 'tooling'} --locked "
        f"--managed-python python -c {PROBE}"
    )


def test_all_is_default_locked_ordered_and_cwd_independent(
    check_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = check_repo
    project = root / "project"
    result = _run(root, environment, cwd=tmp_path)

    assert result.returncode == 0, result.stderr
    calls = Path(environment["CHECK_TEST_LOG"]).read_text().splitlines()
    assert calls == [
        _python_probe(root),
        f"node cwd={project} probe",
        (
            f"uv cwd={root / 'tooling'} args=run --locked --managed-python "
            f"ruff check {PYTHON_TARGETS}"
        ),
        f"node cwd={project} args=/entry/eslint .",
        f"node cwd={project} args=/entry/react-router typegen",
        f"node cwd={project} args=/entry/tsc",
        *(
            f"terraform chdir={project / 'deploy' / 'terraform'} cmd={command}"
            for command in ("fmt", "init", "validate")
        ),
        (
            f"uv cwd={root / 'tooling'} args=run --locked --managed-python ruff format --check "
            f"{PYTHON_TARGETS}"
        ),
        f"node cwd={project} args=/entry/prettier --check .",
        f"node cwd={project} probe",
        _python_probe(root),
        f"node cwd={project} args=/entry/vitest run",
        (
            f"uv cwd={root} args=run --project {root / 'tooling'} --locked "
            f"--managed-python python -m pytest -q --junitxml {root}/.kickoff/test-timing/full.xml "
            "-o junit_family=xunit1 tests"
        ),
        f"parity cwd={root}",
        f"callers cwd={root}",
        f"dashboards cwd={root}",
        f"config cwd={root} args=show",
        f"catalogs cwd={root}",
        f"lessons cwd={root} args=validate",
        f"treatise cwd={root} args=validate",
        f"hooksinstalled cwd={root}",
        f"shellsyntax cwd={root}",
        f"log cwd={root}",
        f"partition cwd={root}",
        f"governance cwd={root} args=validate",
        f"governance cwd={root} args=timing",
    ]
    # Terraform validates offline: no backend, mirrored providers, a read-only
    # lock file, and a cached working directory outside the tree.
    init = Path(environment["CHECK_TEST_INIT_LOG"]).read_text().strip()
    data, arguments = init.removeprefix("terraform init data=").split(" args=")
    assert data.startswith(str(tmp_path / "cache" / "music-chairs" / "terraform" / "data"))
    assert arguments.split() == [
        "-backend=false",
        "-input=false",
        "-lockfile=readonly",
        f"-plugin-dir={tmp_path / 'cache' / 'music-chairs' / 'terraform' / 'providers'}",
    ]
    for mode in ("lint", "format", "test", "policy"):
        assert f"CHECK {mode} PASS" in result.stdout
    assert "CHECK ALL PASS" in result.stdout


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (
            "lint",
            [
                "CHECK lint-python PASS",
                "CHECK lint-node PASS",
                "CHECK lint-typecheck PASS",
                "CHECK lint-terraform PASS",
            ],
        ),
        ("format", ["CHECK format-python PASS", "CHECK format-node PASS"]),
    ],
)
def test_split_modes_report_each_runtime_and_one_mode_summary(
    check_repo: tuple[Path, dict[str, str]], mode: str, expected: list[str]
) -> None:
    root, environment = check_repo

    result = _run(root, environment, mode)

    assert result.returncode == 0, result.stderr
    lines = result.stdout.splitlines()
    assert [line for line in lines if line.endswith(" PASS")] == [*expected, f"CHECK {mode} PASS"]


@pytest.mark.parametrize(
    ("failing_command", "gate"),
    [("/entry/eslint", "lint-node"), ("/entry/tsc", "lint-typecheck")],
)
def test_node_lint_failure_status_propagates_and_suppresses_the_summary(
    check_repo: tuple[Path, dict[str, str]], failing_command: str, gate: str
) -> None:
    root, environment = check_repo
    environment["CHECK_TEST_NODE_FAIL_MATCH"] = failing_command
    environment["CHECK_TEST_FAIL_CODE"] = "47"

    result = _run(root, environment, "lint")

    assert result.returncode == 47
    assert f"CHECK {gate} FAIL (exit 47)" in result.stderr
    assert "CHECK lint PASS" not in result.stdout


@pytest.mark.parametrize("failing_command", ["fmt", "validate"])
def test_terraform_lint_failure_status_propagates_and_suppresses_the_summary(
    check_repo: tuple[Path, dict[str, str]], failing_command: str
) -> None:
    root, environment = check_repo
    environment["CHECK_TEST_TERRAFORM_FAIL"] = failing_command
    environment["CHECK_TEST_FAIL_CODE"] = "43"

    result = _run(root, environment, "lint")

    assert result.returncode == 43
    assert "CHECK lint-terraform FAIL (exit 43)" in result.stderr
    assert "CHECK lint PASS" not in result.stdout


def test_all_policy_failure_cannot_be_masked_by_later_policy_output(
    check_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = check_repo
    environment["CHECK_POLICY_FAIL_CODE"] = "41"

    result = _run(root, environment, "all")

    assert result.returncode == 41
    assert "CHECK policy-test-time FAIL (exit 41)" in result.stdout
    assert "CHECK policy PASS" not in result.stdout
    assert "CHECK ALL PASS" not in result.stdout


def _git(root: Path, *arguments: str) -> None:
    subprocess.run(["git", *arguments], cwd=root, check=True, capture_output=True)


def _commit_fixture(root: Path) -> None:
    _git(root, "init", "-q")
    _git(root, "config", "user.email", "fixture@example.invalid")
    _git(root, "config", "user.name", "Fixture")
    _git(root, "add", "-A")
    _git(root, "commit", "-qm", "base")


def _assert_format_rejects_every_candidate_state(
    root: Path,
    environment: dict[str, str],
    directory: Path,
    suffix: str,
    clean: str,
    unformatted: str,
    gate: str,
) -> None:
    (directory / f"tracked{suffix}").write_text(clean)
    _commit_fixture(root)
    # The formatter really runs, and a clean tree passes.
    passed = _run(root, environment, "format")
    assert passed.returncode == 0, passed.stdout + passed.stderr
    assert "CHECK format PASS" in passed.stdout

    def rejected(path: Path) -> None:
        result = _run(root, environment, "format")
        assert result.returncode == 1, result.stdout + result.stderr
        assert f"CHECK {gate} FAIL (exit 1)" in result.stderr
        assert "CHECK format PASS" not in result.stdout
        assert path.name in result.stdout + result.stderr
        assert path.read_text() == unformatted

    untracked = directory / f"untracked{suffix}"
    untracked.write_text(unformatted)
    rejected(untracked)
    _git(root, "add", untracked.relative_to(root).as_posix())
    rejected(untracked)
    _git(root, "commit", "-qm", "staged")
    untracked.write_text(clean)
    _git(root, "commit", "-qam", "clean")
    tracked = directory / f"tracked{suffix}"
    tracked.write_text(unformatted)
    rejected(tracked)


def test_format_rejects_staged_unstaged_and_untracked_candidates_without_rewriting(
    check_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = check_repo
    ruff = shutil.which("ruff")
    assert ruff is not None
    environment["CHECK_TEST_REAL_RUFF"] = ruff
    (root / "lib").mkdir()
    (root / ".gitignore").write_text(".kickoff/\nproject/node_modules/\n")

    _assert_format_rejects_every_candidate_state(
        root, environment, root / "lib", ".py", "value = 1\n", "value=1\n", "format-python"
    )


def test_project_format_rejects_staged_unstaged_and_untracked_candidates_without_rewriting(
    check_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = check_repo
    installed = REPO_ROOT / "project" / "node_modules"
    assert (installed / "node" / "bin" / "node").is_file(), "run ./bin/setup first"
    project = root / "project"
    # The deliverable's real runtime and prettier, over the fixture's own sources.
    shutil.rmtree(project / "node_modules")
    (project / "node_modules").symlink_to(installed)
    for name in (".prettierrc.json", ".prettierignore", ".gitignore"):
        shutil.copy2(REPO_ROOT / "project" / name, project / name)
    (root / ".gitignore").write_text(".kickoff/\n")
    (project / "package.json").write_text('{\n  "name": "fixture"\n}\n')
    (project / "src").mkdir()

    _assert_format_rejects_every_candidate_state(
        root,
        environment,
        project / "src",
        ".ts",
        "export const value = 1;\n",
        "export const value=1\n",
        "format-node",
    )


@pytest.mark.parametrize(
    "arguments",
    [("bogus",), ("all", "extra"), ("changed",), ("changed", "HEAD", "extra")],
)
def test_invalid_invocation_is_usage_error(
    check_repo: tuple[Path, dict[str, str]], arguments: tuple[str, ...]
) -> None:
    root, environment = check_repo

    result = _run(root, environment, *arguments)

    assert result.returncode == 2
    assert "Usage: ./bin/check" in result.stderr


@pytest.mark.parametrize(
    ("arguments", "selection_arguments"),
    [
        (("vital",), "--tier vital --format lines"),
        (("changed", "HEAD~1"), "--changed-from HEAD~1 --format lines"),
    ],
)
def test_governed_iteration_lanes_dispatch_selected_tests_without_receipt(
    check_repo: tuple[Path, dict[str, str]],
    arguments: tuple[str, ...],
    selection_arguments: str,
) -> None:
    root, environment = check_repo

    result = _run(root, environment, *arguments)

    assert result.returncode == 0, result.stderr
    calls = Path(environment["CHECK_TEST_LOG"]).read_text().splitlines()
    assert f"governance cwd={root} args=select {selection_arguments}" in calls
    assert any("python -m pytest -q tests/test_check.py" in call for call in calls)
    assert not any("check-receipt" in call for call in calls)


def test_authoritative_runtime_probe_failure_stops_before_gate_without_fallback(
    check_repo: tuple[Path, dict[str, str]],
    tmp_path: Path,
) -> None:
    root, environment = check_repo
    runtime = tmp_path / "candidate-python"
    _write_python_stub(runtime)
    environment["TOOLCHAIN_PYTHON"] = str(runtime)
    environment["CHECK_TEST_FAIL_MATCH"] = PROBE
    environment["CHECK_TEST_FAIL_CODE"] = "43"

    result = _run(root, environment, "lint")

    assert result.returncode == 43
    assert "dependency-chain probe failed" in result.stderr
    assert "no runtime fallback was attempted" in result.stderr
    calls = Path(environment["CHECK_TEST_LOG"]).read_text().splitlines()
    assert calls == [
        f"uv cwd={root} args=python find --no-project {runtime}",
        f"uv cwd={root} args=python dir",
        (
            f"uv cwd={root} args=run --project {root / 'tooling'} --locked "
            f"--python {runtime} --no-managed-python python -c {PROBE}"
        ),
    ]
