import { Register, DVP, PrimaryIssuance } from "../typechain-types";
import { Signer } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";

describe("MadPass", async () => {
  const PRICE = ethers.utils.parseEther("0.2");
  const CHAINID = network.config.chainId!;
  console.log(PRICE);
  const MAX_SUPPLY_TEAM = 0;
  let madPass: MadPass;
  let tokenTest: TokenTest;
  let accounts: Signer[];
  let deployer: Signer;
  let userWl: Signer;
  let userNonWl: Signer;
  let userOG: Signer;
  let addressContract: String;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    userWl = accounts[1];
    userNonWl = accounts[2];
    userOG = accounts[3];
    const deployerAddress = await deployer.getAddress();
    const signerAddress = deployerAddress;
    let MadPassFactory = await ethers.getContractFactory("MadPass");
    madPass = await MadPassFactory.deploy(
      "https://ipfs.io/ipfs/Qmb6tWBDLd9j2oSnvSNhE314WFL7SRpQNtfwjFWsStXp5A/{id}",
      "MADz PASS",
      "MADP",
      signerAddress,
      PRICE
    );
    addressContract = madPass.address;
    let TokenTestFactory = await ethers.getContractFactory("TokenTest");
    tokenTest = await TokenTestFactory.deploy();
  });

  it("Deployer has received all the team passes during deployment", async () => {
    expect(await madPass.balanceOf(deployer.getAddress(), 2)).to.equal(
      MAX_SUPPLY_TEAM
    );
  });
});
