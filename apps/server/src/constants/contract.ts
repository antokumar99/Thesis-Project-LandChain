export const LAND_REGISTRY_ABI = [
  "function latestMerkleRoot() view returns (bytes32)",
  "function lands(bytes32) view returns (string deedCid,uint8 status,bool exists,uint256 landIdField)",
  "function updateMerkleRoot(bytes32 newRoot,(uint256[2] a,uint256[2][2] b,uint256[2] c,uint256[4] signals) transition)",
  "function bootstrapRoot(bytes32 root)",
  "function registerLand(bytes32 landHash,string deedCid,uint256 landIdField)",
  "function verifyAndTransfer(bytes32 landHash,address buyer,bytes32 challengeSalt,uint256[2] a,uint256[2][2] b,uint256[2] c,uint256[] publicSignals)",
  "event MerkleRootUpdated(bytes32 indexed root,address indexed updatedBy,uint256 timestamp)",
  "event MerkleRootBootstrapped(bytes32 indexed root,address indexed updatedBy)",
  "event LandRegistered(bytes32 indexed landHash,string deedCid)",
  "event LandTransferred(bytes32 indexed landHash,uint256 indexed nullifier)"
];
