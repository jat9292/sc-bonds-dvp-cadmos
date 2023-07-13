import { Register, DVP, PrimaryIssuance, Cash } from "../typechain-types";
import { Signer } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { makeBondDate } from "../tests/dates";

describe("DVP", async () => {
  const PRICE = ethers.parseEther("0.2");
  const CHAINID = network.config.chainId!;

  console.log("network", network);
  console.log("network.config.chainId", network.config.chainId);
  console.log("CHAINID", CHAINID);
  console.log(PRICE);
  const MAX_SUPPLY_TEAM = 0;
  let register: Register;
  let dvp: DVP;
  let primaryIssuance: PrimaryIssuance;
  let cash: Cash;
  let accounts: Signer[];
  let cak: Signer;
  let bnd: Signer;
  let custodianA: Signer;
  let custodianB: Signer;
  let investorA: Signer;
  let investorB: Signer;
  let investorC: Signer;
  let investorD: Signer;
  let centralBanker: Signer;
  let addressOfPIA: string;

  beforeEach(async () => {
    accounts = await ethers.getSigners();
    cak = accounts[0];
    bnd = accounts[1];
    custodianA = accounts[2];
    custodianB = accounts[3];
    investorA = accounts[4];
    investorB = accounts[5];
    investorC = accounts[6];
    investorD = accounts[7];
    centralBanker = accounts[8];

    const dates = makeBondDate(5, 1309402208 - 1309302208);

    const bondName = "EIB 3Y 1Bn SEK";
    const isin = "EIB3Y";
    const expectedSupply = 1000;
    const currency = ethers.zeroPadBytes(ethers.toUtf8Bytes("SEK"), 32);
    const unitVal = 100000;
    const couponRate = 0.4 * 100 * 10000;
    // const creationDate = 1309002208; //UTC
    // const issuanceDate = 1309102208; //UTC
    // const maturityDate = 2009202208; //UTC
    // const couponDates = [1309302208, 1309402208, 1309502208, 1309602208, 1309702208]; //UTC
    // const defaultCutofftime = 17 * 3600; //17:00
    // const deployerAddress = await deployer.getAddress();

    console.log("deploying register");
    let RegisterFactory = await ethers.getContractFactory("Register");
    register = await RegisterFactory.deploy(
      bondName,
      isin,
      expectedSupply,
      currency,
      unitVal,
      couponRate,
      dates.creationDate,
      dates.issuanceDate,
      dates.maturityDate,
      dates.couponDates,
      dates.defaultCutofftime
    );

    // Have the CAK declare the actors
    await register.grantBndRole(await cak.getAddress()); // needed to create a dummy primary issuance smart contract

    await register.grantBndRole(await bnd.getAddress());

    await register.grantCstRole(await custodianA.getAddress());

    await register.grantCstRole(await custodianB.getAddress());

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await cak.getAddress()); // needed to deploy a test trade contract

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await investorA.getAddress());

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await investorB.getAddress());

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await investorC.getAddress());

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await investorD.getAddress());

    // Have the CAK register the smart contracts
    const primaryIssuanceFactory = await ethers.getContractFactory(
      "PrimaryIssuance"
    );
    const primary = await primaryIssuanceFactory.deploy(
      await register.getAddress(),
      1500
    );

    let hash = await register.atReturningHash(primary.getAddress());

    await register.enableContractToWhitelist(hash);

    const DVPFactory = await ethers.getContractFactory("DVP");
    const trade = await DVPFactory.deploy(
      await register.getAddress(),
      await cak.getAddress()
    );
    await allContracts
      .get(BilateralTradeContractName)
      .deploy(
        cak.newi({ maxGas: 1000000 }),
        register.deployedAt,
        await cak.account()
      );

    hash = await register.atReturningHash(cak.call(), trade.deployedAt);

    await register.enableContractToWhitelist(
      cak.send({ maxGas: 120000 }),
      hash
    );

    // Initialize the primary issuance account
    await register.setExpectedSupply(cak.send({ maxGas: 100000 }), 1000);

    await register.makeReady(cak.send({ maxGas: makeReadyGas }));

    addressOfPIA = await register.primaryIssuanceAccount();
  });

  it("Primary issuance", async () => {});
});
