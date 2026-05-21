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
  deletion_protection = var.environment == "prod"

  skip_final_snapshot = var.environment != "prod"

  tags = { Name = "${var.project_name}-${var.environment}-pg" }
}
