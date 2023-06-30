const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { get } = hre.deployments

const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { log } = hre.deployments
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit test", async function () {
          let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer

              await deployments.fixture(["mocks", "raffle"])
              raffle = await ethers.getContract("Raffle", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })
          describe("constructor", async function () {
              it("Initialize the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterRaffle", async function () {
              it("reverts when you don't pay enough", async function () {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughETHEntered"
                  )
              })
              it("recoreds players when they enter", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const playersFromContract = await raffle.getPlayer(0)
                  assert.equal(playersFromContract, deployer)
              })
              it("emits event on enter", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
              it("doesn't allow entrance wher raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) //to fast forward time
                  await network.provider.send("evm_mine", [])

                  await raffle.performUpkeep([])
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__RaffleNotOpen"
                  )
              })
          })
          describe("checkUpkeep", async function () {
              it("returns false if prople haven't sent any ETH ", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) //to fast forward time
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = raffle.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })
              it("returns false if raffle isn't open ", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const raffleState = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "1")
                  assert.equal(upkeepNeeded, false)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("it  can only run if checkupkeep is true", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await raffle.performUpkeep([])
                  assert(tx)
              })
              it("revert when checkupkeep is false", async function () {
                  //we not increase time (using time travel)
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  )
              })
              it("update the raffle state , emits the event and call vrf coordinatior", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const txResponse = await raffle.performUpkeep([])
                  const txRecepit = await txResponse.wait(1)
                  const requestId = txRecepit.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1)
              })
          })
          describe("fulfillRandomWords", async function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })
              it("can only be called after performUpkeep ", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
              })
              it("picks a winner, resets, and sends money", async function () {
                  const additionalEntrances = 3 // to test
                  const startingIndex = 1
                  const accounts = await ethers.getSigners()
                  //   console.log(accounts[0])
                  //   console.log(accounts[1])
                  //   console.log(accounts[2])
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      const accountConnectedRaffle = raffle.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                      await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const numberOfPlayers = await raffle.getNumberOfPlayers()
                  console.log("numberOfPlayers " + numberOfPlayers)
                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                      console.log("Account " + accounts[0].address)
                      console.log("Account " + accounts[1].address)
                      console.log("Account " + accounts[2].address)
                      console.log("Account " + accounts[3].address)
                      const recentWinner = await raffle.getRecentWinner()
                      console.log("recentWinner " + recentWinner)
                      raffle.once("WinnerPicked", async () => {
                          try {
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                  })
              })
          })
      })
