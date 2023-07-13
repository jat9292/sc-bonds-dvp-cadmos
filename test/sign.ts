import crypto from "crypto";
import EthCrypto from "eth-crypto";
import pako from "pako";

const COMPRESSION = true;
// Generate a random key
let AESKey = crypto.randomBytes(32); // AES-256
console.log("Key:", AESKey.toString("hex"));

// Define the message which MUST starts with the bytestring corresponding to keccak256("VALID MESSAGE") to let the different actors check the encrypted Metadata before approving the DVP
let message = `704512f53a4efc15864acc3cf3e4e319cf66d48723acf6bd676c1ae7919a05dc
Buyer - Name - Physical Address - LEI
Seller -  Name - Physical  Address -LEI
Asset - Asset Ethereum Address + chainID
Cash - Ethereum Cash Address + chainID
Quantity 
Price
Time
20 - MT202
21 - MT202`;

// Encrypt the message
let iv = crypto.randomBytes(16); // Initialization vector
console.log(iv);
let cipher = crypto.createCipheriv("aes-256-cbc", AESKey, iv);
let encrypted: Buffer;
if (COMPRESSION) {
  let input = Buffer.from(message, "utf-8");
  // Compress the data
  let compressed = pako.deflate(input);
  encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
} else {
  encrypted = Buffer.concat([cipher.update(message, "utf8"), cipher.final()]);
}

console.log("Encrypted Message:", encrypted.toString("hex"));

const privateKeySeller =
  "a68876f6f16efcc9a23b2b14b1783392a47197fe0a8bf5802675f1722165b7ea";
const privateKeyBuyer =
  "a57bf6ca6dbd7f00a47ebca77af4fae539dfd60e284251de03f1d665dfb98586";
const privateKeySettlementOperator =
  "8932fc0faa3f84780d7af8319367d184b428324c7ef14aff8596468249a3107a";

const publicKeySeller = EthCrypto.publicKeyByPrivateKey(privateKeySeller);
const publicKeyBuyer = EthCrypto.publicKeyByPrivateKey(privateKeyBuyer);
const publicKeySettlementOperator = EthCrypto.publicKeyByPrivateKey(
  privateKeySettlementOperator
);

interface Encrypted {
  iv: string;
  ephemPublicKey: string;
  ciphertext: string;
  mac: string;
}

async function encryptWithPublicKey(AESKey_: string, publicKey: string) {
  const encryptedAES = await EthCrypto.encryptWithPublicKey(
    publicKey,
    AESKey_ // message
  );
  console.log("encrypted AES with ECIES : ");
  console.log(encryptedAES);
  return encryptedAES;
}

async function decryptWithPrivateKey(
  encryptedAES: Encrypted,
  privateKey: string
) {
  const decryptedAES = await EthCrypto.decryptWithPrivateKey(
    privateKey, // privateKey
    {
      iv: encryptedAES.iv,
      ephemPublicKey: encryptedAES.ephemPublicKey,
      ciphertext: encryptedAES.ciphertext,
      mac: encryptedAES.mac,
    }
  );
  console.log(decryptedAES);
  return decryptedAES;
}

async function main() {
  let decryptedAES = await decryptWithPrivateKey(
    await encryptWithPublicKey(
      AESKey.toString("hex") + "IV" + iv.toString("hex"),
      publicKeySeller
    ),
    privateKeySeller
  ); // decryptedAES = [AES_key, iv]
  let AESkey_ = decryptedAES.split("IV")[0];

  let iv_ = decryptedAES.split("IV")[1];
  let decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(AESkey_, "hex"),
    Buffer.from(iv_, "hex")
  );
  let decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  let decrypted_msg;
  if (COMPRESSION) {
    const decompressed_msg = pako.inflate(decrypted);
    decrypted_msg = Buffer.from(decompressed_msg).toString("utf-8");
  } else {
    decrypted_msg = decrypted.toString("utf8");
  }
  if (
    decrypted_msg.substring(0, 64) ===
    "704512f53a4efc15864acc3cf3e4e319cf66d48723acf6bd676c1ae7919a05dc"
  ) {
    console.log("Checking message : Message is valid");
    console.log("Decrypted Message:", decrypted_msg.slice(64));
  } else {
    console.log("ERROR : Message is invalid, DO NOT APROVE DVP");
  }
}

main();
