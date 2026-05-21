.PHONY: init plan apply destroy fmt validate

ENV ?= dev
TFVARS = environments/$(ENV)/terraform.tfvars

init:
	terraform init -reconfigure \
		-backend-config="key=digitrans-cm/$(ENV)/terraform.tfstate" \
		-backend-config="dynamodb_table=digitrans-terraform-locks-$(ENV)"

plan:
	terraform plan -var-file=$(TFVARS) -out=tfplan.$(ENV)

apply:
	terraform apply tfplan.$(ENV)

destroy:
	terraform destroy -var-file=$(TFVARS)

fmt:
	terraform fmt -recursive

validate:
	terraform validate

# Usage: make plan ENV=prod
#        make apply ENV=prod
