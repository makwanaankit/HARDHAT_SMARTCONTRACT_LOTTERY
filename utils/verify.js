async function verify(contractAddress, args) {
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        })
    } catch (e) {
        if (e.message.toLowerCase().includes("already Verifed")) {
            console.log("already Verifed")
        } else {
            console.log(e)
        }
    }
}

module.exports = { verify }
