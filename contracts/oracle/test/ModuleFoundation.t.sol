// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {IRateOracle} from "../src/IRateOracle.sol";

contract ModuleFoundationTest {
    function testRateSelectorMatchesPhoenixInterface() external pure {
        require(IRateOracle.rate.selector == 0x2c4e722e, "unexpected rate selector");
    }
}
