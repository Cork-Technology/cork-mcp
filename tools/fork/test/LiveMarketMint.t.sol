// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

interface Vm {
    function store(address target, bytes32 slot, bytes32 value) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

struct Call {
    address to;
    bytes data;
    uint256 value;
    bool skipRevert;
    bytes32 callbackHash;
}

interface IBundler3 {
    function multicall(Call[] calldata calls) external payable;
}

interface IPoolManager {
    function shares(bytes32 poolId) external view returns (address cpt, address cst);
}

interface IWhitelistManager {
    function isWhitelisted(bytes32 poolId, address account) external view returns (bool);
}

contract LiveMarketMintTest {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address private constant BUNDLER3 = 0x1FA4431bC113D308beE1d46B0e98Cb805FB48C13;
    address private constant CORK_ADAPTER = 0x5989761D6a567C16480Bc5ce2989492777532646;
    address private constant POOL_MANAGER = 0xc2De56fb1C7a85250ce69C37B4773767C77954AE;
    address private constant WHITELIST_MANAGER = 0x6611676F84A25914Ce4A4B7866739E5cb70eAf42;

    bytes32 private constant POOL_ID = 0xcc6efddfcaa194769316269616157c3fa0b24a55d3187e935c79e70b61ca50d4;
    uint256 private constant EXPIRY = 1_783_866_249;
    uint256 private constant USDC_BALANCES_SLOT = 9;

    function testHistoricalWhitelistDisabledMint() external {
        uint256 collateralAssetsIn = 1_000_000;
        require(block.timestamp < EXPIRY, "fork block must be before market expiry");
        require(
            IWhitelistManager(WHITELIST_MANAGER).isWhitelisted(POOL_ID, address(this)),
            "whitelist-disabled market must admit the test account"
        );

        (address cpt, address cst) = IPoolManager(POOL_MANAGER).shares(POOL_ID);
        require(cpt != address(0) && cst != address(0), "pool shares are not deployed");

        bytes32 balanceSlot = keccak256(abi.encode(address(this), USDC_BALANCES_SLOT));
        VM.store(USDC, balanceSlot, bytes32(collateralAssetsIn));
        require(IERC20(USDC).balanceOf(address(this)) == collateralAssetsIn, "fork funding failed");
        require(IERC20(USDC).approve(CORK_ADAPTER, collateralAssetsIn), "approval failed");

        Call[] memory calls = new Call[](2);
        calls[0] = Call({
            to: CORK_ADAPTER,
            data: abi.encodeWithSelector(bytes4(0xd96ca0b9), USDC, CORK_ADAPTER, collateralAssetsIn),
            value: 0,
            skipRevert: false,
            callbackHash: bytes32(0)
        });
        calls[1] = Call({
            to: CORK_ADAPTER,
            data: abi.encodeWithSelector(
                bytes4(0x41881406), POOL_ID, collateralAssetsIn, address(this), 0, block.timestamp + 1 hours
            ),
            value: 0,
            skipRevert: false,
            callbackHash: bytes32(0)
        });

        uint256 cptBefore = IERC20(cpt).balanceOf(address(this));
        uint256 cstBefore = IERC20(cst).balanceOf(address(this));
        IBundler3(BUNDLER3).multicall(calls);

        require(IERC20(USDC).balanceOf(address(this)) == 0, "collateral was not spent");
        require(IERC20(USDC).balanceOf(CORK_ADAPTER) == 0, "adapter retained collateral");
        require(IERC20(cpt).balanceOf(address(this)) - cptBefore == 1 ether, "wrong cPT output");
        require(IERC20(cst).balanceOf(address(this)) - cstBefore == 1 ether, "wrong cST output");
    }
}
