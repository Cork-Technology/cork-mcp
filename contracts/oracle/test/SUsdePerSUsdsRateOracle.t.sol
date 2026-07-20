// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {SUsdePerSUsdsRateOracle} from "../src/SUsdePerSUsdsRateOracle.sol";
import {ISUsdePerSUsdsRateOracle} from "../src/interfaces/ISUsdePerSUsdsRateOracle.sol";
import {FullMath} from "../src/libraries/FullMath.sol";
import {MockAggregatorV3} from "./mocks/MockAggregatorV3.sol";

interface Vm {
    function chainId(uint256 newChainId) external;
    function warp(uint256 newTimestamp) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory value);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256 forkId);
    function skip(bool skipTest) external;
}

contract FullMathHarness {
    function mulDivDown(uint256 x, uint256 y, uint256 denominator) external pure returns (uint256) {
        return FullMath.mulDivDown(x, y, denominator);
    }
}

contract SUsdePerSUsdsRateOracleTest {
    error AssertionFailed();

    uint256 internal constant ARBITRUM_CHAIN_ID = 42_161;
    uint256 internal constant TEST_TIMESTAMP = 2_000_000;
    uint256 internal constant SUSDS_MAXIMUM_AGE = 100;
    uint256 internal constant SUSDE_MAXIMUM_AGE = 200;
    uint256 internal constant USDE_MAXIMUM_AGE = 300;
    uint256 internal constant SEQUENCER_GRACE_PERIOD = 1_000;

    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct Environment {
        MockAggregatorV3 sUsdsUsds;
        MockAggregatorV3 sUsdeUsd;
        MockAggregatorV3 usdeUsd;
        MockAggregatorV3 sequencer;
        SUsdePerSUsdsRateOracle oracle;
    }

    function setUp() external {
        vm.chainId(ARBITRUM_CHAIN_ID);
        vm.warp(TEST_TIMESTAMP);
    }

    function testConfigurationGettersExposeExactWiring() external {
        Environment memory env = _deploy();

        _assertEq(env.oracle.sUsdsUsdsFeed(), address(env.sUsdsUsds));
        _assertEq(env.oracle.sUsdeUsdFeed(), address(env.sUsdeUsd));
        _assertEq(env.oracle.usdeUsdFeed(), address(env.usdeUsd));
        _assertEq(env.oracle.sequencerUptimeFeed(), address(env.sequencer));
        _assertEq(env.oracle.sUsdsUsdsMaximumAge(), SUSDS_MAXIMUM_AGE);
        _assertEq(env.oracle.sUsdeUsdMaximumAge(), SUSDE_MAXIMUM_AGE);
        _assertEq(env.oracle.usdeUsdMaximumAge(), USDE_MAXIMUM_AGE);
        _assertEq(env.oracle.sequencerGracePeriod(), SEQUENCER_GRACE_PERIOD);
    }

    function testConstructorRejectsWrongChain() external {
        Environment memory env = _feedsOnly();
        vm.chainId(1);

        vm.expectRevert(abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.WrongChain.selector, 1));
        _construct(env, address(env.sUsdsUsds), address(env.sUsdeUsd), address(env.usdeUsd), address(env.sequencer));
    }

    function testConstructorRejectsEachZeroAddress() external {
        for (uint256 index; index < 4; ++index) {
            Environment memory env = _feedsOnly();
            address[4] memory feeds =
                [address(env.sUsdsUsds), address(env.sUsdeUsd), address(env.usdeUsd), address(env.sequencer)];
            feeds[index] = address(0);

            vm.expectRevert(ISUsdePerSUsdsRateOracle.ZeroAddress.selector);
            _construct(env, feeds[0], feeds[1], feeds[2], feeds[3]);
        }
    }

    function testConstructorRejectsEachZeroTimingValue() external {
        Environment memory env = _feedsOnly();
        for (uint256 index; index < 4; ++index) {
            uint256[4] memory timings = [SUSDS_MAXIMUM_AGE, SUSDE_MAXIMUM_AGE, USDE_MAXIMUM_AGE, SEQUENCER_GRACE_PERIOD];
            timings[index] = 0;

            vm.expectRevert(ISUsdePerSUsdsRateOracle.ZeroTimingValue.selector);
            new SUsdePerSUsdsRateOracle(
                address(env.sUsdsUsds),
                address(env.sUsdeUsd),
                address(env.usdeUsd),
                address(env.sequencer),
                timings[0],
                timings[1],
                timings[2],
                timings[3]
            );
        }
    }

    function testConstructorRejectsUnexpectedSUsdsUsdsDecimals() external {
        Environment memory env = _feedsOnly();
        MockAggregatorV3 wrong = new MockAggregatorV3(17);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.UnexpectedDecimals.selector, address(wrong), uint8(18), uint8(17)
            )
        );
        _construct(env, address(wrong), address(env.sUsdeUsd), address(env.usdeUsd), address(env.sequencer));
    }

    function testConstructorRejectsUnexpectedSUsdeUsdDecimals() external {
        Environment memory env = _feedsOnly();
        MockAggregatorV3 wrong = new MockAggregatorV3(18);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.UnexpectedDecimals.selector, address(wrong), uint8(8), uint8(18)
            )
        );
        _construct(env, address(env.sUsdsUsds), address(wrong), address(env.usdeUsd), address(env.sequencer));
    }

    function testConstructorRejectsUnexpectedUsdeUsdDecimals() external {
        Environment memory env = _feedsOnly();
        MockAggregatorV3 wrong = new MockAggregatorV3(6);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.UnexpectedDecimals.selector, address(wrong), uint8(8), uint8(6)
            )
        );
        _construct(env, address(env.sUsdsUsds), address(env.sUsdeUsd), address(wrong), address(env.sequencer));
    }

    function testConstructorRejectsUnexpectedSequencerDecimals() external {
        Environment memory env = _feedsOnly();
        MockAggregatorV3 wrong = new MockAggregatorV3(1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.UnexpectedDecimals.selector, address(wrong), uint8(0), uint8(1)
            )
        );
        _construct(env, address(env.sUsdsUsds), address(env.sUsdeUsd), address(env.usdeUsd), address(wrong));
    }

    function testEachPriceFeedRejectsMissingRound() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            feed.setRoundData(0, 1, TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 0);

            vm.expectRevert(
                abi.encodeWithSelector(
                    ISUsdePerSUsdsRateOracle.InvalidRound.selector, address(feed), uint80(0), uint80(0)
                )
            );
            env.oracle.rate();
        }
    }

    function testEachPriceFeedRejectsIncompleteRound() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            feed.setRoundData(3, 1, TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 2);

            vm.expectRevert(
                abi.encodeWithSelector(
                    ISUsdePerSUsdsRateOracle.InvalidRound.selector, address(feed), uint80(3), uint80(2)
                )
            );
            env.oracle.rate();
        }
    }

    function testEachPriceFeedRejectsZeroAnswer() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            feed.setRoundData(1, 0, TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);

            vm.expectRevert(
                abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.InvalidAnswer.selector, address(feed), int256(0))
            );
            env.oracle.rate();
        }
    }

    function testEachPriceFeedRejectsNegativeAnswer() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            feed.setRoundData(1, -1, TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);

            vm.expectRevert(
                abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.InvalidAnswer.selector, address(feed), int256(-1))
            );
            env.oracle.rate();
        }
    }

    function testEachPriceFeedRejectsZeroUpdatedAt() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            feed.setRoundData(1, 1, TEST_TIMESTAMP - 10, 0, 1);

            vm.expectRevert(
                abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.InvalidTimestamp.selector, address(feed), 0)
            );
            env.oracle.rate();
        }
    }

    function testEachPriceFeedRejectsFutureUpdatedAt() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            feed.setRoundData(1, 1, TEST_TIMESTAMP - 10, TEST_TIMESTAMP + 1, 1);

            vm.expectRevert(
                abi.encodeWithSelector(
                    ISUsdePerSUsdsRateOracle.InvalidTimestamp.selector, address(feed), TEST_TIMESTAMP + 1
                )
            );
            env.oracle.rate();
        }
    }

    function testEachPriceFeedUsesItsIndependentMaximumAge() external {
        for (uint256 index; index < 3; ++index) {
            Environment memory env = _deploy();
            MockAggregatorV3 feed = _priceFeed(env, index);
            uint256 maximumAge = _maximumAge(index);
            uint256 age = maximumAge + 1;
            feed.setRoundData(1, 1, TEST_TIMESTAMP - age, TEST_TIMESTAMP - age, 1);

            vm.expectRevert(
                abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.StaleFeed.selector, address(feed), age, maximumAge)
            );
            env.oracle.rate();
        }
    }

    function testPriceAtExactMaximumAgeIsAccepted() external {
        Environment memory env = _deploy();
        env.sUsdsUsds
            .setRoundData(1, int256(1e18), TEST_TIMESTAMP - SUSDS_MAXIMUM_AGE, TEST_TIMESTAMP - SUSDS_MAXIMUM_AGE, 1);

        _assertEq(env.oracle.rate(), 1e18);
    }

    function testSequencerRejectsMissingRound() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(0, 0, TEST_TIMESTAMP - 2_000, TEST_TIMESTAMP - 10, 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.InvalidRound.selector, address(env.sequencer), uint80(0), uint80(0)
            )
        );
        env.oracle.rate();
    }

    function testSequencerRejectsIncompleteRound() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(2, 0, TEST_TIMESTAMP - 2_000, TEST_TIMESTAMP - 10, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.InvalidRound.selector, address(env.sequencer), uint80(2), uint80(1)
            )
        );
        env.oracle.rate();
    }

    function testSequencerRejectsZeroStartedAt() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 0, 0, TEST_TIMESTAMP - 10, 1);

        vm.expectRevert(
            abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.InvalidTimestamp.selector, address(env.sequencer), 0)
        );
        env.oracle.rate();
    }

    function testSequencerRejectsFutureStartedAt() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 0, TEST_TIMESTAMP + 1, TEST_TIMESTAMP - 10, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.InvalidTimestamp.selector, address(env.sequencer), TEST_TIMESTAMP + 1
            )
        );
        env.oracle.rate();
    }

    function testSequencerRejectsZeroUpdatedAt() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 0, TEST_TIMESTAMP - 2_000, 0, 1);

        vm.expectRevert(
            abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.InvalidTimestamp.selector, address(env.sequencer), 0)
        );
        env.oracle.rate();
    }

    function testSequencerRejectsFutureUpdatedAt() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 0, TEST_TIMESTAMP - 2_000, TEST_TIMESTAMP + 1, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.InvalidTimestamp.selector, address(env.sequencer), TEST_TIMESTAMP + 1
            )
        );
        env.oracle.rate();
    }

    function testSequencerRejectsUpdatedAtBeforeStartedAt() external {
        Environment memory env = _deploy();
        uint256 startedAt = TEST_TIMESTAMP - 2_000;
        uint256 updatedAt = startedAt - 1;
        env.sequencer.setRoundData(1, 0, startedAt, updatedAt, 1);

        vm.expectRevert(
            abi.encodeWithSelector(ISUsdePerSUsdsRateOracle.InvalidSequencerTimestamps.selector, startedAt, updatedAt)
        );
        env.oracle.rate();
    }

    function testSequencerRejectsDownStatus() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 1, TEST_TIMESTAMP - 2_000, TEST_TIMESTAMP - 10, 1);

        vm.expectRevert(ISUsdePerSUsdsRateOracle.SequencerDown.selector);
        env.oracle.rate();
    }

    function testSequencerRequiresStrictlyMoreThanGracePeriod() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 0, TEST_TIMESTAMP - SEQUENCER_GRACE_PERIOD, TEST_TIMESTAMP - 10, 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ISUsdePerSUsdsRateOracle.SequencerGracePeriodNotElapsed.selector,
                SEQUENCER_GRACE_PERIOD,
                SEQUENCER_GRACE_PERIOD
            )
        );
        env.oracle.rate();
    }

    function testSequencerAcceptsOneSecondBeyondGracePeriod() external {
        Environment memory env = _deploy();
        env.sequencer.setRoundData(1, 0, TEST_TIMESTAMP - SEQUENCER_GRACE_PERIOD - 1, TEST_TIMESTAMP - 10, 1);

        _assertEq(env.oracle.rate(), 1e18);
    }

    function testFormulaComposesShareExchangeRates() external {
        Environment memory env = _deploy();
        _setPriceAnswers(env, 2e18, 3, 2);

        _assertEq(env.oracle.rate(), 750_000_000_000_000_000);
    }

    function testFormulaRoundsDownAtBothCompositions() external {
        Environment memory env = _deploy();
        _setPriceAnswers(env, 2e18, 10, 3);

        _assertEq(env.oracle.rate(), 1_666_666_666_666_666_666);
    }

    function testFormulaRejectsZeroFirstComposition() external {
        Environment memory env = _deploy();
        _setPriceAnswers(env, 1e18, 1, 1e18 + 1);

        vm.expectRevert(ISUsdePerSUsdsRateOracle.ZeroRate.selector);
        env.oracle.rate();
    }

    function testFormulaRejectsZeroFinalRate() external {
        Environment memory env = _deploy();
        _setPriceAnswers(env, 1e36 + 1, 1, 1);

        vm.expectRevert(ISUsdePerSUsdsRateOracle.ZeroRate.selector);
        env.oracle.rate();
    }

    function testFuzzFormulaMatchesIndependentCheckedArithmetic(uint128 sUsdsSeed, uint128 sUsdeSeed, uint128 usdeSeed)
        external
    {
        uint256 sUsds = uint256(sUsdsSeed) % 5e18 + 1;
        uint256 sUsde = uint256(sUsdeSeed) % 1e20 + 1;
        uint256 usde = uint256(usdeSeed) % 1e20 + 1;
        Environment memory env = _deploy();
        _setPriceAnswers(env, sUsds, sUsde, usde);

        uint256 firstComposition = sUsde * 1e18 / usde;
        uint256 expected = firstComposition * 1e18 / sUsds;
        if (firstComposition == 0 || expected == 0) {
            vm.expectRevert(ISUsdePerSUsdsRateOracle.ZeroRate.selector);
            env.oracle.rate();
            return;
        }
        _assertEq(env.oracle.rate(), expected);
    }

    function testFullMathHandlesHighLimbProduct() external {
        FullMathHarness harness = new FullMathHarness();
        _assertEq(harness.mulDivDown(type(uint256).max, type(uint256).max, type(uint256).max), type(uint256).max);
    }

    function testFullMathHighLimbOddDenominatorWithRemainder() external {
        FullMathHarness harness = new FullMathHarness();
        // Expected literal independently derived with arbitrary-precision integer division.
        _assertEq(
            harness.mulDivDown(
                1_684_996_666_696_914_987_166_688_442_938_726_917_102_321_526_421_131_458_970_210_208_467,
                1_461_501_637_330_902_918_203_684_832_726_159_562_866_920_197_297,
                340_282_366_920_938_463_463_374_607_431_768_211_507
            ),
            7_237_005_577_332_262_213_973_186_563_091_900_512_907_179_247_636_116_164_784_816_150_090_813_755_397
        );
    }

    function testFullMathHighLimbPowerOfTwoDenominatorWithRemainder() external {
        FullMathHarness harness = new FullMathHarness();
        // Expected literal independently derived by shifting an arbitrary-precision product.
        _assertEq(
            harness.mulDivDown(
                1_606_938_044_258_990_275_541_962_092_341_162_602_522_202_993_782_792_958_758_165,
                1_267_650_600_228_229_401_497_690_859_697,
                18_446_744_073_709_551_616
            ),
            110_427_941_548_649_020_599_042_130_622_045_097_757_954_307_409_131_739_500_685_356_953_501_696
        );
    }

    function testFullMathRoundsDown() external {
        FullMathHarness harness = new FullMathHarness();
        _assertEq(harness.mulDivDown(10, 10, 6), 16);
    }

    function testFullMathRejectsZeroDenominator() external {
        FullMathHarness harness = new FullMathHarness();
        vm.expectRevert(ISUsdePerSUsdsRateOracle.ZeroDenominator.selector);
        harness.mulDivDown(1, 1, 0);
    }

    function testFullMathRejectsOverflowingResult() external {
        FullMathHarness harness = new FullMathHarness();
        vm.expectRevert(ISUsdePerSUsdsRateOracle.MulDivOverflow.selector);
        harness.mulDivDown(type(uint256).max, type(uint256).max, 1);
    }

    function _deploy() internal returns (Environment memory env) {
        env = _feedsOnly();
        env.oracle = _construct(
            env, address(env.sUsdsUsds), address(env.sUsdeUsd), address(env.usdeUsd), address(env.sequencer)
        );
    }

    function _feedsOnly() internal returns (Environment memory env) {
        env.sUsdsUsds = new MockAggregatorV3(18);
        env.sUsdeUsd = new MockAggregatorV3(8);
        env.usdeUsd = new MockAggregatorV3(8);
        env.sequencer = new MockAggregatorV3(0);

        env.sUsdsUsds.setRoundData(1, int256(1e18), TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);
        env.sUsdeUsd.setRoundData(1, int256(1e8), TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);
        env.usdeUsd.setRoundData(1, int256(1e8), TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);
        env.sequencer.setRoundData(1, 0, TEST_TIMESTAMP - 2_000, TEST_TIMESTAMP - 10, 1);
    }

    function _construct(Environment memory, address sUsdsUsds, address sUsdeUsd, address usdeUsd, address sequencer)
        internal
        returns (SUsdePerSUsdsRateOracle)
    {
        return new SUsdePerSUsdsRateOracle(
            sUsdsUsds,
            sUsdeUsd,
            usdeUsd,
            sequencer,
            SUSDS_MAXIMUM_AGE,
            SUSDE_MAXIMUM_AGE,
            USDE_MAXIMUM_AGE,
            SEQUENCER_GRACE_PERIOD
        );
    }

    function _priceFeed(Environment memory env, uint256 index) internal pure returns (MockAggregatorV3) {
        if (index == 0) return env.sUsdsUsds;
        if (index == 1) return env.sUsdeUsd;
        return env.usdeUsd;
    }

    function _maximumAge(uint256 index) internal pure returns (uint256) {
        if (index == 0) return SUSDS_MAXIMUM_AGE;
        if (index == 1) return SUSDE_MAXIMUM_AGE;
        return USDE_MAXIMUM_AGE;
    }

    function _setPriceAnswers(Environment memory env, uint256 sUsds, uint256 sUsde, uint256 usde) internal {
        // All callers constrain these values below int256.max.
        // forge-lint: disable-next-line(unsafe-typecast)
        env.sUsdsUsds.setRoundData(1, int256(sUsds), TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);
        // All callers constrain these values below int256.max.
        // forge-lint: disable-next-line(unsafe-typecast)
        env.sUsdeUsd.setRoundData(1, int256(sUsde), TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);
        // All callers constrain these values below int256.max.
        // forge-lint: disable-next-line(unsafe-typecast)
        env.usdeUsd.setRoundData(1, int256(usde), TEST_TIMESTAMP - 10, TEST_TIMESTAMP - 10, 1);
    }

    function _assertEq(uint256 actual, uint256 expected) internal pure {
        if (actual != expected) revert AssertionFailed();
    }

    function _assertEq(address actual, address expected) internal pure {
        if (actual != expected) revert AssertionFailed();
    }
}

contract SUsdePerSUsdsRateOracleForkTest {
    error AssertionFailed();

    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant SUSDS_USDS_FEED = 0x2483326d19f780Fb082f333Fe124e4C075B207ba;
    address internal constant SUSDE_USD_FEED = 0xf2215b9c35b1697B5f47e407c917a40D055E68d7;
    address internal constant USDE_USD_FEED = 0x88AC7Bca36567525A866138F03a6F6844868E0Bc;
    address internal constant SEQUENCER_UPTIME_FEED = 0xFdB631F5EE196F0ed6FAa767959853A9F217697D;

    function testForkArbitrumReadsCorrectedThreeFeedCompositionWhenRpcConfigured() external {
        string memory rpcUrl = vm.envOr("ARBITRUM_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(rpcUrl);
        SUsdePerSUsdsRateOracle oracle = new SUsdePerSUsdsRateOracle(
            SUSDS_USDS_FEED, SUSDE_USD_FEED, USDE_USD_FEED, SEQUENCER_UPTIME_FEED, 86_400, 86_400, 86_400, 3_600
        );

        if (oracle.rate() == 0) revert AssertionFailed();
        if (oracle.sUsdsUsdsFeed() != SUSDS_USDS_FEED) revert AssertionFailed();
        if (oracle.sUsdeUsdFeed() != SUSDE_USD_FEED) revert AssertionFailed();
        if (oracle.usdeUsdFeed() != USDE_USD_FEED) revert AssertionFailed();
        if (oracle.sequencerUptimeFeed() != SEQUENCER_UPTIME_FEED) revert AssertionFailed();
    }
}
