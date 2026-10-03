# Deploying music-chairs

music-chairs runs at **https://rehearse.dalan.dev** on one AWS Lightsail instance in us-west-2 (`micro_3_0`: 1 GB memory, 40 GB disk, $7/month), with HTTPS from Caddy and a nightly database backup to S3. Expected cost is about $8.40/month; a budget alert emails the operator if the forecast passes $9.50 or actual spend passes $10.

Everything is driven by `bin/deploy` from the repository root, using the AWS CLI profile `music-chairs` (account 777460179484). Settings live in `config.json`; nothing secret is stored in the repository.

## Deploying

```sh
./bin/deploy all
```

`all` runs three steps, each available on its own:

- `./bin/deploy infra` — creates or updates two CloudFormation stacks through change sets: `music-chairs` in us-west-2 (`stack.yaml`: instance, static IP, the `rehearse.dalan.dev` DNS record, the backup bucket and a write-only backup user) and `music-chairs-alerts` in us-east-1 (`alerts.yaml`: HTTP health check, outage alarm, email topic, monthly budget). It refuses any change set that would replace or remove the instance or its static IP, because the instance holds the live database.
- `./bin/deploy release` — uploads this directory and runs `provision.sh` (idempotent server setup: Node at the version `project/package.json` pins, Caddy, the systemd units), installs the backup key if the server has none, builds the app, and installs it with `install-release.sh`. That script copies the database first and, if the new release fails its health check, restores the copy and returns to the previous release.
- `./bin/deploy smoke` — checks the public site without changing data.

Every subcommand first confirms the profile is signed in to account 777460179484 and refuses otherwise. `--dry-run` confirms the account and lists the steps without running them. `--profile` selects another profile.

The first `infra` needs the alert address in the environment; it is passed to AWS as a hidden parameter and reused afterwards:

```sh
MUSIC_CHAIRS_ALERT_EMAIL=you@example.com ./bin/deploy infra
```

## Secrets

- **SSH key:** `bin/deploy` creates the Lightsail key pair `music-chairs` on first use and saves its private key to `~/.ssh/music-chairs-lightsail` (it cannot be downloaded again). The instance's host key is pinned in `~/.ssh/music-chairs-known-hosts` from Lightsail's own record.
- **Backup key:** created for the backup user and written straight to `/etc/music-chairs/backup.env` on the server; earlier keys of that user are deleted first.
- **Alert email:** only in AWS (a NoEcho stack parameter).
- **Google client secret:** in AWS Parameter Store as the SecureString `/music-chairs/google-client-secret` (us-west-2). The server reads it with the `AppUser` key, which `bin/deploy` installs root-only at `/etc/music-chairs/app.env`; see Google sign-in below.

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

`music-chairs-backup.timer` runs nightly at 03:30 UTC and copies a consistent snapshot to `s3://<bucket>/backups/<date>.sqlite.gz` (the bucket name is the `BackupBucketName` output of the `music-chairs` stack). The bucket keeps each copy 30 days; versioning keeps an overwritten or expired copy 7 more days. The instance's key can only add objects.

Nothing alerts on a failed backup yet. To check the last run, on the server: `systemctl status music-chairs-backup` (and `journalctl -u music-chairs-backup` for its output); the newest object under `backups/` in the bucket should be from the last night.

To restore: download a copy with an administrator profile, `gunzip` it, then on the server `sudo systemctl stop music-chairs`, replace `/var/lib/music-chairs/music-chairs.sqlite` (owned by `music-chairs`), delete any `-wal`/`-shm` files beside it, and `sudo systemctl start music-chairs`.

## Recovery

**A failed first deploy.** `infra` refuses a stack whose state cannot be updated (for example `ROLLBACK_COMPLETE` after a failed first create). The instance, its static IP and the backup bucket are kept even when their stack is deleted, so they can be left behind. If the instance never held a band's data, delete the stack in the CloudFormation console (us-west-2 for `music-chairs`, us-east-1 for `music-chairs-alerts`), then delete the leftover Lightsail instance `music-chairs-app` and static IP `music-chairs-app-ip` (and empty and delete the backup bucket if one was created), then run `infra` again (with `MUSIC_CHAIRS_ALERT_EMAIL` for the alerts stack). If it did hold data, copy the database off first.

**Lost SSH key.** The private key cannot be downloaded again, and deleting and re-creating the key pair does not change the key the instance accepts. Restore `~/.ssh/music-chairs-lightsail` from a backup if you have one. Otherwise connect through the Lightsail console's browser SSH, append a new public key (`ssh-keygen -y -f <new private key>`) to `/home/admin/.ssh/authorized_keys`, and save that private key as `~/.ssh/music-chairs-lightsail` with mode 600.

## Schema changes

The live database is kept across releases: schema changes ship as migrations (`policies/greenfield-until-released.md` § Amendments in force), applied when the new release first opens the database. A release that fails its health check after migrating is rolled back together with the database copy taken just before it started.
