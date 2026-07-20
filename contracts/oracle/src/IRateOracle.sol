// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

/// @title Cork rate oracle interface
/// @notice Minimal rate interface consumed by Phoenix markets.
interface IRateOracle {
    /// @notice Returns the current reference-asset value denominated in collateral-asset units.
    /// @return rateWad The rate with 18 decimal places of precision.
    function rate() external view returns (uint256);
}
