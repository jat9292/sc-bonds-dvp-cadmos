import { Register, DVP, PrimaryIssuance, Cash } from "../typechain-types";
import { Signer } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { makeBondDate } from "../tests/dates";

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

describe("DVP tests", async () => {
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

  console.log("Deploying register");
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
  console.log("ddd");
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

  console.log("Deploying cash");
  const cashFactory = await ethers.getContractFactory("Cash");
  cash = await cashFactory.connect(centralBanker).deploy();

  console.log(
    "The CAK registers the PrimaryIssuance and the DVP smart contracts"
  );
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
  dvp = await DVPFactory.deploy(
    await register.getAddress(),
    await cak.getAddress(),
    await cak.getAddress(),
    await cash.getAddress()
  );

  hash = await register.atReturningHash(dvp.getAddress());
  await register.enableContractToWhitelist(hash);

  // Initialize the primary issuance account
  await register.setExpectedSupply(1000);

  await register.makeReady();

  addressOfPIA = await register.primaryIssuanceAccount();

  it("Primary issuance", async () => {
    const balanceOfPIA = await register.balanceOf(addressOfPIA);
    await primary.connect(bnd).validate();
    const balanceOfBnD = await register.balanceOf(await bnd.getAddress());
    console.log(balanceOfPIA);
    expect(balanceOfPIA).to.be.equal("0");
    expect(balanceOfBnD).to.be.equal("1000");
  });
});