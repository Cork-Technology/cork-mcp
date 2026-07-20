// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {ISUsdePerSUsdsRateOracle} from "../interfaces/ISUsdePerSUsdsRateOracle.sol";

/// @title Full-precision arithmetic
/// @notice Computes floor(x * y / denominator) without losing the high 256 bits of the product.
/// @dev Adapted from Uniswap v3-core `contracts/libraries/FullMath.sol` at tag `v1.0.0`:
/// https://github.com/Uniswap/v3-core/blob/v1.0.0/contracts/libraries/FullMath.sol
/// Local reductions are unsigned-only and round-down-only, use qualified oracle-interface custom
/// errors, and contain no Solidity `unchecked` block. Assembly is required for 512-bit intermediate
/// arithmetic and every instruction is documented immediately above its use.
library FullMath {
    /// @notice Multiplies x and y, divides by denominator, and rounds toward zero.
    /// @param x The first multiplicand.
    /// @param y The second multiplicand.
    /// @param denominator The divisor.
    /// @return result The full-precision quotient.
    function mulDivDown(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result) {
        if (denominator == 0) revert ISUsdePerSUsdsRateOracle.ZeroDenominator();

        uint256 productLow;
        uint256 productHigh;
        assembly ("memory-safe") {
            // Compute the product modulo 2^256 - 1 so the high limb can be reconstructed.
            let productMod := mulmod(x, y, not(0))
            // Compute the low 256-bit limb of x * y.
            productLow := mul(x, y)
            // Reconstruct the high limb, accounting for carry from the modular subtraction.
            productHigh := sub(sub(productMod, productLow), lt(productMod, productLow))
        }

        if (productHigh == 0) return productLow / denominator;
        if (denominator <= productHigh) revert ISUsdePerSUsdsRateOracle.MulDivOverflow();

        assembly ("memory-safe") {
            // Compute the remainder so it can be removed from the 512-bit product exactly.
            let remainder := mulmod(x, y, denominator)
            // Borrow from the high limb when the remainder exceeds the low limb.
            productHigh := sub(productHigh, gt(remainder, productLow))
            // Subtract the remainder from the low limb, leaving a division-exact product.
            productLow := sub(productLow, remainder)

            // Isolate the largest power-of-two divisor of the denominator.
            let powerOfTwo := and(denominator, sub(0, denominator))
            // Divide the now-exact denominator by its power-of-two factor.
            denominator := div(denominator, powerOfTwo)
            // Divide the low product limb by the same power-of-two factor.
            productLow := div(productLow, powerOfTwo)
            // Convert the power-of-two factor into 2^256 / powerOfTwo.
            powerOfTwo := add(div(sub(0, powerOfTwo), powerOfTwo), 1)
            // Shift the high limb into the vacated low-limb bits.
            productLow := or(productLow, mul(productHigh, powerOfTwo))

            // Seed an inverse correct for four bits of the now-odd denominator.
            let inverse := xor(mul(3, denominator), 2)
            // Double the inverse precision from 4 bits to 8 bits.
            inverse := mul(inverse, sub(2, mul(denominator, inverse)))
            // Double the inverse precision from 8 bits to 16 bits.
            inverse := mul(inverse, sub(2, mul(denominator, inverse)))
            // Double the inverse precision from 16 bits to 32 bits.
            inverse := mul(inverse, sub(2, mul(denominator, inverse)))
            // Double the inverse precision from 32 bits to 64 bits.
            inverse := mul(inverse, sub(2, mul(denominator, inverse)))
            // Double the inverse precision from 64 bits to 128 bits.
            inverse := mul(inverse, sub(2, mul(denominator, inverse)))
            // Double the inverse precision from 128 bits to 256 bits.
            inverse := mul(inverse, sub(2, mul(denominator, inverse)))
            // Multiply by the modular inverse to perform the exact division modulo 2^256.
            result := mul(productLow, inverse)
        }
    }
}
