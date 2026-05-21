# ─── Rôle ECS Task ────────────────────────────────────
resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.project_name}-${var.environment}-ecs-task-role" }
}

resource "aws_iam_policy" "ecs_task" {
  name        = "${var.project_name}-${var.environment}-ecs-task-policy"
  description = "Politique pour les tâches ECS DIGITRANS-CM"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-${var.environment}-assets",
          "arn:aws:s3:::${var.project_name}-${var.environment}-assets/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = ["*"]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = ["arn:aws:logs:${var.aws_region}:*:log-group:/ecs/${var.project_name}-${var.environment}-*:*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task.arn
}

# ─── Rôle ECS Execution ───────────────────────────────
resource "aws_iam_role" "ecs_exec" {
  name = "${var.project_name}-${var.environment}-ecs-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${var.project_name}-${var.environment}-ecs-exec-role" }
}

resource "aws_iam_policy" "ecs_exec" {
  name        = "${var.project_name}-${var.environment}-ecs-exec-policy"
  description = "Permet à ECS de pull les images et d'écrire les logs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "secretsmanager:GetSecretValue"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_exec" {
  role       = aws_iam_role.ecs_exec.name
  policy_arn = aws_iam_policy.ecs_exec.arn
}

# ─── Groupes IAM utilisateurs humains ──────────────────
resource "aws_iam_group" "devops" {
  name = "${var.project_name}-${var.environment}-devops"
  path = "/"
}

resource "aws_iam_group_policy" "devops" {
  name   = "${var.project_name}-${var.environment}-devops-policy"
  group  = aws_iam_group.devops.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:PutImage"
        ]
        Resource = ["*"]
      },
      {
        Sid = "ECSUpdate"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService", "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition",
          "ecs:ListTasks", "ecs:DescribeTasks"
        ]
        Resource = ["*"]
      },
      {
        Sid = "CloudWatchRead"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups", "logs:DescribeLogStreams",
          "logs:GetLogEvents", "cloudwatch:GetMetricData",
          "cloudwatch:DescribeAlarms"
        ]
        Resource = ["*"]
      },
      {
        Sid = "S3DevReadWrite"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::${var.project_name}-${var.environment}-*",
          "arn:aws:s3:::${var.project_name}-${var.environment}-*/*"
        ]
      },
      {
        Sid = "DenyProdDestroy"
        Effect = "Deny"
        Action = [
          "rds:DeleteDBInstance", "rds:ModifyDBInstance",
          "elasticache:DeleteReplicationGroup",
          "iam:DeleteRole", "iam:PutRolePolicy",
          "s3:DeleteBucket"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_group" "dev" {
  name = "${var.project_name}-${var.environment}-dev"
  path = "/"
}

resource "aws_iam_group_policy" "dev" {
  name   = "${var.project_name}-${var.environment}-dev-policy"
  group  = aws_iam_group.dev.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "ECRPull"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken", "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"
        ]
        Resource = ["*"]
      },
      {
        Sid = "ReadOnlyInfra"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances", "ec2:DescribeSecurityGroups",
          "ec2:DescribeSubnets", "ec2:DescribeVpcs",
          "ecs:DescribeServices", "ecs:DescribeTaskDefinition",
          "ecs:ListClusters", "ecs:ListServices", "ecs:ListTasks",
          "rds:DescribeDBInstances",
          "elasticache:DescribeReplicationGroups",
          "logs:DescribeLogGroups", "logs:DescribeLogStreams", "logs:GetLogEvents"
        ]
        Resource = ["*"]
      },
      {
        Sid = "S3DevRead"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::${var.project_name}-${var.environment}-*",
          "arn:aws:s3:::${var.project_name}-${var.environment}-*/*"
        ]
      },
      {
        Sid = "DenyWrite"
        Effect = "Deny"
        Action = [
          "ecs:UpdateService", "ecs:RegisterTaskDefinition",
          "rds:*", "iam:*",
          "ecr:PutImage", "ecr:InitiateLayerUpload",
          "s3:PutObject", "s3:DeleteObject", "s3:DeleteBucket"
        ]
        Resource = ["*"]
      }
    ]
  })
}

resource "aws_iam_group" "bi_analyst" {
  name = "${var.project_name}-${var.environment}-bi-analyst"
  path = "/"
}

resource "aws_iam_group_policy" "bi_analyst" {
  name   = "${var.project_name}-${var.environment}-bi-analyst-policy"
  group  = aws_iam_group.bi_analyst.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid = "RDSReadOnly"
        Effect = "Allow"
        Action = ["rds:DescribeDBInstances"]
        Resource = ["*"]
      },
      {
        Sid = "S3AnalyticsRead"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:ListBucket"]
        Resource = [
          "arn:aws:s3:::${var.project_name}-analytics-*",
          "arn:aws:s3:::${var.project_name}-analytics-*/*"
        ]
      },
      {
        Sid = "QuickSight"
        Effect = "Allow"
        Action = [
          "quicksight:DescribeDashboard", "quicksight:ListDashboards",
          "quicksight:GetDashboardEmbedUrl"
        ]
        Resource = ["*"]
      },
      {
        Sid = "DenyNonBI"
        Effect = "Deny"
        Action = ["ecs:*", "ec2:*", "iam:*", "ecr:*", "elasticache:*",
                   "rds:ModifyDBInstance", "rds:DeleteDBInstance", "rds:CreateDBInstance"]
        Resource = ["*"]
      }
    ]
  })
}

# ─── Safety Net : Deny global suppressions critiques ──
resource "aws_iam_group_policy" "safety_net" {
  name   = "${var.project_name}-${var.environment}-safety-net"
  group  = aws_iam_group.devops.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid = "SafetyNet"
      Effect = "Deny"
      Action = [
        "rds:DeleteDBInstance", "s3:DeleteBucket",
        "iam:DeleteRole", "organizations:LeaveOrganization"
      ]
      Resource = ["*"]
      Condition = {
        StringNotEquals = {
          "aws:PrincipalARN": "arn:aws:iam::*:role/AdminCloud"
        }
      }
    }]
  })
}
