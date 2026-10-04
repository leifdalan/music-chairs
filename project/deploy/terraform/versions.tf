# music-chairs infrastructure (plan/phase-16.md). Settings come from
# ../config.json, so names live in one place; run it through ./bin/deploy.
terraform {
  required_version = "= 1.16.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.67.0"
    }
  }
}

locals {
  config = jsondecode(file("${path.module}/../config.json"))
}
