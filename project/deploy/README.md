# Deploying music-chairs

music-chairs runs at **https://rehearse.dalan.dev** on one AWS Lightsail instance in us-west-2 (`micro_3_0`: 1 GB memory, 40 GB disk, $7/month), with HTTPS from Caddy and a nightly database backup to S3. Expected cost is about $8.40/month; a budget alert emails the operator if the forecast passes $9.50 or actual spend passes $10.

Everything is driven by `bin/deploy` from the repository root, using the AWS CLI profile `music-chairs` (account 777460179484). Settings live in `config.json`; the infrastructure is the Terraform configuration in `terraform/`, run with the pinned Terraform (`terraform-release.json`, installed by `./bin/setup`, run through `./bin/terraform`). Nothing secret is stored in the repository.

## Deploying

```sh
./bin/deploy all
```

`all` runs four steps, each available on its own:

- `./bin/deploy bootstrap` — creates what Terraform needs before it can run: the private, versioned, encrypted state bucket `music-chairs-terraform-state-777460179484` and the SecureString `/music-chairs/alert-email`. It creates each only when missing, and re-applies the state bucket's privacy, encryption and versioning settings on every run; the parameter is never changed once it exists.
- `./bin/deploy infra` — plans the Terraform configuration in `terraform/` and applies exactly that plan. us-west-2 holds the instance, its static IP and open ports, the `rehearse.dalan.dev` record, the `dalan.dev` Google verification TXT values, the backup bucket and the two IAM users. us-east-1 holds the HTTP health check, outage alarm, email topic and subscription, and the monthly budget. It prints the plan's summary first, and refuses any plan that would destroy, replace or forget the instance, its address, the backup bucket or its protections, the IAM users and their policies, or the TXT record. Terraform's state is in the state bucket, with S3's lock file stopping two runs at once.

Two settings need care. Changing the open ports replaces the ports resource, and AWS closes every port while it does so, so SSH and the site are unreachable for a moment. And Terraform owns the whole `dalan.dev` TXT record: any TXT value there (another site's verification, SPF) must be listed under `googleSiteVerification` in `config.json`, or the next apply removes it.

- `./bin/deploy release` — uploads this directory and runs `provision.sh` (idempotent server setup: Node at the version `project/package.json` pins, Caddy, the systemd units), installs the backup key if the server has none, builds the app, and installs it with `install-release.sh`. That script copies the database first and, if the new release fails its health check, restores the copy and returns to the previous release.
- `./bin/deploy smoke` — checks the public site without changing data.

Every subcommand first confirms the profile is signed in to account 777460179484 and refuses otherwise. `--dry-run` confirms the account, plans the infrastructure and prints what would change, and lists the remaining steps without running them. `--profile` selects another profile. The monthly budget, like every other setting, lives in `config.json`.

The first `bootstrap` needs the alert address in the environment; it is stored as the parameter above and read by Terraform from then on:

```sh
MUSIC_CHAIRS_ALERT_EMAIL=you@example.com ./bin/deploy bootstrap
```

AWS emails a confirmation link for the alert subscription; click it within 48 hours. SNS deletes an unconfirmed subscription after that, and the next plan then shows one subscription to add.

Terraform's behaviour relied on here is documented by HashiCorp: the S3 backend and its lock file (https://developer.hashicorp.com/terraform/language/backend/s3, as of Terraform 1.16, retrieved 2026-10-04) and the `prevent_destroy` lifecycle setting (https://developer.hashicorp.com/terraform/language/meta-arguments/lifecycle, retrieved 2026-10-04). The AWS provider's resource pages are pinned under `docs/`.

## Secrets

- **SSH key:** `bin/deploy` creates the Lightsail key pair `music-chairs` on first use and saves its private key to `~/.ssh/music-chairs-lightsail` (it cannot be downloaded again). The instance's host key is pinned in `~/.ssh/music-chairs-known-hosts` from Lightsail's own record.
- **Backup key:** created for the backup user and written straight to `/etc/music-chairs/backup.env` on the server; earlier keys of that user are deleted first.
- **Alert email:** only in AWS, as the SecureString `/music-chairs/alert-email`. `bootstrap` writes it through stdin, never on a command line; Terraform's state, in the private state bucket, holds it too.
- **Google client secret:** in AWS Parameter Store as the SecureString `/music-chairs/google-client-secret` (us-west-2). The server reads it with the app user's key, which `bin/deploy` installs root-only at `/etc/music-chairs/app.env`; see Google sign-in below.

SSH (port 22) is open to all addresses on purpose: logins are key-only and the operator's own address changes.

## Google sign-in

The OAuth client (Google Cloud project `music-chairs`) asks only for `openid`, `email` and `profile`. Its client id is in `config.json`; the secret is in Parameter Store. Each time the app starts, `fetch-secret.sh` runs as root (`ExecStartPre=+` in `music-chairs.service`), reads the secret with the `AppUser` key, and writes it to `/run/music-chairs/google.env`, a root-only file systemd passes to the app as `MUSIC_CHAIRS_GOOGLE_CLIENT_SECRET`. The key never reaches the app. If the parameter or key is missing, or AWS cannot be reached after three tries, the app starts with sign-in unavailable and the journal says why; `./bin/deploy smoke` prints `Google sign-in: available` or `unavailable`.

To change the secret, put the new value from your own terminal (the first command prompts without echoing), then deploy a release so the app restarts:

```sh
read -rs SECRET
```

```sh
aws ssm put-parameter --profile music-chairs --region us-west-2 --name /music-chairs/google-client-secret --type SecureString --overwrite --value "$SECRET" && unset SECRET
```

```sh
./bin/deploy release
```

**Calendar.** Import asks for `calendar.freebusy` (busy periods only) and writing for `calendar.events.owned`, each only when a member uses it. Members' refresh tokens are stored in the database; they are useless without the client secret, which never leaves Parameter Store and the server's memory. The server re-syncs every member who writes to Google once an hour (`SWEEP_MINUTES` in `project/app/.server/calendar-sync.ts`), which retries failed updates and adds dates as the eight-week window moves. Turning writing off removes the upcoming events the app added but keeps the Google permission until the member removes it at myaccount.google.com → Security → Third-party apps. The app is unverified: Google shows a warning when members grant Calendar access, and at most 100 Google accounts can grant it. Verification is filed as `user-actions/cherubic-fox.md`.

## Backups and restoring

`music-chairs-backup.timer` runs nightly at 03:30 UTC and copies a consistent snapshot to `s3://<bucket>/backups/<date>.sqlite.gz` (the bucket name is `backupBucketName` in `config.json`). The bucket keeps each copy 30 days; versioning keeps an overwritten or expired copy 7 more days. The instance's key can only add objects.

Nothing alerts on a failed backup yet. To check the last run, on the server: `systemctl status music-chairs-backup` (and `journalctl -u music-chairs-backup` for its output); the newest object under `backups/` in the bucket should be from the last night.

To restore: download a copy with an administrator profile, `gunzip` it, then on the server `sudo systemctl stop music-chairs`, replace `/var/lib/music-chairs/music-chairs.sqlite` (owned by `music-chairs`), delete any `-wal`/`-shm` files beside it, and `sudo systemctl start music-chairs`.

## Recovery

**A failed apply.** Terraform records what it created before failing; fix the cause and run `infra` again, and it continues from the recorded state. The state bucket is versioned, so a damaged state file can be restored from an earlier version in the S3 console. Nothing outside Terraform should change these resources; if something did, the next plan shows the difference before anything is applied.

**Lost SSH key.** The private key cannot be downloaded again, and deleting and re-creating the key pair does not change the key the instance accepts. Restore `~/.ssh/music-chairs-lightsail` from a backup if you have one. Otherwise connect through the Lightsail console's browser SSH, append a new public key (`ssh-keygen -y -f <new private key>`) to `/home/admin/.ssh/authorized_keys`, and save that private key as `~/.ssh/music-chairs-lightsail` with mode 600.

## Schema changes

The live database is kept across releases: schema changes ship as migrations (`policies/greenfield-until-released.md` § Amendments in force), applied when the new release first opens the database. A release that fails its health check after migrating is rolled back together with the database copy taken just before it started.
