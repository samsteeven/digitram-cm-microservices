const path = require("path");

const FABRIC_CONFIG = {
  channelName: process.env.FABRIC_CHANNEL || "supplychain-channel",
  chaincodeName: process.env.FABRIC_CHAINCODE || "digitrans-supply",
  mspId: process.env.FABRIC_MSP_ID || "AgrocamMSP",
  walletPath: process.env.FABRIC_WALLET_PATH || path.join(__dirname, "..", "..", "fabric-wallet"),
  connectionProfilePath: process.env.FABRIC_CONNECTION_PROFILE || path.join(__dirname, "..", "..", "fabric-profiles", "connection-profile.json"),
  identityLabel: process.env.FABRIC_IDENTITY || "supply-chain-app",
  peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || "localhost:7051",
  caUrl: process.env.FABRIC_CA_URL || "https://localhost:7054",
  gatewayDiscovery: { enabled: true, asLocalhost: true },
};

module.exports = { FABRIC_CONFIG };
