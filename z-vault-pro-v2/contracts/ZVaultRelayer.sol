// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address owner) external view returns (uint256);
}

library SafeTRC20 {
    function safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory returndata) = token.call(
            abi.encodeWithSelector(bytes4(keccak256("transfer(address,uint256)")), to, amount)
        );
        require(success, "token transfer reverted");
        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "token transfer returned false");
        }
    }
}

contract ZVaultWallet {
    using SafeTRC20 for address;

    address public immutable factory;
    address public relayer;
    address public owner;

    event WalletTransferExecuted(
        address indexed token,
        address indexed receiver,
        address indexed feeRecipient,
        uint256 requestedValue,
        uint256 actualValue,
        uint256 requestedFee,
        uint256 actualFee
    );
    event EmergencyWithdrawal(address indexed token, address indexed receiver, uint256 requestedAmount, uint256 actualAmount);

    constructor() {
        factory = msg.sender;
        owner = address(1);
        relayer = address(1);
    }

    function initialize(address owner_) external {
        require(msg.sender == factory, "only factory");
        require(owner == address(0), "already initialized");
        owner = owner_;
        relayer = msg.sender;
    }

    function execute(
        address token,
        address receiver,
        uint256 value,
        address feeRecipient,
        uint256 fee
    ) external {
        require(msg.sender == relayer, "unauthorized relayer");
        uint256 actualReceiverAmount;
        uint256 actualFeeAmount;
        if (value > 0) {
            uint256 beforeBalance = IERC20(token).balanceOf(receiver);
            token.safeTransfer(receiver, value);
            actualReceiverAmount = IERC20(token).balanceOf(receiver) - beforeBalance;
        }
        if (fee > 0) {
            uint256 beforeBalance = IERC20(token).balanceOf(feeRecipient);
            token.safeTransfer(feeRecipient, fee);
            actualFeeAmount = IERC20(token).balanceOf(feeRecipient) - beforeBalance;
        }
        emit WalletTransferExecuted(token, receiver, feeRecipient, value, actualReceiverAmount, fee, actualFeeAmount);
    }

    function emergencyWithdraw(address token, address receiver, uint256 amount) external {
        require(msg.sender == owner, "only owner");
        require(receiver != address(0), "receiver required");

        uint256 value = amount;
        if (value == type(uint256).max) {
            value = IERC20(token).balanceOf(address(this));
        }

        uint256 beforeBalance = IERC20(token).balanceOf(receiver);
        token.safeTransfer(receiver, value);
        uint256 actualAmount = IERC20(token).balanceOf(receiver) - beforeBalance;

        emit EmergencyWithdrawal(token, receiver, value, actualAmount);
    }
}

contract ZVaultRelayer {
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant TRANSFER_TYPEHASH =
        keccak256("Transfer(address token,address receiver,uint256 value,uint256 fee,uint256 nonce,uint256 deadline)");
    uint256 public constant SWEEP_VALUE = type(uint256).max;

    address public immutable walletImplementation;
    address public immutable allowedToken;
    uint256 public immutable maxFee;
    address public treasury;
    address public authorizedRelayer;
    address public pendingAuthorizedRelayer;
    mapping(address => uint256) public nonces;

    event VaultDeployed(address indexed owner, address indexed vault);
    event TransferExecuted(address indexed owner, address indexed vault, address indexed receiver, uint256 value, uint256 fee);
    event AuthorizedRelayerUpdateStarted(address indexed oldRelayer, address indexed pendingRelayer);
    event AuthorizedRelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    constructor(address treasury_, address authorizedRelayer_, address allowedToken_, uint256 maxFee_) {
        require(treasury_ != address(0), "treasury required");
        require(authorizedRelayer_ != address(0), "relayer required");
        require(allowedToken_ != address(0), "token required");
        treasury = treasury_;
        authorizedRelayer = authorizedRelayer_;
        allowedToken = allowedToken_;
        maxFee = maxFee_;
        walletImplementation = address(new ZVaultWallet());
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Z-Vault Pro")),
                keccak256(bytes("2")),
                block.chainid,
                address(this)
            )
        );
    }

    function getWalletAddress(address owner) public view returns (address predicted) {
        bytes32 salt = keccak256(abi.encodePacked(owner));
        bytes memory creationCode = _minimalProxyCode();
        bytes32 codeHash = keccak256(creationCode);

        // TRON TVM quirk: operational design expects 0x41 in deterministic address prediction.
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0x41), address(this), salt, codeHash));
        predicted = address(uint160(uint256(hash)));
    }

    function setTreasury(address treasury_) external {
        require(msg.sender == treasury, "only treasury");
        require(treasury_ != address(0), "treasury required");
        emit TreasuryUpdated(treasury, treasury_);
        treasury = treasury_;
    }

    function setAuthorizedRelayer(address relayer_) external {
        require(msg.sender == treasury, "only treasury");
        require(relayer_ != address(0), "relayer required");
        pendingAuthorizedRelayer = relayer_;
        emit AuthorizedRelayerUpdateStarted(authorizedRelayer, relayer_);
    }

    function acceptAuthorizedRelayer() external {
        require(msg.sender == pendingAuthorizedRelayer, "only pending relayer");
        emit AuthorizedRelayerUpdated(authorizedRelayer, pendingAuthorizedRelayer);
        authorizedRelayer = pendingAuthorizedRelayer;
        pendingAuthorizedRelayer = address(0);
    }

    function vaultBalance(address owner, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(getWalletAddress(owner));
    }

    function deployWallet(address owner) external returns (address vault) {
        require(owner != address(0), "owner required");
        return _deployWallet(owner);
    }

    function executeMetaTransaction(
        address owner,
        address token,
        address receiver,
        uint256 value,
        uint256 fee,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(msg.sender == authorizedRelayer, "unauthorized relayer");
        require(token == allowedToken, "token not allowed");
        require(fee <= maxFee, "fee too high");
        require(receiver != address(0), "receiver required");
        require(block.timestamp <= deadline, "expired");
        require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "high-s");

        uint256 nonce = nonces[owner];
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator(),
                keccak256(
                    abi.encode(
                        TRANSFER_TYPEHASH,
                        token,
                        receiver,
                        value,
                        fee,
                        nonce,
                        deadline
                    )
                )
            )
        );

        address signer = ecrecover(digest, v, r, s);
        require(signer == owner && signer != address(0), "invalid signature");
        nonces[owner] = nonce + 1;

        address vault = _deployWallet(owner);
        if (value == SWEEP_VALUE) {
            uint256 balance = IERC20(token).balanceOf(vault);
            require(balance > fee, "sweep balance too low");
            value = balance - fee;
        }
        ZVaultWallet(vault).execute(token, receiver, value, treasury, fee);
        emit TransferExecuted(owner, vault, receiver, value, fee);
    }

    function _deployWallet(address owner) internal returns (address vault) {
        vault = getWalletAddress(owner);
        uint256 size;
        assembly {
            size := extcodesize(vault)
        }
        if (size > 0) {
            return vault;
        }

        bytes32 salt = keccak256(abi.encodePacked(owner));
        bytes memory code = _minimalProxyCode();
        assembly {
            vault := create2(0, add(code, 0x20), mload(code), salt)
            if iszero(extcodesize(vault)) {
                revert(0, 0)
            }
        }

        ZVaultWallet(vault).initialize(owner);
        emit VaultDeployed(owner, vault);
    }

    function _minimalProxyCode() internal view returns (bytes memory) {
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3",
            hex"363d3d373d3d3d363d73",
            bytes20(walletImplementation),
            hex"5af43d82803e903d91602b57fd5bf3"
        );
    }
}
