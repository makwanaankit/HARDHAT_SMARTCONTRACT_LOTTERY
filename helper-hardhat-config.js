const { ethers } = require("hardhat")

const networkConfig = {
    4: {
        name: "rinkeby",
        vrfCoordinatorV2: "0x6168499c0cFfCaCD319c818142124B7A15E857ab",
        entranceFee: "100000000000000000",
        gasLane: "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
        subscriptionId: "20626",
        callbackGasLimit: "500000",
        interval: "30",
    },
    31337: {
        name: "hardhat",
        entranceFee: "100000000000000000",
        gasLane: "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15",
        callbackGasLimit: "500000",
        interval: "30",
    },
}
const VERIFICATION_BLOCK_CONFIRMATIONS = 6
const developmentChains = ["hardhat", "localhost"]
const DECIMALS = 8
const INITIAL_ANSWER = 20000000000
module.exports = {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
    DECIMALS,
    INITIAL_ANSWER,
}
