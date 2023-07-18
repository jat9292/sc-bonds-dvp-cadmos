import {
  Register,
  DVP,
  DVPFactory,
  PrimaryIssuance,
  Cash,
  CashTokenExecutor,
  FakeCurvePool,
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

// defining utils functions before the tests
interface Encrypted {
  iv: string;
  ephemPublicKey: string;
  ciphertext: string;
  mac: string;
}
function add0x(encryptedAES_: Encrypted): Encrypted {
  return {
    iv: "0x" + encryptedAES_.iv,
    ephemPublicKey: "0x" + encryptedAES_.ephemPublicKey,
    ciphertext: "0x" + encryptedAES_.ciphertext,
    mac: "0x" + encryptedAES_.mac,
  };
}
function remove0x(encryptedAES_: Encrypted): Encrypted {
  return {
    iv:
      encryptedAES_.iv.slice(0, 2) == "0x"
        ? encryptedAES_.iv.slice(2)
        : encryptedAES_.iv,
    ephemPublicKey:
      encryptedAES_.ephemPublicKey.slice(0, 2) == "0x"
        ? encryptedAES_.ephemPublicKey.slice(2)
        : encryptedAES_.ephemPublicKey,
    ciphertext:
      encryptedAES_.ciphertext.slice(0, 2) == "0x"
        ? "0x" + encryptedAES_.ciphertext.slice(2)
        : encryptedAES_.ciphertext,
    mac:
      encryptedAES_.mac.slice(0, 2) == "0x"
        ? "0x" + encryptedAES_.mac.slice(2)
        : encryptedAES_.mac,
  };
}

describe("DVP tests", async () => {
  let register: Register;
  let dvp: DVP;
  let curveExec: CashTokenExecutor;
  let fakeCurvePool: FakeCurvePool;
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
    const expectedSupply = 10000000;
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
    usd = await usdFactory.connect(centralBanker).deploy();

    console.log(
      "The CAK registers the PrimaryIssuance and the DVP smart contracts"
    );
    const primaryIssuanceFactory = await ethers.getContractFactory(
      "PrimaryIssuance"
    );

    const primaryIssuanceTest = await primaryIssuanceFactory.deploy(
      await register.getAddress(),
      15000000
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
    await register.setExpectedSupply(10000000);

    await register.makeReady();

    addressOfPIA = await register.primaryIssuanceAccount();
  });

  it("Primary issuance", async () => {
    const balanceOfPIABefore = await register.balanceOf(addressOfPIA);
    expect(balanceOfPIABefore).to.be.equal("10000000");
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
    expect(balanceOfBnD).to.be.equal("10000000");
  });

  it("DVP from BND to Investor in same currency unit (no cashTokenExecutor)", async () => {
    const DVPLogicFactory = await ethers.getContractFactory("DVP");
    const dvpLogic = await DVPLogicFactory.deploy();

    const DVPFactoryFactory = await ethers.getContractFactory("DVPFactory");

    const CurveExecFactory = await ethers.getContractFactory("CurveExecutor");
    const FakeCurvePoolFactory = await ethers.getContractFactory(
      "FakeCurvePool"
    );

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

    await eur
      .connect(centralBanker)
      .transfer(investorA, 20000000n * 10n ** 18n);

    await eur
      .connect(centralBanker)
      .transfer(fakeCurvePool.getAddress(), 30000000n * 10n ** 18n);
    await usd
      .connect(centralBanker)
      .transfer(fakeCurvePool.getAddress(), 30000000n * 10n ** 18n);

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
      signingKeyBnd.publicKey.slice(4) // we need to slice the first 4 characters because according to section 2.2 of RFC 5480, the first byte, "0x04" indicates that this is an uncompressed key, and EthCrypto does not follow this convention, contrarily to ethersjs
    ); // encrypts AES key with public key of seller using ECIES

    const encECIES_buyer = await encryptWithPublicKey(
      AESKey.toString("hex") + "IV" + iv.toString("hex"),
      signingKeyInvestorA.publicKey.slice(4)
    ); // encrypts AES key with public key of buyer using ECIES

    // the Bnd (seller) set the details of the trade
    const tx2 = await dvp.connect(bnd).setDetails(
      {
        encryptedMetadaHash: ethers.keccak256(encryptedMetadata),
        quantity: 10000000,
        price: 11n * 10n ** 17n,
        cashToken: await usd.getAddress(),
        cashTokenExecutor: await curveExec.getAddress(),
        securityToken: register.getAddress(),
        buyer: investorA.getAddress(),
        seller: bnd.getAddress(),
        tradeDate: 123,
        valueDate: 234,
      },
      encryptedMetadata,
      [add0x(encECIES_seller), add0x(encECIES_buyer)]
    );
    const txReceipt2 = await tx2.wait(1); // the EncryptedMetaData event which is listened to by buyer and seller
    const encryptedMetadataLog = await txReceipt2.logs[1].args[1]; // the encrypted metadata extracted from the EncryptedMetaData event
    const EncryptedAESwithECIESArray = await txReceipt2.logs[1].args[2]; // array of encrypted AES key, one for each actor of the trade

    // the buyer (investorA) verifies that at least one of the EncryptedAES keys can be decrypted
    // to an AES key which can, in turn, be used to decrypt a valid message from the encrypted metadata
    // NOTE : the validity check is not sufficient by itself, in practise the buyer should then read the
    // decrypted message to ensure that he agrees on the terms before doing the approve transaction
    for (let i = 0; i < EncryptedAESwithECIESArray.length; i++) {
      try {
        let [isValid, decryptedMessage] = await decryptWithPrivateKeyAndAES(
          encryptedMetadataLog.slice(2),
          remove0x(EncryptedAESwithECIESArray[i]),
          signingKeyInvestorA.privateKey.slice(2),
          true
        );
        console.log(isValid);
      } catch (error) {
        console.log(error.message);
      }
    }

    // if previous check convinced the buyer that metadata is valid and he agrees on the terms,
    // he approves the dvp to spend the needed amount of cashToken and then calls approve on dvp

    await eur
      .connect(investorA)
      .approve(curveExec.getAddress(), 10000000000000000n * 10n ** 18n);
    await dvp.connect(investorA).approve({
      encryptedMetadaHash: ethers.keccak256(encryptedMetadata),
      quantity: 10000000,
      price: 11n * 10n ** 17n,
      cashToken: await usd.getAddress(),
      cashTokenExecutor: await curveExec.getAddress(),
      securityToken: register.getAddress(),
      buyer: investorA.getAddress(),
      seller: bnd.getAddress(),
      tradeDate: 123,
      valueDate: 234,
    });

    // the seller (Bnd) could also checks that at least one of the EncryptedAES keys lead to a valid decrypted
    // metadata but this check in this special case is optional, because he is also the settlement operator
    // so in this case the bnd can approve directly and, because he is the setllement operator,
    // dvp will be executed in the same approve transaction

    const hash3 = await register.atReturningHash(dvp);
    await register.enableContractToWhitelist(hash3);
    console.log("-------- Executing DVP --------");
    console.log("Trade Details:", {
      encryptedMetadaHash: ethers.keccak256(encryptedMetadata),
      quantity: 10000000,
      price: 1.1,
      cashToken: await usd.getAddress(),
      cashTokenExecutor: await curveExec.getAddress(),
      securityToken: await register.getAddress(),
      buyer: investorA.getAddress(),
      seller: bnd.getAddress(),
    });
    console.log("----------------");
    console.log("- State Before:");
    console.log(
      "EUR of Buyer before DVP : ",
      Number((await eur.balanceOf(investorA.getAddress())) / 10n ** 18n)
    );
    console.log(
      "USD of Buyer before DVP : ",
      Number((await usd.balanceOf(investorA.getAddress())) / 10n ** 18n)
    );
    console.log(
      "EUR of Seller before DVP : ",
      Number((await eur.balanceOf(bnd.getAddress())) / 10n ** 18n)
    );
    console.log(
      "USD of Seller before DVP : ",
      Number((await usd.balanceOf(bnd.getAddress())) / 10n ** 18n)
    );
    console.log(
      "Security token quantity of Buyer before DVP : ",
      Number(await register.balanceOf(investorA.getAddress()))
    );
    console.log(
      "Security token quantity of Seller before DVP : ",
      Number(await register.balanceOf(bnd.getAddress()))
    );
    console.log("-------- ATOMIC SWAP! --------");
    await dvp.connect(bnd).approve({
      encryptedMetadaHash: ethers.keccak256(encryptedMetadata),
      quantity: 10000000,
      price: 11n * 10n ** 17n,
      cashToken: await usd.getAddress(),
      cashTokenExecutor: await curveExec.getAddress(),
      securityToken: register.getAddress(),
      buyer: investorA.getAddress(),
      seller: bnd.getAddress(),
      tradeDate: 123,
      valueDate: 234,
    });
    console.log("- State After:");

    console.log(
      "EUR of Buyer after DVP : ",
      Number((await eur.balanceOf(investorA.getAddress())) / 10n ** 18n)
    );
    console.log(
      "USD of Buyer after DVP : ",
      Number((await usd.balanceOf(investorA.getAddress())) / 10n ** 18n)
    );
    console.log(
      "EUR of Seller after DVP : ",
      Number((await eur.balanceOf(bnd.getAddress())) / 10n ** 18n)
    );
    console.log(
      "USD of Seller after DVP : ",
      Number((await usd.balanceOf(bnd.getAddress())) / 10n ** 18n)
    );
    console.log(
      "Security token quantity of Buyer after DVP : ",
      Number(await register.balanceOf(investorA.getAddress()))
    );
    console.log(
      "Security token quantity of Seller after DVP : ",
      Number(await register.balanceOf(bnd.getAddress()))
    );
    console.log("-------- END DVP --------");
  });
});
