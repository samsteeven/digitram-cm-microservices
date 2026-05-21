# DIGITRANS-CM — Azure Virtual Network (hub pour BI/Fabric)
# Utilisé pour le déploiement BI Service (FastAPI) et Fabric Gateway

resource "azurerm_resource_group" "main" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.azure_location
  tags = {
    Project     = "DIGITRANS-CM"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "azurerm_virtual_network" "main" {
  name                = "${var.project_name}-${var.environment}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = [var.vnet_cidr]

  tags = { Name = "${var.project_name}-${var.environment}-vnet" }
}

resource "azurerm_subnet" "public" {
  count                = length(var.azure_availability_zones)
  name                 = "${var.project_name}-${var.environment}-public-${count.index + 1}"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, count.index)]
}

resource "azurerm_subnet" "private" {
  count                = length(var.azure_availability_zones)
  name                 = "${var.project_name}-${var.environment}-private-${count.index + 1}"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, count.index + length(var.azure_availability_zones))]
  service_endpoints    = ["Microsoft.Storage", "Microsoft.Sql"]
}

resource "azurerm_subnet" "bi" {
  name                 = "${var.project_name}-${var.environment}-bi"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, length(var.azure_availability_zones) * 2)]
}

resource "azurerm_network_security_group" "bi" {
  name                = "${var.project_name}-${var.environment}-nsg-bi"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  security_rule {
    name                       = "AllowAPI"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8000"
    source_address_prefixes    = var.allowed_cidrs
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowSSH"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefixes    = var.allowed_cidrs
    destination_address_prefix = "*"
  }

  tags = { Name = "${var.project_name}-${var.environment}-nsg-bi" }
}

resource "azurerm_subnet_network_security_group_association" "bi" {
  subnet_id                 = azurerm_subnet.bi.id
  network_security_group_id = azurerm_network_security_group.bi.id
}

resource "azurerm_public_ip" "nat" {
  name                = "${var.project_name}-${var.environment}-nat-pip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_nat_gateway" "main" {
  name                = "${var.project_name}-${var.environment}-natgw"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku_name            = "Standard"
}

resource "azurerm_nat_gateway_public_ip_association" "main" {
  nat_gateway_id       = azurerm_nat_gateway.main.id
  public_ip_address_id = azurerm_public_ip.nat.id
}

resource "azurerm_subnet_nat_gateway_association" "private" {
  count          = length(var.azure_availability_zones)
  subnet_id      = azurerm_subnet.private[count.index].id
  nat_gateway_id = azurerm_nat_gateway.main.id
}
