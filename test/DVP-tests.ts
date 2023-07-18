import {
  Register,
  DVP,
  DVPFactory,
  PrimaryIssuance,
  Cash,
} from "../typechain-types";
import { Signer } from "ethers";
import { ethers, network } from "hardhat";
import { expect } from "chai";
import { makeBondDate } from "../tests/dates";
import {
  encryptSymmetricAES,
  encryptWithPublicKey,
  decryptWithPrivateKeyAndAES,
} from "../utils/sign";

describe("DVP tests", async () => {
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

  before(async () => {
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

    let primaryIssuanceTest = await primaryIssuanceFactory.deploy(
      await register.getAddress(),
      1500
    );

    let hash = await register.atReturningHash(primaryIssuanceTest.getAddress());
    await register.enableContractToWhitelist(hash);

    const DVPLogicFactory = await ethers.getContractFactory("DVP");
    let dvpLogic = await DVPLogicFactory.deploy();

    const DVPFactoryFactory = await ethers.getContractFactory("DVPFactory");

    let dvpFactory: DVPFactory = await DVPFactoryFactory.deploy(
      await dvpLogic.getAddress()
    );

    const tx = await dvpFactory.createDVP();

    const txReceipt = await tx.wait(1);
    console.log("DVP sc deployed to: " + txReceipt.logs[2].args[0]);
    let dvpTest: DVP = await txReceipt.logs[2].args[0];

    hash = await register.atReturningHash(dvpTest);
    await register.enableContractToWhitelist(hash);

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
    let dvpLogic = await DVPLogicFactory.deploy();

    const DVPFactoryFactory = await ethers.getContractFactory("DVPFactory");

    let dvpFactory: DVPFactory = await DVPFactoryFactory.deploy(
      await dvpLogic.getAddress()
    );

    const tx = await dvpFactory.connect(bnd).createDVP(); // the BND is the setllement operator

    const txReceipt = await tx.wait(1);
    console.log("DVP sc deployed to: " + txReceipt.logs[2].args[0]);
    let dvpAddress = await txReceipt.logs[2].args[0];
    const DVPContract = await ethers.getContractFactory("DVP");
    dvp = DVPContract.attach(dvpAddress);

    await cash.connect(centralBanker).transfer(investorA, 1000);

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

    const encryptedMetadata = encryptSymmetricAES(metadata, true); // compression set to true: saves around 30% of bytes emitted in the EncryptedMetaData event, saving gas

    const wallet1 = ethers.fromMnemonic(accounts.mnemonic, accounts.path + `/1`);

const privateKey1 = wallet1.privateKey
    const privateKeySeller = bnd.; //BND is the seller
    const publicKeySeller = ;

    let encECIES = await encryptWithPublicKey(
      AESKey.toString("hex") + "IV" + iv.toString("hex"),
      publicKeySeller
    ); // encrypts AES with ECIES
    let [isValid, decryptedMessage] = await decryptWithPrivateKeyAndAES(
      encryptedMessage,
      encECIES,
      privateKeySeller,
      COMPRESSION
    );

    await dvp.connect(bnd).setDetails(
      {
        encryptedMetadaHash:
          "0xbc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a",
        quantity: 1000,
        price: 1 * 10 ** 18,
        cashToken: await cash.getAddress(),
        cashTokenExecutor: "0x0000000000000000000000000000000000000000", // no need for a cash executor
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
