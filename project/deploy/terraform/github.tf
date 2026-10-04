# GitHub Actions deploys main (plan/phase-18.md): the workflow's deploy job
# assumes this role through GitHub's OpenID Connect identity, so GitHub holds
# no AWS keys. Only pushes to main of the one repository may assume it.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "github_deploy" {
  name                 = local.config.deployRoleName
  max_session_duration = 3600
  # GitHub's immutable subject format (owner and repository with their ids), the
  # default for repositories created after 2026-07-15
  # (docs/github-actions-oidc-rulesets-2026-10-04.md).
  assume_role_policy = templatefile("${path.module}/policies/github-trust.json.tftpl", {
    provider_arn = aws_iam_openid_connect_provider.github.arn
    subject      = "repo:${local.config.githubOidcRepository}:ref:refs/heads/main"
  })
}

# Terraform's refresh reads every managed resource type, and the account holds
# only music-chairs, so the role may read it; the inline policy takes away
# backups and secrets and adds the few writes a deploy makes.
resource "aws_iam_role_policy_attachment" "github_deploy_read" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "deploy"
  role = aws_iam_role.github_deploy.name
  policy = templatefile("${path.module}/policies/github-deploy.json.tftpl", {
    state_bucket_arn  = "arn:aws:s3:::${local.config.stateBucket}"
    backup_bucket_arn = aws_s3_bucket.backups.arn
    parameter_prefix  = "arn:aws:ssm:${local.config.region}:${local.config.account}:parameter"
    google_secret_arn = "arn:aws:ssm:${local.config.region}:${local.config.account}:parameter${local.config.googleSecretParameter}"
    alert_email_arn   = "arn:aws:ssm:${local.config.region}:${local.config.account}:parameter${local.config.alertEmailParameter}"
    region            = local.config.region
  })
}
