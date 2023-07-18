import {
  Register,
  DVP,
  DVPFactory,
  PrimaryIssuance,
  Cash,
  CashTokenExecutor,
  FakeCurvePool


} from "../typechain-types";
import { Signer, SigningKey } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { makeBondDate } from "../tests/dates";
import {
  encryptSymmetricAES,
  encryptWithPublicKey,
  decryptWithPrivateKeyAndAES,
} from "../utils/sign";
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");
import dotenv from "dotenv";
import { curveExecutorSol } from "../typechain-types/src";
dotenv.config();

describe("DVP tests", async () => {
  let register: Register;
  let dvp: DVP;
  let curveExec: CashTokenExecutor
  let fakeCurvePool: FakeCurvePool
  let primaryIssuance: PrimaryIssuance;
  let eur: Cash;
  let usd: Cash;
  let accounts: Signer[];
  let cak: Signer;
  let bnd: Signer;
  let custodianA: Signer;
  let investorA: Signer;
  let investorB: Signer;
  let centralBanker: Signer;
  let addressOfPIA: string;
  let signingKeyBnd: SigningKey;
  let signingKeyInvestorA: SigningKey;
  let signingKeyInvestorB: SigningKey;

  before(async () => {
    accounts = await ethers.getSigners();
    cak = accounts[0];
    custodianA = accounts[1];
    signingKeyBnd = new ethers.SigningKey("0x" + process.env.PRIVATE1!);
    bnd = new ethers.Wallet(signingKeyBnd, ethers.provider);
    signingKeyInvestorA = new ethers.SigningKey("0x" + process.env.PRIVATE2!);
    investorA = new ethers.Wallet(signingKeyInvestorA, ethers.provider);
    signingKeyInvestorB = new ethers.SigningKey("0x" + process.env.PRIVATE3!);
    investorB = new ethers.Wallet(signingKeyInvestorB, ethers.provider);

    await setBalance(await bnd.getAddress(), 100n ** 18n); // set initial balances to 100 ETH
    await setBalance(await investorA.getAddress(), 100n ** 18n); // set initial balances to 100 ETH
    await setBalance(await investorB.getAddress(), 100n ** 18n); // set initial balances to 100 ETH

    centralBanker = accounts[8];
    const dates = makeBondDate(5, 1309402208 - 1309302208);
    const bondName = "EIB 3Y 1Bn SEK";
    const isin = "EIB3Y";
    const expectedSupply = 1000;
    const currency = ethers.zeroPadBytes(ethers.toUtf8Bytes("SEK"), 32);
    const unitVal = 100000;
    const couponRate = 0.4 * 100 * 10000;

    console.log("Deploying register");
    const RegisterFactory = await ethers.getContractFactory("Register");

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

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await cak.getAddress()); // needed to deploy a test trade contract

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await investorA.getAddress());

    await register
      .connect(custodianA)
      .enableInvestorToWhitelist(await investorB.getAddress());

    console.log("Deploying cash");
    const eurFactory = await ethers.getContractFactory("Cash");
    const usdFactory = await ethers.getContractFactory("Cash");
    eur = await eurFactory.connect(centralBanker).deploy();
    usd = await eurFactory.connect(centralBanker).deploy();

    console.log(
      "The CAK registers the PrimaryIssuance and the DVP smart contracts"
    );
    const primaryIssuanceFactory = await ethers.getContractFactory(
      "PrimaryIssuance"
    );

    const primaryIssuanceTest = await primaryIssuanceFactory.deploy(
      await register.getAddress(),
      1500
    );

    const hash = await register.atReturningHash(
      primaryIssuanceTest.getAddress()
    );
    await register.enableContractToWhitelist(hash);

    const DVPLogicFactory = await ethers.getContractFactory("DVP");
    let dvpLogic = await DVPLogicFactory.deploy();

    const DVPFactoryFactory = await ethers.getContractFactory("DVPFactory");

    const dvpFactory: DVPFactory = await DVPFactoryFactory.deploy(
      await dvpLogic.getAddress()
    );

    const tx = await dvpFactory.createDVP();

    const txReceipt = await tx.wait(1);
    console.log("Test DVP sc deployed to: " + txReceipt.logs[2].args[0]);
    const dvpTest: DVP = await txReceipt.logs[2].args[0];

    const hash2 = await register.atReturningHash(dvpTest);
    await register.enableContractToWhitelist(hash2);

    // Initialize the primary issuance account
    await register.setExpectedSupply(1000);

    await register.makeReady();

    addressOfPIA = await register.primaryIssuanceAccount();
  });

  it("Primary issuance", async () => {
    const balanceOfPIABefore = await register.balanceOf(addressOfPIA);
    expect(balanceOfPIABefore).to.be.equal("1000");
    const primaryIssuanceFactory = await ethers.getContractFactory(
      "PrimaryIssuance"
    );
    primaryIssuance = await primaryIssuanceFactory
      .connect(bnd)
      .deploy(await register.getAddress(), 1500);
    await primaryIssuance.connect(bnd).validate();
    const balanceOfPIA = await register.balanceOf(addressOfPIA);
    const balanceOfBnD = await register.balanceOf(await bnd.getAddress());
    expect(balanceOfPIA).to.be.equal("0");
    expect(balanceOfBnD).to.be.equal("1000");
  });

  it("DVP from BND to Investor in same currency unit (no cashTokenExecutor)", async () => {
    const DVPLogicFactory = await ethers.getContractFactory("DVP");
    const dvpLogic = await DVPLogicFactory.deploy();

    const DVPFactoryFactory = await ethers.getContractFactory("DVPFactory");

    const CurveExecFactory  = await ethers.getContractFactory("curveExec");
    const FakeCurvePoolFactory  = await ethers.getContractFactory("fakeCurvePool");

    let dvpFactory: DVPFactory = await DVPFactoryFactory.deploy(
      await dvpLogic.getAddress()
    );

    const tx = await dvpFactory.connect(bnd).createDVP(); // the BND is the setllement operator

    const txReceipt = await tx.wait(1);
    console.log("DVP sc deployed to: " + txReceipt.logs[2].args[0]);
    const dvpAddress = await txReceipt.logs[2].args[0];
    const DVPContract = await ethers.getContractFactory("DVP");
    dvp = DVPContract.attach(dvpAddress);

    let fakeCurvePool: FakeCurvePool = await FakeCurvePoolFactory.deploy(
      await eur.getAddress(),
      await usd.getAddress()
    );

    let curveExec: CashTokenExecutor = await CurveExecFactory.deploy(
      await eur.getAddress(),
      await usd.getAddress(),
      await fakeCurvePool.getAddress(),
      await dvp.getAddress()
    );

    await eur.connect(centralBanker).transfer(investorA, 1000);

    await eur.connect(centralBanker).transfer(fakeCurvePool.getAddress(), 2000);
    await usd.connect(centralBanker).transfer(fakeCurvePool.getAddress(), 2000);
    
    await eur.connect(investorA).approve(curveExec.getAddress(), 100000000);

    // metadata MUST starts with the bytestring corresponding to keccak256("VALID MESSAGE") to let the different actors check the encrypted Metadata before approving the DVP
    const metadata = `704512f53a4efc15864acc3cf3e4e319cf66d48723acf6bd676c1ae7919a05dc
    Buyer - Name - Physical Address - LEI
    Seller -  Name - Physical  Address - LEI
    Asset - Asset Ethereum Address + chainID
    Cash - Ethereum Cash Address + chainID
    Quantity 
    Price
    Time
    20 - MT202
    21 - MT202`;

    // The first seller (the Bnd) generates a random AES key and encrypts the metadata :
    let [encryptedMetadata, AESKey, iv] = encryptSymmetricAES(metadata, true); // compression set to true: saves around 30% of bytes emitted in the EncryptedMetaData event, saving gas

    const encECIES_seller = await encryptWithPublicKey(
      AESKey.toString("hex") + "IV" + iv.toString("hex"),
      signingKeyBnd.publicKey
    ); // encrypts AES with ECIES

    let [isValid, decryptedMessage] = await decryptWithPrivateKeyAndAES(
      encryptedMetadata,
      encECIES_seller,
      signingKeyBnd.privateKey,
      true
    );
    
    await dvp.connect(bnd).setDetails(
      {
        encryptedMetadaHash:
          "0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a",
        quantity: 1000,
        price: 1 * 10 ** 18,
        cashToken: await usd.getAddress(),
        cashTokenExecutor: await curveExec.getAddress(),
        securityToken: await register.getAddress(),
        buyer: await investorA.getAddress(),
        seller: await bnd.getAddress(),
        tradeDate: 123,
        valueDate: 234,
      },
      "0x00",
      [
        { iv: "0x00", ephemPublicKey: "0x00", ciphertext: "0x00", mac: "0x00" },
        { iv: "0x00", ephemPublicKey: "0x00", ciphertext: "0x00", mac: "0x00" },
        { iv: "0x00", ephemPublicKey: "0x00", ciphertext: "0x00", mac: "0x00" },
      ]
    );
  });
});
