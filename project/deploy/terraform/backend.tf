# State lives in a private, versioned, encrypted bucket that ./bin/deploy
# bootstrap creates; S3's own lock file stops two runs colliding. bin/deploy
# supplies the bucket, key and region from ../config.json at init.
terraform {
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
