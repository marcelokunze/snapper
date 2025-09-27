// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address recipient
    ) ERC20(name_, symbol_) {
        _decimals = decimals_;
        _mint(recipient, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}


