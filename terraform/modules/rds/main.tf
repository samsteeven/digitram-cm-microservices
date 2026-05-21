# ─── KMS Key pour chiffrement RDS ──────────────────────
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS ${var.project_name}-${var.environment}"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = { Name = "${var.project_name}-${var.environment}-kms-rds" }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project_name}-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}-db-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "${var.project_name}-${var.environment}-db-subnet-group" }
}

resource "aws_db_instance" "postgresql" {
  identifier = "${var.project_name}-${var.environment}-pg"
  engine     = "postgres"
  engine_version = "15.7"

  instance_class    = var.db_instance_class
  allocated_storage = var.environment == "prod" ? 100 : 20

  db_name  = "digitrans_${var.environment}"
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_sg_id]

  multi_az               = var.environment == "prod"
  backup_retention_period = var.environment == "prod" ? 30 : 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"

  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn
  deletion_protection = var.environment == "prod"

  skip_final_snapshot = var.environment != "prod"

  tags = { Name = "${var.project_name}-${var.environment}-pg" }
}
