// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {WDrop} from "../src/WDrop.sol";

/// Minimal 6dp mock USDC (no imports needed in src).
contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }

    function approve(address sp, uint256 amt) external returns (bool) {
        allowance[msg.sender][sp] = amt;
        return true;
    }

    function transfer(address to, uint256 amt) external returns (bool) {
        require(balanceOf[msg.sender] >= amt, "bal");
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function transferFrom(address f, address t, uint256 amt) external returns (bool) {
        require(balanceOf[f] >= amt, "bal");
        require(allowance[f][msg.sender] >= amt, "allow");
        allowance[f][msg.sender] -= amt;
        balanceOf[f] -= amt;
        balanceOf[t] += amt;
        return true;
    }
}

contract WDropTest is Test {
    WDrop w;
    MockUSDC usdc;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address arbiter = address(0xA2B);

    function setUp() public {
        w = new WDrop(address(this));
        usdc = new MockUSDC();
        usdc.mint(alice, 100_000_000); // $100
        usdc.mint(bob, 10_000_000);
    }

    function _createDrop(uint256 amt, bytes32 secret, uint64 ttl) internal returns (uint256 id) {
        bytes32 h = keccak256(abi.encodePacked(secret));
        vm.startPrank(alice);
        usdc.approve(address(w), amt);
        id = w.create(address(usdc), amt, h, ttl, address(0));
        vm.stopPrank();
    }

    function testCreateClaim() public {
        bytes32 secret = bytes32(uint256(1234));
        uint256 id = _createDrop(2_000_000, secret, 1 days);
        assertEq(uint256(w.getDrop(id).status), uint256(WDrop.Status.Locked));

        uint256 before = usdc.balanceOf(bob);
        vm.prank(bob);
        w.claim(id, secret);
        assertEq(usdc.balanceOf(bob) - before, 2_000_000);
        assertEq(uint256(w.getDrop(id).status), uint256(WDrop.Status.Claimed));
    }

    function testClaimWrongSecretReverts() public {
        bytes32 secret = bytes32(uint256(777));
        uint256 id = _createDrop(1_000_000, secret, 1 days);
        vm.prank(bob);
        vm.expectRevert(WDrop.BadSecret.selector);
        w.claim(id, bytes32(uint256(778)));
    }

    function testDoubleClaimReverts() public {
        bytes32 secret = bytes32(uint256(42));
        uint256 id = _createDrop(1_000_000, secret, 1 days);
        vm.prank(bob);
        w.claim(id, secret);
        vm.prank(bob);
        vm.expectRevert(WDrop.NotLocked.selector);
        w.claim(id, secret);
    }

    function testReclaimUndo() public {
        bytes32 secret = bytes32(uint256(9));
        uint256 id = _createDrop(5_000_000, secret, 1 days);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        w.reclaim(id);
        assertEq(usdc.balanceOf(alice) - before, 5_000_000);
    }

    function testReclaimNotSenderReverts() public {
        bytes32 secret = bytes32(uint256(9));
        uint256 id = _createDrop(5_000_000, secret, 1 days);
        vm.prank(bob);
        vm.expectRevert(WDrop.NotSender.selector);
        w.reclaim(id);
    }

    function testExpirySweep() public {
        bytes32 secret = bytes32(uint256(5));
        uint256 id = _createDrop(1_000_000, secret, 5 minutes);
        // claim after expiry must revert to expired path
        vm.warp(block.timestamp + 6 minutes);
        vm.prank(bob);
        vm.expectRevert(WDrop.NotYetExpired.selector);
        w.claim(id, secret);
        // anyone can sweep
        uint256 before = usdc.balanceOf(alice);
        vm.prank(bob);
        w.sweepExpired(id);
        assertEq(usdc.balanceOf(alice) - before, 1_000_000);
    }

    function testSweepBeforeExpiryReverts() public {
        bytes32 secret = bytes32(uint256(5));
        uint256 id = _createDrop(1_000_000, secret, 1 days);
        vm.expectRevert(WDrop.NotExpired.selector);
        w.sweepExpired(id);
    }

    function testTTLBounds() public {
        bytes32 h = keccak256(abi.encodePacked(bytes32(uint256(1))));
        vm.startPrank(alice);
        usdc.approve(address(w), 1_000_000);
        vm.expectRevert(WDrop.BadTTL.selector);
        w.create(address(usdc), 1_000_000, h, 60, address(0)); // < 5min
        vm.stopPrank();
    }

    function testArbiterResolve() public {
        bytes32 secret = bytes32(uint256(31337));
        bytes32 h = keccak256(abi.encodePacked(secret));
        vm.startPrank(alice);
        usdc.approve(address(w), 3_000_000);
        uint256 id = w.create(address(usdc), 3_000_000, h, 1 days, arbiter);
        vm.stopPrank();
        uint256 before = usdc.balanceOf(bob);
        vm.prank(arbiter);
        w.resolve(id, bob);
        assertEq(usdc.balanceOf(bob) - before, 3_000_000);
    }

    function testReplayIdSingleUse() public {
        // nextId increments; each id is single-use (claim then reclaim must fail)
        bytes32 secret = bytes32(uint256(100));
        uint256 id0 = _createDrop(1_000_000, secret, 1 days);
        bytes32 secret2 = bytes32(uint256(101));
        uint256 id1 = _createDrop(1_000_000, secret2, 1 days);
        assertEq(id1, id0 + 1);
        vm.prank(bob);
        w.claim(id0, secret);
        vm.prank(alice);
        vm.expectRevert(WDrop.NotLocked.selector);
        w.reclaim(id0);
    }
}
