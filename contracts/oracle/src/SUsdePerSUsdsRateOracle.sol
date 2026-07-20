// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {ISUsdePerSUsdsRateOracle} from "./interfaces/ISUsdePerSUsdsRateOracle.sol";
import {FullMath} from "./libraries/FullMath.sol";

/// @title Fundamental sUSDe-per-sUSDS rate oracle
/// @notice Quotes one sUSDe share in sUSDS shares on Arbitrum using current Chainlink rounds.
/// @dev The composition is floor(floor(sUSDe/USD * 1e18 / USDe/USD) * 1e18 /
/// sUSDS/USDS). It deliberately isolates the sUSDe/USDe exchange rate before comparing share
/// exchange rates, so a USDe price impairment is not incorporated into the fundamental rate.
/// The contract is ownerless, immutable, non-upgradeable, and intentionally has no fallback price.
contract SUsdePerSUsdsRateOracle is ISUsdePerSUsdsRateOracle {
    uint256 internal constant ARBITRUM_CHAIN_ID = 42_161;
    uint256 internal constant WAD = 1e18;

    uint8 internal constant SUSDS_USDS_DECIMALS = 18;
    uint8 internal constant SUSDE_USD_DECIMALS = 8;
    uint8 internal constant USDE_USD_DECIMALS = 8;
    uint8 internal constant SEQUENCER_DECIMALS = 0;

    /// @inheritdoc ISUsdePerSUsdsRateOracle
    address public immutable override sUsdsUsdsFeed;
    /// @inheritdoc ISUsdePerSUsdsRateOracle
    address public immutable override sUsdeUsdFeed;
    /// @inheritdoc ISUsdePerSUsdsRateOracle
    address public immutable override usdeUsdFeed;
    /// @inheritdoc ISUsdePerSUsdsRateOracle
    address public immutable override sequencerUptimeFeed;

    /// @inheritdoc ISUsdePerSUsdsRateOracle
    uint256 public immutable override sUsdsUsdsMaximumAge;
    /// @inheritdoc ISUsdePerSUsdsRateOracle
    uint256 public immutable override sUsdeUsdMaximumAge;
    /// @inheritdoc ISUsdePerSUsdsRateOracle
    uint256 public immutable override usdeUsdMaximumAge;
    /// @inheritdoc ISUsdePerSUsdsRateOracle
    uint256 public immutable override sequencerGracePeriod;

    /// @notice Configures all immutable feeds and their independent freshness limits.
    /// @param sUsdsUsdsFeed_ The sUSDS/USDS exchange-rate proxy, required to use 18 decimals.
    /// @param sUsdeUsdFeed_ The sUSDe/USD price proxy, required to use 8 decimals.
    /// @param usdeUsdFeed_ The USDe/USD price proxy, required to use 8 decimals.
    /// @param sequencerUptimeFeed_ The Arbitrum sequencer uptime proxy, required to use 0 decimals.
    /// @param sUsdsUsdsMaximumAge_ Maximum sUSDS/USDS answer age in seconds.
    /// @param sUsdeUsdMaximumAge_ Maximum sUSDe/USD answer age in seconds.
    /// @param usdeUsdMaximumAge_ Maximum USDe/USD answer age in seconds.
    /// @param sequencerGracePeriod_ Required seconds of sequencer availability before reads resume.
    constructor(
        address sUsdsUsdsFeed_,
        address sUsdeUsdFeed_,
        address usdeUsdFeed_,
        address sequencerUptimeFeed_,
        uint256 sUsdsUsdsMaximumAge_,
        uint256 sUsdeUsdMaximumAge_,
        uint256 usdeUsdMaximumAge_,
        uint256 sequencerGracePeriod_
    ) {
        if (block.chainid != ARBITRUM_CHAIN_ID) revert WrongChain(block.chainid);
        if (
            sUsdsUsdsFeed_ == address(0) || sUsdeUsdFeed_ == address(0) || usdeUsdFeed_ == address(0)
                || sequencerUptimeFeed_ == address(0)
        ) revert ZeroAddress();
        if (
            sUsdsUsdsMaximumAge_ == 0 || sUsdeUsdMaximumAge_ == 0 || usdeUsdMaximumAge_ == 0
                || sequencerGracePeriod_ == 0
        ) revert ZeroTimingValue();

        _requireDecimals(sUsdsUsdsFeed_, SUSDS_USDS_DECIMALS);
        _requireDecimals(sUsdeUsdFeed_, SUSDE_USD_DECIMALS);
        _requireDecimals(usdeUsdFeed_, USDE_USD_DECIMALS);
        _requireDecimals(sequencerUptimeFeed_, SEQUENCER_DECIMALS);

        sUsdsUsdsFeed = sUsdsUsdsFeed_;
        sUsdeUsdFeed = sUsdeUsdFeed_;
        usdeUsdFeed = usdeUsdFeed_;
        sequencerUptimeFeed = sequencerUptimeFeed_;
        sUsdsUsdsMaximumAge = sUsdsUsdsMaximumAge_;
        sUsdeUsdMaximumAge = sUsdeUsdMaximumAge_;
        usdeUsdMaximumAge = usdeUsdMaximumAge_;
        sequencerGracePeriod = sequencerGracePeriod_;
    }

    /// @inheritdoc ISUsdePerSUsdsRateOracle
    function rate() external view override returns (uint256) {
        _requireSequencerAvailable();

        uint256 sUsdeUsd = _readPrice(sUsdeUsdFeed, sUsdeUsdMaximumAge);
        uint256 usdeUsd = _readPrice(usdeUsdFeed, usdeUsdMaximumAge);
        uint256 sUsdsUsds = _readPrice(sUsdsUsdsFeed, sUsdsUsdsMaximumAge);

        uint256 sUsdeUsde = FullMath.mulDivDown(sUsdeUsd, WAD, usdeUsd);
        if (sUsdeUsde == 0) revert ZeroRate();

        uint256 rateWad = FullMath.mulDivDown(sUsdeUsde, WAD, sUsdsUsds);
        if (rateWad == 0) revert ZeroRate();
        return rateWad;
    }

    /// @dev Verifies a feed's fixed decimal convention at construction time.
    /// @param feed The feed whose decimal count is read.
    /// @param expected The required decimal count.
    function _requireDecimals(address feed, uint8 expected) private view {
        uint8 actual = IAggregatorV3(feed).decimals();
        if (actual != expected) revert UnexpectedDecimals(feed, expected, actual);
    }

    /// @dev Reverts unless a complete sequencer round reports continuous availability beyond grace.
    function _requireSequencerAvailable() private view {
        (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            IAggregatorV3(sequencerUptimeFeed).latestRoundData();

        _requireCompleteRound(sequencerUptimeFeed, roundId, answeredInRound);
        _requireTimestamp(sequencerUptimeFeed, startedAt);
        _requireTimestamp(sequencerUptimeFeed, updatedAt);
        if (updatedAt < startedAt) revert InvalidSequencerTimestamps(startedAt, updatedAt);
        if (answer != 0) revert SequencerDown();

        uint256 elapsed = block.timestamp - startedAt;
        if (elapsed <= sequencerGracePeriod) {
            revert SequencerGracePeriodNotElapsed(elapsed, sequencerGracePeriod);
        }
    }

    /// @dev Reads a complete, positive, current price answer from one immutable feed.
    /// @param feed The price feed to read.
    /// @param maximumAge The maximum permitted age in seconds.
    /// @return price The positive raw feed answer.
    function _readPrice(address feed, uint256 maximumAge) private view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            IAggregatorV3(feed).latestRoundData();

        _requireCompleteRound(feed, roundId, answeredInRound);
        if (answer <= 0) revert InvalidAnswer(feed, answer);
        _requireTimestamp(feed, updatedAt);

        uint256 age = block.timestamp - updatedAt;
        if (age > maximumAge) revert StaleFeed(feed, age, maximumAge);
        // The preceding positive-answer check proves this signed-to-unsigned conversion is lossless.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(answer);
    }

    /// @dev Verifies that a Chainlink round exists and was finalized in that round or a later one.
    /// @param feed The feed that supplied the round.
    /// @param roundId The reported round identifier.
    /// @param answeredInRound The round in which the answer was finalized.
    function _requireCompleteRound(address feed, uint80 roundId, uint80 answeredInRound) private pure {
        if (roundId == 0 || answeredInRound < roundId) revert InvalidRound(feed, roundId, answeredInRound);
    }

    /// @dev Verifies that a required timestamp exists and is not in the future.
    /// @param feed The feed that supplied the timestamp.
    /// @param timestamp The timestamp to validate.
    function _requireTimestamp(address feed, uint256 timestamp) private view {
        // Timestamp ordering is the intended trust-boundary check for externally reported rounds.
        // forge-lint: disable-next-line(block-timestamp)
        if (timestamp == 0 || timestamp > block.timestamp) revert InvalidTimestamp(feed, timestamp);
    }
}
