// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {IRateOracle} from "../IRateOracle.sol";

/// @title sUSDe-per-sUSDS rate oracle interface
/// @notice Defines an immutable, ownerless Arbitrum oracle with no authority or cached fallback.
/// @dev The 18-decimal rate is
/// floor(floor(sUSDe/USD * 1e18 / USDe/USD) * 1e18 / sUSDS/USDS), with both divisions
/// rounding down. Every call fails closed on invalid data. Its four feed reads are compiler-enforced
/// read-only static calls; the oracle exposes no callback or state-changing reentrancy surface.
interface ISUsdePerSUsdsRateOracle is IRateOracle {
    /// @notice The deployment chain is not Arbitrum One.
    /// @param actualChainId The chain identifier observed by the constructor.
    error WrongChain(uint256 actualChainId);

    /// @notice A required feed address is zero.
    error ZeroAddress();

    /// @notice A maximum age or the sequencer grace period is zero.
    error ZeroTimingValue();

    /// @notice A feed does not use the precision required by this composition.
    /// @param feed The feed with the unexpected configuration.
    /// @param expected The required decimal count.
    /// @param actual The reported decimal count.
    error UnexpectedDecimals(address feed, uint8 expected, uint8 actual);

    /// @notice A feed returned a missing or incomplete round.
    /// @param feed The invalid feed.
    /// @param roundId The round identifier returned by the feed.
    /// @param answeredInRound The round in which the answer was finalized.
    error InvalidRound(address feed, uint80 roundId, uint80 answeredInRound);

    /// @notice A price feed returned a non-positive answer.
    /// @param feed The invalid price feed.
    /// @param answer The answer returned by the feed.
    error InvalidAnswer(address feed, int256 answer);

    /// @notice A feed timestamp is zero or later than the current block timestamp.
    /// @param feed The invalid feed.
    /// @param timestamp The invalid timestamp.
    error InvalidTimestamp(address feed, uint256 timestamp);

    /// @notice A price feed answer is older than its configured maximum age.
    /// @param feed The stale price feed.
    /// @param age The observed age in seconds.
    /// @param maximumAge The maximum permitted age in seconds.
    error StaleFeed(address feed, uint256 age, uint256 maximumAge);

    /// @notice The Arbitrum sequencer is reported as unavailable.
    error SequencerDown();

    /// @notice The Arbitrum sequencer has not been continuously available beyond the grace period.
    /// @param elapsed The seconds elapsed since the sequencer became available.
    /// @param gracePeriod The required grace period in seconds.
    error SequencerGracePeriodNotElapsed(uint256 elapsed, uint256 gracePeriod);

    /// @notice Sequencer timestamps are internally inconsistent.
    /// @param startedAt The timestamp when the sequencer status round began.
    /// @param updatedAt The timestamp when the sequencer status answer was updated.
    error InvalidSequencerTimestamps(uint256 startedAt, uint256 updatedAt);

    /// @notice A positive input tuple rounded to a zero composed share ratio or final rate.
    error ZeroRate();

    /// @notice A full-precision division was attempted with a zero denominator.
    error ZeroDenominator();

    /// @notice A full-precision multiplication and division result exceeds 256 bits.
    error MulDivOverflow();

    /// @notice Returns one sUSDe share denominated in sUSDS shares.
    /// @dev Returns
    /// floor(floor(sUSDe/USD * 1e18 / USDe/USD) * 1e18 / sUSDS/USDS). Both divisions round
    /// down. The function fails closed without a last-good cache. All four external feed calls are
    /// read-only static calls, and this ownerless immutable oracle has no callback or state-changing
    /// reentrancy surface.
    /// @return rateWad The nonzero composed rate with 18 decimal places of precision.
    function rate() external view override returns (uint256);

    /// @notice Returns the sUSDS/USDS exchange-rate proxy.
    /// @return feed The immutable proxy address.
    function sUsdsUsdsFeed() external view returns (address feed);

    /// @notice Returns the sUSDe/USD price proxy.
    /// @return feed The immutable proxy address.
    function sUsdeUsdFeed() external view returns (address feed);

    /// @notice Returns the USDe/USD price proxy.
    /// @return feed The immutable proxy address.
    function usdeUsdFeed() external view returns (address feed);

    /// @notice Returns the Arbitrum sequencer uptime proxy.
    /// @return feed The immutable proxy address.
    function sequencerUptimeFeed() external view returns (address feed);

    /// @notice Returns the maximum permitted age of the sUSDS/USDS answer.
    /// @return maximumAge The immutable age limit in seconds.
    function sUsdsUsdsMaximumAge() external view returns (uint256 maximumAge);

    /// @notice Returns the maximum permitted age of the sUSDe/USD answer.
    /// @return maximumAge The immutable age limit in seconds.
    function sUsdeUsdMaximumAge() external view returns (uint256 maximumAge);

    /// @notice Returns the maximum permitted age of the USDe/USD answer.
    /// @return maximumAge The immutable age limit in seconds.
    function usdeUsdMaximumAge() external view returns (uint256 maximumAge);

    /// @notice Returns the required sequencer recovery grace period.
    /// @return gracePeriod The immutable grace period in seconds.
    function sequencerGracePeriod() external view returns (uint256 gracePeriod);
}
