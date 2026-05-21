resource "aws_s3_bucket" "assets" {
  bucket = "${var.project_name}-${var.environment}-assets"
  force_destroy = var.environment != "prod"
  tags  = { Name = "${var.project_name}-${var.environment}-assets" }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = var.environment == "prod" ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ─── Bucket S3 pour logs (CloudTrail, ALB) ────────────
resource "aws_s3_bucket" "logs" {
  bucket = "${var.project_name}-${var.environment}-logs"
  force_destroy = var.environment != "prod"
  tags  = { Name = "${var.project_name}-${var.environment}-logs" }
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "logs_cloudtrail" {
  bucket = aws_s3_bucket.logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid = "AWSCloudTrailAclCheck"
      Effect = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action = "s3:GetBucketAcl"
      Resource = "arn:aws:s3:::${var.project_name}-${var.environment}-logs"
    }, {
      Sid = "AWSCloudTrailWrite"
      Effect = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action = "s3:PutObject"
      Resource = "arn:aws:s3:::${var.project_name}-${var.environment}-logs/*"
      Condition = {
        StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
      }
    }]
  })
}
