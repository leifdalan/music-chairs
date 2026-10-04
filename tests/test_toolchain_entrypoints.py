from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
ENTRYPOINTS = ("setup", "test", "python", "node")
SYMLINK_INVOCATIONS = (
    ("setup", ()),
    ("test", ("tests/test_check.py", "-q")),
    ("test", ("project/tests/site.test.ts",)),
    ("python", ("--version",)),
    ("node", ("--version",)),
)
PROBE = (
    "import pytest, yaml, subprocess; "
    "subprocess.run(['ruff','--version'], check=True, stdout=subprocess.DEVNULL)"
)
# A Node stub that answers the helper's runtime queries and logs every probe and
# tool run. Tool entries resolve to /entry/<executable>.
NODE_STUB = """#!/usr/bin/env bash
set -u
if [[ "${1:-}" == "-p" ]]; then
  printf '%s\\n' "$0"
  exit 0
fi
if [[ "${1:-}" == "-e" ]]; then
  case "$2" in
    *"await import('react-router')"*)
      printf 'node=%s cwd=%s probe\\n' "$0" "$PWD" >> "$TOOLCHAIN_TEST_LOG"
      exit "${TOOLCHAIN_TEST_NODE_PROBE_FAIL:-0}"
      ;;
    *"toolEntry(...process.argv"*)
      printf '/entry/%s\\n' "$4"
      exit 0
      ;;
  esac
fi
printf 'node=%s cwd=%s args=%s\\n' "$0" "$PWD" "$*" >> "$TOOLCHAIN_TEST_LOG"
if [[ "${1:-}" == "/entry/vitest" && -n "${TOOLCHAIN_TEST_VITEST_FAIL:-}" ]]; then
  exit "$TOOLCHAIN_TEST_VITEST_FAIL"
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
def toolchain_repo(tmp_path: Path) -> tuple[Path, dict[str, str]]:
    root = tmp_path / "repo"
    (root / "bin").mkdir(parents=True)
    (root / "tooling").mkdir()
    (root / "project").mkdir()
    for helper in ("_python-toolchain", "_node-toolchain", "_terraform-toolchain"):
        shutil.copy2(REPO_ROOT / "bin" / helper, root / "bin" / helper)
    for entrypoint in ENTRYPOINTS:
        shutil.copy2(REPO_ROOT / "bin" / entrypoint, root / "bin" / entrypoint)
    _write_executable(
        root / "bin" / "test-governance",
        """#!/usr/bin/env bash
if [[ "${TOOLCHAIN_TEST_SELECTION:-}" == "FULL" ]]; then
  printf '%s\n' 'FULL' 'fixture widening'
else
  printf '%s\n' 'FOCUSED' 'fixture selection' 'tests/test_check.py'
fi
""",
    )
    (root / "tooling" / ".python-version").write_text("3.11\n")
    (root / "tooling" / "pyproject.toml").write_text("[project]\nname='fixture'\n")
    (root / "tooling" / "uv.lock").write_text("version = 1\n")
    (root / "project" / "package.json").write_text('{"name": "fixture"}\n')
    (root / "project" / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n")
    _write_executable(root / "project" / "node_modules" / "node" / "bin" / "node", NODE_STUB)
    _write_terraform_release(root, "0" * 64)

    log_path = tmp_path / "calls.log"
    tool_dir = tmp_path / "tools"
    tool_dir.mkdir()
    _write_executable(
        tool_dir / "uv",
        """#!/usr/bin/env bash
set -u
if [[ "${VIRTUAL_ENV+x}" == x ]]; then
  echo 'Inherited environment reached project selection' >&2
  exit 87
fi
printf 'uv cwd=%s args=%s\\n' "$PWD" "$*" >> "$TOOLCHAIN_TEST_LOG"
if [[ -n "${TOOLCHAIN_TEST_FAIL_MATCH:-}" && "$*" == *"$TOOLCHAIN_TEST_FAIL_MATCH"* ]]; then
  exit "${TOOLCHAIN_TEST_FAIL_CODE:-23}"
fi
if [[ "$*" == python\\ find\\ --no-project\\ * ]]; then
  printf '%s\\n' "${@: -1}"
elif [[ "$*" == "python dir" ]]; then
  printf '%s\\n' "$TOOLCHAIN_TEST_MANAGED_ROOT"
fi
""",
    )
    _write_executable(
        tool_dir / "corepack",
        """#!/usr/bin/env bash
printf 'corepack cwd=%s args=%s\\n' "$PWD" "$*" >> "$TOOLCHAIN_TEST_LOG"
exit "${TOOLCHAIN_TEST_COREPACK_FAIL:-0}"
""",
    )
    # An authoritative Terraform stand-in, so setup never downloads one.
    _write_executable(
        tool_dir / "terraform",
        """#!/usr/bin/env bash
printf 'terraform args=%s\\n' "$*" >> "$TOOLCHAIN_TEST_LOG"
""",
    )
    environment = os.environ.copy()
    # No host node, corepack, or uv can leak in: only the stubs and base utilities.
    environment["PATH"] = f"{tool_dir}:/usr/bin:/bin"
    environment["XDG_CACHE_HOME"] = str(tmp_path / "cache")
    environment["TOOLCHAIN_TERRAFORM"] = str(tool_dir / "terraform")
    environment["TOOLCHAIN_TEST_LOG"] = str(log_path)
    environment["TOOLCHAIN_TEST_MANAGED_ROOT"] = str(tool_dir / "managed-python")
    environment.pop("TOOLCHAIN_PYTHON", None)
    environment.pop("TOOLCHAIN_NODE", None)
    return root, environment


def _write_terraform_release(root: Path, sha256: str) -> None:
    platform = {"Darwin": "darwin", "Linux": "linux"}[os.uname().sysname]
    arch = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "amd64"}[os.uname().machine]
    release = root / "project" / "deploy" / "terraform-release.json"
    release.parent.mkdir(parents=True, exist_ok=True)
    release.write_text(
        '{\n  "version": "9.9.9",\n  "sha256": {\n'
        f'    "{platform}_{arch}": "{sha256}"\n'
        "  }\n}\n"
    )


def _run_path(
    executable: Path,
    environment: dict[str, str],
    *arguments: str,
    cwd: Path,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(executable), *arguments],
        cwd=cwd,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def _run(
    root: Path,
    environment: dict[str, str],
    entrypoint: str,
    *arguments: str,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    return _run_path(root / "bin" / entrypoint, environment, *arguments, cwd=cwd or root)


def _calls(environment: dict[str, str]) -> list[str]:
    log_path = Path(environment["TOOLCHAIN_TEST_LOG"])
    return log_path.read_text().splitlines() if log_path.exists() else []


def _managed_node(root: Path) -> Path:
    return root / "project" / "node_modules" / "node" / "bin" / "node"


def _python_probe(root: Path) -> str:
    return (
        f"uv cwd={root} args=run --project {root / 'tooling'} --locked "
        f"--managed-python python -c {PROBE}"
    )


def test_test_defaults_to_every_repository_test_from_any_cwd(
    toolchain_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = toolchain_repo
    node = _managed_node(root)

    environment["VIRTUAL_ENV"] = str(tmp_path / "standalone-script-environment")

    result = _run(root, environment, "test", cwd=tmp_path)

    assert result.returncode == 0, result.stderr
    assert _calls(environment) == [
        f"node={node} cwd={root / 'project'} probe",
        _python_probe(root),
        f"node={node} cwd={root / 'project'} args=/entry/vitest run",
        (
            f"uv cwd={root} args=run --project {root / 'tooling'} --locked "
            f"--managed-python python -m pytest -q --junitxml {root}/.kickoff/test-timing/full.xml "
            "-o junit_family=xunit1 tests"
        ),
    ]


def test_project_suite_failure_status_stops_the_full_run(
    toolchain_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = toolchain_repo
    environment["TOOLCHAIN_TEST_VITEST_FAIL"] = "29"

    result = _run(root, environment, "test")

    assert result.returncode == 29
    assert "TEST FAIL project suite (exit 29)" in result.stderr
    assert not any("-m pytest" in call for call in _calls(environment))


def test_setup_provisions_and_probes_both_runtimes_from_their_lockfiles(
    toolchain_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = toolchain_repo
    node = _managed_node(root)

    result = _run(root, environment, "setup", cwd=tmp_path)

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines()[-1] == "SETUP PASS"
    assert _calls(environment) == [
        f"uv cwd={root} args=sync --project {root / 'tooling'} --locked --managed-python",
        _python_probe(root),
        f"corepack cwd={root / 'project'} args=pnpm install --frozen-lockfile",
        f"node={node} cwd={root / 'project'} probe",
        (
            f"terraform args=-chdir={root / 'project' / 'deploy' / 'terraform'} providers "
            f"mirror {tmp_path / 'cache' / 'music-chairs' / 'terraform' / 'providers'}"
        ),
    ]


def test_setup_installs_only_a_terraform_matching_its_pinned_checksum(
    toolchain_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = toolchain_repo
    environment.pop("TOOLCHAIN_TERRAFORM")
    # A fake download: a zip holding a terraform that reports the pinned version.
    payload = tmp_path / "payload"
    _write_executable(
        payload / "terraform",
        """#!/usr/bin/env bash
if [[ "$1" == "version" ]]; then printf '{"terraform_version": "9.9.9"}\\n'; exit 0; fi
printf 'pinned terraform args=%s\\n' "$*" >> "$TOOLCHAIN_TEST_LOG"
""",
    )
    archive = tmp_path / "terraform.zip"
    subprocess.run(["zip", "-q", "-j", str(archive), str(payload / "terraform")], check=True)
    _write_executable(
        tmp_path / "tools" / "curl",
        f'#!/usr/bin/env bash\nwhile [[ "$1" != "-o" ]]; do shift; done\ncp {archive} "$2"\n',
    )
    installed = tmp_path / "cache" / "music-chairs" / "terraform" / "9.9.9" / "terraform"

    refused = _run(root, environment, "setup")

    assert refused.returncode != 0
    assert "does not match the pinned" in refused.stderr
    assert not installed.exists()

    digest = subprocess.run(
        ["shasum", "-a", "256", str(archive)], capture_output=True, text=True, check=True
    ).stdout.split()[0]
    _write_terraform_release(root, digest)
    accepted = _run(root, environment, "setup")

    assert accepted.returncode == 0, accepted.stderr
    assert installed.exists()
    assert any(call.startswith("pinned terraform args=") for call in _calls(environment))


def test_terraform_runs_offline_with_its_data_outside_the_tree(
    toolchain_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = toolchain_repo
    shutil.copy2(REPO_ROOT / "bin" / "terraform", root / "bin" / "terraform")
    _write_executable(
        tmp_path / "tools" / "terraform",
        """#!/usr/bin/env bash
printf 'terraform data=%s checkpoint=%s args=%s\\n' "$TF_DATA_DIR" "$CHECKPOINT_DISABLE" "$*" \\
  >> "$TOOLCHAIN_TEST_LOG"
""",
    )

    defaulted = _run(root, environment, "terraform", "version")
    environment["TF_DATA_DIR"] = str(tmp_path / "chosen")
    chosen = _run(root, environment, "terraform", "version")

    assert defaulted.returncode == 0 and chosen.returncode == 0, defaulted.stderr + chosen.stderr
    cache = tmp_path / "cache" / "music-chairs" / "terraform" / "data" / "manual"
    assert _calls(environment) == [
        f"terraform data={cache} checkpoint=1 args=version",
        f"terraform data={tmp_path / 'chosen'} checkpoint=1 args=version",
    ]


def test_invalid_terraform_override_refuses_without_fallback(
    toolchain_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = toolchain_repo
    environment["TOOLCHAIN_TERRAFORM"] = "terraform"

    result = _run(root, environment, "setup")

    assert result.returncode != 0
    assert "TOOLCHAIN_TERRAFORM must be an executable absolute path" in result.stderr
    assert "no fallback was attempted" in result.stderr
    assert not any(call.startswith("terraform ") for call in _calls(environment))


def test_setup_propagates_the_package_manager_status(
    toolchain_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = toolchain_repo
    environment["TOOLCHAIN_TEST_COREPACK_FAIL"] = "31"

    result = _run(root, environment, "setup")

    assert result.returncode == 31
    assert "SETUP FAIL (exit 31)" in result.stderr
    assert not any(call.startswith("node=") for call in _calls(environment))


def _assert_selected_repository(
    root: Path,
    environment: dict[str, str],
    result: subprocess.CompletedProcess[str],
) -> None:
    assert result.returncode == 0, result.stderr
    calls = _calls(environment)
    assert calls
    for call in calls:
        if call.startswith("uv "):
            assert f"--project {root / 'tooling'} --locked" in call, call
        elif call.startswith("node="):
            assert call.startswith(f"node={_managed_node(root)} "), call
        elif call.startswith("terraform "):
            assert f"-chdir={root / 'project' / 'deploy' / 'terraform'} " in call, call
        else:
            assert call.startswith(f"corepack cwd={root / 'project'} "), call


@pytest.mark.parametrize(("entrypoint", "arguments"), SYMLINK_INVOCATIONS)
def test_installed_symlink_chain_selects_the_owning_repository(
    toolchain_repo: tuple[Path, dict[str, str]],
    tmp_path: Path,
    entrypoint: str,
    arguments: tuple[str, ...],
) -> None:
    root, environment = toolchain_repo
    first_dir = tmp_path / "first-bin"
    second_dir = tmp_path / "second-bin"
    first_dir.mkdir()
    second_dir.mkdir()
    (first_dir / entrypoint).symlink_to(root / "bin" / entrypoint)
    launcher = second_dir / entrypoint
    launcher.symlink_to(Path("..") / "first-bin" / entrypoint)

    result = _run_path(launcher, environment, *arguments, cwd=tmp_path)

    _assert_selected_repository(root, environment, result)


@pytest.mark.parametrize(
    "arguments",
    [("--vital",), ("--changed-from", "HEAD~1")],
)
def test_test_governed_lanes_run_selected_proofs(
    toolchain_repo: tuple[Path, dict[str, str]], arguments: tuple[str, ...]
) -> None:
    root, environment = toolchain_repo

    result = _run(root, environment, "test", *arguments)

    assert result.returncode == 0, result.stderr
    assert "TEST GOVERNED FOCUSED: fixture selection" in result.stdout
    assert _calls(environment) == [
        _python_probe(root),
        (
            f"uv cwd={root} args=run --project {root / 'tooling'} --locked "
            "--managed-python python -m pytest -q tests/test_check.py"
        ),
    ]


def test_widened_governed_lane_runs_both_suites(
    toolchain_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = toolchain_repo
    environment["TOOLCHAIN_TEST_SELECTION"] = "FULL"

    result = _run(root, environment, "test", "--changed-from", "HEAD~1")

    assert result.returncode == 0, result.stderr
    assert "TEST GOVERNED FULL: fixture widening" in result.stdout
    calls = _calls(environment)
    assert any(call.endswith("args=/entry/vitest run") for call in calls), calls
    assert calls[-1].endswith("-o junit_family=xunit1 tests"), calls


def test_focused_project_paths_run_vitest_without_the_prefix(
    toolchain_repo: tuple[Path, dict[str, str]],
) -> None:
    root, environment = toolchain_repo
    node = _managed_node(root)

    result = _run(root, environment, "test", "project/tests/site.test.ts", "-t", "brands")

    assert result.returncode == 0, result.stderr
    assert _calls(environment) == [
        f"node={node} cwd={root / 'project'} probe",
        f"node={node} cwd={root / 'project'} args=/entry/vitest run tests/site.test.ts -t brands",
    ]


@pytest.mark.parametrize(
    ("arguments", "diagnostic"),
    [
        (("project/tests/site.test.ts", "tests/test_check.py"), "may not name both"),
        (("-q",), "must name a project/... or tests/... path"),
    ],
)
def test_focused_arguments_must_select_exactly_one_suite(
    toolchain_repo: tuple[Path, dict[str, str]],
    arguments: tuple[str, ...],
    diagnostic: str,
) -> None:
    root, environment = toolchain_repo

    result = _run(root, environment, "test", *arguments)

    assert result.returncode == 2
    assert diagnostic in result.stderr
    assert _calls(environment) == []


@pytest.mark.parametrize(
    ("entrypoint", "arguments"),
    [
        ("setup", ()),
        ("test", ("tests/test_check.py", "-q")),
        ("python", ("--version",)),
    ],
)
def test_authoritative_runtime_override_is_used_for_probe_and_command(
    toolchain_repo: tuple[Path, dict[str, str]],
    tmp_path: Path,
    entrypoint: str,
    arguments: tuple[str, ...],
) -> None:
    root, environment = toolchain_repo
    runtime = tmp_path / "candidate-python"
    _write_python_stub(runtime)
    environment["TOOLCHAIN_PYTHON"] = str(runtime)

    result = _run(root, environment, entrypoint, *arguments)

    assert result.returncode == 0, result.stderr
    calls = [call for call in _calls(environment) if call.startswith("uv ")]
    assert len(calls) == 4
    assert calls[0] == f"uv cwd={root} args=python find --no-project {runtime}"
    assert calls[1] == f"uv cwd={root} args=python dir"
    assert all(f"--python {runtime} --no-managed-python" in call for call in calls[2:])


@pytest.mark.parametrize(
    ("entrypoint", "arguments", "command"),
    [
        ("setup", (), None),
        ("test", ("project/tests/site.test.ts",), "args=/entry/vitest run tests/site.test.ts"),
        ("node", ("--version",), "args=--version"),
    ],
)
def test_authoritative_node_override_is_used_for_probe_and_command(
    toolchain_repo: tuple[Path, dict[str, str]],
    tmp_path: Path,
    entrypoint: str,
    arguments: tuple[str, ...],
    command: str | None,
) -> None:
    root, environment = toolchain_repo
    runtime = tmp_path / "candidate-node"
    _write_executable(runtime, NODE_STUB)
    environment["TOOLCHAIN_NODE"] = str(runtime)

    result = _run(root, environment, entrypoint, *arguments)

    assert result.returncode == 0, result.stderr
    calls = [call for call in _calls(environment) if call.startswith("node=")]
    assert calls[0] == f"node={runtime} cwd={root / 'project'} probe"
    assert all(call.startswith(f"node={runtime} ") for call in calls), calls
    if command is not None:
        assert calls[-1].endswith(command), calls


@pytest.mark.parametrize("override", ["relative/node", "project-environment"])
def test_invalid_node_override_refuses_without_fallback(
    toolchain_repo: tuple[Path, dict[str, str]], override: str
) -> None:
    root, environment = toolchain_repo
    if override == "project-environment":
        override = str(_managed_node(root))
    environment["TOOLCHAIN_NODE"] = override

    result = _run(root, environment, "node", "--version")

    assert result.returncode == 1
    assert "no runtime fallback was attempted" in result.stderr
    assert _calls(environment) == []


def test_node_override_probe_failure_propagates_without_fallback(
    toolchain_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = toolchain_repo
    runtime = tmp_path / "candidate-node"
    _write_executable(runtime, NODE_STUB)
    environment["TOOLCHAIN_NODE"] = str(runtime)
    environment["TOOLCHAIN_TEST_NODE_PROBE_FAIL"] = "37"

    result = _run(root, environment, "test", "project/tests/site.test.ts")

    assert result.returncode == 37
    assert "dependency-chain probe failed" in result.stderr
    assert "no runtime fallback was attempted" in result.stderr
    assert _calls(environment) == [f"node={runtime} cwd={root / 'project'} probe"]


def test_missing_package_manager_launcher_is_a_named_prerequisite(
    toolchain_repo: tuple[Path, dict[str, str]], tmp_path: Path
) -> None:
    root, environment = toolchain_repo
    (tmp_path / "tools" / "corepack").unlink()

    result = _run(root, environment, "node", "--version")

    assert result.returncode == 1
    assert "NODE ERROR missing prerequisite: corepack" in result.stderr
