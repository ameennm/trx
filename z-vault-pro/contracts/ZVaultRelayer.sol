// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ZVaultWallet
 * @dev A minimal proxy wallet that holds USDT for a user.
 * Only the designated Relayer can execute transfers.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract ZVaultWallet {
    address public relayer;
    address public owner;

    /**
     * @dev Initializes the proxy wallet. Can only be called once.
     */
    function initialize(address _owner) external {
        require(owner == address(0), "Already initialized");
        owner = _owner;
        relayer = msg.sender;
    }

    /**
     * @dev Executes a transfer. Only the Relayer can call this.
     */
    function execute(address token, address to, uint256 amount, address feeRecipient, uint256 fee) external {
        require(msg.sender == relayer, "Unauthorized: only relayer");
        
        if (amount > 0) {
            require(IERC20(token).transfer(to, amount), "Transfer failed");
        }
        if (fee > 0) {
            require(IERC20(token).transfer(feeRecipient, fee), "Fee transfer failed");
        }
    }
}

/**
 * @title ZVaultRelayer
 * @dev The main relayer contract that verifies TIP-712 signatures,
 * deploys proxy wallets via CREATE2, and executes transfers.
 */
contract ZVaultRelayer {
    address public walletImplementation;
    address public treasury;
    address public authorizedRelayer;
    
    mapping(address => uint256) public nonces;

    // TIP-712 TypeHashes
    bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant TRANSFER_TYPEHASH = keccak256("Transfer(address token,address receiver,uint256 value,uint256 fee,uint256 nonce,uint256 deadline)");

    event WalletDeployed(address indexed owner, address wallet);
    event TransferExecuted(address indexed owner, address indexed receiver, uint256 value, uint256 fee);

    constructor(address _treasury, address _authorizedRelayer) {
        // Deploy the implementation contract once
        walletImplementation = address(new ZVaultWallet());
        treasury = _treasury;
        authorizedRelayer = _authorizedRelayer;
    }

    /**
     * @dev Returns the TIP-712 domain separator.
     */
    function getDomainSeparator() public view returns (bytes32) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes("Z-Vault Pro")),
            keccak256(bytes("1")),
            chainId,
            address(this)
        ));
    }

    /**
     * @dev Predicts the deterministic CREATE2 address for a user's wallet.
     */
    function getWalletAddress(address owner) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(owner));
        
        // EIP-1167 Minimal Proxy initialization code
        bytes memory creationCode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            walletImplementation,
            hex"5af43d82803e903d91602b57fd5bf3"
        );

        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(creationCode)
        ));
        
        // Convert to address format (taking last 20 bytes)
        return address(uint160(uint256(hash)));
    }

    /**
     * @dev Deploys the proxy wallet if it doesn't exist yet.
     */
    function _deployWallet(address owner) internal returns (address wallet) {
        address expectedAddress = getWalletAddress(owner);
        uint256 size;
        assembly { size := extcodesize(expectedAddress) }
        
        if (size > 0) {
            return expectedAddress; // Wallet already exists
        }

        bytes32 salt = keccak256(abi.encodePacked(owner));
        bytes memory code = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            walletImplementation,
            hex"5af43d82803e903d91602b57fd5bf3"
        );

        assembly {
            wallet := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(wallet)) {
                revert(0, 0)
            }
        }
        
        ZVaultWallet(wallet).initialize(owner);
        emit WalletDeployed(owner, wallet);
    }

    /**
     * @dev Updates the treasury address.
     */
    function setTreasury(address _treasury) external {
        require(msg.sender == treasury, "Unauthorized");
        treasury = _treasury;
    }

    /**
     * @dev Updates the authorized relayer address.
     */
    function setAuthorizedRelayer(address _relayer) external {
        require(msg.sender == treasury, "Unauthorized");
        authorizedRelayer = _relayer;
    }

    /**
     * @dev Executes a gasless meta-transaction based on a user's TIP-712 signature.
     */
    function executeMetaTransaction(
        address owner,
        address token,
        address receiver,
        uint256 value,
        uint256 fee,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        require(msg.sender == authorizedRelayer, "Unauthorized relayer");
        require(block.timestamp <= deadline, "Transaction expired");
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "Invalid signature 's' value");
        
        uint256 currentNonce = nonces[owner]++;

        // 1. Reconstruct the signed data
        bytes32 structHash = keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            token,
            receiver,
            value,
            fee,
            currentNonce,
            deadline
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            getDomainSeparator(),
            structHash
        ));

        // 2. Recover the signer
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == owner, "Invalid signature");

        // 3. Ensure the proxy wallet is deployed
        address wallet = _deployWallet(owner);

        // 4. Execute the transfer from the proxy wallet
        ZVaultWallet(wallet).execute(token, receiver, value, treasury, fee);
        
        emit TransferExecuted(owner, receiver, value, fee);
    }
}
