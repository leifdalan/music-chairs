provider "aws" {
  region              = local.config.region
  allowed_account_ids = [local.config.account]
}

# Route 53 health-check metrics and AWS billing alerts live in us-east-1.
provider "aws" {
  alias               = "us_east_1"
  region              = local.config.alertsRegion
  allowed_account_ids = [local.config.account]
}
