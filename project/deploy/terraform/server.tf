# The instance holds the live database: neither it nor its address may ever be
# destroyed or replaced (bin/deploy also refuses such a plan). A newer Debian
# blueprint or changed user data must never plan a replacement.
resource "aws_lightsail_instance" "app" {
  name              = local.config.instanceName
  availability_zone = local.config.availabilityZone
  blueprint_id      = local.config.blueprintId
  bundle_id         = local.config.bundleId
  key_pair_name     = local.config.keyPairName
  ip_address_type   = "dualstack"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [blueprint_id, user_data]
  }
}

resource "aws_lightsail_static_ip" "app" {
  name = "${local.config.instanceName}-ip"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name

  lifecycle {
    prevent_destroy = true
  }
}

# SSH stays open to all addresses on purpose: key-only authentication, and the
# operator's own address changes (see ../README.md). Ports not listed here are
# closed.
resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  dynamic "port_info" {
    for_each = [22, 80, 443]
    content {
      protocol   = "tcp"
      from_port  = port_info.value
      to_port    = port_info.value
      cidrs      = ["0.0.0.0/0"]
      ipv6_cidrs = ["::/0"]
    }
  }
}
