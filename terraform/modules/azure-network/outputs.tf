output "resource_group_name" { value = azurerm_resource_group.main.name }
output "vnet_id" { value = azurerm_virtual_network.main.id }
output "vnet_name" { value = azurerm_virtual_network.main.name }
output "public_subnet_ids" { value = azurerm_subnet.public[*].id }
output "private_subnet_ids" { value = azurerm_subnet.private[*].id }
output "bi_subnet_id" { value = azurerm_subnet.bi.id }
output "bi_nsg_id" { value = azurerm_network_security_group.bi.id }
