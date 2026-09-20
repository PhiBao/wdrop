// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title WDrop — claim-link USDC escrow with undo on Arc
/// @notice Lock ERC20 (USDC) behind a claim hash. Anyone with the secret can
///         claim to their own address. Sender can reclaim before claim.
///         Anyone can sweep expired drops back to the sender.
/// @dev Self-contained (no external imports) so the microgrant repo builds
///      offline and audits in one file. Designed for Arc mainnet (USDC gas).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/// @dev Minimal reentrancy guard (mirrors OZ semantics).
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_status != _ENTERED, "WDrop: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract WDrop is ReentrancyGuard {
    enum Status {
        Locked,
        Claimed,
        Reclaimed,
        Swept
    }

    struct Drop {
        address token;
        address sender;
        address arbiter; // zero = none; can force-release while Locked
        uint256 amount;
        uint64 createdAt;
        uint64 expiry;
        bytes32 claimHash; // keccak256(secret)
        Status status;
    }

    // ---- config ----
    address public owner;
    address public feeRecipient;
    uint16 public feeBps; // default 0, max 100 (1%)
    uint256 public constant MAX_FEE_BPS = 100;
    uint64 public constant MIN_TTL = 5 minutes;
    uint64 public constant MAX_TTL = 30 days;
    uint256 public constant MAX_AMOUNT = 10_000_000_000; // 10k USDC (6dp)

    uint256 public nextId;
    mapping(uint256 => Drop) public drops;

    // ---- events (receipt trail) ----
    event Created(
        uint256 indexed id,
        address indexed sender,
        address indexed token,
        uint256 amount,
        uint64 expiry,
        bytes32 claimHash,
        address arbiter
    );
    event Claimed(uint256 indexed id, address indexed claimer, uint256 amount, uint256 fee);
    event Reclaimed(uint256 indexed id, address indexed sender, uint256 amount);
    event Swept(uint256 indexed id, address indexed sender, uint256 amount);
    event Resolved(uint256 indexed id, address indexed to, uint256 amount, uint256 fee);
    event FeeUpdated(uint16 bps, address recipient);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    error ZeroAddress();
    error ZeroAmount();
    error AmountTooLarge();
    error BadTTL();
    error BadToken();
    error NotSender();
    error NotArbiter();
    error NotLocked();
    error NotExpired();
    error NotYetExpired();
    error BadSecret();
    error TransferFailed();

    constructor(address _feeRecipient) {
        owner = msg.sender;
        feeRecipient = _feeRecipient == address(0) ? msg.sender : _feeRecipient;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "WDrop: not owner");
        _;
    }

    function transferOwnership(address n) external onlyOwner {
        if (n == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, n);
        owner = n;
    }

    function setFee(uint16 bps, address recipient) external onlyOwner {
        require(bps <= MAX_FEE_BPS, "WDrop: fee too high");
        if (recipient == address(0)) revert ZeroAddress();
        feeBps = bps;
        feeRecipient = recipient;
        emit FeeUpdated(bps, recipient);
    }

    /// @notice Lock tokens behind keccak256(secret).
    /// @param token ERC20 (USDC on Arc: 0x3600000000000000000000000000000000000000)
    /// @param amount Base units (USDC: 6dp, e.g. 2_000_000 = $2)
    /// @param claimHash keccak256(secret bytes32)
    /// @param ttlSeconds lock lifetime, clamped [5min, 30d]
    /// @param arbiter optional dispute resolver (zero = none)
    /// @return id refund_id — single-use, replay-protected
    function create(
        address token,
        uint256 amount,
        bytes32 claimHash,
        uint64 ttlSeconds,
        address arbiter
    ) external nonReentrant returns (uint256 id) {
        if (token == address(0)) revert BadToken();
        if (amount == 0) revert ZeroAmount();
        if (amount > MAX_AMOUNT) revert AmountTooLarge();
        if (claimHash == bytes32(0)) revert BadSecret();
        if (ttlSeconds < MIN_TTL || ttlSeconds > MAX_TTL) revert BadTTL();

        id = nextId++;
        uint64 expiry = uint64(block.timestamp) + ttlSeconds;
        drops[id] = Drop({
            token: token,
            sender: msg.sender,
            arbiter: arbiter,
            amount: amount,
            createdAt: uint64(block.timestamp),
            expiry: expiry,
            claimHash: claimHash,
            status: Status.Locked
        });

        if (!_safeTransferFrom(token, msg.sender, address(this), amount)) revert TransferFailed();
        emit Created(id, msg.sender, token, amount, expiry, claimHash, arbiter);
    }

    /// @notice Claim by revealing the secret. Pays out to msg.sender (the claimer).
    function claim(uint256 id, bytes32 secret) external nonReentrant {
        Drop storage d = drops[id];
        if (d.status != Status.Locked) revert NotLocked();
        if (block.timestamp > d.expiry) revert NotYetExpired(); // expired -> reclaim/sweep path
        if (keccak256(abi.encodePacked(secret)) != d.claimHash) revert BadSecret();

        d.status = Status.Claimed;
        (uint256 fee, uint256 net) = _splitFee(d.amount);
        if (fee > 0) {
            if (!_safeTransfer(d.token, feeRecipient, fee)) revert TransferFailed();
        }
        if (!_safeTransfer(d.token, msg.sender, net)) revert TransferFailed();
        emit Claimed(id, msg.sender, net, fee);
    }

    /// @notice Sender undo: reclaim while still locked (even before expiry).
    function reclaim(uint256 id) external nonReentrant {
        Drop storage d = drops[id];
        if (d.status != Status.Locked) revert NotLocked();
        if (msg.sender != d.sender) revert NotSender();

        d.status = Status.Reclaimed;
        if (!_safeTransfer(d.token, d.sender, d.amount)) revert TransferFailed();
        emit Reclaimed(id, d.sender, d.amount);
    }

    /// @notice Permissionless sweep of expired drops back to sender.
    function sweepExpired(uint256 id) external nonReentrant {
        Drop storage d = drops[id];
        if (d.status != Status.Locked) revert NotLocked();
        if (block.timestamp <= d.expiry) revert NotExpired();

        d.status = Status.Swept;
        if (!_safeTransfer(d.token, d.sender, d.amount)) revert TransferFailed();
        emit Swept(id, d.sender, d.amount);
    }

    /// @notice Optional arbiter force-release (dispute path). Zero-fee bypass
    ///         only when arbiter == address(0) is impossible — arbiter must be set.
    function resolve(uint256 id, address to) external nonReentrant {
        Drop storage d = drops[id];
        if (d.status != Status.Locked) revert NotLocked();
        if (d.arbiter == address(0) || msg.sender != d.arbiter) revert NotArbiter();
        if (to == address(0)) revert ZeroAddress();

        d.status = Status.Claimed;
        (uint256 fee, uint256 net) = _splitFee(d.amount);
        if (fee > 0) {
            if (!_safeTransfer(d.token, feeRecipient, fee)) revert TransferFailed();
        }
        if (!_safeTransfer(d.token, to, net)) revert TransferFailed();
        emit Resolved(id, to, net, fee);
    }

    function _splitFee(uint256 amount) internal view returns (uint256 fee, uint256 net) {
        fee = (amount * feeBps) / 10_000;
        net = amount - fee;
    }

    function _safeTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal returns (bool) {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }

    /// @notice Read helper for UIs: is this drop currently claimable?
    function isClaimable(uint256 id) external view returns (bool) {
        Drop storage d = drops[id];
        return d.status == Status.Locked && block.timestamp <= d.expiry;
    }

    /// @notice Full struct getter (public mapping getter returns a tuple).
    function getDrop(uint256 id) external view returns (Drop memory) {
        return drops[id];
    }
}
