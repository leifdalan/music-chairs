resource "aws_route53_record" "app" {
  zone_id = local.config.hostedZoneId
  name    = local.config.domain
  type    = "A"
  ttl     = 300
  records = [aws_lightsail_static_ip.app.ip_address]
}

# The dalan.dev TXT record holds exactly the Google Search Console verification
# values the app's Google verification depends on; Google re-checks them.
resource "aws_route53_record" "google_verification" {
  zone_id = local.config.hostedZoneId
  name    = "dalan.dev"
  type    = "TXT"
  ttl     = 300
  records = local.config.googleSiteVerification
}
