// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title GasStation — Forwarder Contract for Gasless USDT Transfers
 * @notice Allows a Relayer to facilitate USDT transfers where the user pays
 *         the Relayer in USDT for gas costs + markup. The Relayer pays TRX gas.
 *
 * Flow:
 *   1. User approves this contract to spend their USDT (one-time).
 *   2. User signs a typed-data hash off-chain (EIP-712 style).
 *   3. Relayer submits the signed data to executeTransfer().
 *   4. Contract verifies signature, sends USDT to recipient, sends fee to Relayer.
 */

interface ITRC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

contract GasStation {
    // --- State ---
    address public owner;
    address public relayer;
    ITRC20 public usdt;

    // Replay protection: each user has an incrementing nonce
    mapping(address => uint256) public nonces;

    // --- Constants ---
    // Domain separator components for EIP-712 style signing
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(address from,address to,uint256 sendAmount,uint256 feeAmount,uint256 nonce,uint256 deadline)"
    );

    string public constant NAME = "Crypxe-GasStation";
    string public constant VERSION = "1";

    // Nile testnet chain ID (use the actual value from the network)
    uint256 public chainId;

    // Cache the domain separator to avoid mismatches
    bytes32 public DOMAIN_SEPARATOR;


    // --- Events ---
    event TransferExecuted(
        address indexed from,
        address indexed to,
        uint256 sendAmount,
        uint256 feeAmount,
        uint256 nonce
    );

    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "GasStation: not owner");
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "GasStation: not relayer");
        _;
    }

    // --- Constructor ---
    constructor(address _usdt, address _relayer, uint256 _chainId) {
        require(_usdt != address(0), "GasStation: zero USDT address");
        require(_relayer != address(0), "GasStation: zero relayer address");

        owner = msg.sender;
        relayer = _relayer;
        usdt = ITRC20(_usdt);
        chainId = _chainId;

        // One-time calculation of Domain Separator for reliability
        // We cast address(this) to uint160 to strip the TRON 0x41 prefix, 
        // ensuring compatibility with standard EVM hashing.
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                _chainId,
                address(uint160(address(this)))
            )
        );
    }

    /**
     * @notice Official Fingerprint Generator (Mirror Protocol)
     * @dev Fetches the exact hash the contract expects for a given transfer.
     */
    function getTransferDigest(
        address from,
        address to,
        uint256 sendAmount,
        uint256 feeAmount,
        uint256 deadline
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TRANSFER_TYPEHASH,
                address(uint160(from)),
                address(uint160(to)),
                sendAmount,
                feeAmount,
                nonces[from],
                deadline
            )
        );

        return keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
    }

    function executeTransfer(
        address from,
        address to,
        uint256 sendAmount,
        uint256 feeAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyRelayer {
        // 1. Core Validation
        require(block.timestamp / 1000 <= deadline, "GasStation: signature expired");
        require(to != address(0), "GasStation: zero recipient");

        uint256 currentNonce = nonces[from];
        
        // 2. Generate Base EIP-712 Digest
        bytes32 digest = getTransferDigest(from, to, sendAmount, feeAmount, deadline);

        // 3. Dual Recovery (Standard vs TRON-Prefix)
        // Some wallets (like TronLink) automatically add the TRON prefix 
        // for security. We check both possibilities.
        address recovered = ecrecover(digest, v, r, s);
        if (uint160(recovered) != uint160(from)) {
            // Fallback: Check if message was signed with TRON prefix
            bytes32 prefixedDigest = keccak256(
                abi.encodePacked("\x19TRON Signed Message:\n32", digest)
            );
            recovered = ecrecover(prefixedDigest, v, r, s);
        }

        require(uint160(recovered) != 0 && uint160(recovered) == uint160(from), "GasStation: invalid signature");
        
        // 4. Update Nonce
        nonces[from] = currentNonce + 1;

        // Execute the two transfers
        // 1. Send USDT from user to recipient
        require(
            usdt.transferFrom(from, to, sendAmount),
            "GasStation: USDT transfer failed"
        );

        // 2. Send fee from user to relayer
        if (feeAmount > 0) {
            require(
                usdt.transferFrom(from, relayer, feeAmount),
                "GasStation: fee transfer failed"
            );
        }

        emit TransferExecuted(from, to, sendAmount, feeAmount, currentNonce);
    }

    // --- Admin Functions ---

    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "GasStation: zero address");
        address old = relayer;
        relayer = _relayer;
        emit RelayerUpdated(old, _relayer);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "GasStation: zero address");
        address old = owner;
        owner = _newOwner;
        emit OwnerUpdated(old, _newOwner);
    }

    // --- View Functions ---

    function getDomainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                chainId,
                address(this)
            )
        );
    }

    function getTransferHash(
        address from,
        address to,
        uint256 sendAmount,
        uint256 feeAmount,
        uint256 nonce,
        uint256 deadline
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                TRANSFER_TYPEHASH,
                from,
                to,
                sendAmount,
                feeAmount,
                nonce,
                deadline
            )
        );
    }
}
