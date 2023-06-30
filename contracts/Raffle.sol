//SPDX-License-Identifier: MIT
pragma solidity 0.8.7;
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__TransferFailded();
error Raffle__RaffleNotOpen();
error Raffle__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 raffleState);

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    uint256 private immutable i_entranceFee;
    address payable[] private s_player;

    event RaffleEnter(address indexed player);
    event RequestedRaffleWinner(uint256 indexed requestId);
    event WinnerPicked(address winner);
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_gaseLane;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUESTCONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant NUM_WORDS = 1;
    uint256 private immutable i_interval;
    uint256 private s_lastTimeStamp;
    address private s_recentWinner;
    enum RaffleState {
        OPEN,
        CALCULATING
    }
    RaffleState private s_raffleState;

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gaseLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gaseLane = gaseLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function requestRandomWinner() external {
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gaseLane,
            i_subscriptionId,
            REQUESTCONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId);
    }

    function enterRaffle() public payable {
        if (msg.value < i_entranceFee) {
            revert Raffle__NotEnoughETHEntered();
        }
        if (s_raffleState != RaffleState.OPEN) {
            revert Raffle__RaffleNotOpen();
        }
        s_player.push(payable(msg.sender)); // using this addres contract get some ether that is why we use payable
        emit RaffleEnter(msg.sender);
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_player[index];
    }

    function fulfillRandomWords(
        uint256, /*requestId*/
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_player.length;
        address payable recentWinner = s_player[indexOfWinner];
        s_recentWinner = recentWinner;
        s_player = new address payable[](0);
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Raffle__TransferFailded();
        }
        s_player = new address payable[](0); //Zero indicate size of array

        emit WinnerPicked(recentWinner);
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = RaffleState.OPEN == s_raffleState;
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = s_player.length > 0;
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers);
        upkeepNeeded = true;
        //return (upkeepNeeded, "0x0"); // can we comment this out?
    }

    function performUpkeep(
        bytes calldata /*performData*/
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Raffle__UpkeepNotNeeded(
                address(this).balance,
                s_player.length,
                uint256(s_raffleState)
            );
        }
        s_raffleState = RaffleState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gaseLane,
            i_subscriptionId,
            REQUESTCONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRaffleWinner(requestId);
    }

    function getRaffleState() public view returns (RaffleState) {
        return s_raffleState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_player.length;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getLastTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUESTCONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
