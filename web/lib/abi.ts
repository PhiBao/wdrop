import { parseAbi } from "viem";

export const wdropAbi = parseAbi([
  "function create(address token, uint256 amount, bytes32 claimHash, uint64 ttlSeconds, address arbiter) returns (uint256 id)",
  "function claim(uint256 id, bytes32 secret)",
  "function reclaim(uint256 id)",
  "function sweepExpired(uint256 id)",
  "function resolve(uint256 id, address to)",
  "function getDrop(uint256 id) view returns (address token, address sender, address arbiter, uint256 amount, uint64 createdAt, uint64 expiry, bytes32 claimHash, uint8 status)",
  "function isClaimable(uint256 id) view returns (bool)",
  "function nextId() view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "event Created(uint256 indexed id, address indexed sender, address indexed token, uint256 amount, uint64 expiry, bytes32 claimHash, address arbiter)",
  "event Claimed(uint256 indexed id, address indexed claimer, uint256 amount, uint256 fee)",
  "event Reclaimed(uint256 indexed id, address indexed sender, uint256 amount)",
  "event Swept(uint256 indexed id, address indexed sender, uint256 amount)",
  "event Resolved(uint256 indexed id, address indexed to, uint256 amount, uint256 fee)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export const DROP_STATUS = ["Locked", "Claimed", "Reclaimed", "Swept"] as const;

// Named single-event ABIs for log queries. Do NOT index wdropAbi by position
// (e.g. wdropAbi[9]) — adding a function above would silently repoint queries.
// Each uses `as const` so viem infers exact event arg types for getLogs.
export const createdEvent = parseAbi([
  "event Created(uint256 indexed id, address indexed sender, address indexed token, uint256 amount, uint64 expiry, bytes32 claimHash, address arbiter)",
] as const);
export const claimedEvent = parseAbi([
  "event Claimed(uint256 indexed id, address indexed claimer, uint256 amount, uint256 fee)",
] as const);
export const reclaimedEvent = parseAbi([
  "event Reclaimed(uint256 indexed id, address indexed sender, uint256 amount)",
] as const);
export const sweptEvent = parseAbi([
  "event Swept(uint256 indexed id, address indexed sender, uint256 amount)",
] as const);
