# The server can only add backups; it cannot read, list or delete them.
resource "aws_iam_user" "backup" {
  name = local.config.backupUserName
}

resource "aws_iam_user_policy" "backup" {
  name = "put-backups"
  user = aws_iam_user.backup.name
  policy = templatefile("${path.module}/policies/put-backups.json.tftpl", {
    bucket_arn = aws_s3_bucket.backups.arn
  })
}

# Reads one parameter, the Google client secret, and nothing else. Its key is
# root-only on the server (bin/deploy, fetch-secret.sh).
resource "aws_iam_user" "app" {
  name = local.config.appUserName
}

resource "aws_iam_user_policy" "app" {
  name = "read-google-secret"
  user = aws_iam_user.app.name
  policy = templatefile("${path.module}/policies/read-google-secret.json.tftpl", {
    parameter_arn = "arn:aws:ssm:${local.config.region}:${local.config.account}:parameter${local.config.googleSecretParameter}"
    region        = local.config.region
  })
}
