output "static_ip_address" {
  value = aws_lightsail_static_ip.app.ip_address
}

output "backup_bucket_name" {
  value = aws_s3_bucket.backups.bucket
}

output "backup_user_name" {
  value = aws_iam_user.backup.name
}

output "app_user_name" {
  value = aws_iam_user.app.name
}

output "deploy_role_arn" {
  value = aws_iam_role.github_deploy.arn
}
