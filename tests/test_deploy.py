"""Hermetic tests for the deploy command and its server scripts (no AWS, no network).

`bin/deploy` reaches AWS, Terraform and the server only through the commands
named by MUSIC_CHAIRS_AWS, TOOLCHAIN_TERRAFORM (read by bin/terraform) and
MUSIC_CHAIRS_SSH, so these tests replace all three with scripted fakes that
record every call. The Terraform configuration itself is read with python-hcl2.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import stat
import subprocess
import sys
import tarfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.machinery import SourceFileLoader
from pathlib import Path

import hcl2
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


# A fake Terraform: records each call with the environment bin/deploy gives it,
# writes the saved plan file, and answers `show -json` and `output -json` from
# FAKE_TF_RULES (Terraform's JSON plan and output formats).
FAKE_TERRAFORM = """#!{python}
import json, os, sys
argv = sys.argv[1:]
keys = ("TF_DATA_DIR", "AWS_PROFILE", "TF_INPUT", "TF_IN_AUTOMATION")
with open(os.environ["FAKE_TF_LOG"], "a") as log:
    log.write(json.dumps({{"argv": argv, "env": {{k: os.environ.get(k) for k in keys}}}}) + "\\n")
rules = json.load(open(os.environ["FAKE_TF_RULES"]))
command = next(a for a in argv if not a.startswith("-"))
if command == "plan":
    with open(argv[argv.index("-out") + 1], "w") as plan:
        plan.write("saved plan")
elif command == "show":
    sys.stdout.write(json.dumps(rules["plan"]))
elif command == "output":
    sys.stdout.write(json.dumps(rules["outputs"]))
sys.exit(rules.get("exit", {{}}).get(command, 0))
"""

NO_CHANGES = {"resource_changes": []}
OUTPUTS = {
    "static_ip_address": {"value": "203.0.113.7"},
    "backup_bucket_name": {"value": "bucket"},
    "backup_user_name": {"value": "backup-user"},
    "app_user_name": {"value": "app-user"},
}
STATE_BUCKET_EXISTS = {"match": ["s3api", "head-bucket"], "stdout": {}}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")


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
    terraform = write_executable(
        tmp_path / "terraform", FAKE_TERRAFORM.format(python=sys.executable)
    )
    tf_rules_file = tmp_path / "terraform-rules.json"

    def run(
        *args: str,
        account: str = ACCOUNT,
        rules: list | None = None,
        env: dict | None = None,
        terraform_rules: dict | None = None,
    ):
        all_rules = [
            {"match": ["sts", "get-caller-identity"], "stdout": {"Account": account}},
            *(rules or []),
        ]
        rules_file.write_text(json.dumps(all_rules))
        tf_rules_file.write_text(
            json.dumps({"plan": NO_CHANGES, "outputs": OUTPUTS, **(terraform_rules or {})})
        )
        # The operator's own alert address must never leak into a test run.
        ambient = {k: v for k, v in os.environ.items() if k != "MUSIC_CHAIRS_ALERT_EMAIL"}
        environment = {
            **ambient,
            "HOME": str(home),
            "MUSIC_CHAIRS_AWS": str(aws),
            "MUSIC_CHAIRS_SSH": str(ssh),
            "TOOLCHAIN_TERRAFORM": str(terraform),
            "FAKE_LOG": str(log),
            "FAKE_RULES": str(rules_file),
            "FAKE_TF_LOG": str(tmp_path / "terraform.log"),
            "FAKE_TF_RULES": str(tf_rules_file),
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


def terraform_calls(tmp_path: Path) -> list[dict]:
    log = tmp_path / "terraform.log"
    return [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []


def test_dry_run_confirms_the_account_then_lists_every_step_in_order(fakes) -> None:
    run, log, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")

    result = run(
        "all",
        "--dry-run",
        rules=[STATE_BUCKET_EXISTS],
        env={"MUSIC_CHAIRS_ALERT_EMAIL": "someone@example.test"},
    )

    assert result.returncode == 0, result.stderr
    steps = [line for line in result.stdout.splitlines() if line.startswith("would ")]
    assert [step.split(" ")[1:3] for step in steps] == [
        ["ensure", "the"],
        ["ensure", "Lightsail"],
        ["apply", "the"],
        ["read", "the"],
        ["upload", "project/deploy"],
        ["install", "the"],
        ["build", "the"],
        ["check", "the"],
        ["run", "the"],
    ]
    assert "plan: no changes" in result.stdout
    assert "someone@example.test" not in result.stdout + result.stderr
    assert [call[:2] for call in calls(log)] == [
        ["sts", "get-caller-identity"],
        ["s3api", "head-bucket"],
    ]
    # A dry run plans but never applies.
    commands = [
        next(a for a in c["argv"] if not a.startswith("-")) for c in terraform_calls(tmp_path)
    ]
    assert commands == ["init", "plan", "show"]


def test_tool_overrides_must_be_absolute_paths(fakes) -> None:
    run, log, _, _ = fakes

    result = run("smoke", "--dry-run", env={"MUSIC_CHAIRS_AWS": "aws"})

    assert result.returncode == 1
    assert "MUSIC_CHAIRS_AWS must be an absolute path" in result.stderr
    assert calls(log) == []


def plan_changing(address: str, actions: list[str]) -> dict:
    """A plan in Terraform's JSON format with one resource change."""
    kind, name = address.split(".")
    return {
        "format_version": "1.2",
        "resource_changes": [
            {
                "address": address,
                "type": kind,
                "name": name,
                "change": {"actions": actions},
            }
        ],
    }


def test_a_plan_that_would_destroy_replace_or_forget_a_protected_resource_is_refused(
    fakes,
) -> None:
    run, _, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    rules = [{"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {}}}]
    cases = [
        ("aws_lightsail_instance.app", ["delete", "create"]),
        ("aws_lightsail_static_ip.app", ["create", "delete"]),
        ("aws_s3_bucket.backups", ["delete"]),
        ("aws_s3_bucket_versioning.backups", ["delete"]),
        ("aws_iam_user.app", ["forget"]),
        ("aws_route53_record.google_verification", ["delete"]),
    ]

    for address, actions in cases:
        (tmp_path / "terraform.log").unlink(missing_ok=True)
        result = run(
            "infra",
            rules=rules,
            terraform_rules={"plan": plan_changing(address, actions)},
        )

        assert result.returncode == 1, address
        assert f"would replace, remove or forget {address}" in result.stderr
        assert "apply" not in [c["argv"][1] for c in terraform_calls(tmp_path)], address

    # An unprotected resource may be replaced, and the plan is then applied.
    result = run(
        "infra",
        rules=rules,
        terraform_rules={
            "plan": plan_changing("aws_route53_health_check.app", ["delete", "create"])
        },
    )
    assert result.returncode == 0, result.stderr
    assert "plan: 1 to add, 0 to change, 1 to destroy" in result.stdout


def test_a_clean_plan_is_applied_from_its_saved_file_without_prompts_or_files_in_the_tree(
    fakes,
) -> None:
    run, _, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    rules = [{"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {}}}]

    result = run(
        "infra",
        rules=rules,
        terraform_rules={"plan": plan_changing("aws_sns_topic_subscription.alerts", ["create"])},
    )

    assert result.returncode == 0, result.stderr
    assert "plan: 1 to add, 0 to change, 0 to destroy" in result.stdout
    recorded = terraform_calls(tmp_path)
    by_command = {next(a for a in c["argv"] if not a.startswith("-")): c for c in recorded}
    assert list(by_command) == ["init", "plan", "show", "apply"]
    for call in recorded:
        assert call["argv"][0] == f"-chdir={ROOT / 'project' / 'deploy' / 'terraform'}"
        assert call["env"]["AWS_PROFILE"] == "music-chairs"
        assert call["env"]["TF_INPUT"] == "0"
        assert not call["env"]["TF_DATA_DIR"].startswith(str(ROOT))
    init = by_command["init"]["argv"]
    assert "-input=false" in init and "-lockfile=readonly" in init
    assert f"-backend-config=bucket={CONFIG['stateBucket']}" in init
    plan_file = by_command["plan"]["argv"][by_command["plan"]["argv"].index("-out") + 1]
    assert not plan_file.startswith(str(ROOT))
    assert by_command["apply"]["argv"][-1] == plan_file
    assert "-input=false" in by_command["plan"]["argv"] + by_command["apply"]["argv"]
    # The saved plan (which can hold the alert email) is gone afterwards.
    assert not Path(plan_file).exists()


def test_bootstrap_creates_only_what_is_missing_and_needs_the_email_once(fakes) -> None:
    run, log, _, _ = fakes
    missing_bucket = {
        "match": ["s3api", "head-bucket"],
        "returncode": 254,
        "stderr": "(404) Not Found",
    }
    missing_parameter = {
        "match": ["ssm", "get-parameter"],
        "returncode": 254,
        "stderr": "An error occurred (ParameterNotFound)",
    }
    created = [
        {"match": ["s3api"], "stdout": {}},
        {"match": ["ssm", "put-parameter"], "stdout": {}},
    ]

    refused = run("bootstrap", rules=[missing_bucket, missing_parameter, *created])
    assert refused.returncode == 1
    assert "set MUSIC_CHAIRS_ALERT_EMAIL once" in refused.stderr
    assert not any(call[:2] == ["ssm", "put-parameter"] for call in calls(log))

    log.unlink()
    present = run(
        "bootstrap",
        rules=[
            STATE_BUCKET_EXISTS,
            {"match": ["s3api"], "stdout": {}},
            {"match": ["ssm", "get-parameter"], "stdout": {}},
        ],
    )
    assert present.returncode == 0, present.stderr
    # An existing bucket is never recreated, but its protections are re-applied.
    assert [call[:2] for call in calls(log)] == [
        ["sts", "get-caller-identity"],
        ["s3api", "head-bucket"],
        ["s3api", "put-public-access-block"],
        ["s3api", "put-bucket-ownership-controls"],
        ["s3api", "put-bucket-encryption"],
        ["s3api", "put-bucket-versioning"],
        ["ssm", "get-parameter"],
    ]

    log.unlink()
    made = run(
        "bootstrap",
        rules=[missing_bucket, missing_parameter, *created],
        env={"MUSIC_CHAIRS_ALERT_EMAIL": "someone@example.test"},
    )
    assert made.returncode == 0, made.stderr
    bucket_calls = {call[1]: call for call in calls(log) if call[0] == "s3api"}
    assert list(bucket_calls) == [
        "head-bucket",
        "create-bucket",
        "put-public-access-block",
        "put-bucket-ownership-controls",
        "put-bucket-encryption",
        "put-bucket-versioning",
    ]
    settings = {
        "put-public-access-block": (
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,"
            "RestrictPublicBuckets=true"
        ),
        "put-bucket-ownership-controls": "Rules=[{ObjectOwnership=BucketOwnerEnforced}]",
        "put-bucket-encryption": (
            "Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256}}]"
        ),
        "put-bucket-versioning": "Status=Enabled",
    }
    for command, value in settings.items():
        assert bucket_calls[command][5] == value, command


def test_the_alert_email_reaches_aws_only_through_a_private_file(fakes) -> None:
    run, log, _, tmp_path = fakes
    email = "someone@example.test"
    seen = tmp_path / "request.log"
    # Records the request file's contents and permissions while the call runs.
    aws = write_executable(
        tmp_path / "aws-file",
        FAKE_AWS.format(python=sys.executable).replace(
            "argv = sys.argv[1:]",
            "argv = sys.argv[1:]\n"
            "if '--cli-input-json' in argv:\n"
            "    path = argv[argv.index('--cli-input-json') + 1].removeprefix('file://')\n"
            f"    open({str(seen)!r}, 'w').write(json.dumps({{'path': path, "
            "'mode': oct(os.stat(path).st_mode & 0o777), 'body': json.load(open(path))}))",
        ),
    )
    rules = [
        STATE_BUCKET_EXISTS,
        {"match": ["s3api"], "stdout": {}},
        {
            "match": ["ssm", "get-parameter"],
            "returncode": 254,
            "stderr": "ParameterNotFound",
        },
        {"match": ["ssm", "put-parameter"], "stdout": {}},
    ]

    result = run(
        "bootstrap",
        rules=rules,
        env={"MUSIC_CHAIRS_ALERT_EMAIL": email, "MUSIC_CHAIRS_AWS": str(aws)},
    )

    assert result.returncode == 0, result.stderr
    assert email not in result.stdout + result.stderr
    assert not any(email in token for call in calls(log) for token in call)
    request = json.loads(seen.read_text())
    assert request["body"] == {
        "Name": "/music-chairs/alert-email",
        "Type": "SecureString",
        "Value": email,
    }
    assert request["mode"] == "0o600"
    assert not request["path"].startswith(str(ROOT))
    assert not Path(request["path"]).exists()


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


RELEASE_RULES = [
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


def test_the_release_reads_terraform_outputs_and_uploads_no_terraform_files(
    fakes,
) -> None:
    run, _, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    bundle = tmp_path / "bundle.tgz"
    # Keeps the uploaded deploy bundle, then stops the release at provisioning.
    ssh = scripted_ssh(
        tmp_path,
        f"  *'tar -xzf -'*) cat > {bundle};;\n  *provision.sh*) echo stopped here >&2; exit 1;;",
    )

    result = run("release", rules=RELEASE_RULES, env={"MUSIC_CHAIRS_SSH": str(ssh)})

    assert result.returncode == 1
    assert "stopped here" in result.stderr
    remote = (tmp_path / "remote.log").read_text()
    assert "BUCKET=bucket" in remote
    assert f"SSH_USER={CONFIG['sshUser']}" in remote
    with tarfile.open(bundle) as tar:
        names = tar.getnames()
    assert "provision.sh" in names and "config.json" in names
    assert "install-deploy-keys.sh" in names and "deploy-keys.pub" in names
    assert not any(name.startswith("terraform") for name in names)
    outputs = [c for c in terraform_calls(tmp_path) if "output" in c["argv"]]
    assert outputs and outputs[0]["argv"][-2:] == ["output", "-json"]


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


TERRAFORM_DIR = DEPLOY_DIR / "terraform"


def unquote(value):
    """python-hcl2 keeps HCL's quotes on strings and keys; this strips them, recursively."""
    if isinstance(value, str):
        return value[1:-1] if len(value) >= 2 and value[0] == value[-1] == '"' else value
    if isinstance(value, list):
        return [unquote(item) for item in value]
    if isinstance(value, dict):
        return {unquote(k): unquote(v) for k, v in value.items() if k != "__is_block__"}
    return value


def terraform_blocks() -> dict:
    """Every resource ("type.name"), data source ("data.type.name") and terraform block."""
    found: dict = {"terraform": []}
    for path in sorted(TERRAFORM_DIR.glob("*.tf")):
        parsed = unquote(hcl2.load(path.open()))
        for block in parsed.get("resource", []):
            for kind, named in block.items():
                for name, body in named.items():
                    found[f"{kind}.{name}"] = body
        for block in parsed.get("data", []):
            for kind, named in block.items():
                for name, body in named.items():
                    found[f"data.{kind}.{name}"] = body
        found["terraform"].extend(parsed.get("terraform", []))
    return found


def policy(name: str, **values: str) -> dict:
    """A policy template rendered the way Terraform's templatefile fills ${...}."""
    text = (TERRAFORM_DIR / "policies" / name).read_text()
    for key, value in values.items():
        text = text.replace("${" + key + "}", value)
    return json.loads(text)


def test_the_configuration_protects_live_data_and_keeps_backups_private_for_30_days() -> None:
    blocks = terraform_blocks()

    for address in (
        "aws_lightsail_instance.app",
        "aws_lightsail_static_ip.app",
        "aws_lightsail_static_ip_attachment.app",
        "aws_s3_bucket.backups",
    ):
        assert blocks[address]["lifecycle"][0]["prevent_destroy"] is True, address
    assert blocks["aws_lightsail_instance.app"]["lifecycle"][0]["ignore_changes"] == [
        "blueprint_id",
        "user_data",
    ]
    ports = blocks["aws_lightsail_instance_public_ports.app"]["dynamic"][0]["port_info"]
    assert ports["for_each"] == [22, 80, 443]
    assert ports["content"][0]["cidrs"] == ["0.0.0.0/0"]
    keep, markers = blocks["aws_s3_bucket_lifecycle_configuration.backups"]["rule"]
    assert keep["expiration"][0]["days"] == 30
    assert keep["noncurrent_version_expiration"][0]["noncurrent_days"] == 7
    assert markers["expiration"][0]["expired_object_delete_marker"] is True
    versioning = blocks["aws_s3_bucket_versioning.backups"]["versioning_configuration"][0]
    assert versioning["status"] == "Enabled"
    public = blocks["aws_s3_bucket_public_access_block.backups"]
    assert all(public[key] is True for key in public if key != "bucket")
    encryption = blocks["aws_s3_bucket_server_side_encryption_configuration.backups"]["rule"][0]
    assert encryption["apply_server_side_encryption_by_default"][0]["sse_algorithm"] == "AES256"
    ownership = blocks["aws_s3_bucket_ownership_controls.backups"]["rule"][0]
    assert ownership["object_ownership"] == "BucketOwnerEnforced"
    statement = policy("put-backups.json.tftpl", bucket_arn="arn:aws:s3:::b")["Statement"]
    assert statement == [
        {
            "Effect": "Allow",
            "Action": "s3:PutObject",
            "Resource": "arn:aws:s3:::b/backups/*",
        }
    ]
    assert CONFIG["bundleId"] == "micro_3_0"
    # Lightsail names are unique across its resource types: an instance named like
    # the key pair fails to create.
    instance = CONFIG["instanceName"]
    assert len({instance, instance + "-ip", CONFIG["keyPairName"]}) == 3


def test_the_app_key_may_read_only_the_google_secret_parameter() -> None:
    blocks = terraform_blocks()
    statements = policy(
        "read-google-secret.json.tftpl",
        parameter_arn="arn:aws:ssm:r:1:parameter/p",
        region="r",
    )["Statement"]

    assert [entry["Action"] for entry in statements] == [
        "ssm:GetParameter",
        "kms:Decrypt",
    ]
    assert statements[0]["Resource"] == "arn:aws:ssm:r:1:parameter/p"
    assert statements[1]["Condition"] == {"StringEquals": {"kms:ViaService": "ssm.r.amazonaws.com"}}
    arn = blocks["aws_iam_user_policy.app"]["policy"]
    assert "parameter${local.config.googleSecretParameter}" in arn
    assert CONFIG["googleSecretParameter"] == "/music-chairs/google-client-secret"
    assert CONFIG["googleClientId"].endswith(".apps.googleusercontent.com")


def test_the_alerts_check_http_health_and_budgets_as_decided() -> None:
    blocks = terraform_blocks()

    check = blocks["aws_route53_health_check.app"]
    assert (check["type"], check["port"], check["resource_path"]) == (
        "HTTP",
        80,
        "/healthz",
    )
    assert (check["request_interval"], check["failure_threshold"]) == (30, 3)
    alarm = blocks["aws_cloudwatch_metric_alarm.outage"]
    assert (
        alarm["metric_name"],
        alarm["comparison_operator"],
        alarm["treat_missing_data"],
    ) == (
        "HealthCheckStatus",
        "LessThanThreshold",
        "breaching",
    )
    assert (alarm["statistic"], alarm["period"], alarm["evaluation_periods"]) == (
        "Minimum",
        60,
        2,
    )
    assert alarm["threshold"] == 1
    assert alarm["dimensions"] == {"HealthCheckId": "${aws_route53_health_check.app.id}"}
    topic = "${aws_sns_topic.alerts.arn}"
    assert alarm["alarm_actions"] == [topic] and alarm["ok_actions"] == [topic]
    budget = blocks["aws_budgets_budget.monthly"]
    assert budget["limit_amount"] == "${tostring(local.config.monthlyBudgetUsd)}"
    notifications = blocks["aws_budgets_budget.monthly"]["notification"]
    assert sorted((n["notification_type"], n["threshold"]) for n in notifications) == [
        ("ACTUAL", 100),
        ("FORECASTED", 95),
    ]
    assert CONFIG["monthlyBudgetUsd"] == 10
    # The address comes only from Parameter Store, never from the repository.
    email = "${data.aws_ssm_parameter.alert_email.value}"
    assert blocks["aws_sns_topic_subscription.alerts"]["endpoint"] == email
    assert all(n["subscriber_email_addresses"] == [email] for n in notifications)
    assert blocks["data.aws_ssm_parameter.alert_email"]["with_decryption"] is True
    for path in [DEPLOY_DIR / "config.json", *TERRAFORM_DIR.rglob("*.tf*")]:
        # No email address; GitHub's subject (name@id) has no domain after the @.
        assert not EMAIL.search(path.read_text()), path


def test_terraform_owns_exactly_the_google_verification_values_and_locks_its_state() -> None:
    blocks = terraform_blocks()

    record = blocks["aws_route53_record.google_verification"]
    assert (record["name"], record["type"]) == ("dalan.dev", "TXT")
    assert record["records"] == "${local.config.googleSiteVerification}"
    assert len(CONFIG["googleSiteVerification"]) == 2
    assert all(v.startswith("google-site-verification=") for v in CONFIG["googleSiteVerification"])
    backend = next(b["backend"] for b in blocks["terraform"] if "backend" in b)[0]["s3"]
    assert backend == {"encrypt": True, "use_lockfile": True}


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


def test_the_secret_fetch_writes_only_the_secret_to_a_private_file(
    tmp_path: Path,
) -> None:
    result, secret_env, aws_calls, log = fetch_secret(tmp_path, "ok")

    assert result.returncode == 0, result.stderr
    assert secret_env.read_text() == "MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET=GOCSPX-test-secret\n"
    assert stat.S_IMODE(secret_env.stat().st_mode) == 0o600
    assert aws_calls == 1
    assert "AWS_ACCESS_KEY_ID=AKIDEXAMPLE" in log.read_text()  # the key reached the AWS CLI...
    assert "AKIDEXAMPLE" not in secret_env.read_text()  # ...and nothing else
    assert "GOCSPX" not in result.stdout + result.stderr


def test_each_secret_fetch_is_time_bounded_so_a_hang_cannot_fail_the_start(
    tmp_path: Path,
) -> None:
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


# -- GitHub's CI/CD (plan/phase-18.md) ------------------------------------------

WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
ALERT_ARN = "arn:aws:ssm:r:1:parameter/music-chairs/alert-email"
GOOGLE_ARN = "arn:aws:ssm:r:1:parameter/music-chairs/google-client-secret"


def deploy_role_policy() -> list[dict]:
    return policy(
        "github-deploy.json.tftpl",
        state_bucket_arn="arn:aws:s3:::state",
        backup_bucket_arn="arn:aws:s3:::backups",
        parameter_prefix="arn:aws:ssm:r:1:parameter",
        google_secret_arn=GOOGLE_ARN,
        alert_email_arn=ALERT_ARN,
        region="r",
    )["Statement"]


def test_the_deploy_role_trusts_only_pushes_to_main_of_this_repository() -> None:
    blocks = terraform_blocks()
    role = blocks["aws_iam_role.github_deploy"]
    provider = blocks["aws_iam_openid_connect_provider.github"]
    [statement] = policy(
        "github-trust.json.tftpl",
        provider_arn="arn:aws:iam::1:oidc-provider/x",
        subject="S",
    )["Statement"]

    assert provider["url"] == "https://token.actions.githubusercontent.com"
    assert provider["client_id_list"] == ["sts.amazonaws.com"]
    assert statement["Action"] == "sts:AssumeRoleWithWebIdentity"
    assert statement["Principal"] == {"Federated": "arn:aws:iam::1:oidc-provider/x"}
    assert statement["Condition"] == {
        "StringEquals": {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": "S",
        }
    }
    assert "github-trust.json.tftpl" in role["assume_role_policy"]
    assert role["max_session_duration"] == 3600
    # GitHub's immutable subject: owner and repository, each with its numeric id.
    assert CONFIG["githubOidcRepository"] == "leifdalan@571833/music-chairs@1402125894"
    assert (
        '"repo:${local.config.githubOidcRepository}:ref:refs/heads/main"'
        in (TERRAFORM_DIR / "github.tf").read_text()
    )


def test_the_deploy_role_reads_but_never_backups_or_secrets_and_writes_only_state(
    fakes,
) -> None:
    run, log, _, _ = fakes
    blocks = terraform_blocks()
    statements = {entry["Sid"]: entry for entry in deploy_role_policy()}

    attached = blocks["aws_iam_role_policy_attachment.github_deploy_read"]
    assert attached["policy_arn"] == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    assert statements["NoBackups"] == {
        "Sid": "NoBackups",
        "Effect": "Deny",
        "Action": "s3:GetObject*",
        "Resource": "arn:aws:s3:::backups/*",
    }
    assert statements["NoGoogleSecret"]["Effect"] == "Deny"
    assert statements["NoGoogleSecret"]["Resource"] == GOOGLE_ARN
    assert statements["NoParameterPaths"]["Effect"] == "Deny"
    assert statements["NoParameterPaths"]["Action"] == "ssm:GetParametersByPath"
    assert statements["NoParameterPaths"]["Resource"] == [
        "arn:aws:ssm:r:1:parameter/",
        "arn:aws:ssm:r:1:parameter/music-chairs",
    ]
    assert statements["TerraformState"]["Resource"] == [
        "arn:aws:s3:::state/music-chairs.tfstate",
        "arn:aws:s3:::state/music-chairs.tfstate.tflock",
    ]
    assert statements["AlertEmail"]["Condition"] == {
        "StringEquals": {
            "kms:ViaService": "ssm.r.amazonaws.com",
            "kms:EncryptionContext:PARAMETER_ARN": ALERT_ARN,
        }
    }
    allowed = [entry for entry in statements.values() if entry["Effect"] == "Allow"]
    # Exactly these allows: any widening of the role's writes fails here.
    assert {entry["Sid"]: entry["Action"] for entry in allowed} == {
        "TerraformState": ["s3:PutObject", "s3:DeleteObject"],
        "StateBucketSettings": statements["StateBucketSettings"]["Action"],
        "AlertEmail": "kms:Decrypt",
        # Not in ReadOnlyAccess, which lists Lightsail's reads one by one; bin/deploy
        # pins the server's host key with it.
        "HostKeys": "lightsail:GetInstanceAccessDetails",
    }
    assert len(statements["StateBucketSettings"]["Action"]) == 4
    actions = [
        action
        for entry in allowed
        for action in (entry["Action"] if isinstance(entry["Action"], list) else [entry["Action"]])
    ]
    assert not any(action.startswith(("iam:", "sts:")) for action in actions)

    # The bucket settings it may write are exactly those bootstrap re-applies.
    present = run(
        "bootstrap",
        rules=[
            STATE_BUCKET_EXISTS,
            {"match": ["s3api"], "stdout": {}},
            {"match": ["ssm", "get-parameter"], "stdout": {}},
        ],
    )
    assert present.returncode == 0, present.stderr
    iam_names = {
        "put-public-access-block": "s3:PutBucketPublicAccessBlock",
        "put-bucket-ownership-controls": "s3:PutBucketOwnershipControls",
        "put-bucket-encryption": "s3:PutEncryptionConfiguration",
        "put-bucket-versioning": "s3:PutBucketVersioning",
    }
    recorded = {call[1] for call in calls(log) if call[0] == "s3api" and call[1].startswith("put-")}
    assert recorded <= set(iam_names), recorded
    assert sorted(statements["StateBucketSettings"]["Action"]) == sorted(
        iam_names[name] for name in recorded
    )
    assert statements["StateBucketSettings"]["Resource"] == "arn:aws:s3:::state"


def test_with_refuse_infra_changes_any_plan_change_stops_before_apply(fakes) -> None:
    run, _, home, tmp_path = fakes
    (home / ".ssh" / "music-chairs-lightsail").write_text("key")
    rules = [{"match": ["lightsail", "get-key-pair"], "stdout": {"keyPair": {}}}]

    for actions in (["create"], ["update"], ["delete"], ["forget"]):
        (tmp_path / "terraform.log").unlink(missing_ok=True)
        result = run(
            "infra",
            "--refuse-infra-changes",
            rules=rules,
            terraform_rules={"plan": plan_changing("aws_route53_health_check.app", actions)},
        )
        assert result.returncode == 1, actions
        assert "infrastructure changes are applied by hand before merging" in result.stderr
        assert "apply" not in [c["argv"][1] for c in terraform_calls(tmp_path)], actions

    (tmp_path / "terraform.log").unlink(missing_ok=True)
    unchanged = run("infra", "--refuse-infra-changes", rules=rules)
    assert unchanged.returncode == 0, unchanged.stderr
    assert "plan: no changes" in unchanged.stdout
    assert "apply" in [c["argv"][1] for c in terraform_calls(tmp_path)]


def install_deploy_keys(
    tmp_path: Path, authorized: str | None, keys: str
) -> subprocess.CompletedProcess[str]:
    target = tmp_path / "ssh" / "authorized_keys"
    target.parent.mkdir(exist_ok=True)
    if authorized is not None:
        target.write_text(authorized)
    (tmp_path / "keys.pub").write_text(keys)
    return subprocess.run(
        [
            "bash",
            str(DEPLOY_DIR / "install-deploy-keys.sh"),
            str(tmp_path / "keys.pub"),
            str(target),
            "nobody",
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def test_deploy_keys_are_one_managed_block_beside_the_operators_key(
    tmp_path: Path,
) -> None:
    target = tmp_path / "ssh" / "authorized_keys"
    operator = "ssh-ed25519 AAAAoperator lightsail"
    block = "# BEGIN music-chairs deploy keys\n{}\n# END music-chairs deploy keys\n"

    # Added beside a last line that has no newline, with comments and blanks skipped.
    added = install_deploy_keys(tmp_path, operator, "# note\n\nssh-ed25519 AAAAone ci\n")
    assert added.returncode == 0, added.stderr
    assert target.read_text() == operator + "\n" + block.format("ssh-ed25519 AAAAone ci")
    assert stat.S_IMODE(target.stat().st_mode) == 0o600

    # Replaced, not appended to, and every other line is kept.
    target.write_text(target.read_text() + "ssh-rsa AAAAlater other\n")
    replaced = install_deploy_keys(tmp_path, None, "ssh-ed25519 AAAAtwo ci\n")
    assert replaced.returncode == 0, replaced.stderr
    assert target.read_text() == (
        operator + "\nssh-rsa AAAAlater other\n" + block.format("ssh-ed25519 AAAAtwo ci")
    )

    # An empty list removes the block.
    removed = install_deploy_keys(tmp_path, None, "# no keys\n")
    assert removed.returncode == 0, removed.stderr
    assert target.read_text() == operator + "\nssh-rsa AAAAlater other\n"
    assert not list(target.parent.glob(".authorized_keys.*"))


@pytest.mark.parametrize(
    ("authorized", "reason"),
    [
        (None, "missing or empty"),
        ("", "missing or empty"),
        ("# BEGIN music-chairs deploy keys\nssh-ed25519 AAAAold ci\n", "unmatched"),
        ("ssh-ed25519 AAAAop x\n# END music-chairs deploy keys\n", "unmatched"),
        (
            "# BEGIN music-chairs deploy keys\nssh-ed25519 AAAAold ci\n"
            "# END music-chairs deploy keys\n",
            "no key outside the deploy block",
        ),
    ],
    ids=["missing", "empty", "unclosed-block", "stray-end", "only-deploy-keys"],
)
def test_deploy_keys_never_write_a_file_that_could_lock_the_operator_out(
    tmp_path: Path, authorized: str | None, reason: str
) -> None:
    target = tmp_path / "ssh" / "authorized_keys"

    result = install_deploy_keys(tmp_path, authorized, "ssh-ed25519 AAAAnew ci\n")

    assert result.returncode == 1
    assert reason in result.stderr
    assert (target.read_text() if target.exists() else None) == authorized
    assert not list(target.parent.glob(".authorized_keys.*"))


def test_a_missing_keys_file_is_refused_not_read_as_an_empty_list(tmp_path: Path) -> None:
    target = tmp_path / "ssh" / "authorized_keys"
    target.parent.mkdir()
    before = "ssh-ed25519 AAAAop x\n# BEGIN music-chairs deploy keys\nssh-ed25519 AAAAci ci\n"
    before += "# END music-chairs deploy keys\n"
    target.write_text(before)

    result = subprocess.run(
        [
            "bash",
            str(DEPLOY_DIR / "install-deploy-keys.sh"),
            str(tmp_path / "absent.pub"),
            str(target),
            "nobody",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 1
    assert "missing or unreadable" in result.stderr
    assert target.read_text() == before


def test_provisioning_installs_the_committed_deploy_keys_for_the_ssh_user() -> None:
    provision = (DEPLOY_DIR / "provision.sh").read_text().splitlines()
    command = (
        'bash "$here/install-deploy-keys.sh" "$here/deploy-keys.pub" '
        '"/home/$SSH_USER/.ssh/authorized_keys" "$SSH_USER"'
    )
    # A live line, not a comment, after the inputs are checked.
    assert [line for line in provision if line.strip() == command] == [command]
    assert any(line.startswith(": ") and '"${SSH_USER:?}"' in line for line in provision)
    keys = [
        line
        for line in (DEPLOY_DIR / "deploy-keys.pub").read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert all(line.startswith("ssh-ed25519 ") for line in keys)
    assert not any("PRIVATE KEY" in line for line in keys)


def workflow() -> dict:
    loaded = yaml.safe_load(WORKFLOW.read_text())
    # YAML 1.1 reads the bare key `on` as the boolean True.
    loaded["on"] = loaded.pop(True)
    return loaded


def test_the_workflow_checks_every_pull_request_and_deploys_only_main() -> None:
    flow = workflow()
    check, deploy = flow["jobs"]["check"], flow["jobs"]["deploy"]

    assert flow["name"] == "CI/CD"
    assert flow["on"] == {"pull_request": None, "push": {"branches": ["main"]}}
    assert flow["permissions"] == {"contents": "read"}
    assert "permissions" not in check
    assert deploy["permissions"] == {"contents": "read", "id-token": "write"}
    assert deploy["needs"] == "check"
    assert deploy["if"] == "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    assert deploy["concurrency"] == {"group": "deploy", "cancel-in-progress": False}
    assert [step["run"] for step in check["steps"] if "run" in step] == [
        "./bin/setup",
        "./bin/check all",
        "project/scripts/smoke.sh",
    ]
    runs = [step.get("run", "") for step in deploy["steps"]]
    assert "./bin/deploy all --profile music-chairs --refuse-infra-changes" in runs
    cleanup = deploy["steps"][-1]
    assert cleanup["if"] == "always()"
    assert "~/.ssh/music-chairs-lightsail" in cleanup["run"]
    assert "~/.aws/credentials" in cleanup["run"]


def test_the_workflow_pins_its_actions_and_keeps_secrets_out_of_scripts() -> None:
    flow = workflow()
    steps = [step for job in flow["jobs"].values() for step in job["steps"]]

    for step in steps:
        if "uses" in step:
            name, _, ref = step["uses"].partition("@")
            assert len(ref) == 40 and all(c in "0123456789abcdef" for c in ref), step["uses"]
        if name_is(step, "actions/checkout"):
            assert step["with"]["persist-credentials"] is False
        if name_is(step, "actions/setup-node"):
            assert (
                str(step["with"]["node-version"])
                == json.loads((ROOT / "project" / "package.json").read_text())["devEngines"][
                    "runtime"
                ]["version"]
            )
        assert "secrets." not in step.get("run", "")
    keyed = [step for step in steps if "DEPLOY_SSH_KEY" in step.get("env", {})]
    assert len(keyed) == 1
    assert keyed[0]["env"]["DEPLOY_SSH_KEY"] == "${{ secrets.DEPLOY_SSH_KEY }}"
    assert keyed[0]["run"].lstrip().startswith("umask 077")
    assert all("secrets." not in json.dumps(step.get("with", {})) for step in steps)


def name_is(step: dict, action: str) -> bool:
    return step.get("uses", "").split("@")[0] == action


def test_a_tracked_workflow_is_classified_for_candidate_identity(
    tmp_path: Path,
) -> None:
    repo = tmp_path / "repo"
    (repo / ".github" / "workflows").mkdir(parents=True)
    (repo / "candidate-partition.yaml").write_text((ROOT / "candidate-partition.yaml").read_text())
    (repo / ".github" / "workflows" / "ci.yml").write_text("name: x\n")
    for command in (["init", "-q"], ["add", "candidate-partition.yaml", ".github"]):
        subprocess.run(["git", *command], cwd=repo, check=True)

    result = subprocess.run(
        [str(ROOT / "bin" / "check-candidate-partition"), "--root", str(repo)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
