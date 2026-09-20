// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {WDrop} from "../src/WDrop.sol";

/// @notice Deploy WDrop to Arc (mainnet 5042 or testnet 5042002).
/// @dev forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --private-key $PRIVATE_KEY --broadcast
contract Deploy is Script {
    function run() external returns (WDrop w) {
        address feeRecipient = vm.envOr("FEE_RECIPIENT", msg.sender);
        vm.startBroadcast();
        w = new WDrop(feeRecipient);
        vm.stopBroadcast();
        console.log("WDrop deployed at:", address(w));
        console.log("feeRecipient:", w.feeRecipient());
        console.log("chainId:", block.chainid);
    }
}
