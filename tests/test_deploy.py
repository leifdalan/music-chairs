"""Hermetic tests for the deploy command and its server scripts (no AWS, no network).

`bin/deploy` reaches AWS and the server only through the commands named by
MUSIC_CHAIRS_AWS and MUSIC_CHAIRS_SSH, so these tests replace both with scripted
fakes that record every call.
"""

from __future__ import annotations

import importlib.util
import json
import os
import stat
import subprocess
import sys
import tarfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.machinery import SourceFileLoader
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
DEPLOY = ROOT / "bin" / "deploy"
DEPLOY_DIR = ROOT / "project" / "deploy"
CONFIG = json.loads((DEPLOY_DIR / "config.json").read_text())
ACCOUNT = CONFIG["account"]

FAKE_AWS = """#!{python}
import json, os, sys
argv = sys.argv[1:]
with open(os.environ["FAKE_LOG"], "a") as log:
    log.write(json.dumps(argv) + "\\n")
for rule in json.load(open(os.environ["FAKE_RULES"])):
    if all(token in argv for token in rule["match"]):
        sys.stdout.write(json.dumps(rule.get("stdout", {{}})))
        sys.stderr.write(rule.get("stderr", ""))
        sys.exit(rule.get("returncode", 0))
sys.stderr.write("fake aws: no rule for " + " ".join(argv))
sys.exit(254)
"""


COMPLETE = {"Stacks": [{"StackStatus": "CREATE_COMPLETE"}]}
MISSING = {"returncode": 255, "stderr": "Stack with id music-chairs-alerts does not exist"}


def write_executable(path: Path, content: str) -> Path:
    path.write_text(content)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


def calls(log: Path) -> list[list[str]]:
    return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []


@pytest.fixture
def fakes(tmp_path: Path):
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    log = tmp_path / "calls.log"
    rules_file = tmp_path / "rules.json"
    aws = write_executable(tmp_path / "aws", FAKE_AWS.format(python=sys.executable))
    ssh = write_executable(tmp_path / "ssh", f'#!/bin/sh\necho ssh "$@" >> {tmp_path}/ssh.log\n')

    def run(*args: str, account: str = ACCOUNT, rules: list | None = None, env: dict | None = None):
        all_rules = [
            {"match": ["sts", "get-caller-identity"], "stdout": {"Account": account}},
            *(rules or []),
        ]
        rules_file.write_text(json.dumps(all_rules))
        # The operator's own alert address must never leak into a test run.
        ambient = {k: v for k, v in os.environ.items() if k != "MUSIC_CHAIRS_ALERT_EMAIL"}
        environment = {
            **ambient,
            "HOME": str(home),
            "MUSIC_CHAIRS_AWS": str(aws),
            "MUSIC_CHAIRS_SSH": str(ssh),
            "FAKE_LOG": str(log),
            "FAKE_RULES": str(rules_file),
            **(env or {}),
        }
        # The repository's interpreter, not the uv shebang: with HOME replaced, uv
        # would look for (and might download) a Python of its own.
        return subprocess.run(
            [sys.executable, str(DEPLOY), *args],
            env=environment,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

    return run, log, home, tmp_path


def test_deploy_refuses_any_account_but_the_configured_one(fakes) -> None:
    run, log, _, tmp_path = fakes

    result = run("all", account="111111111111")

    assert result.returncode == 1
    assert f"deploys only to {ACCOUNT}" in result.stderr
    assert "nothing was changed" in result.stderr
    assert [call[:2] for call in calls(log)] == [["sts", "get-caller-identity"]]
    assert calls(log)[0][2:4] == ["--profile", "music-chairs"]
    assert not (tmp_path / "ssh.log").exists()


def test_dry_run_confirms_the_account_then_lists_every_step_in_order(fakes) -> None:
    run, log, _, _ = fakes

    result = run("all", "--dry-run", env={"MUSIC_CHAIRS_ALERT_EMAIL": "someone@example.test"})

    assert result.returncode == 0, result.stderr
    steps = [line for line in result.stdout.splitlines() if line.startswith("would ")]
    assert [step.split(" ")[1:3] for step in steps] == [
        ["ensure", "Lightsail"],
        ["deploy", "stack"],
        ["deploy", "stack"],
        ["read", "the"],
        ["upload", "project/deploy"],
        ["install", "the"],
        ["build", "the"],
        ["check", "the"],
        ["run", "the"],
    ]
    assert "music-chairs in us-west-2" in steps[1]
    assert "music-chairs-alerts in us-east-1" in steps[2]
    assert "someone@example.test" not in result.stdout + result.stderr
    assert [call[:2] for call in calls(log)] == [["sts", "get-caller-identity"]]


def test_tool_overrides_must_be_absolute_paths(fakes) -> None:
    run, log, _, _ = fakes

    result = run("smoke", "--dry-run", env={"MUSIC_CHAIRS_AWS": "aws"})

    assert result.returncode == 1
    assert "MUSIC_CHAIRS_AWS must be an absolute path" in result.stderr
    assert calls(log) == []


def test_a_change_set_that_would_replace_the_instance_is_refused(fakes) -> None:
    run, log, home, _ = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    replacement = {
        "Changes": [
            {
                "ResourceChange": {
                    "LogicalResourceId": "Instance",
                    "Action": "Modify",
                    "Replacement": "True",
                }
            }
        ]
    }
    rules = [
        {"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {"name": "music-chairs"}}},
        {"match": ["cloudformation", "describe-stacks"], "stdout": COMPLETE},
        {"match": ["cloudformation", "create-change-set"], "stdout": {"Id": "x"}},
        {"match": ["cloudformation", "wait", "change-set-create-complete"], "stdout": {}},
        {"match": ["cloudformation", "describe-change-set"], "stdout": replacement},
        {"match": ["cloudformation", "delete-change-set"], "stdout": {}},
    ]

    result = run("infra", rules=rules)

    assert result.returncode == 1
    assert "would replace or remove Instance" in result.stderr
    operations = [call[1] for call in calls(log)]
    assert "delete-change-set" in operations
    assert "execute-change-set" not in operations


def test_the_first_alerts_deploy_requires_the_email_and_never_prompts(fakes) -> None:
    run, log, home, _ = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    unchanged = {"StatusReason": "The submitted information didn't contain changes."}
    rules = [
        {"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {}}},
        {"match": ["describe-stacks", "music-chairs-alerts"], **MISSING},
        {"match": ["cloudformation", "describe-stacks"], "stdout": COMPLETE},
        {"match": ["cloudformation", "create-change-set"], "stdout": {"Id": "x"}},
        {"match": ["change-set-create-complete"], "returncode": 255, "stdout": {}},
        {"match": ["cloudformation", "describe-change-set"], "stdout": unchanged},
        {"match": ["cloudformation", "delete-change-set"], "stdout": {}},
    ]

    result = run("infra", rules=rules)

    assert result.returncode == 1
    assert "set MUSIC_CHAIRS_ALERT_EMAIL" in result.stderr
    assert "stack music-chairs is already up to date" in result.stdout
    assert not any(
        "music-chairs-alerts" in call and "create-change-set" in call for call in calls(log)
    )


def test_a_stack_left_by_a_failed_first_deploy_is_refused_with_recovery_advice(fakes) -> None:
    run, log, home, _ = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    rules = [
        {"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {}}},
        {
            "match": ["cloudformation", "describe-stacks"],
            "stdout": {"Stacks": [{"StackStatus": "ROLLBACK_COMPLETE"}]},
        },
    ]

    result = run("infra", rules=rules)

    assert result.returncode == 1
    assert "in state ROLLBACK_COMPLETE and cannot be updated" in result.stderr
    assert "A failed first deploy" in result.stderr
    assert not any("create-change-set" in call for call in calls(log))


def test_an_existing_key_file_is_never_overwritten_by_a_new_key_pair(fakes) -> None:
    run, log, home, _ = fakes
    key_file = home / ".ssh" / "music-chairs-lightsail"
    key_file.write_text("an older key")
    rules = [{"match": ["lightsail", "get-key-pair"], "returncode": 255, "stdout": {}}]

    result = run("infra", rules=rules)

    assert result.returncode == 1
    assert "it is not overwritten" in result.stderr
    assert not any("create-key-pair" in call for call in calls(log))
    assert key_file.read_text() == "an older key"


def test_the_alert_email_reaches_aws_only_as_the_alerts_parameter(fakes) -> None:
    run, log, home, _ = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    email = "someone@example.test"
    rules = [
        {"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {}}},
        {"match": ["describe-stacks", "music-chairs-alerts"], **MISSING},
        {"match": ["cloudformation", "describe-stacks"], "stdout": COMPLETE},
        {"match": ["cloudformation", "create-change-set"], "stdout": {"Id": "x"}},
        {"match": ["cloudformation", "wait"], "stdout": {}},
        {"match": ["cloudformation", "describe-change-set"], "stdout": {"Changes": []}},
        {"match": ["cloudformation", "execute-change-set"], "stdout": {}},
    ]

    result = run("infra", rules=rules, env={"MUSIC_CHAIRS_ALERT_EMAIL": email})

    assert result.returncode == 0, result.stderr
    assert email not in result.stdout + result.stderr
    carrying = [call for call in calls(log) if any(email in token for token in call)]
    assert len(carrying) == 1
    call = carrying[0]
    assert call[:2] == ["cloudformation", "create-change-set"]
    assert "music-chairs-alerts" in call
    parameters = json.loads(call[call.index("--parameters") + 1])
    assert {"ParameterKey": "AlertEmail", "ParameterValue": email} in parameters
    assert [token for token in call if email in token] == [call[call.index("--parameters") + 1]]


RELEASE_OUTPUTS = [
    {"OutputKey": "StaticIpAddress", "OutputValue": "203.0.113.7"},
    {"OutputKey": "BackupBucketName", "OutputValue": "bucket"},
    {"OutputKey": "BackupUserName", "OutputValue": "backup-user"},
    {"OutputKey": "AppUserName", "OutputValue": "app-user"},
]
RELEASE_RULES = [
    {
        "match": ["cloudformation", "describe-stacks"],
        "stdout": {"Stacks": [{"Outputs": RELEASE_OUTPUTS}]},
    },
    {
        "match": ["lightsail", "get-instance-access-details"],
        "stdout": {"accessDetails": {"hostKeys": [{"algorithm": "ssh-ed25519", "publicKey": "A"}]}},
    },
]


def scripted_ssh(tmp_path: Path, cases: str) -> Path:
    """A fake ssh that logs each remote command and answers per the shell `case` arms given."""
    return write_executable(
        tmp_path / "scripted-ssh",
        "#!/bin/sh\nfor last; do :; done\n"
        f'echo "$last" >> {tmp_path}/remote.log\n'
        f'case "$last" in\n{cases}\nesac\n',
    )


def test_an_ssh_failure_never_rotates_the_backup_key(fakes) -> None:
    run, log, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    # Reaches the server for provisioning, then fails as an unreachable server would.
    ssh = scripted_ssh(tmp_path, '  *backup.env*) echo "Connection timed out" >&2; exit 255;;')

    result = run("release", rules=RELEASE_RULES, env={"MUSIC_CHAIRS_SSH": str(ssh)})

    assert result.returncode == 1
    assert "Connection timed out" in result.stderr
    assert not any(call[0] == "iam" for call in calls(log))


def test_an_ssh_failure_never_rotates_the_app_key_either(fakes) -> None:
    run, log, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    ssh = scripted_ssh(
        tmp_path,
        "  *'test -f /etc/music-chairs/backup.env'*) echo present;;\n"
        '  *app.env*) echo "Connection timed out" >&2; exit 255;;',
    )

    result = run("release", rules=RELEASE_RULES, env={"MUSIC_CHAIRS_SSH": str(ssh)})

    assert result.returncode == 1
    assert "Connection timed out" in result.stderr
    assert not any(call[0] == "iam" for call in calls(log))


def test_the_app_key_is_created_for_the_app_user_and_installed_root_only(fakes) -> None:
    run, log, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    # The server has the backup key but no app key; the install itself fails so
    # the run stops there instead of building the app.
    ssh = scripted_ssh(
        tmp_path,
        "  *'test -f /etc/music-chairs/backup.env'*) echo present;;\n"
        "  *'test -f /etc/music-chairs/app.env'*) echo missing;;\n"
        "  *'install -o'*) cat >/dev/null; echo stopped here >&2; exit 1;;",
    )
    rules = [
        *RELEASE_RULES,
        {"match": ["iam", "list-access-keys"], "stdout": {"AccessKeyMetadata": []}},
        {
            "match": ["iam", "create-access-key"],
            "stdout": {"AccessKey": {"AccessKeyId": "AKIDEXAMPLE", "SecretAccessKey": "s3cr3t"}},
        },
    ]

    result = run("release", rules=rules, env={"MUSIC_CHAIRS_SSH": str(ssh)})

    assert result.returncode == 1
    remote = (tmp_path / "remote.log").read_text().splitlines()
    assert remote[-1] == "sudo install -o root -g root -m 600 /dev/stdin /etc/music-chairs/app.env"
    iam = [call for call in calls(log) if call[0] == "iam"]
    assert [call[1] for call in iam] == ["list-access-keys", "create-access-key"]
    assert all(call[call.index("--user-name") + 1] == "app-user" for call in iam)
    assert "s3cr3t" not in result.stdout + result.stderr + "\n".join(remote)


def template(name: str) -> dict:
    return yaml.safe_load((DEPLOY_DIR / name).read_text())


def test_the_server_stack_retains_live_data_and_keeps_backups_private_for_30_days() -> None:
    resources = template("stack.yaml")["Resources"]

    for logical in ("Instance", "StaticIp", "BackupBucket"):
        assert resources[logical]["DeletionPolicy"] == "Retain", logical
        assert resources[logical]["UpdateReplacePolicy"] == "Retain", logical
    ports = resources["Instance"]["Properties"]["Networking"]["Ports"]
    assert sorted(port["FromPort"] for port in ports) == [22, 80, 443]
    bucket = resources["BackupBucket"]["Properties"]
    rule, markers = bucket["LifecycleConfiguration"]["Rules"]
    assert rule["ExpirationInDays"] == 30
    assert rule["NoncurrentVersionExpiration"]["NoncurrentDays"] == 7
    assert markers["ExpiredObjectDeleteMarker"] is True
    assert bucket["VersioningConfiguration"]["Status"] == "Enabled"
    assert all(bucket["PublicAccessBlockConfiguration"].values())
    statement = resources["BackupUser"]["Properties"]["Policies"][0]["PolicyDocument"]["Statement"]
    assert [entry["Action"] for entry in statement] == ["s3:PutObject"]
    assert CONFIG["bundleId"] == "micro_3_0"
    # Lightsail names are unique across its resource types: an instance named like
    # the key pair fails to create.
    instance = CONFIG["instanceName"]
    assert len({instance, instance + "-ip", CONFIG["keyPairName"]}) == 3


def test_the_app_key_may_read_only_the_google_secret_parameter() -> None:
    stack = template("stack.yaml")
    statements = stack["Resources"]["AppUser"]["Properties"]["Policies"][0]["PolicyDocument"][
        "Statement"
    ]

    assert [entry["Action"] for entry in statements] == ["ssm:GetParameter", "kms:Decrypt"]
    parameter_arn = statements[0]["Resource"]["Fn::Join"][1]
    assert parameter_arn[0] == "arn:aws:ssm:" and parameter_arn[-1] == {
        "Ref": "GoogleSecretParameter"
    }
    via = statements[1]["Condition"]["StringEquals"]["kms:ViaService"]["Fn::Join"][1]
    assert via == ["ssm.", {"Ref": "AWS::Region"}, ".amazonaws.com"]
    assert stack["Outputs"]["AppUserName"]["Value"] == {"Ref": "AppUser"}
    assert CONFIG["googleSecretParameter"] == "/music-chairs/google-client-secret"
    assert CONFIG["googleClientId"].endswith(".apps.googleusercontent.com")


def test_the_service_runs_the_installed_secret_fetch_and_reads_the_file_it_writes() -> None:
    unit = (DEPLOY_DIR / "music-chairs.service").read_text()
    provision = (DEPLOY_DIR / "provision.sh").read_text()
    fetch = (DEPLOY_DIR / "fetch-secret.sh").read_text()

    assert "ExecStartPre=+/usr/local/lib/music-chairs/fetch-secret.sh" in unit
    assert '"$here/fetch-secret.sh" /usr/local/lib/music-chairs/fetch-secret.sh' in provision
    assert "EnvironmentFile=-/run/music-chairs/google.env" in unit
    assert "RuntimeDirectory=music-chairs" in unit
    assert 'secret_env="${MC_SECRET_ENV:-/run/music-chairs/google.env}"' in fetch
    assert 'app_env="${MC_APP_ENV:-/etc/music-chairs/app.env}"' in fetch
    for variable in ("GOOGLE_CLIENT_ID", "GOOGLE_SECRET_PARAMETER", "AWS_REGION"):
        assert f"Environment=MUSIC_CHAIRS_{variable}=" in provision


FAKE_SSM = """#!/bin/sh
echo call >> "$FAKE_SSM_LOG"
echo "args: $*" >> "$FAKE_SSM_LOG"
env | grep '^AWS_' >> "$FAKE_SSM_LOG"
calls=$(grep -c '^call$' "$FAKE_SSM_LOG")
case "$FAKE_SSM_MODE" in
  ok) echo "GOCSPX-test-secret";;
  missing) echo "An error occurred (ParameterNotFound) when calling GetParameter" >&2; exit 254;;
  flaky) if [ "$calls" -lt 5 ]; then echo "Could not connect" >&2; exit 255; fi
         echo "GOCSPX-test-secret";;
  down) echo "Could not connect to the endpoint URL" >&2; exit 255;;
esac
"""


def fetch_secret(tmp_path: Path, mode: str, with_key: bool = True):
    key = tmp_path / "app.env"
    if with_key:
        key.write_text("AWS_ACCESS_KEY_ID=AKIDEXAMPLE\nAWS_SECRET_ACCESS_KEY=s3cr3t\n")
    aws = write_executable(tmp_path / "fake-aws", FAKE_SSM)
    log = tmp_path / "ssm.log"
    secret_env = tmp_path / "run" / "google.env"
    secret_env.parent.mkdir(exist_ok=True)
    ambient = {k: v for k, v in os.environ.items() if not k.startswith("AWS_")}
    result = subprocess.run(
        ["bash", str(DEPLOY_DIR / "fetch-secret.sh")],
        env={
            **ambient,
            "MC_APP_ENV": str(key),
            "MC_SECRET_ENV": str(secret_env),
            "MC_AWS": str(aws),
            "MC_FETCH_DELAY": "0",
            "FAKE_SSM_LOG": str(log),
            "FAKE_SSM_MODE": mode,
            "MUSIC_CHAIRS_GOOGLE_SECRET_PARAMETER": "/music-chairs/google-client-secret",
            "MUSIC_CHAIRS_AWS_REGION": "us-west-2",
        },
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    aws_calls = log.read_text().count("call\n") if log.exists() else 0
    return result, secret_env, aws_calls, log


def test_the_secret_fetch_writes_only_the_secret_to_a_private_file(tmp_path: Path) -> None:
    result, secret_env, aws_calls, log = fetch_secret(tmp_path, "ok")

    assert result.returncode == 0, result.stderr
    assert secret_env.read_text() == "MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET=GOCSPX-test-secret\n"
    assert stat.S_IMODE(secret_env.stat().st_mode) == 0o600
    assert aws_calls == 1
    assert "AWS_ACCESS_KEY_ID=AKIDEXAMPLE" in log.read_text()  # the key reached the AWS CLI...
    assert "AKIDEXAMPLE" not in secret_env.read_text()  # ...and nothing else
    assert "GOCSPX" not in result.stdout + result.stderr


def test_each_secret_fetch_is_time_bounded_so_a_hang_cannot_fail_the_start(tmp_path: Path) -> None:
    _, _, _, log = fetch_secret(tmp_path, "ok")
    unit = (DEPLOY_DIR / "music-chairs.service").read_text()

    recorded = log.read_text()
    assert "--cli-connect-timeout 5 --cli-read-timeout 10" in recorded
    assert "AWS_MAX_ATTEMPTS=1" in recorded
    # Five bounded tries (15 s each) plus four 2 s pauses fit inside the start timeout.
    timeout = int(
        next(line for line in unit.splitlines() if line.startswith("TimeoutStartSec=")).split("=")[
            1
        ]
    )
    assert 5 * 15 + 4 * 2 < timeout


def test_the_secret_fetch_retries_a_transient_failure(tmp_path: Path) -> None:
    result, secret_env, aws_calls, _ = fetch_secret(tmp_path, "flaky")

    assert result.returncode == 0
    assert aws_calls == 5
    assert secret_env.exists()


@pytest.mark.parametrize(
    ("mode", "with_key", "expected_calls", "message"),
    [
        ("missing", True, 1, "does not exist"),
        ("down", True, 5, "could not read"),
        ("ok", False, 0, "no key"),
    ],
)
def test_without_the_secret_the_app_still_starts_with_sign_in_unavailable(
    tmp_path: Path, mode: str, with_key: bool, expected_calls: int, message: str
) -> None:
    result, secret_env, aws_calls, _ = fetch_secret(tmp_path, mode, with_key)

    assert result.returncode == 0
    assert not secret_env.exists()
    assert aws_calls == expected_calls
    assert "Google sign-in unavailable" in result.stderr and message in result.stderr


def local_site(status: int, location: str = ""):
    """A loopback server answering every GET with `status` (and `Location`)."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self.send_response(status)
            if location:
                self.send_header("Location", location)
            self.end_headers()

        def log_message(self, *args: object) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


@pytest.mark.parametrize(
    ("status", "location", "expected"),
    [
        (302, "https://accounts.google.com/o/oauth2/v2/auth?x=1", "available"),
        (503, "", "unavailable"),
        (302, "/", None),
        (200, "", None),
    ],
)
def test_the_smoke_reports_sign_in_only_for_a_redirect_to_google_or_its_503(
    status: int, location: str, expected: str | None
) -> None:
    loader = SourceFileLoader("deploy_cli", str(DEPLOY))
    spec = importlib.util.spec_from_loader("deploy_cli", loader)
    assert spec is not None
    deploy = importlib.util.module_from_spec(spec)
    loader.exec_module(deploy)
    server = local_site(status, location)
    origin = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        if expected is None:
            with pytest.raises(deploy.DeployError, match="GET /auth/google"):
                deploy.google_sign_in(origin)
        else:
            assert deploy.google_sign_in(origin) == expected
    finally:
        server.shutdown()


def test_the_alerts_stack_checks_http_health_and_budgets_as_decided() -> None:
    alerts = template("alerts.yaml")
    resources = alerts["Resources"]

    assert alerts["Parameters"]["AlertEmail"]["NoEcho"] is True
    check = resources["HealthCheck"]["Properties"]["HealthCheckConfig"]
    assert (check["Type"], check["Port"], check["ResourcePath"]) == ("HTTP", 80, "/healthz")
    notifications = resources["MonthlyBudget"]["Properties"]["NotificationsWithSubscribers"]
    assert sorted(
        (n["Notification"]["NotificationType"], n["Notification"]["Threshold"])
        for n in notifications
    ) == [("ACTUAL", 100), ("FORECASTED", 95)]
    assert CONFIG["monthlyBudgetUsd"] == 10
    assert "@" not in (DEPLOY_DIR / "config.json").read_text()


def test_the_server_scripts_parse() -> None:
    for script in sorted(DEPLOY_DIR.glob("*.sh")):
        result = subprocess.run(["bash", "-n", str(script)], capture_output=True, text=True)
        assert result.returncode == 0, f"{script.name}: {result.stderr}"


def install_release_world(tmp_path: Path, healthy: bool) -> dict:
    root = tmp_path / "opt"
    data = tmp_path / "data"
    (root / "releases").mkdir(parents=True)
    data.mkdir()
    (data / "music-chairs.sqlite").write_text("data before release")
    archive = tmp_path / "release.tgz"
    with tarfile.open(archive, "w:gz") as tar:
        source = tmp_path / "release-source"
        source.mkdir()
        (source / "package.json").write_text("{}")
        tar.add(source / "package.json", arcname="package.json")
    bin_dir = tmp_path / "fake-bin"
    bin_dir.mkdir()
    # Starting a release other than "previous" migrates the database, as a new
    # release carrying a migration would; starting "previous" leaves it alone.
    systemctl = write_executable(
        bin_dir / "systemctl",
        f'#!/bin/sh\necho "$@" >> {tmp_path}/systemctl.log\n'
        f'release=$(basename "$(readlink {root}/current)")\n'
        f'if [ "$1" = start ] && [ "$release" != previous ]; then\n'
        f"  echo migrated >> {data}/music-chairs.sqlite\nfi\nexit 0\n",
    )
    curl = write_executable(bin_dir / "curl", f"#!/bin/sh\nexit {0 if healthy else 7}\n")
    sqlite3 = write_executable(
        bin_dir / "sqlite3",
        '#!/bin/sh\ntarget=$(echo "$2" | sed "s/^.backup \'//; s/\'$//")\ncp "$1" "$target"\n',
    )
    return {
        "root": root,
        "data": data,
        "archive": archive,
        "env": {
            **os.environ,
            "MC_ROOT": str(root),
            "MC_DATA": str(data),
            "MC_SYSTEMCTL": str(systemctl),
            "MC_CURL": str(curl),
            "MC_SQLITE3": str(sqlite3),
            "MC_PNPM": "true",
            "MC_HEALTH_TRIES": "2",
            "MC_HEALTH_DELAY": "0",
        },
    }


def install(world: dict, name: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(DEPLOY_DIR / "install-release.sh"), str(world["archive"]), name],
        env=world["env"],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_a_release_that_fails_its_health_check_restores_the_data_and_the_previous_release(
    tmp_path: Path,
) -> None:
    world = install_release_world(tmp_path, healthy=False)
    previous = world["root"] / "releases" / "previous"
    previous.mkdir()
    (world["root"] / "current").symlink_to(previous)

    result = install(world, "broken")

    assert result.returncode == 1
    assert "rolling back" in result.stderr
    assert os.readlink(world["root"] / "current") == str(previous)
    assert (world["data"] / "music-chairs.sqlite").read_text() == "data before release"


def test_a_healthy_release_becomes_current_and_only_three_releases_are_kept(
    tmp_path: Path,
) -> None:
    world = install_release_world(tmp_path, healthy=True)
    releases = world["root"] / "releases"
    for age, name in enumerate(["r1", "r2", "r3", "r4"]):
        (releases / name).mkdir()
        os.utime(releases / name, (1_000_000 + age, 1_000_000 + age))
    (world["root"] / "current").symlink_to(releases / "r4")

    result = install(world, "r5")

    assert result.returncode == 0, result.stderr
    assert os.readlink(world["root"] / "current") == str(releases / "r5")
    assert sorted(path.name for path in releases.iterdir()) == ["r3", "r4", "r5"]
    assert (releases / "r5" / "package.json").exists()


def test_reinstalling_an_existing_release_name_changes_nothing(tmp_path: Path) -> None:
    world = install_release_world(tmp_path, healthy=True)
    serving = world["root"] / "releases" / "r1"
    serving.mkdir()
    (serving / "server.js").write_text("serving")
    (world["root"] / "current").symlink_to(serving)

    result = install(world, "r1")

    assert result.returncode == 1
    assert "already exists" in result.stderr
    assert (serving / "server.js").read_text() == "serving"
    assert not (tmp_path / "systemctl.log").exists()
