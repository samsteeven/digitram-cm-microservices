output "bucket_name" { value = aws_s3_bucket.assets.id }
output "bucket_arn" { value = aws_s3_bucket.assets.arn }
output "logs_bucket_id" { value = aws_s3_bucket.logs.id }
output "logs_bucket_arn" { value = aws_s3_bucket.logs.arn }
