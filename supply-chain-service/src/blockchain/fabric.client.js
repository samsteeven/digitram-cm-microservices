/**
 * Client Hyperledger Fabric — Supply Chain Service
 *
 * Pont entre l'API REST Node.js et la blockchain privée AGROCAM.
 * - Enregistre chaque expédition et checkpoint sur le ledger Fabric
 * - Fournit une traçabilité immuable pour les audits
 * - Fonctionne en mode degraded (fallback) si Fabric est indisponible
 */

const { Gateway, Wallets } = require("fabric-network");
const { FABRIC_CONFIG } = require("./fabric.config");

let gateway = null;
let network = null;
let contract = null;

/**
 * Initialise la connexion au réseau Fabric
 */
async function connectFabric() {
  try {
    const wallet = await Wallets.newFileSystemWallet(FABRIC_CONFIG.walletPath);
    gateway = new Gateway();

    await gateway.connect(FABRIC_CONFIG.connectionProfilePath, {
      wallet,
      identity: FABRIC_CONFIG.identityLabel,
      discovery: FABRIC_CONFIG.gatewayDiscovery,
    });

    network = await gateway.getNetwork(FABRIC_CONFIG.channelName);
    contract = network.getContract(FABRIC_CONFIG.chaincodeName);

    console.warn("Hyperledger Fabric connecté");
    return true;
  } catch (err) {
    console.warn("⚠ Fabric non disponible — fonctionnement en mode degraded:", err.message);
    return false;
  }
}

/**
 * Vérifie si Fabric est connecté
 */
function isConnected() {
  return gateway !== null && contract !== null;
}

/**
 * Déconnecte proprement
 */
async function disconnectFabric() {
  if (gateway) {
    gateway.disconnect();
    gateway = null;
    network = null;
    contract = null;
    console.warn("Hyperledger Fabric déconnecté");
  }
}

/**
 * Enregistre une expédition sur la blockchain
 */
async function recordShipmentOnChain(shipment) {
  if (!isConnected()) return { onChain: false, reason: "Fabric indisponible" };

  try {
    const result = await contract.submitTransaction(
      "createShipment",
      shipment.id,
      shipment.shipment_ref,
      shipment.origin,
      shipment.destination,
      shipment.product_type,
      String(shipment.quantity || ""),
      shipment.unit || "",
      shipment.carrier || "",
      shipment.status || "pending",
      new Date().toISOString()
    );

    return { onChain: true, txId: result?.toString() || "simulated" };
  } catch (err) {
    console.error("[FABRIC] Erreur createShipment:", err.message);
    return { onChain: false, reason: err.message };
  }
}

/**
 * Met à jour le statut d'une expédition sur la blockchain
 */
async function updateShipmentStatusOnChain(shipmentId, newStatus) {
  if (!isConnected()) return { onChain: false, reason: "Fabric indisponible" };

  try {
    const result = await contract.submitTransaction(
      "updateShipmentStatus",
      shipmentId,
      newStatus,
      new Date().toISOString()
    );

    return { onChain: true, txId: result?.toString() || "simulated" };
  } catch (err) {
    console.error("[FABRIC] Erreur updateShipmentStatus:", err.message);
    return { onChain: false, reason: err.message };
  }
}

/**
 * Enregistre un point de contrôle (checkpoint) sur la blockchain
 */
async function recordCheckpointOnChain(checkpoint) {
  if (!isConnected()) return { onChain: false, reason: "Fabric indisponible" };

  try {
    const result = await contract.submitTransaction(
      "recordCheckpoint",
      checkpoint.id,
      checkpoint.shipment_id,
      checkpoint.location,
      checkpoint.status,
      checkpoint.notes || "",
      String(checkpoint.latitude || ""),
      String(checkpoint.longitude || ""),
      new Date().toISOString()
    );

    return { onChain: true, txId: result?.toString() || "simulated" };
  } catch (err) {
    console.error("[FABRIC] Erreur recordCheckpoint:", err.message);
    return { onChain: false, reason: err.message };
  }
}

/**
 * Interroge l'historique blockchain d'une expédition
 */
async function queryShipmentHistory(shipmentId) {
  if (!isConnected()) return [];

  try {
    const result = await contract.evaluateTransaction("getShipmentHistory", shipmentId);
    return JSON.parse(result.toString());
  } catch (err) {
    console.error("[FABRIC] Erreur getShipmentHistory:", err.message);
    return [];
  }
}

module.exports = {
  connectFabric,
  disconnectFabric,
  isConnected,
  recordShipmentOnChain,
  updateShipmentStatusOnChain,
  recordCheckpointOnChain,
  queryShipmentHistory,
};
