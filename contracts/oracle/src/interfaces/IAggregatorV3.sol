// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

/// @title Chainlink aggregator version 3 interface
/// @notice Minimal interface required to read and validate a Chainlink proxy feed.
interface IAggregatorV3 {
    /// @notice Returns the number of decimal places used by feed answers.
    /// @return The feed answer precision.
    function decimals() external view returns (uint8);

    /// @notice Returns the most recently reported round.
    /// @return roundId The round identifier.
    /// @return answer The reported answer.
    /// @return startedAt The timestamp when the round began.
    /// @return updatedAt The timestamp when the answer was updated.
    /// @return answeredInRound The round in which the answer was finalized.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
